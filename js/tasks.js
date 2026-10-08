// Генератор заданий. Каждый заход на сцену с заданием даёт новое,
// поэтому сказку можно слушать много раз, и она не приедается.
//
// Уровень намеренно низкий: счёт в пределах десяти-двадцати и логика,
// доступная первокласснику. Задача здесь — поддержать повествование,
// а не проверить знания.
//
// Тема задаёт предметный мир: что считаем и о ком логические загадки.
// Предел счёта задаётся сценой, чтобы сложность росла по ходу истории.
//
// Сцена сужает набор ещё и по смыслу — полем topic. Одного вида задачи
// оказалось мало: в шахте спокойно выпадал вопрос про курицу, потому что
// вид подходил, а предметный мир оставался общим на всю тему.

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

// Разброс пошире — для сцен со `"spread": "wide"`. У тесной тройки ±1/±2
// два изъяна: числа часто идут подряд, и тогда верное оказывается ровно
// посередине, а у границы предела оба неверных встают с одной стороны —
// и верное всегда крайнее. И то, и другое ребёнок находит позицией,
// не считая.
//
// Почему флагом, а не заменой numberChoices: пул озвучки собирается
// генератором, и правка общего поведения переписала бы вопросы всех
// прежних ключей вместе с готовыми записями. Флаг входит в ключ пула,
// поэтому старые истории остаются байт в байт теми же.
const WIDE_GAPS = [2, 3, 4, 5];

/**
 * @param {number|number[]} traps результат «не той» операции — типичная ошибка.
 *        Такой вариант нельзя отбросить на глаз, его можно только посчитать.
 *        Список — потому что первая ловушка не всегда попадает в предел счёта:
 *        у вычитания «девять минус восемь» сумма семнадцать за пределом, и тогда
 *        ловушкой становится само услышанное «было девять».
 */
function numberChoicesWide(answer, max, traps) {
  const wrong = [];
  // Расстояние не меньше двух и до ответа, и между неверными: иначе тройка
  // идёт подряд и верное оказывается ровно посередине.
  const ok = (v) => v >= 0 && v <= max && Math.abs(v - answer) >= 2
    && wrong.every(w => Math.abs(w - v) >= 2);

  const trap = [traps].flat().find(v => Number.isInteger(v) && ok(v));
  if (trap !== undefined) wrong.push(trap);

  // Второе число — на расстоянии от двух до пяти и по возможности с другой
  // стороны от ответа, чем ловушка.
  const side = (s) => {
    const opts = WIDE_GAPS.map(g => answer + s * g).filter(ok);
    return opts.length ? pickOne(opts) : null;
  };
  const away = wrong.length ? -Math.sign(wrong[0] - answer) : pickOne([-1, 1]);
  const second = side(away) ?? side(-away);
  if (second !== null) wrong.push(second);

  // Ответ у самой границы — места на разброс может не остаться. Вариантов
  // всё равно должно быть три, поэтому добираем чем есть.
  for (let v = 0; v <= max && wrong.length < 2; v++) if (ok(v)) wrong.push(v);
  for (let v = 0; v <= max && wrong.length < 2; v++) {
    if (v !== answer && !wrong.includes(v)) wrong.push(v);
  }

  return shuffle([numChoice(answer, true), ...wrong.map(v => numChoice(v, false))]);
}

/** Какие варианты даёт сцена: тесные по умолчанию, широкие при `spread`. */
const spreadChoices = (answer, max, wide, traps) =>
  wide ? numberChoicesWide(answer, max, traps) : numberChoices(answer, max);

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
//
// Поле topic — метка предметной области, по которой сцена сужает набор.
// Записи без метки в сужение не попадают. Антонимы метками не размечены:
// это пары слов, у них нет места в сюжете, и они проходят любое сужение
// как есть.
//
// Чередования размечаются с шестого дня. Раньше они тоже проходили сужение
// насквозь, и в зале с рамкой портала выпадала загадка «свинья, корова,
// свинья, корова» — задание падало в историю с потолка, а это ровно то,
// чего правило про topic не допускает. Размеченная тройка записывается
// как { seq, topic }, неразмеченная остаётся простым массивом.
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
      { one: 'блок', few: 'блока', many: 'блоков', topic: 'blocks' },
      { one: 'камень', few: 'камня', many: 'камней', topic: ['blocks', 'ore'] },
      { one: 'алмаз', few: 'алмаза', many: 'алмазов', topic: 'ore' },
      // У слитка метки fuel нет намеренно: слитки не горят, и в сцене
      // с печкой получалось «было пять слитков, сгорело три слитка».
      { one: 'слиток', few: 'слитка', many: 'слитков', topic: ['ore', 'nether'] },
      { one: 'уголёк', few: 'уголька', many: 'угольков', topic: ['ore', 'fuel'] },
      { one: 'факел', few: 'факела', many: 'факелов', topic: 'fuel' },
      // Нижний мир — отдельный мир, и его предметы не должны выпадать
      // в сцене на лугу первого дня. Отсюда onlyTopic: такая запись живёт
      // только в своей области (см. narrow).
      { one: 'стержень', few: 'стержня', many: 'стержней', topic: 'nether', onlyTopic: true },
      { one: 'кирпич', few: 'кирпича', many: 'кирпичей', topic: 'nether', onlyTopic: true },
      { one: 'гриб', few: 'гриба', many: 'грибов', topic: 'nether', onlyTopic: true },
      // Край седьмого дня. Счётных слов здесь ровно два, и оба — то, что
      // гаснет: тогда lostBy.end 'погасло' верен при любом выпавшем слове.
      // «Столб» в счёт не идёт намеренно — «погасло три столба» звучало бы
      // нелепо, и сцена считает огоньки на столбах, а не столбы.
      { one: 'кристалл', few: 'кристалла', many: 'кристаллов', topic: 'end', onlyTopic: true },
      { one: 'огонёк', few: 'огонька', many: 'огоньков', topic: 'end', onlyTopic: true },
      // Рейд второго сезона. Снаряжение, а не добыча: его носят, теряют
      // и ломают — отсюда и глагол области. Все четыре слова мужского рода
      // и неодушевлённые, иначе выйдет «один тотем» рядом с «одна стрела».
      { one: 'щит', few: 'щита', many: 'щитов', topic: 'raid', onlyTopic: true },
      { one: 'арбалет', few: 'арбалета', many: 'арбалетов', topic: 'raid', onlyTopic: true },
      { one: 'шлем', few: 'шлема', many: 'шлемов', topic: 'raid', onlyTopic: true },
      { one: 'тотем', few: 'тотема', many: 'тотемов', topic: 'raid', onlyTopic: true },
    ],
    actors: ['Стива', 'крипера'],
    lost: 'взорвал крипер',
    // Как именно пропадает добро — зависит от места. У печки уголь сгорает,
    // а не взрывается: иначе вычитание в сцене с печкой звучит нелепо.
    lostBy: {
      fuel: 'сгорело',
      ore: 'укатилось в лаву',
      blocks: 'рассыпалось',
      nether: 'упало в лаву',
      end: 'погасло',
      // Снаряжение не горит и не катится в лаву — его ломают в бою.
      // Глагол подобран ко всем четырём словам области сразу.
      raid: 'сломали разбойники',
    },
    oddOneOut: [
      { group: ['крипер', 'зомби', 'скелет'], odd: 'морковка', why: 'мобы' },
      { group: ['алмаз', 'золото', 'изумруд'], odd: 'облако', why: 'руда', topic: 'ore' },
      { group: ['кирка', 'лопата', 'топор'], odd: 'курица', why: 'инструменты' },
      { group: ['факел', 'свеча', 'костёр'], odd: 'камень', why: 'они светят', topic: 'fuel' },
      { group: ['корова', 'свинья', 'курица'], odd: 'сундук', why: 'животные', topic: 'animals' },
      { group: ['волк', 'лошадь', 'овца'], odd: 'факел', why: 'животные', topic: 'animals' },
      { group: ['рыба', 'осьминог', 'черепаха'], odd: 'кирка', why: 'живут в воде', topic: 'animals' },
      { group: ['доска', 'палка', 'бревно'], odd: 'алмаз', why: 'из дерева', topic: 'craft' },
      // Библиотека шестого дня. Метка `onlyTopic` здесь не про «поздний
      // мир», а про готовую озвучку: общий набор уже начитан целиком, и
      // любое его расширение переписало бы пул первого дня. В своей области
      // запись живёт, в общий набор не попадает.
      { group: ['книга', 'свиток', 'страница'], odd: 'кирка', why: 'это читают', topic: 'craft', onlyTopic: true },
      { group: ['книга', 'свиток', 'буква'], odd: 'уголёк', why: 'это читают', topic: 'craft', onlyTopic: true },
      { group: ['обсидиан', 'булыжник', 'песок'], odd: 'курица', why: 'блоки', topic: 'blocks' },
      { group: ['доска', 'кирпич', 'камень'], odd: 'облако', why: 'из них строят', topic: 'blocks' },
      // Нижний мир: лишнее здесь — не «не предмет», а «не отсюда».
      // Поэтому и группа, и лишнее — вещи одного рода, разводит их только
      // место. Слова взяты те, что ребёнок увидит в самой истории.
      { group: ['стержень', 'кварц', 'кирпич'], odd: 'доска', why: 'из Нижнего мира', topic: 'nether', onlyTopic: true },
      { group: ['гриб', 'кварц', 'стержень'], odd: 'пшеница', why: 'из Нижнего мира', topic: 'nether', onlyTopic: true },
      { group: ['лава', 'обсидиан', 'кирпич'], odd: 'трава', why: 'из Нижнего мира', topic: 'nether', onlyTopic: true },
      // Край: лишнее здесь — тоже «не отсюда», как в Нижнем мире. Группа
      // и лишнее одного рода, разводит их только место, и слова взяты те,
      // что ребёнок видит на экране: столбы, кристаллы, чёрный камень.
      { group: ['кристалл', 'обсидиан', 'столб'], odd: 'трава', why: 'из Края', topic: 'end', onlyTopic: true },
      { group: ['пустота', 'кристалл', 'звезда'], odd: 'корова', why: 'из Края', topic: 'end', onlyTopic: true },
      { group: ['обсидиан', 'столб', 'пустота'], odd: 'яблоко', why: 'из Края', topic: 'end', onlyTopic: true },
      // Рейд. Шесть записей, а не три: лишнего можно выбрать тремя способами
      // из каждой, и тогда на вид набирается десяток разных вопросов.
      { group: ['щит', 'арбалет', 'шлем'], odd: 'морковка', why: 'снаряжение для боя', topic: 'raid', onlyTopic: true },
      { group: ['стена', 'ворота', 'частокол'], odd: 'облако', why: 'ими закрывают деревню', topic: 'raid', onlyTopic: true },
      { group: ['знамя', 'тотем', 'плащ'], odd: 'яблоко', why: 'это у разбойников', topic: 'raid', onlyTopic: true },
      { group: ['колокол', 'труба', 'барабан'], odd: 'камень', why: 'они шумят', topic: 'raid', onlyTopic: true },
      { group: ['лук', 'арбалет', 'стрела'], odd: 'овца', why: 'из них стреляют', topic: 'raid', onlyTopic: true },
      { group: ['житель', 'кузнец', 'библиотекарь'], odd: 'разбойник', why: 'живут в деревне', topic: 'raid', onlyTopic: true },
    ],
    // Двух пар про одну и ту же ось быть не должно. `taskOpposite` берёт
    // неверные варианты из ОСТАЛЬНЫХ пар, поэтому пара-дублёр превращается
    // в кнопку, которую ребёнок вправе счесть верной. Поймано на прогоне
    // седьмого дня, и дважды:
    //
    // * «верх — низ» рядом с «высоко — низко» давали «скажи наоборот:
    //   низко» с кнопкой «Низ» — то же направление и тот же корень;
    // * «свет — темнота» рядом с «день — ночь» давали «скажи наоборот:
    //   ночь» с кнопкой «Свет» — ответ не хуже засчитанного.
    //
    // Обе пары-дублёра убраны. Семи пар хватает: на ключ нужно десять
    // вопросов, а шесть пар дают двенадцать.
    opposites: [
      ['день', 'ночь'], ['высоко', 'низко'], ['далеко', 'близко'],
      ['быстро', 'медленно'], ['твёрдый', 'мягкий'], ['полный', 'пустой'],
    ],
    patterns: [
      { seq: ['блок', 'факел', 'сундук'], topic: 'blocks' },
      { seq: ['камень', 'земля', 'песок'], topic: 'blocks' },
      ['алмаз', 'изумруд', 'золото'],
      ['крипер', 'зомби', 'скелет'],
      { seq: ['доска', 'бревно', 'палка'], topic: 'blocks' },
      ['день', 'ночь', 'рассвет'],
      ['кирка', 'лопата', 'топор'],
      ['вода', 'лава', 'лёд'],
      ['свинья', 'корова', 'курица'],
      ['уголёк', 'слиток', 'самоцвет'],
      // Кладка крепости шестого дня: ряды, которые ребёнок видит на экране,
      // пока разглядывает рамку портала. Добавлены в конец — порядок прежних
      // троек сдвинулся бы, а с ним и готовые вопросы.
      { seq: ['кирпич', 'мох', 'песок'], topic: 'blocks' },
      { seq: ['камень', 'кирпич', 'доска'], topic: 'blocks' },
      { seq: ['плита', 'блок', 'сундук'], topic: 'blocks' },
      { seq: ['ступенька', 'плита', 'факел'], topic: 'blocks' },
      { seq: ['песок', 'булыжник', 'земля'], topic: 'blocks' },
    ],
    homes: [
      { who: 'крипер', where: 'пещера', wrong: ['облако', 'сундук'] },
      { who: 'скелет', where: 'пещера', wrong: ['луг', 'двор'] },
      { who: 'корова', where: 'луг', wrong: ['пещера', 'лава'], topic: 'animals' },
      { who: 'рыба', where: 'река', wrong: ['пещера', 'дерево'], topic: 'animals' },
      { who: 'летучая мышь', where: 'пещера', wrong: ['река', 'луг'], topic: 'animals' },
      { who: 'курица', where: 'двор', wrong: ['лава', 'пещера'], topic: 'animals' },
      { who: 'овца', where: 'луг', wrong: ['пещера', 'лава'], topic: 'animals' },
      { who: 'свинья', where: 'двор', wrong: ['река', 'пещера'], topic: 'animals' },
      { who: 'лошадь', where: 'луг', wrong: ['пещера', 'река'], topic: 'animals' },
      { who: 'осьминог', where: 'река', wrong: ['пещера', 'двор'], topic: 'animals' },
      { who: 'волк', where: 'лес', wrong: ['река', 'лава'], topic: 'animals' },
    ],
    // Рецепты — загадка, которая живёт только в этой теме: у леса таких
    // данных нет, и генератор там просто не предлагается.
    //
    // what — в винительном падеже, чтобы вставать в оборот «сделать …».
    // Подсказка хранится целиком: вывести её из названия нельзя, у каждого
    // рецепта своя зацепка.
    recipes: [
      { what: 'кровать', need: 'шерсть и доски',
        wrong: ['алмаз и уголь', 'вода и песок'],
        hint: 'На кровати спят. Значит, нужно мягкое и деревянное.', topic: 'craft' },
      { what: 'верстак', need: 'доски',
        wrong: ['алмазы', 'угольки'],
        hint: 'Верстак деревянный. Что здесь из дерева?', topic: 'craft' },
      { what: 'лестницу', need: 'палки',
        wrong: ['камни', 'слитки'],
        hint: 'По лестнице лезут наверх, и она тоже деревянная.', topic: 'craft' },
      { what: 'кирку', need: 'палки и камень',
        wrong: ['шерсть и вода', 'хлеб и уголь'],
        hint: 'Киркой бьют по камню. Сама она должна быть твёрдой.', topic: 'craft' },
      { what: 'факел', need: 'палка и уголёк',
        wrong: ['шерсть и камень', 'вода и песок'],
        hint: 'Факел горит. Что из этого может загореться?', topic: ['craft', 'fuel'] },
      { what: 'хлеб', need: 'пшеница',
        wrong: ['камень', 'шерсть'],
        hint: 'Хлеб растёт на грядке. Что здесь растёт?', topic: 'craft' },
      { what: 'доспехи', need: 'железные слитки',
        wrong: ['шерсть и вода', 'палки и уголёк'],
        hint: 'Доспехи должны держать удар. Что здесь самое твёрдое?', topic: 'craft' },
      // Рейд. Метка onlyTopic здесь обязательна: общий набор рецептов уже
      // озвучен, и щит с воротами на лугу первого дня взялись бы ниоткуда.
      { what: 'щит', need: 'доски и слиток железа',
        wrong: ['шерсть и вода', 'пшеница и уголёк'],
        hint: 'Щит держит удар. Что здесь крепкое, а что мягкое?',
        topic: 'raid', onlyTopic: true },
      { what: 'стрелу', need: 'палку, камушек и перо',
        wrong: ['доски и шерсть', 'алмаз и воду'],
        hint: 'Стрела летит далеко. Значит, она прямая и лёгкая.',
        topic: 'raid', onlyTopic: true },
      { what: 'ворота', need: 'доски',
        wrong: ['алмазы', 'шерсть'],
        hint: 'Ворота деревянные, как и верстак.',
        topic: 'raid', onlyTopic: true },
    ],
  },
};

/**
 * Тройка чередования: размеченная записана объектом, неразмеченная —
 * простым массивом. Обе формы годятся, и менять старые записи ради
 * единообразия незачем: от этого переписался бы готовый пул.
 */
const seqOf = (entry) => Array.isArray(entry) ? entry : entry.seq;

/** Запись подходит теме, если метка совпала. Без метки — не подходит. */
function inTopic(entry, topic) {
  const t = entry?.topic;
  return Array.isArray(t) ? t.includes(topic) : t === topic;
}

/**
 * Сужает предметный мир темы до одной области.
 *
 * Откат обязателен: опечатка в сценарии иначе оставила бы сцену вообще
 * без задания, а это тупик — ребёнку некуда нажать.
 *
 * Запись с `onlyTopic` живёт только в своей области: в общий набор — тот,
 * что уходит сцене без `topic`, и тот, на который падает откат, — она не
 * попадает. Иначе Нижний мир протёк бы в первый день: там у заданий метки
 * не расставлены, и ребёнок считал бы на лугу огненные стержни. Заодно это
 * не переписывает готовую озвучку: общий набор остался прежним.
 */
function narrow(theme, topic) {
  const common = (arr) => (arr ?? []).filter(e => !e?.onlyTopic);
  if (!topic) {
    return {
      ...theme,
      countable: common(theme.countable),
      oddOneOut: common(theme.oddOneOut),
      homes: common(theme.homes),
      recipes: common(theme.recipes),
    };
  }
  const pick = (arr) => {
    const fit = (arr ?? []).filter(e => inTopic(e, topic));
    return fit.length ? fit : common(arr);
  };
  return {
    ...theme,
    countable: pick(theme.countable),
    oddOneOut: pick(theme.oddOneOut),
    homes: pick(theme.homes),
    recipes: pick(theme.recipes),
    patterns: pick(theme.patterns),
    lost: theme.lostBy?.[topic] ?? theme.lost,
  };
}

/* ---------------- арифметика ---------------- */

function taskAddition(t, max, wide) {
  // Слагаемые соразмерны пределу: при максимуме двадцать «один плюс два»
  // было бы обидно простым, а при десяти — «девять плюс восемь» неподъёмным.
  const half = Math.max(2, Math.floor(max / 2));
  const a = 1 + rnd(half);
  const b = 1 + rnd(Math.min(half, max - a));
  const thing = pickOne(t.countable);
  return {
    question: `Сколько будет ${count(a, thing)} и ещё ${count(b, thing)}?`,
    hint: `Посчитаем вместе: ${count(a, thing)}, и прибавим ещё ${NUM[b]}.`,
    // Ловушка сложения — разность: ребёнок, услышавший числа, но не вопрос,
    // отнимает вместо того, чтобы прибавить.
    choices: spreadChoices(a + b, max, wide, [a - b, a]),
  };
}

function taskSubtraction(t, max, wide) {
  // Вычитание держим в пределах десяти даже там, где сложение идёт до двадцати:
  // переход через десяток в обратную сторону первокласснику даётся заметно хуже.
  const top = Math.min(max, 10);
  const a = 3 + rnd(top - 2);
  const b = 1 + rnd(a - 1);
  const thing = pickOne(t.countable);
  return {
    question: `Было ${count(a, thing)}, ${t.lost} ${count(b, thing)}. Сколько осталось?`,
    hint: `Было ${NUM[a]}, пропало ${NUM[b]}. Отними и скажи, сколько стало.`,
    choices: spreadChoices(a - b, max, wide, [a + b, a]),
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

function taskNext(t, max, wide) {
  const start = 1 + rnd(max - 1);
  return {
    question: `Какое число идёт после ${NUM_GEN[start]}?`,
    hint: `Посчитай по порядку: ${NUM[start - 1]}, ${NUM[start]}, а дальше?`,
    // Ловушка — число перед названным: его называет тот, кто считает назад.
    choices: spreadChoices(start + 1, max, wide, [start - 1, start + 3]),
  };
}

// Вид задания помечается явно: сцена может потребовать только подходящие
// по смыслу. Загадка про антоним посреди сцены с крипером и стеной выглядит
// вставленной наугад — потому что так и было.
// Пропущенное слагаемое — та же программа первого класса, но считать
// приходится в другую сторону: не «сложи», а «досчитай до».
function taskMissing(t, max, wide) {
  const total = 4 + rnd(Math.max(2, max - 3));
  // Начинаем с двух, а не с одного: «было один камень» согласуется неверно,
  // а падежи числительного «один» ради одной задачи тащить незачем.
  const had = 2 + rnd(total - 3);
  const thing = pickOne(t.countable);
  return {
    question: `Было ${count(had, thing)}, стало ${count(total, thing)}. Сколько прибавилось?`,
    hint: `Досчитай от ${NUM_GEN[had]} до ${NUM_GEN[total]} и запомни, сколько вышло шагов.`,
    // Ловушка — само «стало»: последнее услышанное число.
    choices: spreadChoices(total - had, max, wide, [total, had]),
  };
}

const MATH = [
  { type: 'addition', make: taskAddition },
  { type: 'subtraction', make: taskSubtraction },
  { type: 'compare', make: taskCompare },
  { type: 'next', make: taskNext },
  { type: 'missing', make: taskMissing },
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
  const [a, b, extra] = seqOf(pickOne(t.patterns));
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

// Вопрос перечисляет все варианты целиком — тогда правило «всё или ничего»
// в app.js не станет читать кнопки второй раз. Половинчатая формулировка
// там же оказалась прямой подсказкой.
function taskRecipe(t) {
  const r = pickOne(t.recipes);
  const opts = shuffle([r.need, ...r.wrong]);
  return {
    question: `Что нужно, чтобы сделать ${r.what}: ${opts[0]}, ${opts[1]} или ${opts[2]}?`,
    hint: r.hint,
    choices: opts.map(o => ({ label: cap(o), keywords: [o], correct: o === r.need })),
  };
}

// needs — какие данные темы нужны генератору. Без этого «logic» у ёжика
// однажды вытянул бы рецепты, которых в лесу нет.
const LOGIC = [
  { type: 'oddOneOut', make: taskOddOneOut },
  { type: 'opposite', make: taskOpposite },
  { type: 'pattern', make: taskPattern },
  { type: 'home', make: taskHome },
  { type: 'recipe', make: taskRecipe, needs: 'recipes' },
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

export const TASK_TYPES = {
  math: MATH.map(g => g.type),
  logic: LOGIC.map(g => g.type),
};

const groupOf = (kind) => kind === 'math' ? MATH : kind === 'logic' ? LOGIC : [...MATH, ...LOGIC];

/** Генератор годится теме, только если нужные ему данные в ней есть. */
const supported = (g, theme) => !g.needs || (theme[g.needs]?.length > 0);

/**
 * Какие виды задач тема вообще умеет. Нужно сборщику озвучки: иначе он
 * просил бы у леса рецепты и получал вместо них случайную другую загадку.
 */
export function typesFor(kind, themeName = 'forest') {
  const theme = THEMES[themeName] ?? THEMES.forest;
  return groupOf(kind).filter(g => supported(g, theme)).map(g => g.type);
}

/**
 * Ключ пула готовой озвучки. Считается здесь и в tools/tts/collect.mjs.
 *
 * Пятый сегмент появляется только при широком разбросе: без него ключи
 * прежних историй остаются прежними строками, а значит и их семя,
 * и их вопросы, и их записи голосом.
 */
export function poolKey(themeName, kind, max, topic, spread) {
  const base = `${themeName}|${kind}|${max}|${topic || '-'}`;
  return spread === 'wide' ? `${base}|wide` : base;
}

/**
 * @param {'math'|'logic'|'any'} kind
 * @param {{theme?: string, max?: number, types?: string[], topic?: string,
 *          spread?: 'wide'}} opts
 *        предел счёта и предметную область задаёт сцена: сложность растёт
 *        по ходу истории, а вопрос остаётся про то, что на экране;
 *        spread: 'wide' — разброс в ответах шире, подобрать без вычисления нельзя
 * @returns {{question:string, hint:string, choices:Array<{label:string,keywords:string[],correct:boolean}>}}
 */
export function makeTask(kind = 'any', opts = {}) {
  const themeName = opts.theme ?? 'forest';
  const full = THEMES[themeName] ?? THEMES.forest;
  const theme = narrow(full, opts.topic);
  const max = Math.min(Math.max(opts.max ?? 10, 5), 20);
  const wanted = opts.types?.length ? opts.types : null;
  const wide = opts.spread === 'wide';

  const ready = pool?.[poolKey(themeName, kind, max, opts.topic, opts.spread)];
  if (ready && ready.length) {
    const fit = wanted ? ready.filter(t => wanted.includes(t.type)) : ready;
    if (fit.length) return fromPool(fit);
  }

  let generators = groupOf(kind).filter(g => supported(g, theme));
  if (wanted) {
    const fit = generators.filter(g => wanted.includes(g.type));
    if (fit.length) generators = fit;
  }

  let task, gen;
  for (let attempt = 0; attempt < 6; attempt++) {
    gen = pickOne(generators);
    task = gen.make(theme, max, wide);
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
