// Генератор заданий. Каждый заход на сцену с заданием даёт новое,
// поэтому сказку можно слушать много раз, и она не приедается.
//
// Уровень намеренно низкий: счёт в пределах десяти и логика,
// доступная дошкольнику. Задача здесь — поддержать повествование,
// а не проверить знания.

const NUM = ['ноль', 'один', 'два', 'три', 'четыре', 'пять',
             'шесть', 'семь', 'восемь', 'девять', 'десять'];

const rnd = (n) => Math.floor(Math.random() * n);
const pickOne = (arr) => arr[rnd(arr.length)];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const word = (n) => NUM[n][0].toUpperCase() + NUM[n].slice(1);

/** Вариант ответа-числа: на экране слово, голосом принимаем и слово, и цифру. */
const numChoice = (n, correct) => ({
  label: word(n),
  keywords: [NUM[n], String(n)],
  correct,
});

/** Два неверных числа рядом с правильным — чтобы выбор был осмысленным. */
function numberChoices(answer, max = 10) {
  const wrong = new Set();
  while (wrong.size < 2) {
    const delta = pickOne([-2, -1, 1, 2]);
    const v = answer + delta;
    if (v >= 0 && v <= max && v !== answer) wrong.add(v);
  }
  return shuffle([numChoice(answer, true), ...[...wrong].map(v => numChoice(v, false))]);
}

/* ---------------- математика до десяти ---------------- */

// Только мужской род и только неодушевлённые: тогда «один гриб» не превращается
// в «один ягода», а винительный падеж совпадает с именительным — «унёс один гриб».
// С женским родом пришлось бы тащить ещё два набора окончаний ради той же задачи.
const COUNTABLE = [
  { one: 'гриб', few: 'гриба', many: 'грибов' },
  { one: 'жёлудь', few: 'жёлудя', many: 'желудей' },
  { one: 'листик', few: 'листика', many: 'листиков' },
  { one: 'орешек', few: 'орешка', many: 'орешков' },
  { one: 'камешек', few: 'камешка', many: 'камешков' },
  { one: 'цветок', few: 'цветка', many: 'цветков' },
];

// Родительный падеж числительных — для оборота «после двух».
const NUM_GEN = ['нуля', 'одного', 'двух', 'трёх', 'четырёх', 'пяти',
                 'шести', 'семи', 'восьми', 'девяти', 'десяти'];

// Русские числительные требуют согласования: 1 шишка, 2 шишки, 5 шишек.
function plural(n, forms) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms.one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms.few;
  return forms.many;
}

const count = (n, forms) => `${NUM[n]} ${plural(n, forms)}`;

function taskAddition() {
  const a = 1 + rnd(5);              // 1..5
  const b = 1 + rnd(Math.min(5, 10 - a));
  const thing = pickOne(COUNTABLE);
  return {
    question: `Сколько будет ${count(a, thing)} и ещё ${count(b, thing)}?`,
    hint: `Посчитаем вместе: ${count(a, thing)}, и прибавим ещё ${NUM[b]}.`,
    choices: numberChoices(a + b),
  };
}

function taskSubtraction() {
  const a = 3 + rnd(8);              // 3..10
  const b = 1 + rnd(a - 1);          // меньше, чем было
  const thing = pickOne(COUNTABLE);
  return {
    question: `Было ${count(a, thing)}, ветер унёс ${count(b, thing)}. Сколько осталось?`,
    hint: `Было ${NUM[a]}, унесло ${NUM[b]}. Отними и скажи, сколько стало.`,
    choices: numberChoices(a - b),
  };
}

function taskCompare() {
  let a = 1 + rnd(9), b = 1 + rnd(9);
  while (a === b) b = 1 + rnd(9);
  const thing = pickOne(COUNTABLE);
  // Здесь вариантов ровно два: придумывать третье число незачем,
  // вопрос и так про выбор между двумя.
  return {
    question: `У ёжика ${count(a, thing)}, у зайца ${count(b, thing)}. Какое число больше?`,
    hint: `Посчитай по порядку и услышишь, какое число встретится позже.`,
    choices: shuffle([
      numChoice(Math.max(a, b), true),
      numChoice(Math.min(a, b), false),
    ]),
  };
}

function taskNext() {
  const start = 1 + rnd(7);
  return {
    question: `Какое число идёт после ${NUM_GEN[start]}?`,
    hint: `Посчитай по порядку: ${NUM[start - 1]}, ${NUM[start]}, а дальше?`,
    choices: numberChoices(start + 1),
  };
}

const MATH = [taskAddition, taskSubtraction, taskCompare, taskNext];

/* ---------------- логика того же уровня ---------------- */

const ODD_ONE_OUT = [
  { group: ['яблоко', 'груша', 'слива'], odd: 'стул', why: 'фрукты' },
  { group: ['кошка', 'собака', 'лошадка'], odd: 'ромашка', why: 'животные' },
  { group: ['машина', 'автобус', 'самолёт'], odd: 'банан', why: 'на них ездят и летают' },
  { group: ['дождь', 'снег', 'туман'], odd: 'стол', why: 'бывают на улице' },
  { group: ['чашка', 'ложка', 'тарелка'], odd: 'ёжик', why: 'посуда' },
  { group: ['берёза', 'дуб', 'ёлка'], odd: 'ботинок', why: 'деревья' },
];

function taskOddOneOut() {
  const set = pickOne(ODD_ONE_OUT);
  const two = shuffle(set.group).slice(0, 2);
  return {
    question: `Что здесь лишнее: ${two[0]}, ${two[1]} или ${set.odd}?`,
    hint: `Подумай: два из них — это ${set.why}. А третий?`,
    choices: shuffle([
      { label: cap(set.odd), keywords: [set.odd], correct: true },
      ...two.map(w => ({ label: cap(w), keywords: [w], correct: false })),
    ]),
  };
}

const OPPOSITES = [
  ['день', 'ночь'], ['большой', 'маленький'], ['горячий', 'холодный'],
  ['высокий', 'низкий'], ['быстрый', 'медленный'], ['светло', 'темно'],
  ['весёлый', 'грустный'], ['чистый', 'грязный'],
];

function taskOpposite() {
  const [a, b] = pickOne(OPPOSITES);
  const flip = Math.random() < 0.5;
  const [from, to] = flip ? [b, a] : [a, b];
  const others = OPPOSITES.flat().filter(w => w !== from && w !== to);
  return {
    question: `Скажи наоборот: ${from}. Это будет…?`,
    hint: `${cap(from)} — а если совсем наоборот?`,
    choices: shuffle([
      { label: cap(to), keywords: [to], correct: true },
      ...shuffle(others).slice(0, 2).map(w => ({ label: cap(w), keywords: [w], correct: false })),
    ]),
  };
}

// Третий вариант — из той же категории, что и пара. Иначе он слишком
// заметно лишний, ребёнок отсеивает его не думая, и задание пропадает зря.
const PATTERNS = [
  ['солнышко', 'тучка', 'звёздочка'],
  ['красный', 'синий', 'жёлтый'],
  ['кружок', 'квадратик', 'треугольник'],
  ['ёжик', 'зайчик', 'лисичка'],
  ['яблоко', 'груша', 'слива'],
];

function taskPattern() {
  const [a, b, extra] = pickOne(PATTERNS);
  return {
    question: `Что дальше: ${a}, ${b}, ${a}, ${b}, а потом?`,
    hint: `Они идут по очереди. После «${b}» снова начинается тот же порядок.`,
    choices: shuffle([
      { label: cap(a), keywords: [a], correct: true },
      { label: cap(b), keywords: [b], correct: false },
      { label: cap(extra), keywords: [extra], correct: false },
    ]),
  };
}

const HOMES = [
  { who: 'рыбка', where: 'река', wrong: ['небо', 'нора'] },
  { who: 'птичка', where: 'гнездо', wrong: ['река', 'берлога'] },
  { who: 'медведь', where: 'берлога', wrong: ['гнездо', 'река'] },
  { who: 'ёжик', where: 'нора', wrong: ['небо', 'гнездо'] },
  { who: 'пчела', where: 'улей', wrong: ['нора', 'река'] },
];

function taskHome() {
  const h = pickOne(HOMES);
  return {
    question: `Где живёт ${h.who}?`,
    hint: `Вспомни, где ${h.who} прячется, когда хочет поспать.`,
    choices: shuffle([
      { label: cap(h.where), keywords: [h.where], correct: true },
      ...h.wrong.map(w => ({ label: cap(w), keywords: [w], correct: false })),
    ]),
  };
}

const LOGIC = [taskOddOneOut, taskOpposite, taskPattern, taskHome];

const cap = (s) => s[0].toUpperCase() + s.slice(1);

/* ---------------- выдача ---------------- */

// Чтобы одно и то же задание не выпало дважды подряд.
const recent = [];

/**
 * @param {'math'|'logic'|'any'} kind
 * @returns {{question:string, hint:string, choices:Array<{label:string,keywords:string[],correct:boolean}>}}
 */
export function makeTask(kind = 'any') {
  const pool = kind === 'math' ? MATH : kind === 'logic' ? LOGIC : [...MATH, ...LOGIC];

  let task;
  for (let attempt = 0; attempt < 6; attempt++) {
    task = pickOne(pool)();
    if (!recent.includes(task.question)) break;
  }

  recent.push(task.question);
  if (recent.length > 4) recent.shift();
  return task;
}
