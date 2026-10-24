// Сверка устройства истории: дыры в графе сцен, факты, введённые не на всех
// путях, длина текста, прямая речь, слова, которых не было нигде раньше,
// крючки между сериями и редкость персонажей.
//
//   node tools/check-story.mjs            — все истории
//   node tools/check-story.mjs after      — одна история
//
// Где она среди соседей. check-speech.mjs держит правила письма и ПАДАЕТ;
// check-stress-risk.mjs советует и всегда выходит с нулём; check-voices.mjs
// сверяет озвучку. Эта — про устройство самой истории, и она смешанная:
// падает на том, что объективно сломано (битая ссылка, недостижимая сцена,
// текст выше замеренного порога), и советует там, где решает человек.
// Граница проведена нарочно: совет, от которого падает прогон, перестают
// читать, а дефект, о котором только советуют, уезжает в озвучку.
//
// Зачем вообще код, если всё это записано в CLAUDE.md и STORYLINE.md.
// По той же причине, что у check-speech: прозу читают до того, как сядут
// писать, а срабатывает она в минуту, когда пишешь. День четырнадцатый
// это подтвердил трижды — «оберег» назван в трёх сценах и ни разу
// не объяснён, сцена `dawn` после правки вылезла за порог длины,
// и в четырёх сценах из десяти не говорил никто.
//
// Часть проверок перенесена из набора danjdewhurst/story-skills (скиллы
// interactive-fiction, revision-continuity, series-continuity). Он написан
// под свой формат проекта и свой CLI, которых у нас нет, поэтому перенесены
// не команды, а правила. Самое ценное — его жёсткое правило «Never write
// rejoin prose that is true on only one incoming path»: это дословно наш
// случай с колоколом тринадцатого дня, который терялся на половине
// прохождений. Отсюда же приём с исключениями: намеренную находку не глушат
// правкой текста, её записывают с причиной.
//
// Считалка (`review`) отделена от печати и проверяется из node
// на синтетических историях — tests-story.mjs, без настоящих сценариев.

import { readFileSync, readdirSync } from 'node:fs';
import { poolKey } from '../js/tasks.js';
import { taskSpec } from './tts/utterances.mjs';

/* ---------------- пороги и словарь ---------------- */

// Пороги замерены, а не выбраны, и их ДВА.
//
// Замер по ВСЕМ 140 сценам сериала на кадре 1600×900, каждая своей настоящей
// прозой и худшим вопросом своего ключа: самая короткая сцена, у которой верх
// панели ушёл ниже контрактных 56%, — 185 знаков; самая длинная, у которой
// он удержался, — 187. То есть обрыв не точка, а полоса 185…187, и внутри
// неё решают сами слова: где встанут переносы, столько и будет строк.
//
// Поэтому дефект объявляется выше 184 — ниже самой короткой замеренной
// поломки, а не «примерно там». Промежуток 179…184 идёт советом «померяй
// в прогоне». Прежний порог 188 был выведен из одной пробы на одном образце
// прозы и пропускал пять сцен из четырнадцати серий — ровно столько,
// сколько нужно, чтобы сверке перестали верить.
//
// Считать надо ХУДШИЙ вопрос ключа, а не тот, что выпал в прогоне.
const HARD_LEN = 184;
const SOFT_LEN = 178;

// Подпись заметно длиннее соседних читается как правильный ответ — ребёнок
// отсеивает короткие, не думая. Правило из choice-graph.md: «keep the options
// parallel in length so neither looks like the right answer».
const LABEL_RATIO = 2;

// Поля, которые ребёнок слышит. Те же, что у check-speech: `keywords`
// не озвучиваются и сюда не идут.
const SPOKEN = ['text', 'speak', 'prompt', 'hint'];
const SPOKEN_CHOICE = ['say', 'label', 'hint'];

// Приблизительный корень: первые пять букв. Падежи и числа при этом
// сходятся («оберег» и «оберега»), а разные слова почти не слипаются.
// Стеммера в проекте нет и заводить его ради совета незачем.
const STEM = 5;
const wordsOf = (text) => (text.toLowerCase().match(/[а-яё]{5,}/g) || []);
const stemsOf = (text) => wordsOf(text).map((w) => w.slice(0, STEM));

/* ---------------- разбор сцены ---------------- */

/** Что звучит в самой сцене — без реплик вариантов: те принадлежат ветке. */
function sceneSpeech(scene) {
  const out = [];
  for (const k of SPOKEN) if (typeof scene[k] === 'string') out.push(scene[k]);
  return out;
}

/** Что звучит, если нажать этот вариант. */
function choiceSpeech(choice) {
  const out = [];
  for (const k of SPOKEN_CHOICE) if (typeof choice[k] === 'string') out.push(choice[k]);
  return out;
}

/** Всё, что в сцене вообще может прозвучать. */
const allSpeech = (scene) =>
  [...sceneSpeech(scene), ...(scene.choices || []).flatMap(choiceSpeech)];

/** Куда сцена может увести. */
const exitsOf = (scene) => [
  ...(scene.next ? [scene.next] : []),
  ...(scene.choices || []).map((c) => c.next).filter(Boolean),
];

// `max` нормализуется ровно так же, как в makeTask: сцена без предела
// получает десятку, значения вне 5…20 зажимаются. Без этого сверка строила
// ключ «minecraft|logic|undefined|craft» и объявляла дефектом четыре
// исправные сцены второго дня. Сверка, которая врёт, хуже отсутствующей.
const normMax = (max) => Math.min(Math.max(max ?? 10, 5), 20);

const keyOf = (story, spec) =>
  poolKey(story.theme || 'forest', spec.kind, normMax(spec.max), spec.topic, spec.spread);

/* ---------------- считалка ---------------- */

/**
 * @param {object} input
 * @param {{id, story}[]} input.stories    все истории, от новой к старой
 * @param {object} input.pool              stories/tasks-pool.json
 * @param {object[]} input.exemptions      разобранные находки с причиной
 * @param {string} [input.only]            проверить одну историю
 */
export function review({ stories, pool = {}, exemptions = [], only }) {
  const defects = [];
  const advice = [];

  // Намеренную находку не глушат правкой текста — её записывают с причиной.
  // Приём из revision-continuity, и он здесь обязателен: у сериала накопился
  // долг (длина сцен и задания без topic в днях, написанных до этих правил),
  // а прогон, который красен всегда, читать перестают — ровно та же беда,
  // от которой у длины два порога. Погашенные находки не исчезают молча:
  // отчёт печатает, сколько их и каким кодом.
  let dismissed = 0;
  const excused = (code, story, what) => {
    const hit = exemptions.some((e) => e.code === code && e.story === story
      && (!e.what || (what || '').includes(e.what)));
    if (hit) dismissed++;
    return hit;
  };
  const storyOf = (where) => where.split(' ')[0];

  const die = (code, where, what, why) => {
    if (excused(code, storyOf(where), what)) return;
    defects.push({ code, where, what, why });
  };
  const tip = (code, where, what, why, story) => {
    if (excused(code, story ?? storyOf(where), what)) return;
    advice.push({ code, where, what, why });
  };

  const targets = stories.filter((s) => !only || s.id === only);

  for (const t of targets) {
    checkStory(t, pool, die, tip);
    freshFacts(t, stories.filter((s) => s !== t), pool, tip);
    castRarity(t, stories, tip);
    hookLedger(t, stories, tip);
  }

  return { defects, advice, dismissed, checked: targets.length };
}

/* ---------------- граф и сцены ---------------- */

function checkStory(target, pool, die, tip) {
  const { id: name, story } = target;
  const scenes = story.scenes;
  const ids = Object.keys(scenes);

  // 1. Граф: битые ссылки и недостижимые сцены. Опечатка в `next` иначе
  //    видна только в журнале с телефона, событием `scene.missing`.
  if (!scenes[story.start]) {
    die('bad-start', name, `start «${story.start}» — такой сцены нет`, 'поле start');
    return;
  }
  const reached = new Set([story.start]);
  const queue = [story.start];
  while (queue.length) {
    const id = queue.shift();
    for (const next of exitsOf(scenes[id])) {
      if (!scenes[next]) {
        die('missing-scene', `${name} / ${id}`, `переход в «${next}» — такой сцены нет`, 'опечатка в next');
        continue;
      }
      if (!reached.has(next)) { reached.add(next); queue.push(next); }
    }
  }
  for (const id of ids) {
    if (!reached.has(id)) die('unreachable', `${name} / ${id}`, 'сцена недостижима', 'в неё не ведёт ни один переход');
  }

  // 2. Финал: сцена без choices и без next. На ней появляются «Прочитать
  //    ещё раз» и «Выбрать другую историю», и там же стирается прогресс.
  const finals = ids.filter((id) => !scenes[id].choices && !scenes[id].next);
  if (!finals.length) {
    die('no-ending', name, 'нет финальной сцены', 'нужна сцена без choices и без next');
  }
  if (finals.length > 1) {
    tip('many-endings', name, `финалов несколько: ${finals.join(', ')}`, 'обычно он один');
  }

  // 3. Из каждой сцены должен быть выход к финалу. Наличия финала мало:
  //    петля, из которой не выйти, его не достигает, а ребёнок застревает
  //    в ней навсегда. Их CLI такого не проверяет вовсе и просит обходить
  //    петли руками — здесь это считается.
  const toEnd = new Set(finals);
  let grew = true;
  while (grew) {
    grew = false;
    for (const id of ids) {
      if (toEnd.has(id)) continue;
      if (exitsOf(scenes[id]).some((n) => toEnd.has(n))) { toEnd.add(id); grew = true; }
    }
  }
  for (const id of ids) {
    if (reached.has(id) && !toEnd.has(id)) {
      die('no-ending-on-path', `${name} / ${id}`, 'из сцены не добраться до финала',
        'петля без выхода: ребёнок застрянет в ней навсегда');
    }
  }

  // 4. Перекрёстки: сцены, куда сходятся две и более ветки. Их проза обязана
  //    быть верна на КАЖДОМ входящем пути — жёсткое правило оттуда же.
  const incoming = new Map(ids.map((id) => [id, new Set()]));
  for (const id of ids) for (const n of exitsOf(scenes[id])) incoming.get(n)?.add(id);
  const joins = ids.filter((id) => incoming.get(id).size > 1 && reached.has(id));
  if (joins.length) {
    tip('rejoin', name, `перекрёстки: ${joins.join(', ')}`,
      'их проза должна быть верна на каждом входящем пути; что свести нельзя — убрать из прозы');
  }

  let withSpeech = 0;

  for (const id of ids) {
    const scene = scenes[id];
    const where = `${name} / ${id}`;

    // 5. Длина. Две ловушки: считать по тому вопросу, что выпал в прогоне,
    //    и считать не то, что реально встанет в панель (см. panelLength).
    const len = panelLength(story, scene, pool);
    if (len > HARD_LEN) {
      die('too-long', where, `в панели ${len} знаков`,
        `выше ${HARD_LEN}: на 185 знаках замерено 55.8%, то есть ниже контрактных 56%`);
    } else if (len > SOFT_LEN) {
      tip('long', where, `в панели ${len} знаков`,
        `выше запаса ${SOFT_LEN}: держится, но мерить панель в прогоне`, name);
    }

    // 6. Задание обязано знать свой вид и свою область. Без этого в сцене
    //    с крипером у стены выпадала загадка про антоним к слову «медленно».
    const spec = taskSpec(scene);
    if (spec) {
      if (!spec.types?.length) die('task-no-types', where, 'у задания нет types', 'вид задачи указывается всегда');
      if (!spec.topic) die('task-no-topic', where, 'у задания нет topic', 'предметная область указывается всегда');
      const key = keyOf(story, spec);
      if (!pool[key]) die('no-pool-key', where, `ключа пула «${key}» нет`, 'нужен прогон collect.mjs');
    }

    const ch = scene.choices || [];

    // 7. Тупиковый выбор обязан что-то дать. Если все варианты ведут в одну
    //    сцену и ни у одного нет say, ребёнок видит выбор без последствий
    //    и решает, что сломалось. Так было с поглаженной коровой. У них это
    //    зовётся false choice: «cut one or make it matter».
    if (ch.length > 1) {
      const targets = new Set(ch.map((c) => c.next));
      if (targets.size === 1 && !ch.some((c) => c.say)) {
        die('false-choice', where, 'тупиковый выбор без реплики', 'хотя бы у одного варианта нужен say');
      }

      // 8. Соразмерность подписей.
      const lens = ch.map((c) => (c.label || '').length);
      const min = Math.min(...lens), max = Math.max(...lens);
      if (min > 0 && max > min * LABEL_RATIO) {
        tip('uneven-labels', where, `подписи разной длины: ${lens.join(', ')}`,
          'длинная читается как правильный ответ; держать их соразмерными', name);
      }
    }

    // 9. Прямая речь. Голос задаётся на сцену целиком, поэтому реплики
    //    раскладываются по сценам заранее — дописать потом нельзя.
    if (allSpeech(scene).some((s) => s.includes('«'))) withSpeech++;
    else tip('silent-scene', where, 'в сцене не говорит никто', 'прямая речь ожидается не реже чем в половине сцен', name);
  }

  if (withSpeech * 2 < ids.length) {
    tip('narration-heavy', name, `прямая речь только в ${withSpeech} сценах из ${ids.length}`,
      'история звучит пересказом; см. STORYLINE.md, «Герои и тон»');
  }
}

/**
 * Сколько знаков реально встанет в панель `#text`.
 *
 * Считать надо ровно то, что показывает движок, и он показывает разное:
 *
 *   • у сцены с заданием — `raw.text + ' ' + task.question` (`js/app.js`),
 *     то есть прозу, ПРОБЕЛ и самый длинный вопрос ключа;
 *   • у сцены с кнопками — только `scene.text`. Поле `prompt` в панель
 *     не попадает вовсе, оно лишь звучит.
 *
 * Первая версия сверки прибавляла `prompt` к прозе и забывала пробел,
 * то есть завышала длину у развилок и занижала у заданий. Поймано замером
 * всех 140 сцен в браузере: сверка показывала 188 там, где панель вставала
 * на 189 знаках и уезжала на 55.8%.
 */
function panelLength(story, scene, pool) {
  const prose = (scene.text || '').length;
  const spec = taskSpec(scene);
  if (!spec) return prose;
  const entries = pool[keyOf(story, spec)];
  if (!entries?.length) return prose;
  return prose + 1 + Math.max(...entries.map((t) => t.question.length));
}

/* ---------------- факты и пути ---------------- */

/**
 * Слово, которого не было нигде в сериале, — кандидат в предмет. Проверяется
 * двумя разными мерками:
 *
 *   • перешло во вторую сцену — значит стало предметом, и в первой из них
 *     надо было сказать, что это такое («оберег» четырнадцатого дня);
 *   • употреблено там, куда ведёт путь, нигде его не вводивший, — значит
 *     половина детей услышит слово впервые уже как известное. Это перенос
 *     жёсткого правила про перекрёстки.
 *
 * Реплика варианта считается принадлежащей ВЕТКЕ, а не сцене: слово из `say`
 * известно только тому, кто нажал эту кнопку. На этом и сломался колокол —
 * он жил в `say` варианта «К колокольне» и в боковой сцене, то есть на двух
 * необязательных ветках сразу, а сцена-то формально его «упоминала».
 */
function freshFacts(target, others, pool, tip) {
  const { id: name, story } = target;
  const known = new Set();
  for (const o of others) {
    for (const scene of Object.values(o.story.scenes)) {
      for (const s of allSpeech(scene)) for (const st of stemsOf(s)) known.add(st);
    }
  }
  // Пул заданий — тоже корпус: слово из набора темы ребёнок уже слышал.
  for (const entries of Object.values(pool)) {
    for (const t of entries) {
      for (const st of stemsOf(t.question + ' ' + t.hint)) known.add(st);
      for (const c of t.choices) for (const st of stemsOf(c.label)) known.add(st);
    }
  }

  const scenes = story.scenes;
  const ids = Object.keys(scenes);

  // Где корень вводится: в самой сцене (знают все, кто сюда дошёл)
  // и на ребре (знает только тот, кто нажал эту кнопку).
  const inScene = new Map();     // stem -> Set(sceneId)
  const onEdge = new Map();      // stem -> Set("from>to")
  const forms = new Map();       // stem -> Set(слово)
  const add = (map, stem, value) => (map.get(stem) ?? map.set(stem, new Set()).get(stem)).add(value);

  for (const id of ids) {
    for (const s of sceneSpeech(scenes[id])) {
      for (const w of wordsOf(s)) {
        const st = w.slice(0, STEM);
        if (known.has(st)) continue;
        add(inScene, st, id); add(forms, st, w);
      }
    }
    for (const c of scenes[id].choices || []) {
      if (!c.next) continue;
      for (const s of choiceSpeech(c)) {
        for (const w of wordsOf(s)) {
          const st = w.slice(0, STEM);
          if (known.has(st)) continue;
          add(onEdge, st, `${id}>${c.next}`); add(forms, st, w);
        }
      }
    }
  }

  for (const [stem, where] of inScene) {
    const words = [...forms.get(stem)].join('», «');

    // Мерка первая: слово перешло во вторую сцену. Слово, запертое в одной
    // сцене, объясняется ею же или не нужно вовсе. Шум от этого остаётся
    // («вчера», «улицу»), и это осознанная цена: пропустить «оберег»
    // дороже, чем прочитать две лишние строки. Разобранные находки
    // записываются в tools/story-exemptions.json, а не глушатся правкой.
    if (where.size >= 2) {
      tip('new-word', name, `новое слово «${words}»`,
        `сцены: ${[...where].join(', ')} — проверь, сказано ли в первой из них, что это такое`, name);
    }

    // Мерка вторая: часть детей приходит в сцену со знанием слова, а часть
    // без. Само место, где слово вводится, находкой не считается — впервые
    // прозвучать оно где-то обязано. Беда ровно тогда, когда до ОДНОЙ
    // и той же сцены ведут и путь через введение, и путь мимо него.
    const intro = new Set([...where, ...(onEdge.get(stem) || [])]);
    for (const used of where) {
      const earlier = [...intro].filter((p) => p !== used && leadsTo(story, p, used));
      if (!earlier.length) continue;              // это и есть первое упоминание
      const path = pathAvoiding(story, used, new Set(earlier));
      if (!path) continue;                        // мимо не пройти — знают все
      tip('fact-not-on-all-paths', `${name} / ${used}`, `слово «${words}» известно не всем`,
        `путь ${path.join(' → ')} проходит мимо введения: эти дети услышат слово впервые как известное`, name);
      break;
    }
  }
}

/**
 * Лежит ли место введения `spot` на каком-нибудь пути от старта до `goal`.
 * `spot` — это либо id сцены, либо ребро «откуда>куда» (реплика варианта).
 */
function leadsTo(story, spot, goal) {
  const [from, to] = spot.includes('>') ? spot.split('>') : [spot, spot];
  return reaches(story, story.start, from) && reaches(story, to, goal);
}

/** Достижима ли `goal` из `from` по переходам. */
function reaches(story, from, goal) {
  if (from === goal) return true;
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const id = queue.shift();
    for (const next of exitsOf(story.scenes[id] || {})) {
      if (next === goal) return true;
      if (!story.scenes[next] || seen.has(next)) continue;
      seen.add(next); queue.push(next);
    }
  }
  return false;
}

/**
 * Путь от старта до `goal`, не проходящий ни через одну сцену-источник
 * и ни через одно ребро-источник из `intro`. Есть такой путь — значит
 * факт известен не всем.
 *
 * Поиск в ширину: нужен сам путь, чтобы находку можно было прочитать,
 * а не только узнать, что она есть.
 */
function pathAvoiding(story, goal, intro) {
  const scenes = story.scenes;
  if (intro.has(story.start) && story.start !== goal) return null;
  const seen = new Set([story.start]);
  const queue = [[story.start]];
  while (queue.length) {
    const path = queue.shift();
    const id = path[path.length - 1];
    if (id === goal) return path;
    for (const next of exitsOf(scenes[id] || {})) {
      if (!scenes[next] || seen.has(next)) continue;
      if (intro.has(`${id}>${next}`)) continue;        // ребро вводит слово
      if (intro.has(next) && next !== goal) continue;  // сцена вводит слово
      seen.add(next);
      queue.push([...path, next]);
    }
  }
  return null;
}

/* ---------------- крючки между сериями ---------------- */

/**
 * Заявка одной серии должна быть выплачена следующей — или намеренно
 * оставлена, и тогда это записывается, а не забывается. Приём из
 * series-continuity: «threads paid off in a later book» учитываются явно.
 *
 * Поля читает только сверка: движок берёт из истории `title`, `theme`,
 * `voice`, `start` и `scenes`, остальное не трогает.
 */
function hookLedger(target, stories, tip) {
  const i = stories.findIndex((s) => s.id === target.id);
  if (i < 0 || i + 1 >= stories.length) return;        // самая старая история
  const prev = stories[i + 1];
  if (!prev.story.hook) return;
  const closes = target.story.closes || [];
  if (closes.includes(prev.id)) return;
  tip('hook-not-closed', target.id, `крючок «${prev.story.hook}» (${prev.id}) не закрыт`,
    'закрыть в этой серии и назвать её в поле closes, либо записать причину в tools/story-exemptions.json',
    target.id);
}

/* ---------------- редкость персонажей ---------------- */

function castRarity(target, stories, tip) {
  const castOf = (story) => new Set(Object.values(story.scenes)
    .flatMap((s) => (s.cast || []).map((c) => c.src.split('/').pop().replace('.svg', ''))));
  const i = stories.findIndex((s) => s.id === target.id);
  if (i < 0) return;
  for (const who of castOf(target.story)) {
    let gap = 0;
    for (let j = i + 1; j < stories.length; j++) {
      if (castOf(stories[j].story).has(who)) break;
      gap++;
    }
    if (gap >= 3 && i + gap < stories.length - 1) {
      tip('rare-cast', target.id, `персонаж «${who}» не выходил ${gap} историй подряд`,
        'это нормально для пасхалки и подозрительно для героя', target.id);
    }
  }
}

/* ---------------- запуск ---------------- */

const isMain = process.argv[1] && process.argv[1].endsWith('check-story.mjs');

if (isMain) {
  const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
  const only = process.argv.slice(2).find((a) => !a.startsWith('--'))?.replace(/\.json$/, '');

  const pool = read('stories/tasks-pool.json');
  const catalog = read('comics.json');              // от новой истории к старой
  let exemptions = [];
  try { exemptions = read('tools/story-exemptions.json').exemptions || []; } catch { /* файла может не быть */ }

  const onDisk = readdirSync('stories')
    .filter((f) => f.endsWith('.json') && f !== 'tasks-pool.json')
    .map((f) => ({ id: f.replace(/\.json$/, ''), file: 'stories/' + f, story: read('stories/' + f) }));

  // Порядок — каталожный, от новой истории к старой: по нему считаются
  // и крючки, и редкость персонажей. Истории, которой нет в каталоге,
  // в порядке не место, но проверить её всё равно надо.
  const byAge = catalog.map((c) => onDisk.find((s) => s.file === c.story)).filter(Boolean);
  const stories = [...byAge, ...onDisk.filter((s) => !byAge.includes(s))];

  const { defects, advice, dismissed, checked } = review({ stories, pool, exemptions, only });

  // Погашенное печатается всегда: долг должен быть виден числом, иначе
  // исключения превращаются в способ не замечать поломку.
  console.log(`проверено историй ${checked}; дефектов ${defects.length}, советов ${advice.length}`
    + (dismissed ? `, погашено исключениями ${dismissed}` : '') + '\n');

  if (defects.length) {
    console.log('ДЕФЕКТЫ — прогон падает:');
    for (const d of defects) console.log(`  [${d.code}] ${d.where}: ${d.what}\n    ${d.why}`);
    console.log();
  }
  if (advice.length) {
    console.log('советы — решает человек:');
    for (const a of advice) console.log(`  [${a.code}] ${a.where}: ${a.what}\n    ${a.why}`);
    console.log();
  }
  if (!defects.length) console.log('устройство историй в порядке');
  process.exitCode = defects.length ? 1 : 0;
}
