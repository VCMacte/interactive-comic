// Анимации сцены.
//
// Слои двигаются с разной скоростью: небо почти стоит, дальний план едет
// заметнее, ближний — сильнее всего. Это и создаёт ощущение, что ёжик
// действительно перешёл в другое место, а не что картинка подменилась.

const $ = (id) => document.getElementById(id);
const el = {
  sky: $('laySky'), stars: $('layStars'), far: $('layFar'), near: $('layNear'),
  cast: $('cast'), fx: $('fx'), scenery: $('scenery'),
};

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
// При включённом «меньше движения» анимации не выключаются совсем, а сжимаются
// почти в ноль: так код остаётся один, а ребёнок с укачиванием не страдает.
const T = (ms) => (reduced ? 1 : ms);

const EASE_OUT = 'cubic-bezier(.22,.61,.36,1)';
const EASE_POP = 'cubic-bezier(.34,1.46,.64,1)';

const play = (node, frames, opts) =>
  node.animate(frames, { fill: 'both', easing: EASE_OUT, ...opts, duration: T(opts.duration) });

const settled = (anims) => Promise.all(anims.map(a => a.finished.catch(() => {})));

/** Куда «едет камера»: влево, вправо или вглубь. */
function offsets(dir) {
  if (dir === 'left')  return { sign: -1, zoom: 1 };
  if (dir === 'right') return { sign: 1, zoom: 1 };
  return { sign: 0, zoom: 1.1 };   // вперёд: не сдвиг, а наезд
}

/* ---------------- наполнение сцены ---------------- */

export function setScene(scene) {
  const bg = scene.bg || {};
  swap(el.sky, bg.sky);
  swap(el.stars, bg.stars);
  swap(el.far, bg.far);
  swap(el.near, bg.near);

  el.cast.innerHTML = '';
  for (const actor of scene.cast || []) {
    const img = document.createElement('img');
    img.className = 'char' + (actor.flip ? ' flip' : '');
    img.src = actor.src;
    img.alt = '';
    img.style.left = (actor.x ?? 40) + '%';
    img.style.bottom = (actor.y ?? 12) + '%';
    img.style.width = (actor.w ?? 22) + '%';
    el.cast.append(img);
  }
}

function swap(node, src) {
  if (src) { node.src = src; node.hidden = false; }
  else { node.removeAttribute('src'); node.hidden = true; }
}

/** Картинки должны быть готовы до анимации, иначе вход «моргает». */
export function preloadScene(scene) {
  const urls = [...Object.values(scene.bg || {}), ...(scene.cast || []).map(a => a.src)];
  return Promise.all(urls.filter(Boolean).map(src => new Promise((resolve) => {
    const img = new Image();
    img.onload = img.onerror = resolve;
    img.src = src;
  })));
}

/* ---------------- вход и выход ---------------- */

export function leave(dir = 'forward') {
  const { sign, zoom } = offsets(dir);
  const out = (node, dist, scale) => play(node, [
    { transform: 'translateX(0) scale(1)', opacity: 1 },
    { transform: `translateX(${sign * dist}px) scale(${scale})`, opacity: 0 },
  ], { duration: 360, easing: 'cubic-bezier(.55,.06,.68,.19)' });

  return settled([
    out(el.sky, 24, zoom === 1 ? 1 : 0.97),
    out(el.stars, 34, zoom === 1 ? 1 : 0.97),
    out(el.far, 110, zoom === 1 ? 1 : 0.95),
    out(el.near, 230, zoom === 1 ? 1 : 0.92),
    ...[...el.cast.children].map((c, i) => play(c, [
      { transform: 'translateY(0) scale(1)', opacity: 1 },
      { transform: 'translateY(18px) scale(.94)', opacity: 0 },
    ], { duration: 280, delay: i * 40 })),
  ]);
}

export function enter(dir = 'forward') {
  const { sign, zoom } = offsets(dir);
  // Входим с противоположной стороны: если камера ушла влево,
  // новая локация появляется слева и доезжает до места.
  const from = -sign;

  const inAnim = (node, dist, delay) => play(node, [
    { transform: `translateX(${from * dist}px) scale(${zoom})`, opacity: 0 },
    { transform: 'translateX(0) scale(1)', opacity: 1 },
  ], { duration: 560, delay: T(delay) });

  const anims = [
    inAnim(el.sky, 26, 0),
    inAnim(el.stars, 36, 20),
    inAnim(el.far, 120, 50),
    inAnim(el.near, 240, 100),
  ];

  // Персонажи появляются после фона и слегка «с подскоком» —
  // так взгляд ребёнка сам переходит с локации на героя.
  [...el.cast.children].forEach((c, i) => {
    anims.push(play(c, [
      { transform: 'translateY(34px) scale(.9)', opacity: 0 },
      { transform: 'translateY(0) scale(1)', opacity: 1 },
    ], { duration: 520, delay: T(240 + i * 110), easing: EASE_POP }));
  });

  return settled(anims);
}

/* ---------------- реакции на ответ ---------------- */

/** Верный ответ: герой подпрыгивает, вокруг разлетаются искры. */
export function cheer() {
  for (const c of el.cast.children) {
    play(c, [
      { transform: 'translateY(0) scale(1)' },
      { transform: 'translateY(-7%) scale(1.04)', offset: 0.3 },
      { transform: 'translateY(0) scale(1)', offset: 0.55 },
      { transform: 'translateY(-3%) scale(1.02)', offset: 0.78 },
      { transform: 'translateY(0) scale(1)' },
    ], { duration: 900, easing: 'ease-out' });
  }
  sparks();
}

function sparks(count = 16) {
  if (reduced) return;
  const hero = el.cast.firstElementChild;
  const box = el.fx.getBoundingClientRect();
  const h = hero ? hero.getBoundingClientRect() : box;
  // Координаты в процентах кадра: кадр масштабируется, пиксели поедут.
  const cx = ((h.left + h.width / 2 - box.left) / box.width) * 100;
  const cy = ((h.top + h.height * 0.35 - box.top) / box.height) * 100;

  for (let i = 0; i < count; i++) {
    const s = document.createElement('div');
    s.className = 'spark';
    s.style.left = cx + '%';
    s.style.top = cy + '%';
    el.fx.append(s);

    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const dist = 60 + Math.random() * 110;
    const a = s.animate([
      { transform: 'translate(-50%,-50%) scale(.4)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist}px)) scale(1.1)`, opacity: 0 },
    ], { duration: 700 + Math.random() * 400, easing: EASE_OUT, fill: 'both' });
    a.finished.then(() => s.remove(), () => s.remove());
  }
}

/**
 * Неверный ответ: кнопка покачивается, герой удивлённо наклоняется.
 * Намеренно без красного и без резких движений — это не ошибка,
 * а приглашение попробовать ещё раз.
 */
export function wobble(button) {
  if (button) {
    play(button, [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-7px)', offset: 0.2 },
      { transform: 'translateX(6px)', offset: 0.45 },
      { transform: 'translateX(-4px)', offset: 0.7 },
      { transform: 'translateX(0)' },
    ], { duration: 420, easing: 'ease-in-out' });
  }
  for (const c of el.cast.children) {
    play(c, [
      { transform: 'rotate(0deg)' },
      { transform: 'rotate(-4deg)', offset: 0.3 },
      { transform: 'rotate(3deg)', offset: 0.65 },
      { transform: 'rotate(0deg)' },
    ], { duration: 520, easing: 'ease-in-out' });
  }
}
