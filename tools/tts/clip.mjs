// Два правила, по которым реплика превращается в файл. Вынесены из
// `collect.mjs` отдельным модулем ровно по одной причине: у коллектора
// весь разбор лежит на верхнем уровне, и любой импорт из него пересобирал
// бы манифест и пул. Проверке (`tools/check-voices.mjs`) нужны только эти
// две функции, и брать их она обязана отсюда, а не своей копией: копия
// согласилась бы сама с собой и ничего бы не поймала.

/**
 * Идентификатор реплики — от её текста и роли. Так приложение находит
 * нужный файл, ничего не зная о структуре сцен: совпал текст — нашлась
 * озвучка. Задания из пула подхватываются тем же механизмом.
 *
 * Тот же расчёт живёт в `js/audio.js` — там он нужен в браузере, где
 * этого модуля нет. Менять можно только оба сразу.
 */
export function clipId(text, role) {
  let h = 0x811c9dc5;
  const s = role + '|' + text.trim();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Прямая речь в «ёлочках» — голос персонажа, остальное — рассказчик.
 *
 * Та же разметка разбирается в `js/voice.js` (`speakDialogue`). Два места
 * обязаны остаться одинаковыми: разойдутся — запись будет записана под
 * одним именем, а искаться под другим, и движок уйдёт в браузерный синтез.
 * На слух это не тишина, а чужой голос.
 */
export function splitDialogue(text, character) {
  const out = [];
  const re = /«([^»]*)»/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push({ role: 'narrator', text: text.slice(last, m.index) });
    out.push({ role: character, text: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ role: 'narrator', text: text.slice(last) });

  return out
    .map(s => ({ role: s.role, text: s.text.replace(/^[\s—,.:;-]+/, '').trim() }))
    .filter(s => s.text);
}
