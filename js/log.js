// Журнал событий. Пишется на телефон, выгружается файлом, разбирается потом.
//
// Зачем вообще: телефон — движок истории, он лежит на столе, консоли у него
// нет, а смотрит ребёнок на телевизор. Дефекты вроде «прослушивание заедает
// и ответ не слышно» снаружи выглядят одинаково — «сломалось», — и в тот
// момент к устройству никто не подключён. Журнал и есть тот свидетель.
//
// Процедура взята целиком у соседнего проекта (`run-game`, `js/log.js`):
// IndexedDB, очередь со сбросом раз в две секунды, склейка повторов,
// потолки с автоочисткой, выгрузка файлом плюс «Поделиться» и уборка
// выгруженного в два приёма. Она там проверена на живых журналах с телефона,
// и переизобретать её тут незачем.
//
// Почему IndexedDB, а не localStorage: у localStorage около пяти мегабайт
// и синхронный доступ, то есть каждая запись подвешивает кадр. У нас кадр
// дешёвый, но подвисание приходится ровно на озвучку и анимацию сцены.
//
// Почему сброс раз в две секунды, а не в конце истории: самые ценные записи —
// те, после которых приложение умерло. Их в памяти не остаётся.
//
// Разбор: tools/log-report.mjs. Что пишется и зачем — в CLAUDE.md.

const DB = 'comic-log';
const VERSION = 1;

export const LIMITS = {
  // Приложение целиком весит 21 МБ озвучки плюс графика, и всё это лежит
  // в офлайн-кэше. Журнал здесь мелкий — события микрофона, а не кадры, —
  // поэтому потолок скромный: пять мегабайт это тысячи окон прослушивания.
  bytes: 5 * 1024 * 1024,
  sessions: 20,            // сессий приложения
  flushMs: 2000,
  /* Сколько одинаковых событий подряд склеивать в одно.

     Это и есть страховка ровно от того дефекта, ради которого журнал
     заводится: затык прослушивания — поток одинаковых записей. Без склейки
     он вытеснил бы из журнала все прошлые сессии, то есть один дефект унёс
     бы с собой свидетельства остальных.

     Склейка не бесконечная: после 500 повторов копится следующая запись.
     Так видно, что поток продолжается, а не кончился. */
  repeat: 500,
};

/* ---------------- доступ к базе ---------------- */

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('events')) {
        db.createObjectStore('events', { keyPath: 'k', autoIncrement: true })
          .createIndex('session', 'session');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = tx.onabort = () => reject(tx.error);
});

const ask = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

/* ---------------- сессия ---------------- */

// Сессия — один запуск приложения, а не одна история: интересны как раз
// случаи, когда история не доиграна.
const sessionId = Date.now();
const startedAt = new Date().toISOString();
const t0 = (typeof performance === 'undefined' ? Date.now() : performance.now());
const now = () => (typeof performance === 'undefined' ? Date.now() : performance.now());

let queue = [];
// Отпечаток последнего события в очереди — чтобы не сериализовать его заново
// при каждом следующем. Сбрасывается вместе с очередью.
let prevKey = null;
let queuedBytes = 0;
let timer = 0;
let broken = false;   // база недоступна — приватный режим, переполнение диска

const encoder = typeof TextEncoder === 'undefined' ? null : new TextEncoder();
const sizeOf = (v) => {
  try { return encoder ? encoder.encode(JSON.stringify(v)).length : JSON.stringify(v).length; }
  catch { return 0; }
};

/* Отпечаток события: всё, кроме времени и полей конверта.

   Сравнение по полям, а не по типу: две РАЗНЫЕ ошибки склеивать нельзя —
   из журнала исчезла бы вторая. Поля конверта названы с подчёркиванием,
   чтобы не столкнуться с полезной нагрузкой.

   Экспортируется ради проверки: очередь приватна, а решение «это тот же
   поток или новый» обязано быть под тестом. */
export function eventKey(e) {
  try {
    const { t, _n, _lastT, ...rest } = e;
    return JSON.stringify(rest);
  } catch { return null; }
}

/** Одинаковы ли два события с точностью до времени и счётчика повторов. */
export function sameEvent(a, b) {
  if (!a || !b || a.type !== b.type) return false;
  const ka = eventKey(a);
  return ka != null && ka === eventKey(b);
}

/** Ставит событие в очередь. Никогда не бросает: журнал не должен ронять историю. */
export function event(type, data) {
  if (broken) return;
  const e = { t: Math.round(now() - t0), type, ...data };

  /* Повтор подряд — не новая запись, а счётчик у прошлой. Склейка живёт
     здесь, в общем месте, а не у вызывающих: непредвиденный поток событий —
     это и есть тот случай, который журнал обязан выдержать.

     `t` первой записи не меняется: по нему видно, когда поток начался.
     `_lastT` говорит, когда пришёл последний повтор, иначе длительность
     потока по журналу не восстановить. */
  const prev = queue[queue.length - 1];
  const key = eventKey(e);
  if (prev && key != null && key === prevKey && (prev._n || 1) < LIMITS.repeat) {
    prev._n = (prev._n || 1) + 1;
    prev._lastT = e.t;
    return;
  }

  queue.push(e);
  prevKey = key;
  queuedBytes += sizeOf(e);
  if (!timer) timer = setTimeout(flush, LIMITS.flushMs);
}

export async function flush() {
  clearTimeout(timer);
  timer = 0;
  if (broken || !queue.length) return;

  const batch = queue;
  queue = [];
  prevKey = null;
  queuedBytes = 0;

  try {
    const db = await open();
    const bytes = sizeOf(batch);
    const tx = db.transaction(['events', 'sessions'], 'readwrite');
    const events = tx.objectStore('events');
    for (const e of batch) events.add({ ...e, session: sessionId });

    const sessions = tx.objectStore('sessions');
    const prev = await ask(sessions.get(sessionId));
    sessions.put({
      id: sessionId,
      startedAt,
      ua: navigator.userAgent,
      events: (prev?.events || 0) + batch.length,
      bytes: (prev?.bytes || 0) + bytes,
      updatedAt: new Date().toISOString(),
    });
    await done(tx);
    await trim();
  } catch {
    // База не открылась — журнал молча выключается. История важнее журнала.
    broken = true;
  }
}

/* ---------------- потолок и автоочистка ---------------- */

/* Чистится по двум условиям сразу: больше 20 сессий или больше потолка
   в байтах. Удаляются всегда самые старые: свежая запись полезнее, а дефект,
   который разбирают, случился только что. */
export async function trim() {
  const db = await open();
  const tx = db.transaction(['sessions', 'events'], 'readwrite');
  const sessions = tx.objectStore('sessions');
  const all = (await ask(sessions.getAll())).sort((a, b) => a.id - b.id);

  let total = all.reduce((s, x) => s + (x.bytes || 0), 0);
  const doomed = [];

  // Текущую сессию не трогаем никогда: иначе журнал съест сам себя
  // на длинной истории и останется пустым ровно тогда, когда нужен.
  const removable = all.filter((s) => s.id !== sessionId);

  for (const s of removable) {
    if (all.length - doomed.length <= LIMITS.sessions && total <= LIMITS.bytes) break;
    doomed.push(s);
    total -= s.bytes || 0;
  }

  if (doomed.length) {
    const store = tx.objectStore('events');
    const index = store.index('session');
    for (const s of doomed) {
      sessions.delete(s.id);
      await dropEvents(store, index, s.id);
    }
  }
  await done(tx);
  return doomed.length;
}

// Курсор продвигается в собственном onsuccess: continue() ничего
// не возвращает, результат приходит в тот же запрос.
function dropEvents(store, index, session) {
  return new Promise((resolve, reject) => {
    const req = index.openKeyCursor(IDBKeyRange.only(session));
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) { resolve(); return; }
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

/* ---------------- состояние ---------------- */

export async function status() {
  if (broken) return { broken: true };
  try {
    const db = await open();
    const all = await ask(db.transaction('sessions').objectStore('sessions').getAll());
    const bytes = all.reduce((s, x) => s + (x.bytes || 0), 0) + queuedBytes;
    const events = all.reduce((s, x) => s + (x.events || 0), 0) + queue.length;
    return { broken: false, sessions: all.length, events, bytes };
  } catch {
    return { broken: true };
  }
}

/* ---------------- выгрузка ---------------- */

async function collect() {
  await flush();
  const db = await open();
  const tx = db.transaction(['sessions', 'events']);
  const sessions = (await ask(tx.objectStore('sessions').getAll())).sort((a, b) => a.id - b.id);
  const events = await ask(tx.objectStore('events').getAll());
  const bySession = new Map(sessions.map((s) => [s.id, { ...s, log: [] }]));
  for (const e of events.sort((a, b) => a.k - b.k)) {
    const { k, session, ...rest } = e;
    bySession.get(session)?.log.push(rest);
  }
  return {
    exportedAt: new Date().toISOString(),
    limits: LIMITS,
    sessions: [...bySession.values()],
  };
}

function download(blob, name) {
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    return true;
  } catch {
    return false;
  }
}

/**
 * Сохраняет журнал файлом и открывает «Поделиться».
 *
 * Именно в таком порядке и обязательно оба. Файл должен лечь на телефон
 * независимо от того, чем кончится шторка: её можно закрыть случайно
 * или передумать — и журнал не должен при этом пропасть. А шторка нужна
 * потому, что искать файл в «Загрузках» телефона ради отправки — лишний шаг.
 */
export async function save() {
  const data = await collect();
  const name = `comic-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });

  const saved = download(blob, name);

  // Шторка требует «свежего» жеста пользователя. Сборка журнала выше занимает
  // миллисекунды; если когда-нибудь перестанет укладываться — share() откажет,
  // а файл всё равно уже сохранён.
  let shared = 'unavailable';
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Журнал комикса' });
      shared = 'shared';
    } catch (e) {
      shared = e?.name === 'AbortError' ? 'cancelled' : 'failed';
    }
  }

  return { name, bytes: blob.size, saved, shared, sessions: data.sessions.length };
}

/**
 * Уборка выгруженного — в ДВА приёма, через пометку.
 *
 * Удалять сразу нельзя: `download()` возвращает `true` всегда, когда
 * `a.click()` не бросил, а браузер отказывает в загрузке ПОСЛЕ клика
 * и молча — кончилось место, загрузка заблокирована. Выходило бы так:
 * взрослый жмёт «Выгрузить журнал» на телефоне без свободного места,
 * Chrome показывает «Загрузка не удалась», а приложение пишет «журнал
 * очищен» и сносит записи, которых больше нигде нет.
 *
 * Поэтому: в этот раз сессия ПОМЕЧАЕТСЯ выгруженной, а удаляется та, что
 * была помечена в прошлый раз. Чтобы потерять сессию, надо, чтобы две
 * выгрузки подряд не доехали до диска.
 *
 * Текущая не помечается и не удаляется: в неё сейчас пишут, а `flush()`
 * собирает её запись заново на каждом сбросе и пометку бы стёр.
 */
export async function sweepExported() {
  const db = await open();
  const tx = db.transaction(['sessions', 'events'], 'readwrite');
  const sessions = tx.objectStore('sessions');
  const store = tx.objectStore('events');
  const index = store.index('session');
  const all = await ask(sessions.getAll());

  const doomed = [];
  let marked = 0;
  let bytes = 0;

  for (const s of all) {
    if (s.id === sessionId) continue;
    if (s.exported) {
      doomed.push(s);
      bytes += s.bytes || 0;
    } else {
      sessions.put({ ...s, exported: true });
      marked++;
    }
  }

  for (const s of doomed) {
    sessions.delete(s.id);
    await dropEvents(store, index, s.id);
  }
  await done(tx);
  return { sessions: doomed.length, marked, bytes };
}

export async function clear() {
  queue = [];
  prevKey = null;
  queuedBytes = 0;
  const db = await open();
  const tx = db.transaction(['sessions', 'events'], 'readwrite');
  tx.objectStore('sessions').clear();
  tx.objectStore('events').clear();
  await done(tx);
}

/* ---------------- что пишется без отдельной просьбы ---------------- */

/* Жизненный цикл и ошибки пишутся всегда. Это и есть события, ради которых
   журнал затевался: уход со страницы по кнопке микрофона на пульте, гашение
   экрана, исключение — всё то, что со стороны выглядит одинаково, как
   «приложение сломалось». */
export function watchLifecycle() {
  event('session.start', {
    startedAt,
    screen: `${screen.width}x${screen.height}@${devicePixelRatio}`,
    installed: matchMedia('(display-mode: fullscreen)').matches
      || matchMedia('(display-mode: standalone)').matches,
    lang: navigator.language,
  });

  addEventListener('error', (e) => event('error', {
    message: String(e.message), source: e.filename, line: e.lineno, col: e.colno,
  }));
  addEventListener('unhandledrejection', (e) => event('error.promise', {
    reason: String(e.reason?.message || e.reason),
  }));

  addEventListener('visibilitychange', () => {
    event('visibility', { state: document.visibilityState });
    // Последний шанс записать: после ухода со страницы её могут не разбудить.
    if (document.visibilityState === 'hidden') flush();
  });
  addEventListener('pagehide', flush);
}
