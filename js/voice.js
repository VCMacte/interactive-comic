// Голос: синтез (рассказчик) и распознавание (ответ ребёнка).
// Главное правило — никогда не слушать, пока говорит рассказчик:
// звук идёт на телевизор, микрофон слышит его обратно и ловит эхо.

const LANG = 'ru-RU';

/* ---------------- интонации ---------------- */

// Один и тот же голос звучит живее, если рассказ, вопрос и похвала
// произносятся по-разному. Паузы между фразами важнее самих настроек:
// без них получается сплошной поток, который ребёнок не разбирает.
export const MOOD = {
  story:    { rate: 0.90, pitch: 1.05, gap: 280 },
  question: { rate: 0.84, pitch: 1.14, gap: 340 },
  praise:   { rate: 0.98, pitch: 1.22, gap: 200 },
  hint:     { rate: 0.86, pitch: 1.08, gap: 300 },
};

/* ---------------- выбор голоса ---------------- */

let voicesReady = false;
let chosenVoice;           // undefined — ещё не искали, null — подходящего нет

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
// Поэтому не берём первый попавшийся, а оцениваем.
function scoreVoice(v) {
  const lang = (v.lang || '').replace('_', '-').toLowerCase();
  if (!lang.startsWith('ru')) return -1;

  const name = (v.name || '').toLowerCase();
  let score = 100;

  if (/natural|neural|enhanced|premium|wavenet/.test(name)) score += 40;
  if (/google/.test(name)) score += 30;
  // Женские голоса для детской сказки звучат мягче.
  if (/milena|alyona|алёна|katya|катя|irina|ирина|tatyana|татьяна|svetlana|светлана/.test(name)) score += 20;
  if (/compact|espeak|robot/.test(name)) score -= 40;
  if (v.localService === false) score += 10;

  return score;
}

function pickVoice() {
  if (chosenVoice !== undefined) return chosenVoice;

  const ranked = speechSynthesis.getVoices()
    .map(v => ({ v, score: scoreVoice(v) }))
    .filter(x => x.score >= 0)
    .sort((a, b) => b.score - a.score);

  chosenVoice = ranked.length ? ranked[0].v : null;
  return chosenVoice;
}

/** Какой голос выбран — чтобы можно было проверить на устройстве. */
export function currentVoiceName() {
  return pickVoice()?.name ?? 'голос не найден';
}

/* ---------------- синтез речи ---------------- */

// Отмена работает через счётчик: запущенная цепочка фраз видит чужой
// номер и замолкает, не дожидаясь, пока движок отработает очередь.
let speechToken = 0;

export function cancelSpeech() {
  speechToken++;
  try { speechSynthesis.cancel(); } catch {}
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Длинная реплика одним куском звучит как диктор, читающий инструкцию.
// Разбиваем по предложениям и говорим с паузами — так слышна интонация.
function toChunks(text) {
  const parts = text
    .split(/(?<=[.!?…])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

  // Очень короткие обрывки («Ой!») склеиваем со следующим,
  // иначе пауза после них рвёт фразу на полуслове.
  const out = [];
  for (const part of parts) {
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
    try { const v = pickVoice(); if (v) u.voice = v; } catch {}

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
      // Два тика тишины подряд: либо реплика кончилась, либо голоса нет совсем.
      if (++idleTicks >= 2) finish();
    }, 200);

    // Последняя страховка на случай, если и опрос соврёт.
    const guard = setTimeout(finish, 1500 + text.length * 90);

    try { speechSynthesis.speak(u); } catch { finish(); }
  });
}

/**
 * Произносит текст. Промис резолвится, когда рассказчик замолчал
 * или когда речь отменили через cancelSpeech().
 * @param {string} text
 * @param {keyof MOOD} mood
 */
export async function speak(text, mood = 'story') {
  if (!('speechSynthesis' in window) || !text) return;

  const opts = MOOD[mood] ?? MOOD.story;
  await loadVoices();

  const my = ++speechToken;
  const chunks = toChunks(text);

  for (let i = 0; i < chunks.length; i++) {
    if (my !== speechToken) return;
    await speakChunk(chunks[i], opts);
    if (my !== speechToken) return;
    if (i < chunks.length - 1) await sleep(opts.gap);
  }
}

/* ---------------- распознавание речи ---------------- */

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const voiceSupported = Boolean(SR);

/**
 * Одна попытка прослушивания.
 * @returns {{start:Function, stop:Function}}
 */
export function createListener({ onInterim, onResult, onEnd }) {
  if (!SR) return { start() { onEnd?.('unsupported'); }, stop() {} };

  let rec = null;
  let stopped = false;

  function start() {
    stopped = false;
    rec = new SR();
    rec.lang = LANG;
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 3;

    rec.onresult = (e) => {
      const last = e.results[e.results.length - 1];
      const text = last[0].transcript;
      if (last.isFinal) {
        // альтернативы повышают шанс попасть в ключевое слово
        const all = Array.from(last).map(alt => alt.transcript);
        onResult?.(text, all);
      } else {
        onInterim?.(text);
      }
    };
    rec.onerror = (e) => { if (e.error !== 'aborted') onEnd?.(e.error); };
    rec.onend = () => { if (!stopped) onEnd?.('silence'); };

    try { rec.start(); } catch { /* уже запущено — игнорируем */ }
  }

  function stop() {
    stopped = true;
    try { rec?.abort(); } catch {}
    rec = null;
  }

  return { start, stop };
}
