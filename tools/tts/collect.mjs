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
import { makeTask, typesFor, poolKey } from '../../js/tasks.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// Вариантов поровну на каждый вид задачи. Раньше генератор выбирал вид
// случайно, и при ограничении сцены одним видом вариантов могло остаться
// вчетверо меньше, чем кажется.
import { clipId, splitDialogue } from './clip.mjs';

const PER_TYPE = 10;

// Генератор заданий берёт числа из Math.random, поэтому каждый запуск
// коллектора давал бы новый пул, и вся озвучка устаревала целиком.
// Подменяем источник случайности на воспроизводимый: тот же набор данных —
// тот же набор вопросов, и пересобирать нужно только то, что добавилось.
//
// Семя считается от ключа пула, а не одно на весь прогон. С общим семенем
// новая история сдвигала поток случайных чисел и переписывала вопросы всех
// прежних сцен — а значит, и всю их озвучку. Теперь ключи независимы:
// добавление комикса не трогает ни один готовый файл.
function seedRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Расчёт имени файла и разбор «ёлочек» живут отдельным модулем: его
// импортирует проверка `tools/check-voices.mjs`, а импорт самого
// коллектора пересобирал бы манифест и пул — весь разбор у него на
// верхнем уровне. Переэкспорт оставлен, чтобы прежние импорты работали.
export { clipId, splitDialogue } from './clip.mjs';
// Правило «всё или ничего» и сборка вопроса из подписей берутся из общего
// модуля: пока коллектор знал их по-своему, он озвучивал подписи всегда,
// и 111 записей ложились в офлайн-кэш, ни разу не прозвучав.
import { askLine, spokenLabels } from './utterances.mjs';

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
    const sceneChoices = scene.choices || [];
    // Вопрос у сцены с выбором есть всегда: свой или собранный из подписей.
    const scenePrompt = scene.prompt ?? (sceneChoices.length ? askLine(sceneChoices) : null);
    if (scenePrompt) add(fill(scenePrompt), 'narrator');

    for (const c of sceneChoices) {
      // Роль реплики варианта считается ровно так же, как в js/app.js:
      // свой голос варианта, иначе голос сцены, иначе голос истории.
      // Пока здесь стоял голос истории, записи для сцены со своим голосом
      // искались под чужим именем и не находились вовсе: Алекс в девятом
      // дне заговорила Стивом, а голем — браузерным синтезом.
      if (c.say) for (const part of splitDialogue(fill(c.say), c.voice ?? scene.voice ?? character)) add(part.text, part.role);
      if (c.hint) add(fill(c.hint), 'narrator');
    }
    // Подписи на кнопках проговариваются вслух: мелкий текст с дивана
    // не прочесть, а выбирать ребёнок должен на слух. Но только если
    // вопрос не назвал их все — иначе движок их и не читает.
    for (const label of spokenLabels(fill(scenePrompt), sceneChoices)) add(label, 'narrator');

    if (scene.task) {
      const spec = typeof scene.task === 'string' ? { kind: scene.task } : scene.task;
      const theme = story.theme ?? 'forest';
      const max = spec.max ?? 10;
      const key = poolKey(theme, spec.kind, max, spec.topic, spec.spread);

      // Озвучиваем только те виды, которые сцены действительно просят.
      // Раньше пул набирался по всем видам сразу, и четыре пятых записей
      // никогда не звучали — просто лежали в офлайн-кэше.
      //
      // Один ключ могут делить несколько сцен с разными types, поэтому
      // виды складываются. Сцена без types (короткая запись "task": "math")
      // означает «любой», и тогда сужать нельзя вовсе.
      const prev = taskSpecs.get(key);
      const types = prev?.types === null || !spec.types?.length
        ? null
        : [...new Set([...(prev?.types ?? []), ...spec.types])];
      taskSpecs.set(key, { theme, kind: spec.kind, max, topic: spec.topic, types, spread: spec.spread });
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

/** Семя от строки ключа — чтобы ключи не влияли друг на друга. */
function seedOf(key) {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

for (const [key, spec] of taskSpecs) {
  Math.random = seedRandom(seedOf(key));
  const seen = new Map();

  const available = typesFor(spec.kind, spec.theme);
  const types = spec.types ? available.filter(t => spec.types.includes(t)) : available;

  for (const type of types) {
    let made = 0;
    for (let i = 0; i < PER_TYPE * 60 && made < PER_TYPE; i++) {
      const t = makeTask(spec.kind, {
        theme: spec.theme, max: spec.max, topic: spec.topic, types: [type],
        spread: spec.spread,
      });
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
    for (const label of spokenLabels(t.question, t.choices)) add(label, 'narrator');
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
