// Порядок реплик сцены — ровно тот, в котором их просит движок.
//
// Это зеркало `js/app.js`, и живёт оно отдельным модулем по той же причине,
// по которой отдельно живёт `clip.mjs`: обход нужен не одному месту.
// Им пользуются `tools/check-voices.mjs` (сверка «что попросят — что есть»)
// и `tools/listen.html` (прослушивание истории целиком). Третьей копии
// быть не должно: разойдётся — и запись будет записана под одним именем,
// а искаться под другим. На слух это не тишина, а чужой голос.
//
// Модуль **чистый**: ни файлов, ни сети. Данные (историю, пул) передаёт
// вызывающий — поэтому он одинаково работает и в node, и в браузере.
//
// Чего здесь нарочно НЕТ — расчёта ключа пула. Он повторён в
// `tools/check-voices.mjs` своей копией, чтобы расхождение с `js/tasks.js`
// было замечено, а не повторено следом; браузерная страница берёт его
// прямо из `js/tasks.js`, то есть из авторского экземпляра.

import { splitDialogue } from './clip.mjs';

/** Чей голос у сцены: свой, иначе голос истории, иначе герой (js/app.js). */
export const voiceOf = (scene, story) => scene.voice ?? story.voice ?? 'hero';

/** Что произносится, когда у сцены с выбором нет своего `prompt`. */
export const askLine = (choices) => 'Что выберем: ' + choices.map(c => c.label).join(', или ');

/** Похвалы за верный ответ — из js/app.js. Произносятся рассказчиком. */
export const PRAISE = [
  'Верно! Молодец.',
  'Правильно! Отлично справился.',
  'Точно! Ты внимательный.',
  'Да, именно так. Умница!',
];

/** Служебные реплики вне сцен: похвалы плюс подсказки про микрофон. */
export const SYSTEM = [
  ...PRAISE,
  'Скажи ещё раз, только погромче. Или нажми ответ внизу.',
  'Не расслышал. Нажми на нужный ответ внизу.',
];

/**
 * Имя зрителя подставляется один раз при загрузке истории — как в движке.
 * Сейчас поля `viewer` нет ни у одной истории, но механизм оставлен: он
 * есть в `js/app.js`, и зеркало обязано его повторять.
 */
export function fillViewer(story) {
  if (!story.viewer) return story;
  const walk = (v) => {
    if (typeof v === 'string') return v.replaceAll('{{имя}}', story.viewer);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(story);
}

/**
 * Подписи кнопок, которые движок действительно прочитает вслух.
 *
 * Правило «всё или ничего» (`js/app.js`): если вопрос уже назвал все
 * варианты, читать их ещё раз незачем; если не назвал ни одного — читаются
 * все. Половинчатый случай был хуже обоих: у задания «что дальше: блок,
 * факел, блок, факел» озвучивался единственный вариант, которого в вопросе
 * нет, то есть прямая подсказка.
 *
 * Вынесено отдельно, потому что это нужно ещё и коллектору
 * (`tools/tts/collect.mjs`): пока он озвучивал подписи всегда, в корпусе
 * лежало 111 записей, которых движок не проигрывает никогда.
 */
export function spokenLabels(prompt, choices = []) {
  const said = (prompt || '').toLowerCase();
  const allNamed = choices.every(c => said.includes(c.label.toLowerCase()));
  return allNamed ? [] : choices.map(c => c.label);
}

/**
 * Все реплики сцены по порядку: текст, вопрос, подписи кнопок, реплики
 * вариантов, подсказки. `tasks` — то, во что задание превратило сцену
 * (`{ prompt, choices }`), или `null` у сцены без задания.
 *
 * `why` объясняет, откуда реплика взялась: это нужно и сверке, и
 * прослушиванию — по нему видно, почему подпись кнопки то читается,
 * то нет.
 */
export function utterances(scene, story, tasks) {
  const out = [];
  const say = (text, role, why) => { if (text) out.push({ text, role, why }); };
  const dialogue = (text, character, why) => {
    for (const seg of splitDialogue(text, character)) say(seg.text, seg.role, why);
  };

  // Задание рисует сцене новый `prompt` и новые `choices`, поэтому
  // разбирать надо то, что получится после `withTask`, а не сырую сцену.
  dialogue(scene.speak ?? scene.text, voiceOf(scene, story), 'текст сцены');

  const choices = scene.task ? tasks.choices : (scene.choices || []);
  const prompt = scene.task ? tasks.prompt : (scene.prompt ?? (choices.length ? askLine(choices) : null));

  if (choices.length) {
    say(prompt, 'narrator', scene.prompt || scene.task ? 'вопрос' : 'вопрос собран из подписей (askLine)');

    for (const label of spokenLabels(prompt, choices)) say(label, 'narrator', 'подпись кнопки');

    for (const c of choices) {
      if (c.say) dialogue(c.say, c.voice ?? voiceOf(scene, story), 'реплика варианта');
      if (c.hint) say(c.hint, 'narrator', 'подсказка');
    }
  }
  return out;
}

/**
 * Во что превращается сцена с заданием. Вариантов столько, сколько
 * заданий в пуле под её ключом: вопросы там разные, и у каждого свой файл.
 * У сцены без задания — один проход с `null`.
 *
 * `entries` — записи пула по ключу сцены; сужение по `types` делается
 * здесь, потому что это часть поведения движка, а не вызывающего.
 */
export function runsOf(scene, entries = []) {
  if (!scene.task) return [null];
  const spec = typeof scene.task === 'string' ? { kind: scene.task } : scene.task;
  return entries
    .filter(t => !spec.types || spec.types.includes(t.type))
    .map(t => ({
      prompt: t.question,
      choices: t.choices.map(c => (c.correct
        ? { label: c.label, say: PRAISE[0] }   // похвала одна на всех по разбору
        : { label: c.label, hint: t.hint })),
      // Для прослушивания полезно знать, какой это вариант и верный ли ответ.
      meta: { type: t.type, audio: t.audio, correct: t.choices.find(c => c.correct)?.label },
    }));
}

/** Спецификация задания сцены в едином виде: строка или объект. */
export const taskSpec = (scene) =>
  (typeof scene.task === 'string' ? { kind: scene.task } : scene.task);
