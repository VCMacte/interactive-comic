import { matchChoice } from './js/match.js';
import assert from 'node:assert';

const choices = [
  { label: 'Пять', keywords: ['пять', '5'] },
  { label: 'Четыре', keywords: ['четыре', '4'] },
  { label: 'Налево, к реке', keywords: ['налево', 'лево', 'река'] },
];
const pick = (t) => matchChoice(t, choices)?.choice.label ?? null;

const cases = [
  ['пять', 'Пять'],
  ['5', 'Пять'],
  ['думаю пять брёвен', 'Пять'],
  ['пядь', 'Пять'],                  // типичная ошибка распознавания
  ['четыре', 'Четыре'],
  ['пойдем налево', 'Налево, к реке'],
  ['к речке', 'Налево, к реке'],
  ['ПЯТЬ!', 'Пять'],
  ['', null],
  ['абракадабра', null],
];

let failed = 0;
for (const [input, expected] of cases) {
  const got = pick(input);
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  "${input}" -> ${got}  (ждали ${expected})`);
}
console.log(failed ? `\n${failed} провалено` : '\nвсе проверки пройдены');
process.exit(failed ? 1 : 0);
