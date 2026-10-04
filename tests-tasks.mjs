import { makeTask, typesFor, poolKey } from './js/tasks.js';

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
if (failed) process.exitCode = 1;

// ---- тема Minecraft и предел счёта ----
{
  let bad = 0;
  const NUM20 = ['ноль','один','два','три','четыре','пять','шесть','семь','восемь','девять','десять',
                 'одиннадцать','двенадцать','тринадцать','четырнадцать','пятнадцать',
                 'шестнадцать','семнадцать','восемнадцать','девятнадцать','двадцать'];
  const toNum20 = (w) => NUM20.indexOf(w.toLowerCase());

  for (let i = 0; i < 500; i++) {
    const max = i % 2 ? 20 : 10;
    const t = makeTask('math', { theme: 'minecraft', max });
    const answer = toNum20(t.choices.find(c => c.correct).label);
    if (answer < 0 || answer > max) { console.log('FAIL: ответ вне предела', max, t.question, answer); bad++; }
    for (const c of t.choices) {
      const v = toNum20(c.label);
      if (v < 0 || v > max) { console.log('FAIL: вариант вне предела', max, c.label); bad++; }
    }
    if (/укатил|ветер/.test(t.question)) { console.log('FAIL: лесной оборот в теме Minecraft:', t.question); bad++; }
  }

  // Логика темы должна говорить о Minecraft, а не о ёжиках.
  const words = new Set();
  for (let i = 0; i < 300; i++) {
    const t = makeTask('logic', { theme: 'minecraft' });
    t.choices.forEach(c => words.add(c.label.toLowerCase()));
    if (t.choices.filter(c => c.correct).length !== 1) { console.log('FAIL: верных ответов не один:', t.question); bad++; }
  }
  const mc = ['крипер', 'алмаз', 'факел', 'пещера', 'сундук', 'зомби'];
  if (!mc.some(w => words.has(w))) { console.log('FAIL: в логике нет слов темы'); bad++; }

  console.log(bad ? `\n${bad} провалено в теме Minecraft` : '\nтема Minecraft и предел счёта в порядке');
  if (bad) process.exitCode = 1;
}

// ---- ограничение вида задания сценой ----
{
  let bad = 0;
  for (const [kind, types] of [['math', ['addition']], ['math', ['compare', 'next']],
                               ['logic', ['home']], ['logic', ['oddOneOut', 'pattern']]]) {
    for (let i = 0; i < 60; i++) {
      const t = makeTask(kind, { theme: 'minecraft', max: 10, types });
      if (!types.includes(t.type)) {
        console.log('FAIL: просили', types.join('/'), 'получили', t.type, '—', t.question);
        bad++;
      }
    }
  }

  // Несуществующий вид не должен ронять генератор: лучше любое задание, чем пустота.
  const fallback = makeTask('logic', { theme: 'minecraft', types: ['выдуманный'] });
  if (!fallback?.question) { console.log('FAIL: неизвестный вид уронил генератор'); bad++; }

  console.log(bad ? `\n${bad} провалено в ограничении видов` : '\nограничение вида задания работает');
  if (bad) process.exitCode = 1;
}

// ---- сужение по предметной области ----
{
  let bad = 0;

  // Сцена в шахте не должна спрашивать про факелы, а у печки — про блоки.
  const TOPICS = {
    ore: { allow: /камень|камн|алмаз|слит|уголёк|угольк/, deny: /блок|факел/ },
    fuel: { allow: /слит|уголёк|угольк|факел/, deny: /алмаз|блок/ },
    blocks: { allow: /блок|камень|камн/, deny: /алмаз|факел|уголёк/ },
    nether: { allow: /стерж|кирпич|гриб|слит/, deny: /блок|факел|алмаз|уголёк/ },
  };
  for (const [topic, { allow, deny }] of Object.entries(TOPICS)) {
    for (let i = 0; i < 120; i++) {
      const t = makeTask('math', { theme: 'minecraft', max: 10, topic, types: ['addition', 'missing'] });
      if (!allow.test(t.question)) { console.log('FAIL: тема', topic, 'дала чужое:', t.question); bad++; }
      if (deny.test(t.question)) { console.log('FAIL: тема', topic, 'не отфильтровала:', t.question); bad++; }
    }
  }

  // Логика про зверей не должна приводить крипера и скелета.
  for (let i = 0; i < 150; i++) {
    const t = makeTask('logic', { theme: 'minecraft', topic: 'animals', types: ['home', 'oddOneOut'] });
    if (/крипер|скелет|зомби/.test(t.question)) { console.log('FAIL: моб в загадке про зверей:', t.question); bad++; }
  }

  // Нижний мир — область, которой нет на поверхности. Загадка там про место,
  // а не про род вещи, поэтому лесное и луговое в неё попадать не должно.
  for (let i = 0; i < 150; i++) {
    const t = makeTask('logic', { theme: 'minecraft', topic: 'nether', types: ['oddOneOut'] });
    if (/корова|курица|рыба|осьминог|волк|овца/.test(t.question)) {
      console.log('FAIL: зверь в загадке про Нижний мир:', t.question); bad++;
    }
    if (!/Нижнего мира/.test(t.hint)) {
      console.log('FAIL: подсказка не про Нижний мир:', t.hint); bad++;
    }
  }

  // Записи с onlyTopic живут только в своей области: сцена без topic не
  // должна их видеть, иначе на лугу первого дня считают огненные стержни
  // (а заодно переписывается готовая озвучка — пул собирается по тем же
  // наборам).
  for (let i = 0; i < 300; i++) {
    const t = makeTask(i % 2 ? 'math' : 'logic', { theme: 'minecraft', max: 20 });
    // «Кирпич» в проверку не берём: он есть и на поверхности — в загадке
    // «доска, кирпич, камень» области blocks. Сторожим слова, которых
    // в общем наборе нет вовсе.
    if (/стерж|гриб|кварц|Нижнего мира/.test(t.question + t.hint)) {
      console.log('FAIL: Нижний мир протёк в задание без области:', t.question); bad++;
    }
  }
  // То же про откат: незнакомая область падает на общий набор, а не на полный.
  for (let i = 0; i < 150; i++) {
    const t = makeTask('math', { theme: 'minecraft', max: 10, topic: 'выдуманная' });
    if (/стерж|кирпич|гриб/.test(t.question)) {
      console.log('FAIL: откат привёл слова чужой области:', t.question); bad++;
    }
  }

  // У каждой области, где считают предметы, свой глагол потери: иначе
  // в сцене зазвучит «взорвал крипер» там, где вещь упала в лаву.
  for (const topic of ['ore', 'fuel', 'blocks', 'nether']) {
    for (let i = 0; i < 40; i++) {
      const t = makeTask('math', { theme: 'minecraft', max: 10, topic, types: ['subtraction'] });
      if (/взорвал крипер/.test(t.question)) {
        console.log('FAIL: у области', topic, 'нет своего глагола потери'); bad++;
      }
    }
  }

  // Откат обязателен: незнакомая область не должна оставить сцену без задания.
  const fb = makeTask('math', { theme: 'minecraft', max: 10, topic: 'выдуманная' });
  if (!fb?.question || fb.choices.filter(c => c.correct).length !== 1) {
    console.log('FAIL: незнакомая область оставила сцену без задания'); bad++;
  }
  // У леса метки не расставлены — сужение не должно его обнулить.
  const forest = makeTask('logic', { theme: 'forest', topic: 'animals' });
  if (!forest?.question) { console.log('FAIL: сужение обнулило тему без меток'); bad++; }

  console.log(bad ? `\n${bad} провалено в сужении по области` : '\nсужение по предметной области работает');
  if (bad) process.exitCode = 1;
}

// ---- новые виды заданий ----
{
  let bad = 0;

  for (const max of [10, 20]) {
    for (let i = 0; i < 200; i++) {
      const t = makeTask('math', { theme: 'minecraft', max, topic: 'ore', types: ['missing'] });
      const m = t.question.match(/^Было (\S+) .*?, стало (\S+) /);
      if (!m) { console.log('FAIL: пропущенное слагаемое без разбора:', t.question); bad++; continue; }
      // «Было один камень» согласуется неверно — начинать можно только с двух.
      if (m[1] === 'один') { console.log('FAIL: единица после «было»:', t.question); bad++; }
      const answer = Number(t.choices.find(c => c.correct).keywords[1]);
      if (!(answer >= 1 && answer <= max)) { console.log('FAIL: ответ вне предела:', t.question, answer); bad++; }
    }
  }

  // Рецепт перечисляет все варианты в самом вопросе: иначе app.js прочитает
  // кнопки второй раз и получится повтор одного и того же другими словами.
  for (let i = 0; i < 150; i++) {
    const t = makeTask('logic', { theme: 'minecraft', topic: 'craft', types: ['recipe'] });
    if (t.type !== 'recipe') { console.log('FAIL: просили рецепт, получили', t.type); bad++; continue; }
    if (t.choices.filter(c => c.correct).length !== 1) { console.log('FAIL: верных ответов не один:', t.question); bad++; }
    const said = t.question.toLowerCase();
    for (const c of t.choices) {
      if (!said.includes(c.label.toLowerCase())) {
        console.log('FAIL: вариант не назван в вопросе:', c.label, '—', t.question); bad++;
      }
    }
  }

  // Рецепты есть только у Minecraft: у леса таких данных нет.
  if (typesFor('logic', 'forest').includes('recipe')) { console.log('FAIL: рецепт предложен лесу'); bad++; }
  if (!typesFor('logic', 'minecraft').includes('recipe')) { console.log('FAIL: рецепт потерялся у Minecraft'); bad++; }
  for (let i = 0; i < 100; i++) {
    if (makeTask('logic', { theme: 'forest' }).type === 'recipe') { console.log('FAIL: лес выдал рецепт'); bad++; break; }
  }

  // Ключ пула должен совпадать с тем, что считает сборщик озвучки.
  if (poolKey('minecraft', 'math', 10, 'ore') !== 'minecraft|math|10|ore') { console.log('FAIL: ключ пула'); bad++; }
  if (poolKey('forest', 'logic', 10) !== 'forest|logic|10|-') { console.log('FAIL: ключ пула без области'); bad++; }

  console.log(bad ? `\n${bad} провалено в новых видах` : '\nпропущенное слагаемое и рецепты в порядке');
  if (bad) process.exitCode = 1;
}
