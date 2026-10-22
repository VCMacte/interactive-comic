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
 *
 * Сцена и задание приходят в журнал **до** открытия окна: вопрос сначала
 * создаётся и читается вслух, микрофон поднимается после. Поэтому они
 * запоминаются вне окна и достаются каждому следующему — без этого окно
 * нельзя связать с вопросом, на который ребёнок отвечал.
 *
 * Нажатие кнопки, наоборот, случается уже **после** конца окна: голос сдался,
 * прослушивание погашено, ребёнок жмёт ответ. Такое нажатие приписывается
 * последнему закрытому окну той же сцены.
 */
export function windows(log) {
  const out = [];
  let cur = null;
  let scene = null;     // в какой сцене мы сейчас
  let task = null;      // какое задание в ней задано
  let last = null;      // последнее закрытое окно — для нажатий после него

  const blank = (e) => ({
    at: e.t,
    endAt: null,
    reason: null,
    scene,
    task,             // { question, answer, choices, … } или null
    heard: [],        // [{ text, label, score, miss }] — услышанное и куда уехало
    giveup: null,     // почему ушли на кнопки: misses | window | flapping
    picked: null,     // { label, by, correct } — чем сцена в итоге ответила
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
    mute: 0,          // сеансов «услышал речь, но не дал ни одного результата»
    lived: [],        // длительности сеансов, мс
    speaking: 0,      // перезапусков, назначенных пока звучал рассказчик
  });

  for (const e of log) {
    const n = occurrences(e);

    // Контекст сцены живёт и вне окон — см. комментарий выше.
    if (e.type === 'scene.enter') { scene = e.scene ?? null; task = null; continue; }
    if (e.type === 'task.ask') {
      task = { question: e.question ?? null, answer: e.answer ?? null,
               choices: e.choices ?? [], kind: e.kind ?? null, topic: e.topic ?? null };
      continue;
    }

    if (e.type === WINDOW_START) {
      if (cur) { out.push(cur); last = cur; }   // окно без конца — так и запишем
      cur = blank(e);
      continue;
    }

    if (!cur) {
      // Нажатие кнопки после того, как голос сдался: окно уже закрыто,
      // но ответ принадлежит той же сцене.
      if (e.type === 'answer.pick' && last && last.scene === scene && !last.picked) {
        last.picked = { label: e.label ?? null, by: e.by ?? null, correct: !!e.correct };
      }
      continue;                        // прочие события вне окна разбору не нужны
    }

    switch (e.type) {
      case 'mic.on': cur.runs += n; break;
      case 'mic.off':
        if (typeof e.lived === 'number' && e.lived < 500) cur.shortRuns += n;
        // Сеанс, не вернувший ни одного результата, — и есть настоящий
        // отказ; ровно так же считает теперь и сам движок (`noteSession`
        // в js/voice.js). Условие «и при этом слышал звук» здесь стояло
        // и было лишним: звук есть всегда, его издаёт сам распознаватель.
        // Прежняя выгрузка про это молчала, а «затыком» считалось совсем
        // другое — сеанс короче 400 мс без звука, то есть никогда.
        if (e.finals === 0) cur.mute += n;
        if (typeof e.lived === 'number') cur.lived.push(e.lived);
        break;
      case 'mic.relaunch':
        cur.relaunches += n;
        if (typeof e.delay === 'number') cur.delays.push(e.delay);
        if (e.speaking) cur.speaking += n;
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
      case 'mic.match':
        // Повторы склеены, поэтому одна запись бывает и сотней разов.
        cur.heard.push({ text: e.heard ?? '', label: e.label ?? null,
                         score: e.score ?? null, miss: !!e.miss, times: n });
        break;
      case 'mic.giveup': cur.giveup = e.reason ?? null; break;
      case 'answer.pick':
        if (!cur.picked) {
          cur.picked = { label: e.label ?? null, by: e.by ?? null, correct: !!e.correct };
        }
        break;
      case WINDOW_END:
        cur.endAt = e.t;
        cur.reason = e.reason ?? null;
        out.push(cur);
        last = cur;
        cur = null;
        break;
      default: break;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/* Окно считается затыкавшимся, если распознавание в нём перезапускалось
   чаще трёх раз и при этом сеансы ничего не возвращали. Порог именно такой:
   при здоровой работе движок Android обрывается раз в несколько секунд, то
   есть за тридцатисекундное окно три-четыре перезапуска — норма, а десяток
   немых сеансов подряд — это уже то самое мигание.

   Считалось это по «коротким» сеансам (меньше 500 мс), и показывало ноль
   всегда: короче 1225 мс сеансов на Android не бывает вовсе. Настоящий
   признак — сеанс не вернул результата; поле `mute` появилось в журнале
   22.10.2026, у выгрузок старше его нет, и там признак остаётся прежним. */
export const isFlapping = (w) =>
  w.reason === 'flapping'
  || (w.relaunches > 3 && (w.mute || w.shortRuns) >= w.relaunches);

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
      // Замер возможностей распознавания: пишется один раз при старте.
      probe: log.find((e) => e.type === 'mic.probe') || null,
      ua: s.ua,
      events: log.reduce((n, e) => n + occurrences(e), 0),
      records: log.length,
      crashes: log.filter((e) => e.type === 'error' || e.type === 'error.promise')
        .reduce((n, e) => n + occurrences(e), 0),
      windows: ws,
      flapping: ws.filter(isFlapping).length,
      answered: ws.filter((w) => w.kept > 0).length,
      byVoice: ws.filter((w) => w.picked?.by === 'voice').length,
      byButton: ws.filter((w) => w.picked?.by === 'button').length,
      // Главное число новой разметки: ребёнок отвечал, его слышали, но ни
      // один ответ не подошёл — и сцена ушла на кнопки. Молчание сюда не
      // попадает, у него повод `window`.
      unheard: ws.filter((w) => w.giveup === 'misses').length,
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
      byVoice: sessions.reduce((n, s) => n + s.byVoice, 0),
      byButton: sessions.reduce((n, s) => n + s.byButton, 0),
      unheard: sessions.reduce((n, s) => n + s.unheard, 0),
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
    + `с ответом ${t.answered}, с затыком ${t.flapping}, исключений ${t.crashes}`);
  console.log(`ответов голосом ${t.byVoice}, кнопкой ${t.byButton}`
    + `, не расслышано ${t.unheard}\n`);

  for (const s of r.sessions) {
    console.log(`— сессия ${s.startedAt}`);
    console.log(`  ${s.ua || 'устройство не названо'}`);
    if (s.probe) {
      const p = s.probe;
      console.log(`  распознавание: на устройстве ${p.onDevice ?? "—"}, облачное ${p.cloud ?? "—"}`
        + (p.online === false ? ", сети не было" : "")
        + (p.hasProcessLocally === false ? ", processLocally не поддержан" : ""));
    }
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
      if (w.mute || w.speaking || w.lived.length) {
        const l = w.lived.slice().sort((a, b) => a - b);
        console.log(`      немых сеансов (услышал, но смолчал) ${w.mute}`
          + (w.speaking ? `, перезапусков под голос рассказчика ${w.speaking}` : '')
          + (l.length ? `, сеанс жил ${l[0]}…${l[l.length - 1]} мс` : ''));
      }

      if (w.task) {
        console.log(`      вопрос: ${w.task.question}`);
        console.log(`      ответ: ${w.task.answer}   из: ${w.task.choices.join(', ')}`);
      }
      // Ради этих строк разметка и заводилась: слышно, что сказал ребёнок
      // и к какому варианту это уехало. «ПРОМАХ» напротив верного ответа
      // из строки выше — это и есть дефект сопоставления.
      for (const h of w.heard) {
        const to = h.label == null ? 'не подошло ничему'
          : `«${h.label}»` + (h.score ? ` (с ошибкой на ${h.score})` : '');
        console.log(`      услышано «${h.text}» -> ${to}`
          + (h.miss ? '   ПРОМАХ' : '')
          + (h.times > 1 ? `   ×${h.times}` : ''));
      }
      if (w.giveup) console.log(`      ушло на кнопки: ${w.giveup}`);
      if (w.picked) {
        console.log(`      ответили ${w.picked.by === 'voice' ? 'голосом' : 'кнопкой'}`
          + `: «${w.picked.label}»${w.picked.correct ? ' (верно)' : ''}`);
      }
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
