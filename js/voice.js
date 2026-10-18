// Голос: синтез (рассказчик и герои) и распознавание (ответ ребёнка).
// Главное правило — никогда не слушать, пока говорит рассказчик:
// звук идёт на телевизор, микрофон слышит его обратно и ловит эхо.

import { playClip, hasClip, stopAudio, loadIndex, isPlaying } from './audio.js';
import * as log from './log.js';

const LANG = 'ru-RU';

/* ---------------- роли и интонации ---------------- */

// Роль задаёт, кто говорит. Высота и темп разведены заметно: на телевизоре
// через сжатие тонкая разница в тембре пропадает, а разница в высоте слышна.
export const ROLES = {
  narrator: { rate: 0.92, pitch: 1.00, gap: 320 },
  hero:     { rate: 0.99, pitch: 1.22, gap: 260 },
  friend:   { rate: 0.95, pitch: 1.34, gap: 260 },
  kid:      { rate: 1.00, pitch: 1.42, gap: 240 },
  villain:  { rate: 0.82, pitch: 0.68, gap: 340 },
  beast:    { rate: 0.80, pitch: 0.62, gap: 320 },
  // Второй сезон. Алекс — напарница, её слышно между героем и жителем.
  // Голем говорит ниже всех и медленнее всех: он железный и тяжёлый, и этим
  // узнаётся даже там, где диктор у записи тот же, что у злодея.
  ally:     { rate: 0.97, pitch: 1.30, gap: 260 },
  golem:    { rate: 0.74, pitch: 0.55, gap: 380 },
};

// Настроение — поправка поверх роли: вопрос медленнее и выше, похвала живее.
const MOODS = {
  story:    { rate: 1.00, pitch: 1.00, gap: 1.0 },
  question: { rate: 0.94, pitch: 1.06, gap: 1.25 },
  praise:   { rate: 1.06, pitch: 1.10, gap: 0.8 },
  hint:     { rate: 0.95, pitch: 1.00, gap: 1.1 },
};

/* ---------------- выбор голосов ---------------- */

let voicesReady = false;
let assigned = null;      // роль -> голос
let ttsUsable = null;     // null — ещё не выясняли

function loadVoices() {
  return new Promise((resolve) => {
    if (voicesReady || speechSynthesis.getVoices().length) { voicesReady = true; return resolve(); }
    speechSynthesis.addEventListener('voiceschanged', () => { voicesReady = true; resolve(); }, { once: true });
    // Chrome на Android иногда не присылает событие. Ждём один раз —
    // без этого флага секунда ожидания повторялась бы перед каждой репликой.
    setTimeout(() => { voicesReady = true; resolve(); }, 1000);
  });
}

// Набор голосов на устройствах разный, и качество отличается разительно:
// от почти человеческого «Google русский» до скрипучего встроенного движка.
function scoreVoice(v) {
  const lang = (v.lang || '').replace('_', '-').toLowerCase();
  if (!lang.startsWith('ru')) return -1;

  const name = (v.name || '').toLowerCase();
  let score = 100;
  if (/natural|neural|enhanced|premium|wavenet/.test(name)) score += 40;
  if (/google/.test(name)) score += 30;
  if (/milena|alyona|алёна|katya|катя|irina|ирина|tatyana|татьяна|svetlana|светлана/.test(name)) score += 20;
  if (/compact|espeak|robot/.test(name)) score -= 40;
  if (v.localService === false) score += 10;
  return score;
}

/**
 * Если на устройстве есть несколько русских голосов — раздаём разным ролям
 * разные. Если голос один (а чаще всего так и есть) — роли всё равно звучат
 * по-разному за счёт высоты и темпа.
 */
function assignVoices() {
  // Пустой результат не кэшируем: на части устройств список голосов
  // наполняется с задержкой, и один неудачный опрос навсегда объявил бы
  // устройство немым — озвучка не включилась бы до перезапуска.
  if (assigned && ttsUsable) return assigned;

  const all = speechSynthesis.getVoices() || [];
  let ranked = all
    .map(v => ({ v, score: scoreVoice(v) }))
    .filter(x => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map(x => x.v);

  // Русского голоса может не быть вовсе — так случилось в браузере телевизора.
  // Раньше роли оставались вообще без голоса, движок получал неизвестный ему
  // язык и молча ничего не произносил. Лучше нерусский голос, чем тишина:
  // слова он выговорит коряво, но история хотя бы зазвучит.
  if (!ranked.length && all.length) ranked = all.slice();

  ttsUsable = ranked.length > 0;

  const roles = Object.keys(ROLES);
  assigned = {};
  roles.forEach((role, i) => { assigned[role] = ranked[i % Math.max(ranked.length, 1)] ?? null; });

  // Рассказчику всегда лучший голос: его слышно дольше всех.
  if (ranked.length) assigned.narrator = ranked[0];
  return assigned;
}

/**
 * Можно ли вообще рассчитывать на озвучку. Если голосов в системе нет,
 * синтезатор молчит, но об этом не сообщает — история просто идёт в тишине,
 * и непонятно, сломалось что-то или так задумано.
 */
export async function ttsAvailable() {
  if (!('speechSynthesis' in window)) return false;
  await loadVoices();
  assignVoices();
  return !!ttsUsable;
}

/** Какие голоса достались ролям — чтобы можно было проверить на устройстве. */
export function voiceReport() {
  const map = assignVoices();
  return Object.fromEntries(Object.entries(map).map(([role, v]) => [role, v?.name ?? 'голос не найден']));
}

/* ---------------- синтез речи ---------------- */

let speechToken = 0;

export function cancelSpeech() {
  speechToken++;
  stopAudio();
  try { speechSynthesis.cancel(); } catch {}
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Длинная реплика одним куском звучит как диктор, читающий инструкцию.
// Разбиваем по предложениям и говорим с паузами — так слышна интонация.
function toChunks(text) {
  const parts = text.split(/(?<=[.!?…])\s+/).map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const part of parts) {
    // Очень короткие обрывки («Ой!») склеиваем со следующим,
    // иначе пауза после них рвёт фразу на полуслове.
    if (out.length && out[out.length - 1].length < 14) out[out.length - 1] += ' ' + part;
    else out.push(part);
  }
  return out;
}

function speakChunk(text, opts) {
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LANG;
    u.rate = opts.rate;
    u.pitch = opts.pitch;
    // Выбор голоса — необязательная роскошь. Если движок его отвергнет,
    // история не должна замереть: без озвучки читать можно, без сюжета нельзя.
    try { if (opts.voice) u.voice = opts.voice; } catch {}

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(poll);
      clearTimeout(guard);
      resolve();
    };

    u.onend = finish;
    u.onerror = finish;

    // На onend полагаться нельзя: часть движков его не присылает вовсе,
    // и тогда после каждой реплики висела бы многосекундная немая пауза.
    // Поэтому опрашиваем сам синтезатор — он честно отвечает, говорит ли сейчас.
    let idleTicks = 0;
    const poll = setInterval(() => {
      if (speechSynthesis.speaking || speechSynthesis.pending) { idleTicks = 0; return; }
      if (++idleTicks >= 2) finish();
    }, 200);

    const guard = setTimeout(finish, 1500 + text.length * 90);

    try { speechSynthesis.speak(u); } catch { finish(); }
  });
}

function tone(role, mood) {
  const r = ROLES[role] ?? ROLES.narrator;
  const m = MOODS[mood] ?? MOODS.story;
  return {
    rate: r.rate * m.rate,
    pitch: r.pitch * m.pitch,
    gap: r.gap * m.gap,
    voice: assignVoices()[role] ?? null,
  };
}

/**
 * Произносит текст одной ролью.
 * @param {string} text
 * @param {keyof MOODS} mood
 * @param {keyof ROLES} role
 */
export async function speak(text, mood = 'story', role = 'narrator') {
  if (!text) return;

  await loadIndex();
  if (hasClip(text, role)) { await playClip(text, role); return; }

  if (!('speechSynthesis' in window)) return;
  await loadVoices();
  if (!await ttsAvailable()) return;

  const opts = tone(role, mood);
  const my = ++speechToken;
  const chunks = toChunks(text);

  for (let i = 0; i < chunks.length; i++) {
    if (my !== speechToken) return;
    await speakChunk(chunks[i], opts);
    if (my !== speechToken) return;
    if (i < chunks.length - 1) await sleep(opts.gap);
  }
}

/**
 * Реплики в кавычках произносит персонаж, остальное — рассказчик.
 * Разметка уже есть в самих текстах: прямая речь в «ёлочках».
 * Отдельного языка разметки заводить незачем.
 */
export async function speakDialogue(text, { character = 'hero', mood = 'story' } = {}) {
  if (!text) return;
  await loadIndex();

  const segments = [];
  const re = /«([^»]*)»/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segments.push({ role: 'narrator', text: text.slice(last, m.index) });
    segments.push({ role: character, text: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) segments.push({ role: 'narrator', text: text.slice(last) });

  const my = ++speechToken;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const clean = seg.text.replace(/^[\s—,.:;-]+/, '').trim();
    if (!clean) continue;

    if (hasClip(clean, seg.role)) {
      await playClip(clean, seg.role);
      if (my !== speechToken) return;
      if (i < segments.length - 1) await sleep(260);
      continue;
    }

    if (!('speechSynthesis' in window) || !await ttsAvailable()) continue;

    const opts = tone(seg.role, mood);
    const chunks = toChunks(clean);
    for (let c = 0; c < chunks.length; c++) {
      if (my !== speechToken) return;
      await speakChunk(chunks[c], opts);
      if (my !== speechToken) return;
      // После последнего куска паузу не держим: её добавит либо смена
      // говорящего ниже, либо переход к вопросу. Иначе перед вопросом
      // к ребёнку набегала лишняя тишина.
      if (c < chunks.length - 1) await sleep(opts.gap);
    }

    // На смене говорящего пауза заметно длиннее: иначе рассказчик и герой
    // сливаются в один поток и ребёнок не слышит, что заговорил кто-то другой.
    if (i < segments.length - 1) await sleep(260);
  }
}

/* ---------------- распознавание речи ---------------- */

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const voiceSupported = Boolean(SR);

// Пауза перед перезапуском распознавания. Первая короткая — движок на Android
// обрывается сам после каждой паузы, и ждать там нечего; но если сеанс за
// сеансом кончается впустую, пауза удваивается до двух секунд. Без этого
// получается плотный цикл: микрофон мигает, а ребёнка не слышно.
const RELAUNCH_MIN = 250;
const RELAUNCH_MAX = 2000;
// Сеанс короче этого и без единого звука считается провалившимся.
const EMPTY_MS = 400;
// Столько провалов подряд — и мы перестаём драться за микрофон.
const FLAP_LIMIT = 8;
// Как часто переспрашивать, не замолчал ли рассказчик.
const QUIET_POLL_MS = 200;

/**
 * Говорит ли сейчас приложение. Микрофон нельзя поднимать, пока звучит
 * рассказчик: звук идёт на телевизор и возвращается в телефон. Записи
 * и браузерный синтез спрашиваются оба — путей озвучки два.
 */
const isSpeaking = () => isPlaying()
  || Boolean(window.speechSynthesis && (speechSynthesis.speaking || speechSynthesis.pending));

// Шум, кашель и шуршание дают короткие обрывки. Если считать их попыткой
// ответа, прослушивание обрывается, не успев начаться — так и было в первой
// версии. Поэтому за ответ принимаем только то, где есть настоящее слово.
const looksLikeWord = (s) => /[а-яёa-z]{2,}|\d/i.test(s || '');

// Ребёнок думает вслух: «э-э-э», «ну-у-у», «м-м-м» — и только потом отвечает.
// Распознаватель исправно присылает это как готовую фразу. Раньше она шла
// за ответ: засчитывался промах, звучала подсказка, и настоящий ответ,
// сказанный следом, слушать было уже некому. Такие звуки пропускаем мимо.
const HESITATION = /^(?:[аэоуыиеёюяaeiou]+|м+|мм+|хм+|н?у+|э+м*|ээ+|ну+|вот|это|значит|как|бы)$/i;

const isHesitation = (phrase) => {
  const words = String(phrase || '')
    .toLowerCase()
    .replace(/[^а-яёa-z\s-]/gi, ' ')
    .split(/[\s-]+/)
    .filter(Boolean);
  return words.length > 0 && words.every(w => HESITATION.test(w));
};

/**
 * Прослушивание живёт целым окном, а не одной попыткой: движок на Android
 * сам обрывается после паузы, и его нужно молча перезапускать, пока окно
 * не истекло. Иначе ребёнок, который задумался на три секунды, обнаруживает,
 * что его уже не слушают.
 *
 * Весь путь перезапуска переписан по жалобе «прослушивание заедает: само
 * включается и тут же выключается много раз подряд, а ответ в это время
 * не слышно». Причин было четыре, и первая достаточна сама по себе:
 *
 * 1. **Погашенный слушатель оживал.** Неудачный `rec.start()` уходил
 *    в `setTimeout(launch, 300)`, таймер нигде не хранился, `stop()` его
 *    не гасил, а сам `launch()` на флаг остановки не смотрел. Значит после
 *    `stopListening()` — во время подсказки, похвалы и даже на следующей
 *    сцене — поднималось новое распознавание и дралось за микрофон
 *    с законным слушателем: каждый `start()` обрывал чужой сеанс
 *    (`aborted`), тот немедленно стартовал снова, и выходил пинг-понг.
 * 2. **Осиротевшие экземпляры не отцеплялись.** `onend` старого объекта
 *    звал `rec.start()`, а `rec` указывал уже на новый: тот стартовал
 *    дважды, ловил `InvalidStateError` и плодил третий.
 * 3. **Перезапуск шёл без паузы и без счёта** — `onend` сразу в `start()`.
 * 4. **`onerror` молчал обо всём, кроме запрета доступа**, и `no-speech`
 *    с `aborted` перезапускались мгновенно.
 *
 * Лекарство: поколения сеансов, единственная точка перезапуска с отступом,
 * потолок трепыхания и тишина, пока говорит рассказчик. Каждый переход
 * пишется в журнал (`js/log.js`) — затык ловится только на живом телефоне,
 * консоли там нет.
 *
 * @param {{onInterim?:Function, onResult?:Function, onEnd?:Function, windowMs?:number}} h
 */
export function createListener({ onInterim, onResult, onEnd, windowMs = 30000 }) {
  if (!SR) return { start() { onEnd?.('unsupported'); }, stop() {} };

  let rec = null;
  let gen = 0;             // поколение сеанса: событие от чужого игнорируется
  let stopped = true;
  let deadline = 0;
  let windowTimer = null;
  let relaunchTimer = null;
  let backoff = RELAUNCH_MIN;
  let emptyRuns = 0;       // сколько сеансов подряд кончились впустую
  let sessionStart = 0;
  let sessionHeard = false;

  // Снять обработчики и оборвать. Без этого старый объект продолжает слать
  // события и трогает уже другой, живой экземпляр.
  function detach(r) {
    if (!r) return;
    r.onresult = r.onerror = r.onend = null;
    r.onstart = r.onaudiostart = r.onspeechstart = null;
    try { r.abort(); } catch {}
  }

  function teardown() {
    stopped = true;
    gen++;
    clearTimeout(windowTimer);
    clearTimeout(relaunchTimer);
    windowTimer = relaunchTimer = null;
    detach(rec);
    rec = null;
  }

  // Закрыть окно: и по сроку, и по отказу, и по трепыханию.
  function finish(reason, detail) {
    if (stopped) return;
    teardown();
    log.event('mic.window.end', { reason, ...(detail || {}) });
    log.flush();
    onEnd?.(reason);
  }

  /* Единственная точка перезапуска. Раньше их было две — `rec.start()`
     внутри `onend` и неучтённый `setTimeout` в `catch`, — и обе проходили
     мимо флага остановки. */
  function scheduleRelaunch(delay) {
    if (stopped) return;
    clearTimeout(relaunchTimer);
    log.event('mic.relaunch', { delay, empty: emptyRuns });
    relaunchTimer = setTimeout(function tick() {
      if (stopped) return;
      if (Date.now() >= deadline) { finish('window'); return; }
      // Пока звучит рассказчик, микрофон не поднимаем вовсе.
      if (isSpeaking()) { relaunchTimer = setTimeout(tick, QUIET_POLL_MS); return; }
      launch();
    }, delay);
  }

  /* Пустой сеанс — тот, что кончился быстрее EMPTY_MS и не дал ни звука.
     Это и есть признак затыка. Отступ после него удваивается, а любой
     услышанный звук сбрасывает его обратно: ребёнок, который просто
     помолчал полминуты, под лечение попасть не должен. */
  function noteSession(lived) {
    if (!sessionHeard && lived < EMPTY_MS) {
      emptyRuns++;
      const delay = backoff;
      backoff = Math.min(backoff * 2, RELAUNCH_MAX);
      return delay;
    }
    emptyRuns = 0;
    backoff = RELAUNCH_MIN;
    return RELAUNCH_MIN;
  }

  // Общий хвост сеанса: решить, когда перезапускать, и не драться вечно.
  function afterSession(lived) {
    const delay = noteSession(lived);
    // Драться за микрофон бесконечно нельзя: ребёнку это видно как мигание
    // и слышно как тишина. Честнее предложить кнопки.
    if (emptyRuns >= FLAP_LIMIT) { finish('flapping', { empty: emptyRuns }); return; }
    scheduleRelaunch(delay);
  }

  function launch() {
    if (stopped) return;
    detach(rec);
    const my = ++gen;
    sessionStart = Date.now();
    sessionHeard = false;

    const r = rec = new SR();
    r.lang = LANG;
    r.interimResults = true;
    r.continuous = true;          // не обрывать после первой фразы
    r.maxAlternatives = 6;

    const mine = () => my === gen && !stopped;

    r.onstart = () => { if (mine()) log.event('mic.on'); };
    r.onaudiostart = () => { if (mine()) log.event('mic.audio'); };
    r.onspeechstart = () => { if (mine()) { sessionHeard = true; log.event('mic.speech'); } };

    r.onresult = (e) => {
      if (!mine()) return;
      sessionHeard = true;
      const last = e.results[e.results.length - 1];
      const text = last[0].transcript;
      if (!last.isFinal) {
        log.event('mic.interim', { chars: text.length });
        onInterim?.(text);
        return;
      }

      const all = Array.from(last)
        .map(alt => alt.transcript)
        .filter(t => looksLikeWord(t) && !isHesitation(t));
      log.event('mic.final', { chars: text.length, kept: all.length });
      if (all.length) onResult?.(text, all);
      // Обрывок без слов или задумчивое «э-э-э» — не ответ: молчим и слушаем дальше.
    };

    r.onerror = (e) => {
      if (!mine()) return;
      const code = e.error;
      log.event('mic.error', { code });
      // Эти перезапуском не лечатся: доступа нет или микрофона нет вовсе.
      if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') {
        finish(code);
        return;
      }
      // no-speech, aborted, network: сеанс провалился, перезапуск назначит onend.
    };

    r.onend = () => {
      if (!mine()) return;
      const lived = Date.now() - sessionStart;
      log.event('mic.off', { lived, heard: sessionHeard });
      if (Date.now() >= deadline) { finish('window'); return; }
      afterSession(lived);
    };

    try {
      r.start();
    } catch (err) {
      // «Уже запущено» — не повод плодить ещё один экземпляр: считаем сеанс
      // пустым и перезапускаемся по общему правилу.
      log.event('mic.start.failed', { name: String(err?.name || err) });
      sessionHeard = false;
      afterSession(0);
    }
  }

  function start() {
    teardown();
    stopped = false;
    backoff = RELAUNCH_MIN;
    emptyRuns = 0;
    deadline = Date.now() + windowMs;
    log.event('mic.window.start', { windowMs });
    windowTimer = setTimeout(() => finish('window'), windowMs);
    launch();
  }

  function stop() {
    if (stopped) return;
    teardown();
    log.event('mic.window.end', { reason: 'stop' });
    log.flush();
  }

  return { start, stop };
}
