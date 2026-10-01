// Генератор заданий. Каждый заход на сцену с заданием даёт новое,
// поэтому сказку можно слушать много раз, и она не приедается.
//
// Уровень намеренно низкий: счёт в пределах десяти-двадцати и логика,
// доступная первокласснику. Задача здесь — поддержать повествование,
// а не проверить знания.
//
// Тема задаёт предметный мир: что считаем и о ком логические загадки.
// Предел счёта задаётся сценой, чтобы сложность росла по ходу истории.

const NUM = ['ноль', 'один', 'два', 'три', 'четыре', 'пять',
             'шесть', 'семь', 'восемь', 'девять', 'десять',
             'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать',
             'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать', 'двадцать'];

// Родительный падеж числительных — для оборота «после двух».
const NUM_GEN = ['нуля', 'одного', 'двух', 'трёх', 'четырёх', 'пяти',
                 'шести', 'семи', 'восьми', 'девяти', 'десяти',
                 'одиннадцати', 'двенадцати', 'тринадцати', 'четырнадцати', 'пятнадцати',
                 'шестнадцати', 'семнадцати', 'восемнадцати', 'девятнадцати', 'двадцати'];

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

const cap = (s) => s[0].toUpperCase() + s.slice(1);
const word = (n) => cap(NUM[n]);

/** Вариант ответа-числа: на экране слово, голосом принимаем и слово, и цифру. */
const numChoice = (n, correct) => ({
  label: word(n),
  keywords: [NUM[n], String(n)],
  correct,
});

/** Два неверных числа рядом с правильным — чтобы выбор был осмысленным. */
function numberChoices(answer, max) {
  const wrong = new Set();
  let guard = 0;
  while (wrong.size < 2 && guard++ < 50) {
    const v = answer + pickOne([-2, -1, 1, 2]);
    if (v >= 0 && v <= max && v !== answer) wrong.add(v);
  }
  return shuffle([numChoice(answer, true), ...[...wrong].map(v => numChoice(v, false))]);
}

// Русские числительные требуют согласования: 1 блок, 2 блока, 5 блоков.
function plural(n, forms) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms.one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms.few;
  return forms.many;
}

const count = (n, forms) => `${NUM[n]} ${plural(n, forms)}`;

/* ---------------- темы ---------------- */

// Существительные для счёта — только мужской род и только неодушевлённые.
// Тогда «один блок» не превращается в «один доска», а винительный падеж
// совпадает с именительным: «ветер унёс один блок». С женским родом
// пришлось бы тащить ещё два набора окончаний ради той же задачи.
const THEMES = {
  forest: {
    countable: [
      { one: 'гриб', few: 'гриба', many: 'грибов' },
      { one: 'жёлудь', few: 'жёлудя', many: 'желудей' },
      { one: 'листик', few: 'листика', many: 'листиков' },
      { one: 'орешек', few: 'орешка', many: 'орешков' },
      { one: 'камешек', few: 'камешка', many: 'камешков' },
      { one: 'цветок', few: 'цветка', many: 'цветков' },
    ],
    actors: ['ёжика', 'зайца'],
    lost: 'ветер унёс',
    oddOneOut: [
      { group: ['яблоко', 'груша', 'слива'], odd: 'стул', why: 'фрукты' },
      { group: ['кошка', 'собака', 'лошадка'], odd: 'ромашка', why: 'животные' },
      { group: ['машина', 'автобус', 'самолёт'], odd: 'банан', why: 'на них ездят и летают' },
      { group: ['дождь', 'снег', 'туман'], odd: 'стол', why: 'бывают на улице' },
      { group: ['чашка', 'ложка', 'тарелка'], odd: 'ёжик', why: 'посуда' },
      { group: ['берёза', 'дуб', 'ёлка'], odd: 'ботинок', why: 'деревья' },
    ],
    opposites: [
      ['день', 'ночь'], ['большой', 'маленький'], ['горячий', 'холодный'],
      ['высокий', 'низкий'], ['быстрый', 'медленный'], ['светло', 'темно'],
      ['весёлый', 'грустный'], ['чистый', 'грязный'],
    ],
    patterns: [
      ['солнышко', 'тучка', 'звёздочка'],
      ['красный', 'синий', 'жёлтый'],
      ['кружок', 'квадратик', 'треугольник'],
      ['ёжик', 'зайчик', 'лисичка'],
      ['яблоко', 'груша', 'слива'],
      ['утро', 'вечер', 'полдень'],
      ['берёза', 'ёлка', 'дуб'],
      ['белка', 'мышка', 'барсук'],
      ['дождик', 'солнышко', 'радуга'],
      ['шишка', 'жёлудь', 'орешек'],
    ],
    homes: [
      { who: 'рыбка', where: 'река', wrong: ['небо', 'нора'] },
      { who: 'птичка', where: 'гнездо', wrong: ['река', 'берлога'] },
      { who: 'медведь', where: 'берлога', wrong: ['гнездо', 'река'] },
      { who: 'ёжик', where: 'нора', wrong: ['небо', 'гнездо'] },
      { who: 'пчела', where: 'улей', wrong: ['нора', 'река'] },
      { who: 'лиса', where: 'нора', wrong: ['гнездо', 'улей'] },
      { who: 'белка', where: 'дупло', wrong: ['река', 'берлога'] },
      { who: 'бобёр', where: 'река', wrong: ['гнездо', 'дупло'] },
      { who: 'сова', where: 'дупло', wrong: ['нора', 'река'] },
      { who: 'муравей', where: 'муравейник', wrong: ['река', 'гнездо'] },
    ],
  },

  minecraft: {
    countable: [
      { one: 'блок', few: 'блока', many: 'блоков' },
      { one: 'слиток', few: 'слитка', many: 'слитков' },
      { one: 'факел', few: 'факела', many: 'факелов' },
      { one: 'алмаз', few: 'алмаза', many: 'алмазов' },
      { one: 'уголёк', few: 'уголька', many: 'угольков' },
      { one: 'камень', few: 'камня', many: 'камней' },
    ],
    actors: ['Стива', 'крипера'],
    lost: 'взорвал крипер',
    oddOneOut: [
      { group: ['крипер', 'зомби', 'скелет'], odd: 'морковка', why: 'мобы' },
      { group: ['алмаз', 'золото', 'изумруд'], odd: 'облако', why: 'руда' },
      { group: ['кирка', 'лопата', 'топор'], odd: 'курица', why: 'инструменты' },
      { group: ['факел', 'свеча', 'костёр'], odd: 'камень', why: 'они светят' },
      { group: ['корова', 'свинья', 'курица'], odd: 'сундук', why: 'животные' },
      { group: ['доска', 'палка', 'бревно'], odd: 'алмаз', why: 'из дерева' },
    ],
    opposites: [
      ['день', 'ночь'], ['свет', 'темнота'], ['высоко', 'низко'],
      ['далеко', 'близко'], ['быстро', 'медленно'], ['твёрдый', 'мягкий'],
      ['полный', 'пустой'], ['верх', 'низ'],
    ],
    patterns: [
      ['блок', 'факел', 'сундук'],
      ['камень', 'земля', 'песок'],
      ['алмаз', 'изумруд', 'золото'],
      ['крипер', 'зомби', 'скелет'],
      ['доска', 'бревно', 'палка'],
      ['день', 'ночь', 'рассвет'],
      ['кирка', 'лопата', 'топор'],
      ['вода', 'лава', 'лёд'],
      ['свинья', 'корова', 'курица'],
      ['уголёк', 'слиток', 'самоцвет'],
    ],
    homes: [
      { who: 'крипер', where: 'пещера', wrong: ['облако', 'сундук'] },
      { who: 'корова', where: 'луг', wrong: ['пещера', 'лава'] },
      { who: 'рыба', where: 'река', wrong: ['пещера', 'дерево'] },
      { who: 'летучая мышь', where: 'пещера', wrong: ['река', 'луг'] },
      { who: 'курица', where: 'двор', wrong: ['лава', 'пещера'] },
      { who: 'овца', where: 'луг', wrong: ['пещера', 'лава'] },
      { who: 'свинья', where: 'двор', wrong: ['река', 'пещера'] },
      { who: 'лошадь', where: 'луг', wrong: ['пещера', 'река'] },
      { who: 'скелет', where: 'пещера', wrong: ['луг', 'двор'] },
      { who: 'осьминог', where: 'река', wrong: ['пещера', 'двор'] },
    ],
  },
};

/* ---------------- арифметика ---------------- */

function taskAddition(t, max) {
  // Слагаемые соразмерны пределу: при максимуме двадцать «один плюс два»
  // было бы обидно простым, а при десяти — «девять плюс восемь» неподъёмным.
  const half = Math.max(2, Math.floor(max / 2));
  const a = 1 + rnd(half);
  const b = 1 + rnd(Math.min(half, max - a));
  const thing = pickOne(t.countable);
  return {
    question: `Сколько будет ${count(a, thing)} и ещё ${count(b, thing)}?`,
    hint: `Посчитаем вместе: ${count(a, thing)}, и прибавим ещё ${NUM[b]}.`,
    choices: numberChoices(a + b, max),
  };
}

function taskSubtraction(t, max) {
  // Вычитание держим в пределах десяти даже там, где сложение идёт до двадцати:
  // переход через десяток в обратную сторону первокласснику даётся заметно хуже.
  const top = Math.min(max, 10);
  const a = 3 + rnd(top - 2);
  const b = 1 + rnd(a - 1);
  const thing = pickOne(t.countable);
  return {
    question: `Было ${count(a, thing)}, ${t.lost} ${count(b, thing)}. Сколько осталось?`,
    hint: `Было ${NUM[a]}, пропало ${NUM[b]}. Отними и скажи, сколько стало.`,
    choices: numberChoices(a - b, max),
  };
}

function taskCompare(t, max) {
  let a = 1 + rnd(max), b = 1 + rnd(max);
  while (a === b) b = 1 + rnd(max);
  const thing = pickOne(t.countable);
  const [first, second] = t.actors;
  // Здесь вариантов ровно два: придумывать третье число незачем,
  // вопрос и так про выбор между двумя.
  return {
    question: `У ${first} ${count(a, thing)}, у ${second} ${count(b, thing)}. Какое число больше?`,
    hint: 'Посчитай по порядку и услышишь, какое число встретится позже.',
    choices: shuffle([
      numChoice(Math.max(a, b), true),
      numChoice(Math.min(a, b), false),
    ]),
  };
}

function taskNext(t, max) {
  const start = 1 + rnd(max - 1);
  return {
    question: `Какое число идёт после ${NUM_GEN[start]}?`,
    hint: `Посчитай по порядку: ${NUM[start - 1]}, ${NUM[start]}, а дальше?`,
    choices: numberChoices(start + 1, max),
  };
}

// Вид задания помечается явно: сцена может потребовать только подходящие
// по смыслу. Загадка про антоним посреди сцены с крипером и стеной выглядит
// вставленной наугад — потому что так и было.
const MATH = [
  { type: 'addition', make: taskAddition },
  { type: 'subtraction', make: taskSubtraction },
  { type: 'compare', make: taskCompare },
  { type: 'next', make: taskNext },
];

/* ---------------- логика того же уровня ---------------- */

function taskOddOneOut(t) {
  const set = pickOne(t.oddOneOut);
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

function taskOpposite(t) {
  const [a, b] = pickOne(t.opposites);
  const flip = Math.random() < 0.5;
  const [from, to] = flip ? [b, a] : [a, b];
  const others = t.opposites.flat().filter(w => w !== from && w !== to);
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
function taskPattern(t) {
  const [a, b, extra] = pickOne(t.patterns);
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

function taskHome(t) {
  const h = pickOne(t.homes);
  return {
    question: `Где живёт ${h.who}?`,
    hint: `Вспомни, где ${h.who} прячется, когда хочет поспать.`,
    choices: shuffle([
      { label: cap(h.where), keywords: [h.where], correct: true },
      ...h.wrong.map(w => ({ label: cap(w), keywords: [w], correct: false })),
    ]),
  };
}

const LOGIC = [
  { type: 'oddOneOut', make: taskOddOneOut },
  { type: 'opposite', make: taskOpposite },
  { type: 'pattern', make: taskPattern },
  { type: 'home', make: taskHome },
];

/* ---------------- выдача ---------------- */

// Чтобы одно и то же задание не выпало дважды подряд.
const recent = [];

// Готовый пул заданий, озвученных заранее. Генератор остаётся на месте:
// он и строит этот пул на сборке, и работает запасным вариантом, если
// пул не загрузился. Разница только в том, что из пула берётся фраза,
// для которой уже есть запись голосом.
let pool = null;

export function usePool(data) { pool = data || null; }

/**
 * @param {'math'|'logic'|'any'} kind
 * @param {{theme?: string, max?: number}} opts предел счёта задаёт сцена,
 *        чтобы сложность росла по ходу истории
 * @returns {{question:string, hint:string, choices:Array<{label:string,keywords:string[],correct:boolean}>}}
 */
export const TASK_TYPES = {
  math: MATH.map(g => g.type),
  logic: LOGIC.map(g => g.type),
};

export function makeTask(kind = 'any', opts = {}) {
  const themeName = opts.theme ?? 'forest';
  const theme = THEMES[themeName] ?? THEMES.forest;
  const max = Math.min(Math.max(opts.max ?? 10, 5), 20);
  const wanted = opts.types?.length ? opts.types : null;

  const ready = pool?.[`${themeName}|${kind}|${max}`];
  if (ready && ready.length) {
    const fit = wanted ? ready.filter(t => wanted.includes(t.type)) : ready;
    if (fit.length) return fromPool(fit);
  }

  let generators = kind === 'math' ? MATH : kind === 'logic' ? LOGIC : [...MATH, ...LOGIC];
  if (wanted) {
    const fit = generators.filter(g => wanted.includes(g.type));
    if (fit.length) generators = fit;
  }

  let task, gen;
  for (let attempt = 0; attempt < 6; attempt++) {
    gen = pickOne(generators);
    task = gen.make(theme, max);
    if (!recent.includes(task.question)) break;
  }

  return remember({ ...task, type: gen.type });
}

function fromPool(ready) {
  let task = pickOne(ready);
  for (let attempt = 0; attempt < 6 && recent.includes(task.question); attempt++) {
    task = pickOne(ready);
  }
  // Варианты перемешиваем при каждой выдаче: иначе верный ответ всегда
  // оказывался бы на одной и той же кнопке и запоминался позицией.
  return remember({ ...task, choices: shuffle(task.choices) });
}

function remember(task) {
  recent.push(task.question);
  if (recent.length > 4) recent.shift();
  return task;
}
