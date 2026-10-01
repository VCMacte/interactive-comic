import { speak, cancelSpeech, createListener, voiceSupported } from './voice.js';
import { matchChoice } from './match.js';
import { makeTask } from './tasks.js';
import { setScene, preloadScene, enter, leave, cheer, wobble } from './stage.js';

const $ = (id) => document.getElementById(id);
const el = {
  gate: $('gate'), startBtn: $('startBtn'), voiceToggle: $('voiceToggle'),
  stage: $('stage'), text: $('text'), choices: $('choices'),
  mic: $('mic'), heard: $('heard'), replay: $('replayBtn'),
};

const state = {
  story: null,
  sceneId: null,
  scene: null,      // сцена как её видит ребёнок: у заданий выбор создаётся на лету
  started: false,   // первую сцену не из чего «выводить»
  misses: 0,        // подряд не распознанных ответов
  useVoice: true,
  focus: 0,
};

// Любое действие ребёнка увеличивает токен. Всё, что было запущено раньше
// (озвучка, прослушивание, отложенный переход), видит чужой токен и тихо выходит.
// Без этого выбор во время рассказа приводил бы к гонке двух сцен.
let token = 0;
let listener = null;

/* ---------------- запуск ---------------- */

el.startBtn.addEventListener('click', async () => {
  state.useVoice = el.voiceToggle.checked && voiceSupported;

  el.startBtn.disabled = true;
  el.startBtn.textContent = 'Готовим…';

  await goFullscreenLandscape();
  keepScreenAwake();
  if (state.useVoice) await primeMicrophone();

  try {
    state.story = await fetch('story.json').then(r => r.json());
  } catch {
    el.startBtn.disabled = false;
    el.startBtn.textContent = 'Начать историю';
    el.gate.querySelector('p').textContent = 'Не удалось загрузить историю. Проверьте соединение.';
    return;
  }

  el.gate.hidden = true;
  el.stage.hidden = false;
  show(state.story.start);
});

// Полный экран и поворот — украшение, а не условие работы. Оба запроса
// умеют не отвечать вовсе: без настоящего касания браузер промис ни разрешает,
// ни отклоняет, и запуск встаёт намертво на «Готовим…». Поэтому ждём их
// с ограничением и идём дальше в любом случае.
const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise(r => setTimeout(r, ms))]).catch(() => {});

async function goFullscreenLandscape() {
  try {
    await withTimeout(document.documentElement.requestFullscreen({ navigationUI: 'hide' }), 3000);
  } catch {}
  try {
    await withTimeout(screen.orientation.lock('landscape'), 1500);
  } catch {}
}

async function keepScreenAwake() {
  try {
    let lock = await navigator.wakeLock?.request('screen');
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible') {
        try { lock = await navigator.wakeLock.request('screen'); } catch {}
      }
    });
  } catch {}
}

// Разрешение на микрофон спрашиваем один раз на старте, а не посреди сказки.
// Диалог может висеть сколько угодно — поэтому ограничиваем ожидание.
async function primeMicrophone() {
  try {
    const stream = await withTimeout(navigator.mediaDevices.getUserMedia({ audio: true }), 20000);
    if (!stream) throw new Error('timeout');
    stream.getTracks().forEach(t => t.stop());
  } catch {
    state.useVoice = false;
    el.startBtn.textContent = 'Начинаем без голоса…';
  }
}

/* ---------------- показ сцены ---------------- */

async function show(id, dir = 'forward') {
  const my = ++token;
  stopListening();
  cancelSpeech();

  const raw = state.story.scenes[id];
  if (!raw) { console.error('нет сцены:', id); return; }

  const scene = raw.task ? withTask(raw) : raw;

  state.sceneId = id;
  state.scene = scene;
  state.misses = 0;
  state.focus = 0;

  // Картинки грузим до анимации, иначе вход в локацию «моргает».
  // Уход старой сцены идёт параллельно — ждать нечего.
  const ready = preloadScene(scene);
  const gone = state.started ? leave(dir) : Promise.resolve();
  state.started = true;

  el.text.textContent = '';
  el.choices.innerHTML = '';

  await Promise.all([ready, gone]);
  if (my !== token) return;

  setScene(scene);
  el.text.textContent = scene.text;
  renderChoices(scene);
  preloadNext(scene);

  await enter(dir);
  if (my !== token) return;

  narrate(scene, my);
}

const PRAISE = [
  'Верно! Молодец.',
  'Правильно! Отлично справился.',
  'Точно! Ты внимательный.',
  'Да, именно так. Умница!',
];

// Сцена с заданием каждый раз получает новый вопрос и новые ответы,
// поэтому сказку можно слушать много раз подряд.
function withTask(raw) {
  const task = makeTask(raw.task);
  const choices = task.choices.map(c => c.correct
    ? { label: c.label, keywords: c.keywords, correct: true, say: PRAISE[Math.floor(Math.random() * PRAISE.length)], next: raw.next }
    : { label: c.label, keywords: c.keywords, hint: task.hint });

  return {
    ...raw,
    text: raw.text + ' ' + task.question,
    speak: raw.speak ?? raw.text,   // вопрос произносится отдельно, с другой интонацией
    prompt: task.question,
    choices,
  };
}

// Следующие сцены подгружаем заранее, пока ребёнок слушает текущую.
function preloadNext(scene) {
  for (const c of scene.choices || []) {
    const next = state.story.scenes[c.next];
    if (next) preloadScene(next);
  }
}

function renderChoices(scene) {
  el.choices.innerHTML = '';
  const choices = scene.choices || [];

  if (!choices.length) {
    el.choices.append(button('Прочитать ещё раз', (b) => show(state.story.start, 'forward'), 0));
    highlight();
    return;
  }
  choices.forEach((c, i) => el.choices.append(button(c.label, (b) => pick(c, b), i)));
  highlight();
}

function button(label, onClick, index) {
  const b = document.createElement('button');
  b.className = 'choice';
  b.textContent = label;
  b.dataset.index = index;
  // Кнопки активны всегда: нажатие во время рассказа просто обрывает озвучку.
  // Заблокированные кнопки ребёнок воспринимает как сломанные.
  b.addEventListener('click', () => onClick(b));
  return b;
}

/* ---------------- рассказчик ---------------- */

async function narrate(scene, my) {
  // Рассказ и вопрос произносятся отдельно и разной интонацией:
  // так ребёнок слышит, где кончилась сказка и начался вопрос к нему.
  await speak(scene.speak ?? scene.text, 'story');
  if (my !== token) return;   // ребёнок уже выбрал — не перебиваем его

  if (scene.choices?.length) {
    await speak(scene.prompt ?? askLine(scene), 'question');
    if (my !== token) return;
  }

  listen(my);
}

function askLine(scene) {
  return 'Что выберем: ' + scene.choices.map(c => c.label).join(', или ');
}

/* ---------------- ответ голосом ---------------- */

function listen(my) {
  if (!state.useVoice || my !== token) return;
  const scene = state.scene;
  if (!scene?.choices?.length) return;

  el.mic.hidden = false;
  el.heard.textContent = 'слушаю…';

  listener = createListener({
    onInterim: (t) => { el.heard.textContent = t; },
    onResult: (text, alternatives) => {
      if (my !== token) return;
      const hit = alternatives.map(a => matchChoice(a, scene.choices)).find(Boolean);
      if (hit) pick(hit.choice);
      else miss(my);
    },
    onEnd: (reason) => {
      if (my !== token) return;
      if (reason === 'unsupported') { state.useVoice = false; stopListening(); }
      else miss(my);
    },
  });
  listener.start();
}

function stopListening() {
  listener?.stop();
  listener = null;
  el.mic.hidden = true;
}

async function miss(my) {
  stopListening();
  if (my !== token) return;

  state.misses++;
  // Два промаха — переходим на кнопки, чтобы ребёнок не застрял на развилке.
  if (state.misses >= 2) {
    await speak('Что-то я не расслышал. Нажми на нужный ответ внизу.', 'hint');
    return;
  }
  listen(my);
}

/* ---------------- выбор ---------------- */

async function pick(choice, btn) {
  const my = ++token;     // отменяет и текущую озвучку, и её продолжение
  stopListening();
  cancelSpeech();

  // Задание с проверкой: неверный ответ не ведёт дальше, а подсказывает.
  if (choice.hint) {
    wobble(btn);
    await speak(choice.hint, 'hint');
    if (my !== token) return;
    state.misses = 0;
    listen(my);
    return;
  }

  // Радуемся только верному ответу на задание. У сюжетных развилок
  // неправильного выбора нет, и салют там был бы ни к чему.
  if (choice.correct) cheer();

  if (choice.say) {
    await speak(choice.say, 'praise');
    if (my !== token) return;
  }
  show(choice.next, choice.dir ?? 'forward');
}

/* ---------------- управление без касаний ---------------- */

// Стрелки и Enter — чтобы то же приложение работало с пульта,
// если однажды переедет в браузер телевизора.
document.addEventListener('keydown', (e) => {
  const buttons = [...el.choices.querySelectorAll('.choice')];
  if (!buttons.length) return;

  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { state.focus = (state.focus + 1) % buttons.length; highlight(); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { state.focus = (state.focus - 1 + buttons.length) % buttons.length; highlight(); }
  else if (e.key === 'Enter' || e.key === ' ') { buttons[state.focus]?.click(); }
  else if (/^[1-9]$/.test(e.key)) { buttons[+e.key - 1]?.click(); }
});

function highlight() {
  el.choices.querySelectorAll('.choice').forEach((b, i) => b.classList.toggle('focus', i === state.focus));
}

el.replay.addEventListener('click', () => {
  const my = ++token;
  stopListening();
  cancelSpeech();
  // Повторяем ту же сцену с тем же заданием — новое сбило бы ребёнка.
  narrate(state.scene, my);
});

/* ---------------- офлайн-кэш ---------------- */

// На localhost кэш только мешает: Service Worker отдаёт старый код,
// и правки не видны до ручной очистки. В разработке — выключаем.
const isDev = ['localhost', '127.0.0.1'].includes(location.hostname);
if ('serviceWorker' in navigator) {
  if (isDev) {
    navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
    caches.keys?.().then(ks => ks.forEach(k => caches.delete(k)));
  } else {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
