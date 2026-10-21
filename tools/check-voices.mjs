// Сверка голосов: что приложение попросит озвучить — и что для этого есть.
//
//   node tools/check-voices.mjs
//
// Зачем отдельная проверка. Роль реплики считается в ДВУХ местах: движок
// (`js/app.js`) решает, чьим голосом говорить, а коллектор
// (`tools/tts/collect.mjs`) решает, под каким именем записать файл. Имя
// файла — это FNV-1a от строки «роль|текст», поэтому расхождение в роли
// не даёт ни ошибки, ни тишины: запись просто не находится, и движок
// уходит в браузерный синтез. На слух это не «нет звука», а «вдруг другой
// голос» — самый коварный из возможных симптомов, и именно его однажды
// поймали на девятом дне, когда Алекс заговорила голосом Стива.
//
// Поэтому здесь воспроизводится порядок `js/app.js`, реплика за репликой,
// и каждая проверяется по `assets/audio/index.json`. Файл с диска, а не
// манифест: манифест говорит, что собирались озвучить, а index.json —
// что реально лежит и доедет до телевизора.

import { readFileSync, readdirSync } from 'node:fs';
// `clipId` берётся из `js/audio.js`, а не из конвейера озвучки, нарочно:
// это та самая копия, которой приложение ищет файл. Если две копии
// разойдутся, проверка это и покажет — своей копии у неё нет.
import { clipId } from '../js/audio.js';
// Обход сцены вынесен в общий модуль: им пользуется ещё и tools/listen.html,
// а третья копия порядка реплик рано или поздно разошлась бы с движком.
import { utterances, runsOf, fillViewer, PRAISE, SYSTEM, taskSpec } from './tts/utterances.mjs';

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

const have = new Set(read('assets/audio/index.json'));
const manifest = new Map(read('tools/tts/manifest.json').map(c => [c.id, c]));
const pool = read('stories/tasks-pool.json');

/* ---------------- то же, что в js/app.js ---------------- */

// Ключ пула — повторён здесь, а не импортирован, нарочно: если он
// разойдётся с `js/tasks.js`, проверка обязана это заметить, а не
// повторить ошибку следом.
const poolKey = (theme, kind, max, topic, spread) => {
  const base = `${theme}|${kind}|${max}|${topic || '-'}`;
  return spread === 'wide' ? `${base}|wide` : base;
};

/* ---------------- обход историй ---------------- */

/** Записи пула под ключом сцены — ключ считается своей копией (см. выше). */
function tasksOf(scene, story) {
  if (!scene.task) return { key: null, entries: [] };
  const spec = taskSpec(scene);
  const key = poolKey(story.theme ?? 'forest', spec.kind, spec.max ?? 10, spec.topic, spec.spread);
  return { key, entries: pool[key] || [] };
}

const problems = [];
const seen = new Set();
let total = 0;

const files = readdirSync('stories').filter(f => f.endsWith('.json') && f !== 'tasks-pool.json');

for (const file of files) {
  const story = fillViewer(read('stories/' + file));

  for (const [id, scene] of Object.entries(story.scenes)) {
    const runs = runsOf(scene, tasksOf(scene, story).entries);

    if (scene.task && !runs.length) {
      problems.push({ file, scene: id, why: 'ключ пула пуст', text: tasksOf(scene, story).key, role: '—' });
    }

    for (const run of runs) {
      for (const u of utterances(scene, story, run)) {
        const id2 = clipId(u.text, u.role);
        const k = id2;
        if (seen.has(k)) continue;
        seen.add(k);
        total++;
        if (!have.has(id2)) {
          const m = manifest.get(id2);
          problems.push({ file, scene: id, why: u.why, role: u.role, text: u.text,
                          вМанифесте: !!m });
        }
      }
    }
  }
}

// Похвалы и служебные — рассказчиком, вне сцен.
for (const line of SYSTEM) {
  total++;
  if (!have.has(clipId(line, 'narrator'))) {
    problems.push({ file: '—', scene: 'служебное', why: 'системная реплика', role: 'narrator', text: line });
  }
}

/* ---------------- отчёт ---------------- */

console.log(`историй ${files.length}, разных реплик ${total}, записей на диске ${have.size}`);

if (!problems.length) {
  console.log('\nвсе реплики озвучены, роли сходятся');
  process.exit(0);
}

console.log(`\nбез записи: ${problems.length} — движок споёт их браузерным синтезом,`);
console.log('то есть ЧУЖИМ голосом:\n');

const byFile = new Map();
for (const p of problems) byFile.set(p.file, (byFile.get(p.file) || 0) + 1);
console.log('по историям: ' + [...byFile].map(([f, k]) => `${f} ${k}`).join(', '));
console.log('');

const byWhy = new Map();
for (const p of problems) byWhy.set(p.why, [...(byWhy.get(p.why) || []), p]);

for (const [why, list] of byWhy) {
  console.log(`— ${why}: ${list.length}`);
  for (const p of list.slice(0, 6)) {
    console.log(`    ${p.file} / ${p.scene} [${p.role}] «${String(p.text).slice(0, 70)}»`
      + (p.вМанифесте ? '   (в манифесте есть — не хватает MP3)' : ''));
  }
  if (list.length > 6) console.log(`    … и ещё ${list.length - 6}`);
}
process.exit(1);
