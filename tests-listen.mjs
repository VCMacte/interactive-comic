// Цикл перезапуска распознавания на заглушке.
//
//   node tests-listen.mjs
//
// Зачем заглушка. Затык ловится только на живом телефоне, а чинить его
// вслепую нельзя: это самая тонкая часть приложения. Поэтому поведение
// движка, снятое с журнала, воспроизводится здесь по шагам.
//
// Что именно воспроизводится — «НЕМОЙ СЕАНС». Из журнала от 22.10.2026
// видно: у каждого сеанса распознавания срабатывает onspeechstart примерно
// через секунду после старта (у второго и третьего — через 0.6 с), затем
// onspeechend, затем onend, и НИ ОДНОГО результата. Задержка отсчитывается
// от старта каждого сеанса и кластеризуется слишком ровно для человека
// (971, 1012, 1044, 1046 мс у первых; 601, 635, 637, 683 у вторых).
// Это системный сигнал самого распознавателя: Android пищит в начале и
// в конце прослушивания, микрофон слышит собственный писк.
//
// Отсюда и беда, которую тест сторожит: раз звук есть ВСЕГДА, признак
// «сеанс не слышал ни звука» недостижим, отступ никогда не растёт,
// потолок трепыхания никогда не копится, и приложение бесконечно
// поднимает микрофон заново. В журнале это выглядело как «затыков 0»
// при том, что ребёнок видел ровно затык.

const ok = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { console.log('ok    ' + name); return 0; }
  console.log('ПРОВАЛ ' + name + '\n   получено ' + g + '\n   ожидалось ' + w);
  return 1;
};
let failed = 0;

/* ---------------- заглушка распознавателя ---------------- */

// Управляемые часы: тест не ждёт реального времени.
let now = 0;
const timers = [];
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms = 0) => {
  const t = { at: now + ms, fn, id: timers.length + 1, dead: false };
  timers.push(t);
  return t.id;
};
globalThis.clearTimeout = (id) => {
  const t = timers.find((x) => x.id === id);
  if (t) t.dead = true;
};
globalThis.Date.now = () => now;

/** Прокрутить часы на ms, выполняя назначенное. */
function tick(ms) {
  const until = now + ms;
  for (;;) {
    const due = timers.filter((t) => !t.dead && t.at <= until).sort((a, b) => a.at - b.at)[0];
    if (!due) break;
    due.dead = true;
    now = due.at;
    due.fn();
  }
  now = until;
}

// Что делает сеанс: 'mute' — только системный писк и тишина,
// 'answer' — писк и настоящий ответ.
let plan = [];
const started = [];

class StubRecognition {
  constructor() {
    this.onstart = this.onaudiostart = this.onspeechstart = null;
    this.onspeechend = this.onresult = this.onerror = this.onend = null;
    this.aborted = false;
  }
  start() {
    const mode = plan.shift() ?? 'mute';
    started.push(mode);
    const alive = () => !this.aborted;
    setTimeout(() => { if (alive()) this.onstart?.(); }, 0);
    setTimeout(() => { if (alive()) this.onaudiostart?.(); }, 10);
    // системный сигнал распознавателя — его слышит микрофон
    setTimeout(() => { if (alive()) this.onspeechstart?.(); }, 1000);
    setTimeout(() => { if (alive()) this.onspeechend?.(); }, 1400);
    if (mode === 'answer') {
      setTimeout(() => {
        if (!alive()) return;
        const last = [{ transcript: 'шесть' }];
        last.isFinal = true;
        last.length = 1;
        this.onresult?.({ results: [last] });
      }, 1600);
    }
    setTimeout(() => { if (alive()) this.onend?.(); }, 1800);
  }
  stop() { this.aborted = true; }
  abort() { this.aborted = true; }
}

globalThis.window = {
  SpeechRecognition: StubRecognition,
  webkitSpeechRecognition: StubRecognition,
  speechSynthesis: { speaking: false, pending: false, getVoices: () => [], cancel() {}, speak() {}, addEventListener() {} },
};
globalThis.speechSynthesis = globalThis.window.speechSynthesis;
globalThis.indexedDB = undefined;     // журнал молча выключится
globalThis.fetch = async () => ({ json: async () => [] });

const { createListener } = await import('./js/voice.js?v=' + Math.random());

/* ---------------- сами проверки ---------------- */

function run(modes, windowMs = 30000) {
  plan = modes.slice();
  started.length = 0;
  const ends = [];
  const l = createListener({ windowMs, onEnd: (r) => ends.push(r) });
  l.start();
  tick(windowMs + 5000);
  l.stop();
  return { сеансов: started.length, концы: ends };
}

{
  // Главное. Двадцать немых сеансов подряд — это и есть затык, и приложение
  // обязано перестать драться за микрофон, а не поднимать его бесконечно.
  const r = run(Array(20).fill('mute'));
  failed += ok('немые сеансы подряд признаются затыком', r.концы, ['flapping']);
  // Потолок трепыхания — восемь, значит сеансов должно быть примерно столько,
  // а не два десятка.
  failed += ok('затык останавливает перезапуски, а не длится всё окно',
    r.сеансов <= 10, true);
}

{
  // Обратная сторона: настоящий ответ не должен попадать под лечение.
  // Первый сеанс немой (писк), второй приносит ответ — окно закрывается
  // по ответу, а не по затыку.
  const got = [];
  plan = ['mute', 'answer'];
  started.length = 0;
  const l = createListener({
    windowMs: 30000,
    onResult: (text) => got.push(text),
    onEnd: () => {},
  });
  l.start();
  tick(8000);
  l.stop();
  failed += ok('ответ после немого сеанса доходит', got, ['шесть']);
}

{
  // Короткое окно: если оно истекло раньше потолка, повод — «окно»,
  // а не «затык». Иначе голос выключался бы там, где ребёнок просто молчал.
  const r = run(Array(20).fill('mute'), 4000);
  failed += ok('короткое окно закрывается по сроку', r.концы, ['window']);
}

globalThis.setTimeout = realSetTimeout;
console.log(failed ? `\n${failed} провалено` : '\nвсе проверки пройдены');
process.exit(failed ? 1 : 0);
