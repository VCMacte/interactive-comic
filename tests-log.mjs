// Проверки журнала и его разбора.
//
// Журнал пишется на телефоне, а читается здесь — и читателя надо проверять
// отдельно от писателя: запись без разбора бесполезна, а разбор, который
// считает строки вместо разов, врёт тем убедительнее, чем хуже дела.
// Поэтому здесь синтетические сессии, а не настоящая выгрузка.
//
//   node tests-log.mjs

import { report, windows, occurrences, isFlapping } from './tools/log-report.mjs';

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}` + (ok ? '' : `\n      вышло ${JSON.stringify(got)}\n      ждали ${JSON.stringify(want)}`));
};

const session = (log) => ({
  sessions: [{ id: 1, startedAt: '2026-10-18T20:00:00.000Z', ua: 'Android', log }],
  exportedAt: '2026-10-18T20:30:00.000Z',
});

/* ---------------- склейка повторов ---------------- */

// Главная ловушка разбора: затык — это поток одинаковых событий, то есть
// ОДНА запись и сотня разов. Считать записи здесь значит не увидеть дефекта.
check('повтор считается по _n', occurrences({ type: 'mic.off', _n: 42 }), 42);
check('запись без счётчика — один раз', occurrences({ type: 'mic.off' }), 1);

/* ---------------- здоровое окно ---------------- */

const healthy = [
  { t: 1000, type: 'mic.window.start', windowMs: 30000 },
  { t: 1010, type: 'mic.on' },
  { t: 1100, type: 'mic.audio' },
  { t: 2000, type: 'mic.speech' },
  { t: 2100, type: 'mic.interim', chars: 3 },
  { t: 2600, type: 'mic.final', chars: 5, kept: 1 },
  { t: 2700, type: 'mic.window.end', reason: 'stop' },
];

const good = report(session(healthy));
check('окно одно', good.sessions[0].windows.length, 1);
check('ответ засчитан', good.totals.answered, 1);
check('затыка нет', good.totals.flapping, 0);
check('первый звук через секунду', good.sessions[0].windows[0].firstSpeechAt, 1000);

/* ---------------- затык ---------------- */

// То самое, на что жаловались: распознавание включается и тут же
// выключается, ребёнок говорит, а ответа нет.
const flap = [{ t: 0, type: 'mic.window.start', windowMs: 30000 }];
let t = 0;
for (let i = 0; i < 8; i++) {
  flap.push({ t: (t += 10), type: 'mic.on' });
  flap.push({ t: (t += 30), type: 'mic.error', code: 'no-speech' });
  flap.push({ t: (t += 5), type: 'mic.off', lived: 35, heard: false });
  flap.push({ t: (t += 250), type: 'mic.relaunch', delay: 250, empty: i + 1 });
}
flap.push({ t: t + 10, type: 'mic.window.end', reason: 'flapping', empty: 8 });

const bad = report(session(flap));
const w = bad.sessions[0].windows[0];
check('затык найден', bad.totals.flapping, 1);
check('ответа не было', bad.totals.answered, 0);
check('перезапусков восемь', w.relaunches, 8);
check('все сеансы короткие', w.shortRuns, 8);
check('отказы сосчитаны', w.errors, { 'no-speech': 8 });

// Склеенный поток обязан читаться так же, как развёрнутый: на телефоне
// журнал склеит восемь одинаковых отказов в одну запись.
const collapsed = [
  { t: 0, type: 'mic.window.start', windowMs: 30000 },
  { t: 10, type: 'mic.on', _n: 8, _lastT: 2000 },
  { t: 40, type: 'mic.error', code: 'no-speech', _n: 8, _lastT: 2030 },
  { t: 45, type: 'mic.off', lived: 35, heard: false, _n: 8, _lastT: 2035 },
  { t: 300, type: 'mic.relaunch', delay: 250, empty: 1, _n: 8, _lastT: 2300 },
  { t: 2400, type: 'mic.window.end', reason: 'flapping', empty: 8 },
];
const cw = windows(collapsed)[0];
check('склеенный поток — те же восемь', [cw.relaunches, cw.shortRuns, cw.errors['no-speech']], [8, 8, 8]);

/* ---------------- границы ---------------- */

// Окно без конца — приложение закрыли посреди вопроса. Такое окно как раз
// интересно, и выдумывать ему конец нельзя.
const cut = windows([
  { t: 0, type: 'mic.window.start', windowMs: 30000 },
  { t: 10, type: 'mic.on' },
]);
check('незакрытое окно сохраняется', [cut.length, cut[0].reason, cut[0].endAt], [1, null, null]);

// События до первого окна к прослушиванию не относятся.
check('события вне окна не считаются', windows([
  { t: 0, type: 'session.start' },
  { t: 5, type: 'mic.relaunch', delay: 250 },
]).length, 0);

/* ---------------- сцена, задание, услышанное ---------------- */

// То, ради чего разметка заводилась. Сегодняшний случай: ответом было
// «двенадцать», среди вариантов стояло «два», и услышанное уезжало туда.
// По одному журналу микрофона этого было не видно вовсе — пришлось
// вспоминать вопрос по памяти.
const mishear = [
  { t: 100, type: 'story.open', comic: 'bell', scene: 'gate' },
  { t: 200, type: 'scene.enter', scene: 'anvil', dir: 'forward' },
  { t: 210, type: 'task.ask', scene: 'anvil', kind: 'math', max: 20,
    question: 'Сколько будет пять и семь?', answer: 'Двенадцать',
    choices: ['Два', 'Четырнадцать', 'Двенадцать'] },
  { t: 1000, type: 'mic.window.start', windowMs: 30000 },
  { t: 1010, type: 'mic.on' },
  { t: 2000, type: 'mic.speech' },
  { t: 2500, type: 'mic.final', chars: 2, kept: 1 },
  { t: 2510, type: 'mic.match', heard: '12', alts: [], label: 'Два', score: 0, miss: true },
  { t: 2600, type: 'mic.window.end', reason: 'stop' },
];

const mis = report(session(mishear));
const mw = mis.sessions[0].windows[0];
// Сцена и задание приходят ДО окна: вопрос сначала читается вслух.
check('окно знает свою сцену', mw.scene, 'anvil');
check('окно знает задание', [mw.task.question, mw.task.answer], ['Сколько будет пять и семь?', 'Двенадцать']);
check('услышанное и вердикт', mw.heard, [{ text: '12', label: 'Два', score: 0, miss: true, times: 1 }]);

// Четыре промаха подряд, потом кнопка — ровно то, что было на телефоне.
const mishear4 = [...mishear.slice(0, 4)];
let mt = 1000;
for (let i = 0; i < 4; i++) {
  mishear4.push({ t: (mt += 500), type: 'mic.final', chars: 2, kept: 1 });
  mishear4.push({ t: (mt += 10), type: 'mic.match', heard: '12', alts: [], label: 'Два', score: 0, miss: true });
}
mishear4.push({ t: (mt += 10), type: 'mic.giveup', reason: 'misses', misses: 4 });
mishear4.push({ t: (mt += 10), type: 'mic.window.end', reason: 'stop' });
mishear4.push({ t: (mt += 3000), type: 'answer.pick', label: 'Двенадцать', by: 'button', correct: true, hint: false });

const four = report(session(mishear4));
check('не расслышано — одно окно', four.totals.unheard, 1);
check('голосом не ответили', four.totals.byVoice, 0);
// Нажатие приходит ПОСЛЕ конца окна: голос уже сдался. Приписывается тому
// же окну, иначе ответ сцены теряется.
check('кнопка после окна приписана окну', four.totals.byButton, 1);
check('повод отказа сохранён', four.sessions[0].windows[0].giveup, 'misses');

// Ответ голосом закрывает окно изнутри.
const voiced = report(session([
  { t: 200, type: 'scene.enter', scene: 'anvil', dir: 'forward' },
  { t: 1000, type: 'mic.window.start', windowMs: 30000 },
  { t: 2500, type: 'mic.final', chars: 10, kept: 2 },
  { t: 2510, type: 'mic.match', heard: 'двенадцать', alts: ['12'], label: 'Двенадцать', score: 0, miss: false },
  { t: 2520, type: 'answer.pick', label: 'Двенадцать', by: 'voice', correct: true, hint: false },
  { t: 2600, type: 'mic.window.end', reason: 'stop' },
]));
check('ответ голосом сосчитан', [voiced.totals.byVoice, voiced.totals.byButton, voiced.totals.unheard], [1, 0, 0]);

// Новая сцена сбрасывает задание: вопрос прошлой сцены к новому окну
// отношения не имеет.
const next = windows([
  { t: 10, type: 'scene.enter', scene: 'anvil' },
  { t: 20, type: 'task.ask', scene: 'anvil', question: 'раз', answer: 'Два', choices: ['Два'] },
  { t: 30, type: 'mic.window.start' },
  { t: 40, type: 'mic.window.end', reason: 'stop' },
  { t: 50, type: 'scene.enter', scene: 'forge' },
  { t: 60, type: 'mic.window.start' },
  { t: 70, type: 'mic.window.end', reason: 'stop' },
]);
check('задание не перетекает в следующую сцену', [next[0].task?.question, next[1].task], ['раз', null]);

// Поток одинаковых промахов журнал склеит — считать надо разы.
const collapsedMatch = windows([
  { t: 0, type: 'mic.window.start' },
  { t: 10, type: 'mic.match', heard: '12', label: 'Два', score: 0, miss: true, _n: 7, _lastT: 900 },
  { t: 1000, type: 'mic.window.end', reason: 'stop' },
]);
check('склеенные промахи считаются разами', collapsedMatch[0].heard[0].times, 7);

// Длинное молчаливое окно затыком не является: ребёнок просто думал.
check('молчание — не затык', isFlapping({
  reason: 'window', relaunches: 3, shortRuns: 0, kept: 0,
}), false);

console.log(failed ? `\n${failed} провалено` : '\nвсе проверки пройдены');
process.exit(failed ? 1 : 0);
