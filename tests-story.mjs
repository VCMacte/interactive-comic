// Проверка считалки tools/check-story.mjs на синтетических историях.
//
//   node tests-story.mjs
//
// Зачем синтетика, а не настоящие сценарии. Самая ценная проверка —
// «факт введён не на всех путях» — считается по графу и ломается молча:
// ошибёшься в обходе, и она просто перестанет находить, оставаясь зелёной.
// Доказывать её на четырнадцатом дне нельзя: тот случай уже починен, и тест
// по нему проходил бы и со сломанной считалкой. Поэтому случай с колоколом
// воспроизводится здесь по шагам — реплика варианта на одной ветке, боковая
// сцена на другой, и сцена-перекрёсток, где слово звучит как известное.
//
// Тот же приём, что у tests-log.mjs: считалка отделена от печати и проверена
// без настоящих данных.

import { review } from './tools/check-story.mjs';

let failed = 0;
const ok = (cond, what) => {
  if (cond) return;
  failed++;
  console.error('  ПРОВАЛ: ' + what);
};
const codes = (list) => list.map((f) => f.code);
const has = (list, code) => codes(list).includes(code);

/** Истории подаются так же, как их подаёт CLI: от новой к старой. */
const run = (story, opts = {}) => review({
  stories: [{ id: 'test', story }, ...(opts.others || [])],
  pool: opts.pool || {},
  exemptions: opts.exemptions || [],
  only: 'test',
});

const scene = (text, rest = {}) => ({ text, ...rest });

/* ---------------- факт на всех путях ---------------- */

console.log('факт, введённый в обязательной сцене, находкой не считается');
{
  const story = {
    theme: 'minecraft', start: 'a',
    scenes: {
      // «кракозябра» — слово, которого нет ни в одной настоящей истории:
      // нужен корень, заведомо новый для сериала.
      a: scene('Житель принёс кракозябру и показал всем.', {
        prompt: 'Куда пойдём?',
        choices: [{ label: 'Влево', next: 'b' }, { label: 'Вправо', next: 'c' }],
      }),
      b: scene('Налево было тихо.', { next: 'd' }),
      c: scene('Направо было шумно.', { next: 'd' }),
      d: scene('Кракозябру повесили над воротами.'),
    },
  };
  const { defects, advice } = run(story);
  ok(!has(advice, 'fact-not-on-all-paths'), 'слово введено до развилки — находки быть не должно');
  ok(!defects.length, 'дефектов в исправной истории быть не должно, а есть: ' + codes(defects));
}

console.log('факт, введённый только репликой варианта, за перекрёстком — находка');
{
  // Ровно случай колокола: слово живёт в `say` одной кнопки и в боковой
  // сцене, а употребляется там, куда приходят обе ветки.
  const story = {
    theme: 'minecraft', start: 'a',
    scenes: {
      a: scene('Утро пришло тихое.', {
        prompt: 'Куда пойдём?',
        choices: [
          { label: 'К воротам', next: 'b' },
          { label: 'К колокольне', say: 'А кто же вчера звонил в кракозябру?', next: 'c' },
        ],
      }),
      b: scene('У ворот было тихо.', { next: 'd' }),
      c: scene('У колокольни было людно.', { next: 'd' }),
      d: scene('Про кракозябру больше никто не вспоминал.'),
    },
  };
  const { advice } = run(story);
  ok(has(advice, 'fact-not-on-all-paths'),
    'слово введено только на одной ветке — находка обязана быть, а её нет');
  const found = advice.find((f) => f.code === 'fact-not-on-all-paths');
  ok(/a → b → d/.test(found?.why || ''), 'в находке должен быть назван путь, проходящий мимо: ' + found?.why);
}

console.log('слово, запертое в одной сцене, находкой «new-word» не считается');
{
  const story = {
    theme: 'minecraft', start: 'a',
    scenes: {
      a: scene('Житель показал кракозябру и спрятал её.', { next: 'b' }),
      b: scene('Больше про неё не вспоминали.'),
    },
  };
  const { advice } = run(story);
  ok(!has(advice, 'new-word'), 'одна сцена — объяснять нечего, находки быть не должно');
}

/* ---------------- граф ---------------- */

console.log('петля без выхода к финалу — дефект');
{
  const story = {
    theme: 'minecraft', start: 'a',
    scenes: {
      a: scene('Начало.', { prompt: 'Куда?', choices: [{ label: 'Влево', next: 'b' }, { label: 'Вправо', next: 'z' }] }),
      b: scene('Кружим.', { next: 'c' }),
      c: scene('И ещё кружим.', { next: 'b' }),   // b ⇄ c, финала отсюда нет
      z: scene('Финал.'),
    },
  };
  const { defects } = run(story);
  ok(has(defects, 'no-ending-on-path'), 'из петли не добраться до финала — должен быть дефект');
  ok(defects.filter((d) => d.code === 'no-ending-on-path').length === 2,
    'в петле две сцены, и обе должны быть названы');
}

console.log('недостижимая сцена и битая ссылка — дефекты');
{
  const story = {
    theme: 'minecraft', start: 'a',
    scenes: {
      a: scene('Начало.', { next: 'опечатка' }),
      b: scene('Сюда никто не ведёт.'),
    },
  };
  const { defects } = run(story);
  ok(has(defects, 'missing-scene'), 'переход в несуществующую сцену — дефект');
  ok(has(defects, 'unreachable'), 'недостижимая сцена — дефект');
}

console.log('тупиковый выбор без реплики — дефект, с репликой — нет');
{
  const bare = {
    theme: 'minecraft', start: 'a',
    scenes: {
      a: scene('Начало.', { prompt: 'Куда?', choices: [{ label: 'Влево', next: 'b' }, { label: 'Вправо', next: 'b' }] }),
      b: scene('Финал.'),
    },
  };
  ok(has(run(bare).defects, 'false-choice'), 'оба варианта в одну сцену и без say — дефект');

  const withSay = JSON.parse(JSON.stringify(bare));
  withSay.scenes.a.choices[1].say = 'Стив засмеялся. «Ну и ладно»';
  ok(!has(run(withSay).defects, 'false-choice'), 'реплика у варианта снимает дефект');
}

/* ---------------- подписи и перекрёстки ---------------- */

console.log('несоразмерные подписи вариантов — совет');
{
  const story = {
    theme: 'minecraft', start: 'a',
    scenes: {
      a: scene('Начало.', {
        prompt: 'Куда?',
        choices: [
          { label: 'Да', next: 'b' },
          { label: 'Пойти очень длинной дорогой вокруг горы', next: 'b' },
        ],
      }),
      b: scene('Финал.'),
    },
  };
  ok(has(run(story).advice, 'uneven-labels'), 'длинная подпись читается как ответ — должен быть совет');
}

console.log('перекрёсток назван');
{
  const story = {
    theme: 'minecraft', start: 'a',
    scenes: {
      a: scene('Начало.', { prompt: 'Куда?', choices: [{ label: 'Влево', next: 'b' }, { label: 'Вправо', next: 'c' }] }),
      b: scene('Налево.', { next: 'd' }),
      c: scene('Направо.', { next: 'd' }),
      d: scene('Финал.'),
    },
  };
  const found = run(story).advice.find((f) => f.code === 'rejoin');
  ok(found && found.what.includes('d'), 'сцена, куда сходятся две ветки, должна быть названа перекрёстком');
}

/* ---------------- крючки ---------------- */

console.log('незакрытый крючок прошлой серии — совет; closes его снимает');
{
  const prev = { id: 'prev', story: { theme: 'minecraft', start: 'a', hook: 'колокол зазвонил сам', scenes: { a: scene('Финал.') } } };
  const mine = { theme: 'minecraft', start: 'a', scenes: { a: scene('Финал.') } };

  ok(has(run(mine, { others: [prev] }).advice, 'hook-not-closed'), 'крючок прошлой серии не закрыт — совет');

  const closing = { ...mine, closes: ['prev'] };
  ok(!has(run(closing, { others: [prev] }).advice, 'hook-not-closed'), 'поле closes снимает находку');
}

/* ---------------- исключения ---------------- */

console.log('исключение глушит свою находку и не глушит соседнюю');
{
  const story = {
    theme: 'minecraft', start: 'a',
    scenes: {
      a: scene('Житель принёс кракозябру.', { next: 'b' }),
      b: scene('Кракозябру поставили рядом с финтифлюшкой.', { next: 'c' }),
      c: scene('Финтифлюшку забрали.'),
    },
  };
  const before = run(story).advice.filter((f) => f.code === 'new-word');
  ok(before.length === 2, 'два новых слова — две находки, а вышло ' + before.length);

  const after = run(story, {
    exemptions: [{ code: 'new-word', story: 'test', what: 'кракозябр', why: 'проверка' }],
  }).advice.filter((f) => f.code === 'new-word');
  ok(after.length === 1, 'исключение должно снять ровно одну находку, осталось ' + after.length);
  ok(after[0].what.includes('финтифлюшк'), 'снята не та находка: ' + after[0].what);
}

/* ---------------- длина ---------------- */

console.log('длина: выше 184 — дефект, 179…184 — совет');
{
  const long = (n) => 'я'.repeat(n);
  const story = (n) => ({
    theme: 'minecraft', start: 'a',
    scenes: { a: scene(long(n)) },
  });
  ok(has(run(story(200)).defects, 'too-long'), '200 знаков — дефект');
  ok(has(run(story(182)).advice, 'long'), '182 знака — совет');
  ok(!has(run(story(182)).defects, 'too-long'), '182 знака дефектом быть не должны: ниже замеренной поломки');
  ok(has(run(story(186)).defects, 'too-long'), '186 знаков — дефект: в замере такие уже уезжали ниже 56%');
  ok(!has(run(story(170)).advice, 'long'), '170 знаков — в запасе, молчим');
}

/* ---------------- чей голос у реплики ---------------- */

console.log('«Хм-хм» голосом Стива — дефект; своим голосом — нет');
{
  const story = (voice) => ({
    theme: 'minecraft', start: 'a', voice: 'hero',
    scenes: { a: scene('Житель дёрнул верёвку. «Хм-хм! Вот теперь по-настоящему»', voice ? { voice } : {}) },
  });
  ok(has(run(story()).defects, 'speaker-voice'), 'реплика жителя голосом сцены hero — дефект');
  ok(!has(run(story('friend')).defects, 'speaker-voice'), 'у сцены голос friend — находки быть не должно');
}

console.log('перед репликой назван другой персонаж — совет; волк не считается');
{
  const story = (text) => ({ theme: 'minecraft', start: 'a', voice: 'hero', scenes: { a: scene(text) } });
  ok(has(run(story('Библиотекарь махнул в темноту. «Лестница вниз»')).advice, 'speaker-named'),
    'назван библиотекарь, читает Стив — совет');
  ok(!has(run(story('Библиотекарь махнул в темноту. Стив кивнул. «Лестница вниз»')).advice, 'speaker-named'),
    'говорящий назван прямо перед кавычками — молчим');
  ok(!has(run(story('Волк зарычал. «Тише, пёс»')).advice, 'speaker-named'),
    'у волка голоса нет, к нему обращаются — молчим');
}

console.log('реплика варианта считается голосом варианта');
{
  const story = {
    theme: 'minecraft', start: 'a', voice: 'hero',
    scenes: {
      a: scene('Начало.', {
        prompt: 'Куда?',
        choices: [
          { label: 'Туда', say: 'За полками буркнули. «Хрю! Не трогай!»', voice: 'kid', next: 'b' },
          { label: 'Сюда', say: 'За полками буркнули. «Хрю! Не трогай!»', next: 'b' },
        ],
      }),
      b: scene('Финал.'),
    },
  };
  const found = run(story).defects.filter((f) => f.code === 'speaker-voice');
  ok(found.length === 1 && found[0].where.includes('Сюда'), 'дефект только у варианта без voice kid: ' + found.map((f) => f.where));
}

/* ---------------- итог ---------------- */

console.log();
if (failed) {
  console.error(`провалов: ${failed}`);
  process.exitCode = 1;
} else {
  console.log('устройство историй проверяется верно');
}
