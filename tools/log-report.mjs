// Разбор журнала, выгруженного с телефона.
//
//   node tools/log-report.mjs logs/comic-log-2026-10-18-20-11-05.json
//
// Журнал — единственный свидетель сеанса: телефон лежит на столе, консоли
// у него нет, а смотрит ребёнок на телевизор. Читать выгрузку глазами
// нельзя — это тысячи строк, — поэтому здесь она превращается в несколько
// чисел про то, ради чего журнал и заведён: здоровье прослушивания.
//
// Считалка отделена от печати намеренно: `report()` — чистая функция от
// разобранного JSON к числам, и ровно поэтому проверяется из node, без
// телефона и без настоящего журнала (`tests-log.mjs`).

import { readFileSync } from 'node:fs';

/* Сколько раз случилось событие. Повторы подряд журнал склеивает в одну
   запись со счётчиком `_n` (см. `js/log.js`), и считать записи вместо разов —
   главная ловушка этого файла: затык прослушивания — это и есть поток
   одинаковых событий, то есть одна строка и сотня разов. */
export const occurrences = (e) => e?._n || 1;

const WINDOW_START = 'mic.window.start';
const WINDOW_END = 'mic.window.end';

/**
 * Разбирает журнал на окна прослушивания.
 *
 * Окно — от `mic.window.start` до `mic.window.end`. Незакрытое окно тоже
 * считается: приложение могли закрыть посреди вопроса, и такое окно как раз
 * интересно. Отсутствие конца помечается `reason: null`, а не выдумывается.
 */
export function windows(log) {
  const out = [];
  let cur = null;

  const blank = (e) => ({
    at: e.t,
    endAt: null,
    reason: null,
    runs: 0,          // сеансов распознавания внутри окна
    relaunches: 0,    // перезапусков
    delays: [],       // с какими паузами перезапускали
    errors: {},       // код отказа -> сколько раз
    startFailed: 0,
    speech: 0,
    interim: 0,
    finals: 0,
    kept: 0,          // сколько раз распознанное прошло фильтр слов
    firstSpeechAt: null,
    shortRuns: 0,     // сеансов короче полусекунды
  });

  for (const e of log) {
    const n = occurrences(e);
    if (e.type === WINDOW_START) {
      if (cur) out.push(cur);          // окно без конца — так и запишем
      cur = blank(e);
      continue;
    }
    if (!cur) continue;                // события вне окна разбору не нужны

    switch (e.type) {
      case 'mic.on': cur.runs += n; break;
      case 'mic.off':
        if (typeof e.lived === 'number' && e.lived < 500) cur.shortRuns += n;
        break;
      case 'mic.relaunch':
        cur.relaunches += n;
        if (typeof e.delay === 'number') cur.delays.push(e.delay);
        break;
      case 'mic.error':
        cur.errors[e.code] = (cur.errors[e.code] || 0) + n;
        break;
      case 'mic.start.failed': cur.startFailed += n; break;
      case 'mic.speech':
        cur.speech += n;
        if (cur.firstSpeechAt == null) cur.firstSpeechAt = e.t - cur.at;
        break;
      case 'mic.interim': cur.interim += n; break;
      case 'mic.final':
        cur.finals += n;
        cur.kept += (e.kept ? n : 0);
        break;
      case WINDOW_END:
        cur.endAt = e.t;
        cur.reason = e.reason ?? null;
        out.push(cur);
        cur = null;
        break;
      default: break;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/* Окно считается затыкавшимся, если распознавание в нём перезапускалось
   чаще трёх раз и при этом сеансы были короткие. Порог именно такой: при
   здоровой работе движок Android обрывается раз в несколько секунд, то есть
   за тридцатисекундное окно три-четыре перезапуска — норма, а десяток
   коротких сеансов подряд — это уже то самое мигание. */
export const isFlapping = (w) =>
  w.reason === 'flapping' || (w.relaunches > 3 && w.shortRuns >= w.relaunches);

export function report(data) {
  const sessions = (data?.sessions || []).map((s) => {
    const log = s.log || [];
    const ws = windows(log);
    const errors = {};
    for (const e of log) {
      if (e.type === 'mic.error') errors[e.code] = (errors[e.code] || 0) + occurrences(e);
    }
    return {
      id: s.id,
      startedAt: s.startedAt,
      ua: s.ua,
      events: log.reduce((n, e) => n + occurrences(e), 0),
      records: log.length,
      crashes: log.filter((e) => e.type === 'error' || e.type === 'error.promise')
        .reduce((n, e) => n + occurrences(e), 0),
      windows: ws,
      flapping: ws.filter(isFlapping).length,
      answered: ws.filter((w) => w.kept > 0).length,
      errors,
    };
  });

  return {
    exportedAt: data?.exportedAt ?? null,
    sessions,
    totals: {
      sessions: sessions.length,
      windows: sessions.reduce((n, s) => n + s.windows.length, 0),
      flapping: sessions.reduce((n, s) => n + s.flapping, 0),
      answered: sessions.reduce((n, s) => n + s.answered, 0),
      crashes: sessions.reduce((n, s) => n + s.crashes, 0),
    },
  };
}

/* ---------------- печать ---------------- */

const secs = (ms) => (ms / 1000).toFixed(1) + ' с';
const pairs = (o) => Object.entries(o).map(([k, v]) => `${k}×${v}`).join(', ');

function print(r) {
  console.log('журнал от ' + (r.exportedAt ?? 'неизвестно когда'));
  const t = r.totals;
  console.log(`сессий ${t.sessions}, окон прослушивания ${t.windows}, `
    + `с ответом ${t.answered}, с затыком ${t.flapping}, исключений ${t.crashes}\n`);

  for (const s of r.sessions) {
    console.log(`— сессия ${s.startedAt}`);
    console.log(`  ${s.ua || 'устройство не названо'}`);
    console.log(`  событий ${s.events} в ${s.records} записях`
      + (s.crashes ? `, исключений ${s.crashes}` : '')
      + (Object.keys(s.errors).length ? `, отказы микрофона: ${pairs(s.errors)}` : ''));

    if (!s.windows.length) { console.log('  прослушивания не было\n'); continue; }

    for (const w of s.windows) {
      const lived = w.endAt == null ? 'не закрыто' : secs(w.endAt - w.at);
      const mark = isFlapping(w) ? '  ЗАТЫК' : '';
      console.log(`  ${secs(w.at)}  окно: ${lived}, ${w.reason ?? 'обрыв сеанса'}${mark}`);
      console.log(`      сеансов ${w.runs}, перезапусков ${w.relaunches}`
        + (w.delays.length ? ` (паузы ${w.delays.join(', ')} мс)` : '')
        + (w.shortRuns ? `, коротких ${w.shortRuns}` : '')
        + (w.startFailed ? `, start отказал ${w.startFailed}` : ''));
      console.log(`      речь ${w.speech}, промежуточных ${w.interim}, ответов ${w.finals}`
        + `, принято ${w.kept}`
        + (w.firstSpeechAt != null ? `, первый звук через ${secs(w.firstSpeechAt)}` : '')
        + (Object.keys(w.errors).length ? `, отказы: ${pairs(w.errors)}` : ''));
    }
    console.log('');
  }
}

// Запуск из командной строки — но не при импорте из тестов: `report()`
// проверяется из node на синтетических журналах, настоящего там нет.
if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/log-report.mjs')) {
  const file = process.argv[2];
  if (file) print(report(JSON.parse(readFileSync(file, 'utf8'))));
  else console.log('Укажите файл журнала: node tools/log-report.mjs logs/comic-log-….json');
}
