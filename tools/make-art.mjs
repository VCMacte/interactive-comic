// Генератор слоёв фона.
//
// Арт-направление — ночные силуэты с лунной подсветкой. Выбрано не из лени:
// крупные плоские формы и высокий контраст переживают сжатие Miracast,
// тогда как мягкая живопись на трансляции расплывается в кашу.
// Силуэты легко повторить и в нейросетевой генерации — стиль описывается
// одной фразой, и новые локации не выпадают из общего ряда.
//
// Запуск: node tools/make-art.mjs
//
// Сцена собирается из трёх слоёв, чтобы их можно было двигать отдельно
// и получить параллакс: sky (небо) → far (дальний план) → near (ближний).

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = 1920, H = 1080;

// Нижнюю четверть кадра занимает панель с текстом и кнопками. Если ставить
// землю по нижнему краю, персонажи окажутся за панелью — проверено, ёжика
// было не видно. Поэтому горизонт поднят, и действие идёт в светлой полосе
// между небом и панелью.
const GROUND = H * 0.70;
const PANEL = H * 0.74;   // ниже этой линии картинку всё равно закроет текст

/* ---------------- детерминированный случай ---------------- */

// Свой генератор, а не Math.random: иначе каждый запуск менял бы все файлы,
// и в истории правок нельзя было бы увидеть, что реально изменилось.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r2 = (rand, a, b) => a + rand() * (b - a);
const ri = (rand, a, b) => Math.floor(r2(rand, a, b + 1));
const n = (v) => Math.round(v * 10) / 10;

/* ---------------- палитра ---------------- */

const C = {
  skyTop: '#0a1430',
  skyBottom: '#1b2d4d',
  horizon: '#24395c',
  moon: '#fdf6d8',
  far: '#16253f',
  mid: '#101c31',
  near: '#070d18',
  ground: '#04080f',
  water: '#1d4a6b',
  rim: '#8fb4e8',      // лунный кант на силуэтах
  warm: '#ffc247',
};

const svg = (body, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice">\n${extra}\n${body}\n</svg>\n`;

const write = (rel, content) => {
  const path = join(ROOT, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
  console.log('  ' + rel);
};

/* ---------------- небо ---------------- */

// Звёзды живут отдельным прозрачным слоем и НЕ попадают в img2img.
// Причина проверена на двух прогонах: яркую звезду в стороне от луны
// генератор раздувает в второе светило, а если её приглушить — вымывает
// вместе со всеми остальными, и небо становится пустым.
// Отдельным слоем звёзды заодно сохраняют мерцание, которого растр не даёт.
function starsLayer(seed = 3) {
  const rand = rng(seed);
  const stars = [];

  for (let i = 0; i < 170; i++) {
    const x = n(r2(rand, 0, W));
    const y = n(r2(rand, 0, H * 0.62));
    const rad = n(r2(rand, 0.9, 2.8));
    // Чем ниже к горизонту, тем звёзды бледнее — так читается глубина.
    const fade = 1 - (y / (H * 0.62)) * 0.65;
    const op = n(r2(rand, 0.3, 0.95) * fade);
    const delay = n(r2(rand, 0, 6));
    stars.push(`<circle class="tw" cx="${x}" cy="${y}" r="${rad}" fill="#ffffff" opacity="${op}" style="animation-delay:${delay}s"/>`);
  }

  const style = `<style>
  .tw { animation: tw 5.5s ease-in-out infinite; }
  @keyframes tw { 0%,100% { opacity: .2 } 50% { opacity: .95 } }
  @media (prefers-reduced-motion: reduce) { .tw { animation: none } }
</style>`;

  return svg(stars.join('\n'), style);
}

// Основа неба: градиент, луна и ореол. Именно она уходит в img2img.
function sky(seed = 1) {
  const defs = `<defs>
  <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${C.skyTop}"/>
    <stop offset="0.62" stop-color="${C.skyBottom}"/>
    <stop offset="1" stop-color="${C.horizon}"/>
  </linearGradient>
  <radialGradient id="moonGlow">
    <stop offset="0" stop-color="${C.moon}" stop-opacity="0.55"/>
    <stop offset="0.45" stop-color="${C.moon}" stop-opacity="0.13"/>
    <stop offset="1" stop-color="${C.moon}" stop-opacity="0"/>
  </radialGradient>
</defs>
<style>
  .halo { animation: breathe 9s ease-in-out infinite; transform-origin: 1480px 230px; }
  @keyframes breathe { 0%,100% { transform: scale(1) } 50% { transform: scale(1.06) } }
  @media (prefers-reduced-motion: reduce) { .halo { animation: none } }
</style>`;

  const body = `<rect width="${W}" height="${H}" fill="url(#sky)"/>
<circle class="halo" cx="1480" cy="230" r="330" fill="url(#moonGlow)"/>
<circle cx="1480" cy="230" r="96" fill="${C.moon}"/>
<circle cx="1512" cy="206" r="14" fill="#efe6c2" opacity="0.5"/>
<circle cx="1452" cy="262" r="20" fill="#efe6c2" opacity="0.4"/>
<circle cx="1498" cy="272" r="9" fill="#efe6c2" opacity="0.45"/>`;

  return svg(body, defs);
}

/* ---------------- силуэты деревьев ---------------- */

// Ёлка рисуется ярусами: так силуэт не выглядит геометрическим треугольником.
function conifer(x, baseY, height, width, fill, rimOpacity) {
  const tiers = 4;
  const parts = [];
  for (let t = 0; t < tiers; t++) {
    const k = t / tiers;
    const top = baseY - height * (1 - k * 0.62);
    const halfW = (width / 2) * (0.42 + k * 0.58);
    const bottom = baseY - height * 0.52 * (1 - k) * 0.5;
    parts.push(`M${n(x)} ${n(top)} L${n(x - halfW)} ${n(bottom + height * 0.08)} L${n(x + halfW)} ${n(bottom + height * 0.08)} Z`);
  }
  const trunk = `<rect x="${n(x - width * 0.045)}" y="${n(baseY - height * 0.1)}" width="${n(width * 0.09)}" height="${n(height * 0.12)}" fill="${fill}"/>`;
  const d = parts.join(' ');
  // Лунный кант делается копией силуэта со сдвигом, а не обводкой:
  // обводка по составному пути рисует ещё и внутренние грани ярусов,
  // и дерево выглядит расчерченным лесенкой.
  const rim = rimOpacity
    ? `<path d="${d}" fill="${C.rim}" opacity="${rimOpacity}" transform="translate(3,-3)"/>`
    : '';
  return `${trunk}${rim}<path d="${d}" fill="${fill}"/>`;
}

function treeline({ seed, baseY, count, minH, maxH, fill, rim, spread = [0, W] }) {
  const rand = rng(seed);
  const out = [];
  for (let i = 0; i < count; i++) {
    const x = r2(rand, spread[0], spread[1]);
    const h = r2(rand, minH, maxH);
    out.push(conifer(x, baseY + r2(rand, -14, 14), h, h * 0.52, fill, rim));
  }
  return out.join('\n');
}

/* ---------------- дальний план ---------------- */

function farForest(seed = 7) {
  const defs = `<defs><linearGradient id="fog" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${C.horizon}" stop-opacity="0"/>
    <stop offset="1" stop-color="${C.horizon}" stop-opacity="0.75"/>
  </linearGradient></defs>`;

  // Деревьев немного и они низкие: частый ряд одинаковых треугольников
  // читается как гребень и забивает кадр — проверено на первом варианте.
  const hills = `<path d="M0 ${n(GROUND - 46)} Q ${W * 0.26} ${n(GROUND - 92)} ${W * 0.52} ${n(GROUND - 52)} T ${W} ${n(GROUND - 66)} L${W} ${H} L0 ${H} Z" fill="${C.far}" opacity="0.92"/>`;

  return svg(`${hills}
${treeline({ seed: seed + 1, baseY: GROUND - 34, count: 13, minH: 70, maxH: 130, fill: C.far, rim: 0.14 })}
<rect x="0" y="${n(GROUND - 150)}" width="${W}" height="190" fill="url(#fog)"/>
${treeline({ seed: seed + 2, baseY: GROUND - 6, count: 9, minH: 95, maxH: 155, fill: C.mid, rim: 0.2 })}`, defs);
}

function farHills(seed = 11) {
  return svg(`<path d="M0 ${n(GROUND - 56)} Q ${W * 0.3} ${n(GROUND - 120)} ${W * 0.55} ${n(GROUND - 58)} T ${W} ${n(GROUND - 76)} L${W} ${H} L0 ${H} Z" fill="${C.far}"/>
<path d="M0 ${n(GROUND - 16)} Q ${W * 0.35} ${n(GROUND - 60)} ${W * 0.72} ${n(GROUND - 18)} T ${W} ${n(GROUND - 30)} L${W} ${H} L0 ${H} Z" fill="${C.mid}"/>
${treeline({ seed, baseY: GROUND - 10, count: 7, minH: 80, maxH: 130, fill: C.mid, rim: 0.18 })}`);
}

/* ---------------- ближний план ---------------- */

// Кулисы по краям кадра: центр остаётся свободным под персонажей.
// Деревья ровно по два с каждой стороны и уходят за край — так они
// обрамляют, а не загораживают.
function framingTrees(seed) {
  return `${treeline({ seed, baseY: H * 1.04, count: 2, minH: 560, maxH: 760, fill: C.near, rim: 0.22, spread: [-110, W * 0.085] })}
${treeline({ seed: seed + 5, baseY: H * 1.04, count: 2, minH: 560, maxH: 760, fill: C.near, rim: 0.22, spread: [W * 0.915, W + 110] })}`;
}

function groundPath(seed = 21) {
  const rand = rng(seed);
  const grass = [];
  for (let i = 0; i < 120; i++) {
    const x = n(r2(rand, 0, W));
    const y = n(r2(rand, GROUND + 6, PANEL));
    const h = n(r2(rand, 12, 32));
    const lean = n(r2(rand, -7, 7));
    grass.push(`<path d="M${x} ${y} q ${lean} ${-h * 0.6} ${lean * 1.7} ${-h}" stroke="${C.near}" stroke-width="3" fill="none" opacity="0.8"/>`);
  }
  return grass.join('\n');
}

function nearForest(seed = 31) {
  const defs = `<defs><linearGradient id="trail" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${C.moon}" stop-opacity="0.28"/>
    <stop offset="1" stop-color="${C.moon}" stop-opacity="0.04"/>
  </linearGradient></defs>`;
  // Лунная тропа из сюжета: светлый клин, уходящий вдаль и раздваивающийся.
  // Развилка приходится на видимую полосу, а не прячется за панелью.
  const trail = `<path d="M${W * 0.5} ${n(GROUND - 10)} L${W * 0.16} ${H} L${W * 0.84} ${H} Z" fill="url(#trail)"/>
<path d="M${W * 0.5} ${n(GROUND - 6)} L${W * 0.30} ${H} L${W * 0.44} ${H} Z" fill="${C.moon}" opacity="0.14"/>
<path d="M${W * 0.5} ${n(GROUND - 6)} L${W * 0.70} ${H} L${W * 0.56} ${H} Z" fill="${C.moon}" opacity="0.14"/>
<circle cx="${W * 0.5}" cy="${n(GROUND - 6)}" r="90" fill="${C.moon}" opacity="0.07"/>`;

  return svg(`<path d="M0 ${n(GROUND)} Q ${W * 0.5} ${n(GROUND - 18)} ${W} ${n(GROUND)} L${W} ${H} L0 ${H} Z" fill="${C.ground}"/>
${trail}
${groundPath(seed)}
${framingTrees(seed + 1)}`, defs);
}

function nearRiver(seed = 41) {
  const rand = rng(seed);
  const defs = `<defs>
  <linearGradient id="riv" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${C.water}" stop-opacity="0.95"/>
    <stop offset="1" stop-color="#0b2436" stop-opacity="1"/>
  </linearGradient>
</defs>
<style>
  .ripple { animation: drift 7s ease-in-out infinite; }
  @keyframes drift { 0%,100% { transform: translateX(0) } 50% { transform: translateX(26px) } }
  @media (prefers-reduced-motion: reduce) { .ripple { animation: none } }
</style>`;

  const ripples = [];
  for (let i = 0; i < 16; i++) {
    const y = n(r2(rand, GROUND - 120, GROUND - 18));
    const x = n(r2(rand, 0, W * 0.8));
    const len = n(r2(rand, 90, 330));
    const op = n(r2(rand, 0.08, 0.3));
    const delay = n(r2(rand, 0, 7));
    ripples.push(`<rect class="ripple" x="${x}" y="${y}" width="${len}" height="3" rx="1.5" fill="${C.rim}" opacity="${op}" style="animation-delay:${delay}s"/>`);
  }

  // Река уходит за линию земли, а герои стоят на берегу перед ней.
  // В первом варианте вода занимала весь низ, и бобёр оказывался на поверхности.
  const reeds = [];
  const rr = rng(seed + 9);
  for (let i = 0; i < 26; i++) {
    const x = n(r2(rr, 0, W));
    const h = n(r2(rr, 26, 70));
    const lean = n(r2(rr, -10, 10));
    reeds.push(`<path d="M${x} ${n(GROUND - 6)} q ${lean} ${-h * 0.6} ${lean * 1.6} ${-h}" stroke="${C.near}" stroke-width="4" fill="none" opacity="0.9"/>`);
  }

  return svg(`<path d="M0 ${n(GROUND - 130)} Q ${W * 0.5} ${n(GROUND - 148)} ${W} ${n(GROUND - 130)} L${W} ${n(GROUND - 8)} L0 ${n(GROUND - 8)} Z" fill="url(#riv)"/>
<path d="M0 ${n(GROUND - 130)} Q ${W * 0.5} ${n(GROUND - 148)} ${W} ${n(GROUND - 130)}" stroke="${C.rim}" stroke-width="3" fill="none" opacity="0.3"/>
${ripples.join('\n')}
<path d="M0 ${n(GROUND - 8)} Q ${W * 0.5} ${n(GROUND - 26)} ${W} ${n(GROUND - 8)} L${W} ${H} L0 ${H} Z" fill="${C.ground}"/>
${reeds.join('\n')}
${groundPath(seed)}
${treeline({ seed: seed + 3, baseY: H * 1.04, count: 2, minH: 520, maxH: 700, fill: C.near, rim: 0.22, spread: [-110, W * 0.07] })}`, defs);
}

function nearOak(seed = 51) {
  // Дуб из сюжета: толстый ствол с дуплом, в котором виден тёплый огонёк.
  const trunk = `<path d="M${W * 0.60} ${H} L${W * 0.60} ${H * 0.44} Q ${W * 0.63} ${H * 0.30} ${W * 0.70} ${H * 0.26}
    L${W * 0.80} ${H * 0.28} Q ${W * 0.74} ${H * 0.38} ${W * 0.74} ${H * 0.52} L${W * 0.76} ${H} Z" fill="${C.near}"/>`;
  const canopy = `<ellipse cx="${W * 0.72}" cy="${H * 0.22}" rx="${W * 0.30}" ry="${H * 0.21}" fill="${C.mid}"/>
<ellipse cx="${W * 0.72}" cy="${H * 0.22}" rx="${W * 0.30}" ry="${H * 0.21}" fill="none" stroke="${C.rim}" stroke-width="3" opacity="0.18"/>
<ellipse cx="${W * 0.56}" cy="${H * 0.30}" rx="${W * 0.14}" ry="${H * 0.12}" fill="${C.near}" opacity="0.9"/>`;
  const hollow = `<ellipse cx="${W * 0.675}" cy="${H * 0.56}" rx="34" ry="46" fill="#000" opacity="0.85"/>
<ellipse class="glow" cx="${W * 0.675}" cy="${H * 0.57}" rx="16" ry="22" fill="${C.warm}" opacity="0.5"/>`;
  const defs = `<style>
  .glow { animation: flicker 4s ease-in-out infinite; }
  @keyframes flicker { 0%,100% { opacity: .35 } 50% { opacity: .65 } }
  @media (prefers-reduced-motion: reduce) { .glow { animation: none } }
</style>`;

  return svg(`${canopy}
${trunk}
${hollow}
<path d="M0 ${n(GROUND)} Q ${W * 0.5} ${n(GROUND - 16)} ${W} ${n(GROUND)} L${W} ${H} L0 ${H} Z" fill="${C.ground}"/>
${groundPath(seed)}
${treeline({ seed: seed + 2, baseY: H * 1.04, count: 2, minH: 500, maxH: 680, fill: C.near, rim: 0.2, spread: [-110, W * 0.07] })}`, defs);
}

function nearGlade(seed = 61) {
  const rand = rng(seed);
  const defs = `<defs><radialGradient id="warmGlow">
    <stop offset="0" stop-color="${C.warm}" stop-opacity="0.42"/>
    <stop offset="1" stop-color="${C.warm}" stop-opacity="0"/>
  </radialGradient></defs>
<style>
  .fly { animation: float 6s ease-in-out infinite; }
  @keyframes float { 0%,100% { transform: translate(0,0) } 50% { transform: translate(18px,-22px) } }
  @media (prefers-reduced-motion: reduce) { .fly { animation: none } }
</style>`;

  const flies = [];
  for (let i = 0; i < 9; i++) {
    const x = n(r2(rand, W * 0.12, W * 0.88));
    const y = n(r2(rand, H * 0.30, GROUND - 20));
    const delay = n(r2(rand, 0, 6));
    flies.push(`<g class="fly" style="animation-delay:${delay}s">
  <circle cx="${x}" cy="${y}" r="26" fill="url(#warmGlow)"/>
  <circle cx="${x}" cy="${y}" r="3.5" fill="#fff3cd"/>
</g>`);
  }

  return svg(`<path d="M0 ${n(GROUND)} Q ${W * 0.5} ${n(GROUND - 18)} ${W} ${n(GROUND)} L${W} ${H} L0 ${H} Z" fill="${C.ground}"/>
${groundPath(seed)}
${flies.join('\n')}
${framingTrees(seed + 4)}`, defs);
}

function nearBurrow(seed = 71) {
  const defs = `<defs><radialGradient id="door">
    <stop offset="0" stop-color="${C.warm}" stop-opacity="0.6"/>
    <stop offset="1" stop-color="${C.warm}" stop-opacity="0"/>
  </radialGradient></defs>`;

  // Нора — смысловой центр финала, поэтому вход целиком в видимой полосе,
  // а не прижат к нижнему краю, где его закроет панель с текстом.
  const holeY = GROUND - 18;
  return svg(`<path d="M${W * 0.20} ${H} Q ${W * 0.50} ${n(GROUND - 260)} ${W * 0.80} ${H} Z" fill="${C.near}"/>
<ellipse cx="${W * 0.50}" cy="${n(holeY)}" rx="104" ry="80" fill="#000" opacity="0.92"/>
<ellipse cx="${W * 0.50}" cy="${n(holeY)}" rx="200" ry="156" fill="url(#door)"/>
<path d="M0 ${n(GROUND + 6)} Q ${W * 0.5} ${n(GROUND - 10)} ${W} ${n(GROUND + 6)} L${W} ${H} L0 ${H} Z" fill="${C.ground}"/>
${groundPath(seed)}
${framingTrees(seed + 6)}`, defs);
}

/* ---------------- персонажи ---------------- */

// Персонажи живут в своём квадрате 400×400 с прозрачным фоном,
// чтобы их можно было ставить в любую сцену и двигать отдельно от фона.
// Рисуем в квадрате 400×400, но viewBox обрезаем по самому силуэту.
// Иначе вокруг персонажа остаётся пустое поле: он кажется мелким
// и будто висит над землёй, хотя «ногами» стоит в своём невидимом боксе.
const CH = 400;
const charSvg = (body, box, style = '') => {
  // width/height обязаны совпадать с viewBox. Иначе браузер берёт пропорции
  // из атрибутов, рисунок летербоксится внутри квадрата, и персонаж
  // оказывается подвешен над землёй на высоту пустого поля.
  const [, , bw, bh] = box.split(/\s+/).map(Number);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" width="${bw}" height="${bh}">
<style>
  .idle { animation: idle 3.4s ease-in-out infinite; transform-origin: 200px 340px; }
  @keyframes idle { 0%,100% { transform: translateY(0) scaleY(1) } 50% { transform: translateY(-5px) scaleY(1.015) } }
  .blink { animation: blink 5.2s ease-in-out infinite; transform-origin: center; }
  @keyframes blink { 0%,94%,100% { transform: scaleY(1) } 97% { transform: scaleY(0.08) } }
  @media (prefers-reduced-motion: reduce) { .idle, .blink { animation: none } }
  ${style}
</style>
<g class="idle">
${body}
</g>
</svg>\n`;
};

// Общее у всех: глаза и лунный кант. Кант синий намеренно — это отсвет
// луны, а не цвет шерсти, и он связывает персонажей с ночным фоном.
const SKIN = {
  rim: '#9cc0f0',
  eye: '#f7f1e3',
  pupil: '#15111f',
};

// У каждого зверя своя палитра. На первом варианте палитра была одна на всех,
// и весь зверинец выходил фиолетовым. Тона тёплые и чуть светлее фона:
// на синей ночи холодный персонаж сливается с задником.
const FUR = {
  hedgehog: { dark: '#3b2a1b', body: '#5d4531', tip: '#7a5c40', light: '#e8d5b8' },
  owl:      { dark: '#4a3a2b', body: '#6d5742', light: '#f0e4cc' },
  beaver:   { dark: '#432a1a', body: '#6e4529', light: '#d9b795' },
  firefly:  { dark: '#3a2f1a' },
};

// Иголки считаются по дуге эллипса: от руки такой веер получается неровным.
function spikes(cx, cy, rx, ry, fromDeg, toDeg, count, len, fill) {
  const out = [];
  const rad = (d) => (d * Math.PI) / 180;
  for (let i = 0; i < count; i++) {
    const a0 = rad(fromDeg + ((toDeg - fromDeg) * i) / count);
    const a1 = rad(fromDeg + ((toDeg - fromDeg) * (i + 1)) / count);
    const am = (a0 + a1) / 2;
    const p = (a, k = 1) => `${n(cx + Math.cos(a) * rx * k)} ${n(cy - Math.sin(a) * ry * k)}`;
    out.push(`<path d="M${p(a0)} L${p(am, len)} L${p(a1)} Z" fill="${fill}"/>`);
  }
  return out.join('\n');
}

function hedgehog() {
  // Иголок много и они длинные: именно колючая спина делает силуэт ёжиком.
  // На первом варианте их было тринадцать, и он читался гладким пятном.
  const body = `
<ellipse cx="200" cy="272" rx="128" ry="92" fill="${FUR.hedgehog.dark}"/>
${spikes(200, 272, 128, 92, 174, 6, 24, 1.3, FUR.hedgehog.dark)}
${spikes(200, 272, 128, 92, 170, 20, 11, 1.17, FUR.hedgehog.tip)}
<ellipse cx="186" cy="268" rx="104" ry="70" fill="${FUR.hedgehog.body}" opacity="0.55"/>

<!-- мордочка смотрит вправо -->
<path d="M300 288 Q 352 280 372 258 Q 352 244 318 246 Q 300 258 300 288 Z" fill="${FUR.hedgehog.light}"/>
<ellipse cx="296" cy="276" rx="34" ry="34" fill="${FUR.hedgehog.light}"/>
<circle cx="370" cy="256" r="11" fill="${SKIN.pupil}"/>
<circle cx="366" cy="252" r="3.5" fill="${SKIN.eye}" opacity="0.7"/>

<g class="blink" style="transform-origin:302px 262px">
  <ellipse cx="302" cy="262" rx="12" ry="13" fill="${SKIN.eye}"/>
  <circle cx="305" cy="263" r="7" fill="${SKIN.pupil}"/>
  <circle cx="308" cy="259" r="2.6" fill="${SKIN.eye}"/>
</g>

<ellipse cx="258" cy="246" rx="15" ry="11" fill="#e8a0a8" opacity="0.35"/>

<!-- лапки -->
<ellipse cx="150" cy="352" rx="30" ry="17" fill="${FUR.hedgehog.dark}"/>
<ellipse cx="248" cy="354" rx="30" ry="17" fill="${FUR.hedgehog.dark}"/>`;
  return charSvg(body, '16 132 368 244');
}

function owl() {
  const body = `
<ellipse cx="200" cy="262" rx="104" ry="118" fill="${FUR.owl.body}"/>
<ellipse cx="200" cy="262" rx="104" ry="118" fill="none" stroke="${SKIN.rim}" stroke-width="3" opacity="0.25"/>
<path d="M118 196 L104 136 L152 170 Z" fill="${FUR.owl.dark}"/>
<path d="M282 196 L296 136 L248 170 Z" fill="${FUR.owl.dark}"/>
<ellipse cx="200" cy="300" rx="66" ry="72" fill="${FUR.owl.light}" opacity="0.28"/>

<g class="blink" style="transform-origin:200px 222px">
  <circle cx="160" cy="222" r="42" fill="${SKIN.eye}"/>
  <circle cx="240" cy="222" r="42" fill="${SKIN.eye}"/>
  <circle cx="166" cy="224" r="21" fill="${SKIN.pupil}"/>
  <circle cx="234" cy="224" r="21" fill="${SKIN.pupil}"/>
  <circle cx="173" cy="216" r="7" fill="${SKIN.eye}"/>
  <circle cx="241" cy="216" r="7" fill="${SKIN.eye}"/>
</g>

<path d="M200 240 L216 262 L200 276 L184 262 Z" fill="${C.warm}"/>
<path d="M176 352 l-14 26 M200 352 l0 28 M224 352 l14 26" stroke="${C.warm}" stroke-width="7" stroke-linecap="round" opacity="0.85"/>`;
  return charSvg(body, '96 128 208 258');
}

function beaver() {
  const body = `
<!-- хвост-лопата -->
<ellipse cx="96" cy="320" rx="68" ry="34" fill="${FUR.beaver.dark}" transform="rotate(-14 96 320)"/>
<ellipse cx="96" cy="320" rx="68" ry="34" fill="none" stroke="${SKIN.rim}" stroke-width="2.5" opacity="0.2" transform="rotate(-14 96 320)"/>

<ellipse cx="208" cy="276" rx="104" ry="94" fill="${FUR.beaver.body}"/>
<ellipse cx="208" cy="276" rx="104" ry="94" fill="none" stroke="${SKIN.rim}" stroke-width="3" opacity="0.22"/>
<circle cx="274" cy="200" r="20" fill="${FUR.beaver.dark}"/>

<ellipse cx="282" cy="258" rx="54" ry="46" fill="${FUR.beaver.light}"/>
<ellipse cx="316" cy="246" rx="13" ry="10" fill="${SKIN.pupil}"/>

<g class="blink" style="transform-origin:276px 222px">
  <ellipse cx="276" cy="222" rx="13" ry="14" fill="${SKIN.eye}"/>
  <circle cx="280" cy="223" r="7.5" fill="${SKIN.pupil}"/>
  <circle cx="283" cy="219" r="2.8" fill="${SKIN.eye}"/>
</g>

<!-- передние зубы -->
<rect x="296" y="276" width="13" height="26" rx="4" fill="#fffaf0"/>
<rect x="312" y="276" width="13" height="26" rx="4" fill="#fffaf0"/>

<ellipse cx="176" cy="356" rx="30" ry="16" fill="${FUR.beaver.dark}"/>
<ellipse cx="252" cy="356" rx="30" ry="16" fill="${FUR.beaver.dark}"/>`;
  return charSvg(body, '20 170 326 206');
}

function firefly() {
  const body = `
<circle cx="200" cy="210" r="120" fill="url(#ff)"/>
<g class="wing" style="transform-origin:200px 200px">
  <ellipse cx="166" cy="178" rx="40" ry="22" fill="${SKIN.eye}" opacity="0.45" transform="rotate(-24 166 178)"/>
  <ellipse cx="234" cy="178" rx="40" ry="22" fill="${SKIN.eye}" opacity="0.45" transform="rotate(24 234 178)"/>
</g>
<ellipse cx="200" cy="212" rx="30" ry="38" fill="${FUR.firefly.dark}"/>
<circle cx="200" cy="238" r="22" fill="${C.warm}"/>
<circle cx="200" cy="238" r="12" fill="#fff6d8"/>
<circle cx="192" cy="196" r="5" fill="${SKIN.eye}"/>
<circle cx="208" cy="196" r="5" fill="${SKIN.eye}"/>`;

  const defs = `.wing { animation: flap .45s ease-in-out infinite; }
  @keyframes flap { 0%,100% { transform: scaleY(1) } 50% { transform: scaleY(0.55) } }
  @media (prefers-reduced-motion: reduce) { .wing { animation: none } }`;

  return charSvg(body, '80 88 240 242', defs).replace('<style>',
    `<defs><radialGradient id="ff">
      <stop offset="0" stop-color="${C.warm}" stop-opacity="0.5"/>
      <stop offset="1" stop-color="${C.warm}" stop-opacity="0"/>
    </radialGradient></defs>\n<style>`);
}

/* ---------------- сборка ---------------- */

console.log('Слои фона:');
write('assets/bg/sky.svg', sky());
write('assets/bg/stars.svg', starsLayer());
write('assets/bg/far-forest.svg', farForest());
write('assets/bg/far-hills.svg', farHills());
write('assets/bg/near-forest.svg', nearForest());
write('assets/bg/near-river.svg', nearRiver());
write('assets/bg/near-oak.svg', nearOak());
write('assets/bg/near-glade.svg', nearGlade());
write('assets/bg/near-burrow.svg', nearBurrow());

console.log('\nПерсонажи:');
write('assets/char/hedgehog.svg', hedgehog());
write('assets/char/owl.svg', owl());
write('assets/char/beaver.svg', beaver());
write('assets/char/firefly.svg', firefly());
console.log('\nГотово.');
