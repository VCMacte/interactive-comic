import { makeTask } from './js/tasks.js';

let failed = 0;
const fail = (msg) => { console.log('FAIL: ' + msg); failed++; };

// 600 заданий — хватит, чтобы каждый генератор отработал много раз.
const seen = new Map();
for (let i = 0; i < 600; i++) {
  const kind = i % 2 ? 'math' : 'logic';
  const t = makeTask(kind);

  if (!t.question || !t.hint) fail('пустой вопрос или подсказка');
  const correct = t.choices.filter(c => c.correct);
  if (correct.length !== 1) fail(`правильных ответов ${correct.length}: ${t.question}`);
  if (t.choices.length < 2 || t.choices.length > 3) fail(`вариантов ${t.choices.length}: ${t.question}`);

  const labels = t.choices.map(c => c.label);
  if (new Set(labels).size !== labels.length) fail(`повтор вариантов: ${t.question} -> ${labels}`);
  for (const c of t.choices) {
    if (!c.label || !c.keywords?.length) fail('вариант без подписи или ключевых слов');
  }
  seen.set(t.question, (seen.get(t.question) || 0) + 1);
}

console.log(`уникальных заданий: ${seen.size} из 600 генераций`);
if (seen.size < 100) fail('слишком мало разнообразия');

// Арифметика: проверяем, что правильный ответ действительно правильный.
const NUM = ['ноль','один','два','три','четыре','пять','шесть','семь','восемь','девять','десять'];
const toNum = (w) => NUM.indexOf(w.toLowerCase());

for (let i = 0; i < 400; i++) {
  const t = makeTask('math');
  const answer = toNum(t.choices.find(c => c.correct).label);
  if (answer < 0 || answer > 10) fail(`ответ вне счёта до десяти: ${t.question} -> ${answer}`);

  const nums = [...t.question.matchAll(/[а-яё]+/gi)].map(m => toNum(m[0])).filter(n => n >= 0);

  if (/и ещё/.test(t.question)) {
    const [a, b] = nums;
    if (a + b !== answer) fail(`сложение: ${t.question} -> ${answer} (${a}+${b})`);
    if (a + b > 10) fail(`сумма больше десяти: ${t.question}`);
  } else if (/унёс/.test(t.question)) {
    const [a, b] = nums;
    if (a - b !== answer) fail(`вычитание: ${t.question} -> ${answer} (${a}-${b})`);
    if (a - b < 0) fail(`отрицательный ответ: ${t.question}`);
  } else if (/больше/.test(t.question)) {
    if (answer !== Math.max(...nums.slice(0, 2))) fail(`сравнение: ${t.question} -> ${answer}`);
  } else if (/после/.test(t.question)) {
    const GEN = ['нуля','одного','двух','трёх','четырёх','пяти','шести','семи','восьми','девяти','десяти'];
    const from = GEN.indexOf(t.question.match(/после ([а-яё]+)/i)[1].toLowerCase());
    if (answer !== from + 1) fail(`следующее число: ${t.question} -> ${answer}`);
  }
}

// Два одинаковых задания подряд не выдаются.
let prev = '';
for (let i = 0; i < 300; i++) {
  const q = makeTask('any').question;
  if (q === prev) fail('задание повторилось подряд: ' + q);
  prev = q;
}

console.log('\nпримеры:');
for (const kind of ['math', 'logic']) {
  for (let i = 0; i < 4; i++) {
    const t = makeTask(kind);
    const right = t.choices.find(c => c.correct).label;
    console.log(`  [${kind}] ${t.question}  ->  ${right}   {${t.choices.map(c => c.label).join(', ')}}`);
  }
}

console.log(failed ? `\n${failed} провалено` : '\nвсе проверки пройдены');
process.exit(failed ? 1 : 0);
