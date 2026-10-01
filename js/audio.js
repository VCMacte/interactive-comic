// Готовая озвучка: заранее начитанные нейросетью реплики.
//
// Зачем она вообще нужна, если есть синтез в браузере: в браузере
// телевизора русского голоса нет, и комикс шёл в полной тишине. Готовые
// файлы от устройства не зависят вовсе — и звучат заметно живее
// встроенного синтезатора.
//
// Файл находится по содержимому реплики: совпал текст и роль — нашлась
// озвучка. Поэтому ни сцены, ни задания не нужно нигде перечислять:
// достаточно, чтобы текст совпадал с тем, что озвучили на сборке.

const DIR = 'assets/audio/';
const EXT = '.mp3';   // MP3 играет везде, включая браузер телевизора

let index = null;          // множество доступных идентификаторов
let current = null;        // то, что звучит прямо сейчас
let token = 0;

/** Тот же расчёт, что в tools/tts/collect.mjs — иначе файлы не найдутся. */
export function clipId(text, role) {
  let h = 0x811c9dc5;
  const s = role + '|' + String(text).trim();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Список доступных файлов читаем один раз. Без него пришлось бы ловить 404
 * на каждой реплике: в офлайне это ещё и мусорит в консоль.
 */
export async function loadIndex() {
  if (index) return index;
  try {
    const list = await fetch(DIR + 'index.json').then(r => r.json());
    index = new Set(list);
  } catch {
    index = new Set();
  }
  return index;
}

export function hasClip(text, role) {
  return !!index && index.has(clipId(text, role));
}

export function stopAudio() {
  token++;
  if (current) {
    try { current.pause(); current.src = ''; } catch {}
    current = null;
  }
}

/**
 * Проигрывает готовую реплику.
 * @returns {Promise<boolean>} false — файла нет, нужно звать синтез
 */
export async function playClip(text, role) {
  await loadIndex();
  const id = clipId(text, role);
  if (!index.has(id)) return false;

  const my = ++token;
  const el = new Audio(DIR + id + EXT);
  el.preload = 'auto';
  current = el;

  const played = await new Promise((resolve) => {
    let done = false;
    const finish = (ok) => { if (!done) { done = true; resolve(ok); } };

    // «Закончилось» ещё не значит «прозвучало»: если устройство не отдало
    // звук или автовоспроизведение запретили, событие приходит мгновенно
    // с нулевой позицией. Считать это успехом нельзя — иначе история пойдёт
    // в тишине, так и не позвав запасной синтез.
    el.onended = () => finish(el.duration < 1 || el.currentTime >= el.duration * 0.5);
    el.onerror = () => finish(false);
    // Длительность заранее неизвестна, а зависнуть на битом файле нельзя.
    el.onloadedmetadata = () => {
      setTimeout(() => finish(true), (el.duration || 10) * 1000 + 1500);
    };

    el.play().catch(() => finish(false));
  });

  if (my !== token) return true;     // нас прервали — считаем, что отыграли
  if (current === el) current = null;
  return played;
}

/** Заранее подтягиваем файлы следующей сцены, чтобы не было паузы на старте. */
export function preloadClips(pairs) {
  if (!index) return;
  for (const { text, role } of pairs) {
    const id = clipId(text, role);
    if (!index.has(id)) continue;
    const a = new Audio();
    a.preload = 'auto';
    a.src = DIR + id + EXT;
  }
}
