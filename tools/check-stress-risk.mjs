// Где в текстах стоят формы, у которых ударение нельзя задать.
//
//   node tools/check-stress-risk.mjs            — все истории и пул заданий
//   node tools/check-stress-risk.mjs day-two    — одна история
//   node tools/check-stress-risk.mjs --new      — только то, что не поймано accents.json
//
// Зачем это отдельно от accents.json. Тот файл чинит ударение у Silero:
// правило применяется при озвучке, и готовая запись выходит верной. У
// нейросетевой озвучки со стороны (fish.audio) такого рычага нет вовсе —
// метку ударения она не слушает, фонемных тегов для русского у неё не
// существует. Значит единственное управление — не употреблять форму,
// у которой чтений два. Проверка показывает такие места; правит человек.
//
// Проверка СОВЕТУЕТ, а не запрещает, и всегда выходит с нулём: двусмысленная
// форма — не дефект, а риск. Половина находок окажется безобидной (модель
// угадает по смыслу), и решать это может только тот, кто слушал. На «тотеме»
// уже выяснилось, чем кончается правка по ощущению: правило увело ударение
// не туда и испортило четырнадцать готовых записей.

import { readFileSync, readdirSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const risk = read('tools/tts/stress-risk.json');
const accents = read('tools/tts/accents.json');

const args = process.argv.slice(2);
const onlyNew = args.includes('--new');
const onlyStory = args.find((a) => !a.startsWith('--'));

// Произносимые поля. Остальное (`keywords`, пути к картинкам, `next`) до
// озвучки не доходит, и ловить там нечего.
const SPOKEN = ['text', 'speak', 'prompt', 'say', 'hint', 'label', 'question'];

/* ---------------- что именно ищем ---------------- */

// Границы слова приходится задавать руками: \b в JS считает буквами только
// латиницу, и «горе» находилось бы внутри «горевать».
const boundary = (form) => new RegExp(`(?<![а-яёa-z])${form}(?![а-яёa-z])`, 'giu');

const NEEDLES = [
  ...risk.ambiguous.map((r) => ({ ...r, kind: 'двусмысленно' })),
  ...risk.verbs.map((r) => ({ ...r, kind: 'омоним-глагол' })),
  ...risk.blacklist.map((r) => ({ form: r.word, reads: [r.heard], instead: r.instead, kind: 'модель ошибается' })),
].map((r) => ({ ...r, re: boundary(r.form) }));

// Фразы, которые уже разобраны для Silero. Их помечаем отдельно: место
// известное, вручную слушанное, и в первую очередь смотреть надо не на них.
const KNOWN = accents.rules.map((r) => r.from);
const knownAt = (text, form) =>
  KNOWN.filter((k) => k.includes(form) && text.includes(k));

/* ---------------- обход текстов ---------------- */

const findings = [];

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
    for (const n of NEEDLES) {
      n.re.lastIndex = 0;
      const m = n.re.exec(item.text);
      if (!m) continue;
      findings.push({
        ...item,
        form: m[0],
        kind: n.kind,
        reads: n.reads,
        instead: n.instead,
        known: knownAt(item.text, n.form),
      });
    }
  }
}

const files = readdirSync('stories')
  .filter((f) => f.endsWith('.json') && f !== 'tasks-pool.json')
  .filter((f) => !onlyStory || f === onlyStory || f === onlyStory + '.json');

for (const file of files) {
  const story = read('stories/' + file);
  const viewer = story.viewer;
  for (const [sceneId, scene] of Object.entries(story.scenes)) {
    const list = strings(scene, `${file} / ${sceneId}`);
    // Имя зрителя подставляется при загрузке — проверяем то, что прозвучит.
    if (viewer) for (const s of list) s.text = s.text.replaceAll('{{имя}}', viewer);
    scan(list);
  }
}

// Пул заданий — главное место по весу: одно слово в наборе темы
// размножается в десятки вопросов, а фраза в сценарии живёт в одной сцене.
if (!onlyStory) {
  const pool = read('stories/tasks-pool.json');
  for (const [key, entries] of Object.entries(pool)) {
    scan(strings(entries, `пул ${key}`));
  }
}

/* ---------------- отчёт ---------------- */

const shown = onlyNew ? findings.filter((f) => !f.known.length) : findings;

const byForm = new Map();
for (const f of shown) byForm.set(f.form.toLowerCase(), [...(byForm.get(f.form.toLowerCase()) || []), f]);

const prose = shown.filter((f) => !f.where.startsWith('пул '));
const tasks = shown.filter((f) => f.where.startsWith('пул '));

console.log(`проверено историй ${files.length}; находок ${shown.length}`
  + ` (в сценариях ${prose.length}, в пуле заданий ${tasks.length})`);
if (!shown.length) {
  console.log('\nопасных форм не нашлось');
  process.exit(0);
}

const order = [...byForm.entries()].sort((a, b) => b[1].length - a[1].length);

for (const [form, list] of order) {
  const first = list[0];
  console.log(`\n— «${form}» ×${list.length}  (${first.kind})`);
  console.log(`  читается: ${first.reads.join('  |  ')}`);
  if (first.instead?.length) console.log(`  вместо:   ${first.instead.join('; ')}`);
  const seen = new Set();
  const uniq = list.filter((f) => !seen.has(f.text) && seen.add(f.text));
  if (uniq.length < list.length) {
    console.log(`  разных текстов ${uniq.length}, записей задето ${list.length}`);
  }
  for (const f of uniq.slice(0, 4)) {
    const snippet = f.text.length > 92 ? f.text.slice(0, 92) + '…' : f.text;
    console.log(`    ${f.where} [${f.key}] «${snippet}»`);
    if (f.known.length) console.log(`      уже поймано для Silero: ${f.known.map((k) => `«${k}»`).join(', ')}`);
  }
  if (uniq.length > 4) console.log(`    … и ещё ${uniq.length - 4} разных`);
}

const newOnes = findings.filter((f) => !f.known.length).length;
console.log(`\nиз них не разобрано для Silero: ${newOnes}`
  + (onlyNew ? '' : '  (показать только их: --new)'));
console.log('Это советы, а не дефекты: смотреть глазами, править по смыслу,'
  + ' уводить в простое слово, а не в редкое.');
