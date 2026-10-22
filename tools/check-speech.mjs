// Правила письма для озвучки: двоеточие перед прямой речью и слова,
// которых ребёнок не знает.
//
//   node tools/check-speech.mjs            — все истории и пул заданий
//   node tools/check-speech.mjs outpost    — одна история
//
// Чем это отличается от соседней check-stress-risk.mjs. Та СОВЕТУЕТ и всегда
// выходит с нулём: двусмысленное ударение — риск, а не дефект, и решает тот,
// кто слушал. Здесь наоборот — твёрдые запреты, и проверка ПАДАЕТ, чтобы её
// нельзя было проглядеть в выводе.
//
// Зачем вообще проверка, если правила записаны в CLAUDE.md. Потому что одной
// прозы уже не хватило: в граблях стояло, что «кладка» заменена, — я прочитал
// эту строку и всё равно употребил слово в двенадцатом дне восемь раз, а в
// десятом оно вдобавок никуда и не девалось. Ровно та же история, что с
// лимитом процессов: текст в файле не срабатывает в момент, когда пишешь.
//
// Проверяются ТОЛЬКО произносимые поля. `keywords` не озвучиваются, и
// запретные слова там не только допустимы, но и полезны: лишний синоним
// помогает распознаванию, если ребёнок вдруг так скажет.

import { readFileSync, readdirSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const rules = read('tools/tts/speech-rules.json');

const onlyStory = process.argv.slice(2).find((a) => !a.startsWith('--'));

const SPOKEN = ['text', 'speak', 'prompt', 'say', 'hint', 'label', 'question'];

// Границы слова вручную: \b в JS считает буквами только латиницу.
const wordAt = (stem) => new RegExp(`(?<![а-яёa-z])${stem}[а-яё]*`, 'giu');

const BANNED = rules.banned.map((b) => ({ ...b, re: wordAt(b.stem), allow: new Set(b.allow || []) }));
const COLON = /:\s*«/g;

const errors = [];
const advice = [];

/** Все произносимые строки объекта, с пометкой, где они лежат. */
function strings(node, where, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const item of node) strings(item, where, out);
    return out;
  }
  for (const [key, value] of Object.entries(node)) {
    if (typeof value === 'string') {
      if (SPOKEN.includes(key)) out.push({ where, key, text: value });
    } else strings(value, where, out);
  }
  return out;
}

function scan(list) {
  for (const item of list) {
    COLON.lastIndex = 0;
    if (COLON.test(item.text)) {
      errors.push({ ...item, rule: 'двоеточие перед прямой речью', instead: 'знак по смыслу: «!», «.» или «?»' });
    }
    for (const b of BANNED) {
      b.re.lastIndex = 0;
      let m;
      while ((m = b.re.exec(item.text)) !== null) {
        if (b.allow.has(m[0].toLowerCase())) continue;
        errors.push({ ...item, rule: `запретное слово «${m[0]}»`, instead: b.instead });
        break;
      }
    }
  }
}

const files = readdirSync('stories')
  .filter((f) => f.endsWith('.json') && f !== 'tasks-pool.json')
  .filter((f) => !onlyStory || f === onlyStory || f === onlyStory + '.json');

for (const file of files) {
  const story = read('stories/' + file);
  for (const [sceneId, scene] of Object.entries(story.scenes)) {
    const where = `${file} / ${sceneId}`;
    scan(strings(scene, where));
    // Совет, а не запрет: бой без восклицательного знака звучит так,
    // будто ничего не произошло. Эмоцию у fish несёт только пунктуация.
    if (scene.fx === 'impact' && scene.text && !scene.text.includes('!')) {
      advice.push({ where, text: scene.text });
    }
  }
}

// Пул заданий — главное место по весу: одно слово набора темы расходится
// в десятки вопросов, а фраза сценария живёт в одной сцене.
if (!onlyStory) {
  const pool = read('stories/tasks-pool.json');
  for (const [key, entries] of Object.entries(pool)) scan(strings(entries, `пул ${key}`));
}

/* ---------------- отчёт ---------------- */

const short = (s) => (s.length > 78 ? s.slice(0, 78) + '…' : s);

console.log(`проверено историй ${files.length}; нарушений ${errors.length}, советов ${advice.length}\n`);

const byRule = {};
for (const e of errors) (byRule[e.rule] ??= []).push(e);

for (const [rule, list] of Object.entries(byRule)) {
  console.log(`— ${rule} ×${list.length}`);
  console.log(`  вместо: ${list[0].instead}`);
  for (const e of list) console.log(`    ${e.where} [${e.key}] «${short(e.text)}»`);
  console.log();
}

if (advice.length) {
  console.log('— совет: сцена боя без восклицательного знака');
  for (const a of advice) console.log(`    ${a.where} «${short(a.text)}»`);
  console.log();
}

if (!errors.length) console.log('нарушений нет');
process.exitCode = errors.length ? 1 : 0;
