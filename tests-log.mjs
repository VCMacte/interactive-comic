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

// Длинное молчаливое окно затыком не является: ребёнок просто думал.
check('молчание — не затык', isFlapping({
  reason: 'window', relaunches: 3, shortRuns: 0, kept: 0,
}), false);

console.log(failed ? `\n${failed} провалено` : '\nвсе проверки пройдены');
process.exit(failed ? 1 : 0);
