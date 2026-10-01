import { speak, speakDialogue, cancelSpeech, createListener, voiceSupported, ttsAvailable } from './voice.js';
import { matchChoice } from './match.js';
import { makeTask, usePool } from './tasks.js';
import { setScene, preloadScene, enter, leave, cheer, wobble } from './stage.js';

const $ = (id) => document.getElementById(id);
const el = {
  gate: $('gate'), gateText: $('gateText'), comicList: $('comicList'),
  voiceToggle: $('voiceToggle'), installHint: $('installHint'), noVoiceHint: $('noVoiceHint'),
  stage: $('stage'), text: $('text'), choices: $('choices'),
  mic: $('mic'), heard: $('heard'), replay: $('replayBtn'), home: $('homeBtn'),
};

// Установленное приложение само открывается без адресной строки и системных
// кнопок — это задаёт манифест. Во вкладке браузера их приходится убирать
// полноэкранным режимом, а он ещё и теряется при каждом возврате в приложение.
const installedApp = matchMedia('(display-mode: fullscreen)').matches
  || matchMedia('(display-mode: standalone)').matches
  || navigator.standalone === true;

if (!installedApp) el.installHint.hidden = false;

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

// Подобрано по жалобе из реальной эксплуатации: посторонний шум принимался
// за попытку ответить, и прослушивание обрывалось почти сразу.
const LISTEN_WINDOW_MS = 30000;   // сколько держим микрофон открытым
const NUDGE_AFTER = 2;            // после скольких промахов мягко подсказать
const MAX_MISSES = 4;             // после скольких — перейти на кнопки

/* ---------------- запуск ---------------- */

loadCatalogue();
loadTaskPool();
lockOrientation('portrait');
checkVoiceSupport();

// Пул заданий, озвученных заранее. Не загрузился — генератор справится сам,
// просто вопросы будут без готовой записи.
async function loadTaskPool() {
  try { usePool(await fetch('stories/tasks-pool.json').then(r => r.json())); } catch {}
}

// Отсутствие озвучки выглядит как поломка: история идёт, а звука нет.
// Проверяем дважды — список голосов на части устройств наполняется только
// после первого обращения пользователя к странице.
async function checkVoiceSupport() {
  el.noVoiceHint.hidden = await ttsAvailable();
}

async function loadCatalogue() {
  let comics;
  try {
    comics = await fetch('comics.json').then(r => r.json());
  } catch {
    el.gateText.textContent = 'Не удалось загрузить список историй. Проверьте соединение.';
    return;
  }

  el.comicList.innerHTML = '';
  comics.forEach((comic, i) => el.comicList.append(comicCard(comic, i)));
}

function comicCard(comic, index) {
  const card = document.createElement('button');
  card.className = 'comic';
  card.dataset.index = index;

  const img = document.createElement('img');
  img.src = comic.cover;
  img.alt = '';

  const title = document.createElement('b');
  title.textContent = comic.title;

  const sub = document.createElement('span');
  sub.textContent = comic.subtitle ?? '';

  card.append(img, title, sub);
  card.addEventListener('click', () => openComic(comic, card));
  return card;
}

// Нажатие на карточку — тот самый жест пользователя, без которого браузер
// не отдаст ни полный экран, ни микрофон. Поэтому всё разрешение запрашиваем
// здесь, а не при загрузке страницы.
async function openComic(comic, card) {
  state.useVoice = el.voiceToggle.checked && voiceSupported;

  const cards = [...el.comicList.querySelectorAll('.comic')];
  cards.forEach(c => { c.disabled = true; });
  card.querySelector('span').textContent = 'Готовим…';

  await goFullscreenLandscape();
  keepFullscreen();
  keepScreenAwake();
  if (state.useVoice) await primeMicrophone();
  checkVoiceSupport();

  let story;
  try {
    story = await fetch(comic.story).then(r => r.json());
  } catch {
    cards.forEach(c => { c.disabled = false; });
    card.querySelector('span').textContent = comic.subtitle ?? '';
    el.gateText.textContent = 'Не удалось загрузить историю. Проверьте соединение.';
    return;
  }

  state.story = fillViewerName(story);
  state.sceneId = null;
  state.scene = null;
  // Новая история начинается с чистого листа: иначе её первая сцена
  // попыталась бы «выехать» из сцены прошлого комикса.
  state.started = false;
  token++;

  el.gate.hidden = true;
  el.stage.hidden = false;
  show(state.story.start);

  cards.forEach(c => { c.disabled = false; });
  card.querySelector('span').textContent = comic.subtitle ?? '';
}

/**
 * Имя зрителя подставляется один раз при загрузке истории, а не при каждом
 * показе сцены: иначе плейсхолдер пришлось бы помнить во всех местах, где
 * текст читается вслух или попадает на экран.
 */
function fillViewerName(story) {
  const name = story.viewer;
  if (!name) return story;

  const walk = (value) => {
    if (typeof value === 'string') return value.replaceAll('{{имя}}', name);
    if (Array.isArray(value)) return value.map(walk);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]));
    }
    return value;
  };
  return walk(story);
}

function backToHub() {
  token++;                 // всё, что было запущено, увидит чужой токен и замолчит
  stopListening();
  cancelSpeech();
  state.started = false;
  el.stage.hidden = true;
  el.gate.hidden = false;
  el.gate.scrollTop = 0;
  lockOrientation('portrait');
}

el.home.addEventListener('click', backToHub);

// Полный экран и поворот — украшение, а не условие работы. Оба запроса
// умеют не отвечать вовсе: без настоящего касания браузер промис ни разрешает,
// ни отклоняет, и запуск встаёт намертво на «Готовим…». Поэтому ждём их
// с ограничением и идём дальше в любом случае.
function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise(r => setTimeout(r, ms))]).catch(() => {});
}

/**
 * Ориентация переключается по экранам: выбор истории удобнее листать
 * в портрете, сама история живёт в кадре 16:9 и требует альбома.
 * Манифест при этом не навязывает ничего — иначе портрет был бы недоступен.
 */
async function lockOrientation(mode) {
  try {
    await withTimeout(screen.orientation?.lock?.(mode), 1500);
  } catch { /* браузер может не разрешить — не повод останавливать историю */ }
}

async function goFullscreenLandscape() {
  // У установленного приложения полный экран уже есть от манифеста —
  // повторный запрос только мигнул бы системным уведомлением.
  if (!installedApp) {
    try {
      await withTimeout(document.documentElement.requestFullscreen({ navigationUI: 'hide' }), 3000);
    } catch {}
  }
  await lockOrientation('landscape');
}

// Полный экран во вкладке браузера не держится: его сбрасывает поворот,
// шторка уведомлений, переключение приложений. На трансляции это выглядит
// как внезапно выехавшая адресная строка посреди сказки. Возвращаем его
// первым же касанием экрана — касание даёт то самое разрешение пользователя,
// без которого браузер полноэкранный режим не включит.
let fullscreenGuardArmed = false;

function keepFullscreen() {
  if (installedApp || fullscreenGuardArmed) return;
  fullscreenGuardArmed = true;

  const restore = () => {
    if (document.fullscreenElement) return;
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    lockOrientation('landscape');
  };

  el.stage.addEventListener('pointerdown', restore);
}

let wakeLockArmed = false;

async function keepScreenAwake() {
  if (wakeLockArmed) return;
  wakeLockArmed = true;
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
    el.gateText.textContent = 'Микрофон не разрешён — история пойдёт с кнопками.';
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
  // Сцена может задать вид задания строкой ("math") или объектом с пределом
  // счёта: {"kind":"math","max":20}. Так сложность растёт по ходу истории.
  const spec = typeof raw.task === 'string' ? { kind: raw.task } : raw.task;
  const task = makeTask(spec.kind, { theme: state.story.theme, max: spec.max });
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
    el.choices.append(button('Прочитать ещё раз', () => show(state.story.start, 'forward'), 0));
    el.choices.append(button('Выбрать другую историю', () => backToHub(), 1));
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
  await speakDialogue(scene.speak ?? scene.text, { character: voiceOf(scene) });
  if (my !== token) return;   // ребёнок уже выбрал — не перебиваем его

  if (scene.choices?.length) {
    // Вопрос задаёт рассказчик, а не герой: ребёнку должно быть слышно,
    // что обращаются уже к нему.
    await speak(scene.prompt ?? askLine(scene), 'question', 'narrator');
    if (my !== token) return;
  }

  listen(my);
}

// Чьим голосом говорит прямая речь в этой истории.
const voiceOf = (scene) => scene.voice ?? state.story?.voice ?? 'hero';

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
    windowMs: LISTEN_WINDOW_MS,
    onInterim: (t) => { el.heard.textContent = t; },
    onResult: (text, alternatives) => {
      if (my !== token) return;
      const hit = alternatives.map(a => matchChoice(a, scene.choices)).find(Boolean);
      if (hit) pick(hit.choice);
      else miss(my);
    },
    onEnd: (reason) => {
      if (my !== token) return;
      if (reason === 'unsupported' || reason === 'not-allowed' || reason === 'service-not-allowed') {
        state.useVoice = false;
        stopListening();
        return;
      }
      // Окно кончилось — ребёнок молчит или отвлёкся. Не наказываем промахом,
      // просто предлагаем кнопки и замолкаем.
      giveUpToButtons();
    },
  });
  listener.start();
}

function stopListening() {
  listener?.stop();
  listener = null;
  el.mic.hidden = true;
}

// Ребёнок сказал что-то осмысленное, но не то. Прослушивание при этом живёт
// дальше само — обрывать его на каждом промахе было ошибкой: ответ с третьей
// попытки для семилетнего совершенно нормален.
async function miss(my) {
  if (my !== token) return;
  state.misses++;

  if (state.misses >= MAX_MISSES) { giveUpToButtons(); return; }

  if (state.misses === NUDGE_AFTER) {
    // Подсказку произносим с выключенным микрофоном, иначе рассказчика
    // услышит он сам: звук идёт на телевизор и возвращается в телефон.
    stopListening();
    await speak('Скажи ещё раз, только погромче. Или нажми ответ внизу.', 'hint', 'narrator');
    if (my !== token) return;
    listen(my);
  }
}

async function giveUpToButtons() {
  stopListening();
  await speak('Не расслышал. Нажми на нужный ответ внизу.', 'hint', 'narrator');
}

/* ---------------- выбор ---------------- */

async function pick(choice, btn) {
  const my = ++token;     // отменяет и текущую озвучку, и её продолжение
  stopListening();
  cancelSpeech();

  // Задание с проверкой: неверный ответ не ведёт дальше, а подсказывает.
  if (choice.hint) {
    wobble(btn);
    await speak(choice.hint, 'hint', 'narrator');
    if (my !== token) return;
    state.misses = 0;
    listen(my);
    return;
  }

  // Радуемся только верному ответу на задание. У сюжетных развилок
  // неправильного выбора нет, и салют там был бы ни к чему.
  if (choice.correct) cheer();

  if (choice.say) {
    await speakDialogue(choice.say, { character: voiceOf(state.scene), mood: 'praise' });
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
