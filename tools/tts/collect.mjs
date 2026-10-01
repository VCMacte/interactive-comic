// Собирает всё, что нужно озвучить, в один манифест.
//
// Задания генерируются на лету, поэтому озвучить их «как есть» нельзя.
// Решение: прогнать генератор заранее, получить пул готовых вопросов
// и озвучить каждый целиком. В игре берётся случайный из пула — речь
// звучит слитно, а разнообразие сохраняется.
//
// Запуск: node tools/tts/collect.mjs

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTask, TASK_TYPES } from '../../js/tasks.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Вариантов поровну на каждый вид задачи. Раньше генератор выбирал вид
// случайно, и при ограничении сцены одним видом вариантов могло остаться
// вчетверо меньше, чем кажется.
const PER_TYPE = 10;

// Генератор заданий берёт числа из Math.random, поэтому каждый запуск
// коллектора давал бы новый пул, и вся озвучка устаревала целиком.
// Подменяем источник случайности на воспроизводимый: тот же VARIANTS —
// тот же набор вопросов, и пересобирать нужно только то, что добавилось.
function seedRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Идентификатор реплики — от её текста и роли. Так приложение находит
 * нужный файл, ничего не зная о структуре сцен: совпал текст — нашлась
 * озвучка. Задания из пула подхватываются тем же механизмом.
 */
export function clipId(text, role) {
  let h = 0x811c9dc5;
  const s = role + '|' + text.trim();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Прямая речь в «ёлочках» — голос персонажа, остальное — рассказчик. */
export function splitDialogue(text, character) {
  const out = [];
  const re = /«([^»]*)»/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ role: 'narrator', text: text.slice(last, m.index) });
    out.push({ role: character, text: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ role: 'narrator', text: text.slice(last) });

  return out
    .map(s => ({ role: s.role, text: s.text.replace(/^[\s—,.:;-]+/, '').trim() }))
    .filter(s => s.text);
}

/* ---------------- сбор ---------------- */

const utterances = new Map();   // id -> {id, role, text}

function add(text, role) {
  const clean = (text || '').trim();
  if (!clean) return;
  const id = clipId(clean, role);
  const prev = utterances.get(id);
  if (prev && (prev.text !== clean || prev.role !== role)) {
    throw new Error(`столкновение идентификаторов: «${prev.text}» и «${clean}»`);
  }
  utterances.set(id, { id, role, text: clean });
}

// Пул заданий лежит там же, но историей не является: при повторном запуске
// коллектор пытался прочитать собственный результат и падал.
const stories = readdirSync(join(ROOT, 'stories'))
  .filter(f => f.endsWith('.json') && f !== 'tasks-pool.json');
const taskSpecs = new Map();    // "theme|kind|max" -> spec

for (const file of stories) {
  const story = JSON.parse(readFileSync(join(ROOT, 'stories', file), 'utf8'));
  const name = story.viewer;
  const fill = (s) => (name ? String(s).replaceAll('{{имя}}', name) : s);
  const character = story.voice ?? 'hero';

  for (const scene of Object.values(story.scenes)) {
    for (const part of splitDialogue(fill(scene.speak ?? scene.text), scene.voice ?? character)) {
      add(part.text, part.role);
    }
    if (scene.prompt) add(fill(scene.prompt), 'narrator');

    for (const c of scene.choices || []) {
      if (c.say) for (const part of splitDialogue(fill(c.say), character)) add(part.text, part.role);
      if (c.hint) add(fill(c.hint), 'narrator');
      // Подписи на кнопках проговариваются вслух: мелкий текст с дивана
      // не прочесть, а выбирать ребёнок должен на слух.
      add(c.label, 'narrator');
    }

    if (scene.task) {
      const spec = typeof scene.task === 'string' ? { kind: scene.task } : scene.task;
      const key = `${story.theme ?? 'forest'}|${spec.kind}|${spec.max ?? 10}`;
      taskSpecs.set(key, { theme: story.theme ?? 'forest', kind: spec.kind, max: spec.max ?? 10 });
    }
  }
}

// Похвалы и служебные реплики живут в коде, а не в сценарии.
const SYSTEM = [
  'Верно! Молодец.',
  'Правильно! Отлично справился.',
  'Точно! Ты внимательный.',
  'Да, именно так. Умница!',
  'Скажи ещё раз, только погромче. Или нажми ответ внизу.',
  'Не расслышал. Нажми на нужный ответ внизу.',
];
for (const line of SYSTEM) add(line, 'narrator');
add('Выбирай:', 'narrator');

/* ---------------- пул заданий ---------------- */

const pool = {};

const realRandom = Math.random;
Math.random = seedRandom(20260101);

for (const [key, spec] of taskSpecs) {
  const seen = new Map();

  for (const type of TASK_TYPES[spec.kind] ?? []) {
    let made = 0;
    for (let i = 0; i < PER_TYPE * 60 && made < PER_TYPE; i++) {
      const t = makeTask(spec.kind, { theme: spec.theme, max: spec.max, types: [type] });
      if (seen.has(t.question)) continue;
      seen.set(t.question, {
        type: t.type,
        question: t.question,
        hint: t.hint,
        choices: t.choices,
        audio: clipId(t.question, 'narrator'),
        hintAudio: clipId(t.hint, 'narrator'),
      });
      made++;
    }
  }

  pool[key] = [...seen.values()];
  for (const t of pool[key]) {
    add(t.question, 'narrator');
    add(t.hint, 'narrator');
    for (const c of t.choices) add(c.label, 'narrator');
  }
  const byType = {};
  for (const t of pool[key]) byType[t.type] = (byType[t.type] ?? 0) + 1;
  console.log(`${key}: ${pool[key].length} вариантов`, byType);
}

Math.random = realRandom;

/* ---------------- запись ---------------- */

mkdirSync(join(ROOT, 'tools', 'tts'), { recursive: true });
writeFileSync(join(ROOT, 'tools', 'tts', 'manifest.json'),
  JSON.stringify([...utterances.values()], null, 1), 'utf8');
writeFileSync(join(ROOT, 'stories', 'tasks-pool.json'),
  JSON.stringify(pool, null, 1), 'utf8');

const totalChars = [...utterances.values()].reduce((s, u) => s + u.text.length, 0);
console.log(`\nреплик: ${utterances.size}, символов: ${totalChars}`);
console.log(`примерно ${Math.round(totalChars / 14)} секунд речи`);
