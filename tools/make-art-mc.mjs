// Генератор блочного мира для комикса «Первая ночь».
//
// Отдельный файл от make-art.mjs: у ёжика другой стиль и свои семена
// случайности, незачем перегенерировать его арт при каждой правке кубов.
//
// Эти слои — не конечная графика, а основа. Небо и дальний план уходят
// в Easy Diffusion как init-картинки (tools/paint-layers.mjs), и нейросеть
// расписывает их поверх. Геометрию кубов и линию земли задаёт именно вектор:
// генерация с нуля ставит землю куда попало, и персонажи повисают в воздухе.
//
// Запуск: node tools/make-art-mc.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = 1920, H = 1080;
const B = 60;              // сторона блока
const GROUND = H * 0.70;   // та же линия земли, что и у ёжика: ниже панель с текстом

/* ---------------- детерминированный случай ---------------- */

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const n = (v) => Math.round(v * 10) / 10;

/* ---------------- палитры блоков ---------------- */

const P = {
  grass:  { base: '#6aa84f', dark: '#4e7c3a', light: '#86c162' },
  dirt:   { base: '#8b6a44', dark: '#6b5134', light: '#a07c52' },
  stone:  { base: '#8a8a8a', dark: '#6e6e6e', light: '#9e9e9e' },
  deep:   { base: '#4a4a52', dark: '#3a3a42', light: '#5a5a62' },
  wood:   { base: '#9a7040', dark: '#7a5630', light: '#b2854e' },
  plank:  { base: '#b08a50', dark: '#8e6c3c', light: '#c49a60' },
  leaves: { base: '#4f8a3a', dark: '#3d6b2c', light: '#5fa347' },
  far:    { base: '#5d8f52', dark: '#4a7342', light: '#6fa160' },
  coal:   { base: '#3a3a3a', dark: '#222', light: '#555' },
  diamond:{ base: '#4fd3d6', dark: '#2fa8ab', light: '#8ef0f2' },
};

/**
 * Один блок. Крапины внутри — это и есть «пиксельная» текстура Minecraft:
 * без них кубы выглядят плоскими цветными квадратами.
 */
function block(x, y, pal, rand, size = B) {
  const q = size / 4;
  const out = [`<rect x="${n(x)}" y="${n(y)}" width="${size}" height="${size}" fill="${pal.base}"/>`];
  for (let i = 0; i < 4; i++) {
    const sx = x + Math.floor(rand() * 4) * q;
    const sy = y + Math.floor(rand() * 4) * q;
    out.push(`<rect x="${n(sx)}" y="${n(sy)}" width="${q}" height="${q}" fill="${rand() < 0.5 ? pal.dark : pal.light}" opacity="0.55"/>`);
  }
  return out.join('');
}

const svg = (body, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice">\n${extra}\n${body}\n</svg>\n`;

const write = (rel, content) => {
  const path = join(ROOT, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf8');
  console.log('  ' + rel);
};

/* ---------------- небо ---------------- */

// Облака из блоков, а не из мягких пятен: в этом мире даже пар квадратный.
function clouds(seed, fill, opacity) {
  const rand = rng(seed);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(rand() * (W / B)) * B;
    const y = Math.floor(rand() * 6) * B + B;
    const w = 3 + Math.floor(rand() * 4);
    out.push(`<g opacity="${opacity}">`);
    for (let c = 0; c < w; c++) {
      out.push(`<rect x="${x + c * B}" y="${y}" width="${B}" height="${B}" fill="${fill}"/>`);
      if (rand() < 0.45) out.push(`<rect x="${x + c * B}" y="${y - B}" width="${B}" height="${B}" fill="${fill}"/>`);
    }
    out.push('</g>');
  }
  return out.join('\n');
}

function squareSun(x, y, size, core, glow) {
  return `<rect x="${x - size}" y="${y - size}" width="${size * 2}" height="${size * 2}" fill="${glow}" opacity="0.35"/>
<rect x="${n(x - size * 0.62)}" y="${n(y - size * 0.62)}" width="${n(size * 1.24)}" height="${n(size * 1.24)}" fill="${core}"/>`;
}

// Светило живёт отдельным прозрачным слоем и НЕ попадает в img2img:
// проверено — яркий квадрат солнца нейросеть перерисовывает в пятно.
function celestial(x, y, size, core, halo, stars = 0) {
  // Ореол ступенькой, а не широким прямоугольником: большой полупрозрачный
  // квадрат на небе читается не как свет, а как случайный артефакт.
  const out = [
    `<rect x="${n(x - size * 1.22)}" y="${n(y - size * 1.22)}" width="${n(size * 2.44)}" height="${n(size * 2.44)}" fill="${halo}" opacity="0.22"/>`,
    `<rect x="${n(x - size * 1.1)}" y="${n(y - size * 1.1)}" width="${n(size * 2.2)}" height="${n(size * 2.2)}" fill="${halo}" opacity="0.38"/>`,
    `<rect x="${n(x - size)}" y="${n(y - size)}" width="${n(size * 2)}" height="${n(size * 2)}" fill="${core}"/>`,
  ];
  const rand = rng(5);
  for (let i = 0; i < stars; i++) {
    const sx = Math.floor(rand() * (W / 20)) * 20;
    const sy = Math.floor(rand() * (H * 0.55 / 20)) * 20;
    out.push(`<rect x="${sx}" y="${sy}" width="10" height="10" fill="#ffffff" opacity="${n(0.3 + rand() * 0.6)}"/>`);
  }
  return svg(out.join('\n'));
}

function skyDay() {
  const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#4a8fd4"/><stop offset="0.7" stop-color="#8fc4ec"/>
    <stop offset="1" stop-color="#c6e2f5"/></linearGradient></defs>`;
  return svg(`<rect width="${W}" height="${H}" fill="url(#g)"/>
${clouds(21, '#ffffff', 0.9)}`, defs);
}

function skySunset() {
  const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#2e3a6b"/><stop offset="0.45" stop-color="#b85c4a"/>
    <stop offset="0.8" stop-color="#e89458"/><stop offset="1" stop-color="#f3c184"/></linearGradient></defs>`;
  return svg(`<rect width="${W}" height="${H}" fill="url(#g)"/>
${clouds(33, '#f0b48a', 0.75)}`, defs);
}

function skyNight() {
  const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#070d22"/><stop offset="0.7" stop-color="#121d3c"/>
    <stop offset="1" stop-color="#1d2b4d"/></linearGradient></defs>`;
  return svg(`<rect width="${W}" height="${H}" fill="url(#g)"/>
${clouds(44, '#1b2744', 0.8)}`, defs);
}

/* ---------------- дальний план ---------------- */

// Кубическое дерево: столб ствола и шапка листвы из блоков.
function cubeTree(x, baseY, trunkH, rand, palTrunk = P.wood, palLeaf = P.leaves) {
  const out = [];
  for (let i = 0; i < trunkH; i++) out.push(block(x, baseY - (i + 1) * B, palTrunk, rand));
  const top = baseY - (trunkH + 1) * B;
  for (let r = 0; r < 2; r++) {
    for (let c = -1; c <= 1; c++) out.push(block(x + c * B, top - r * B, palLeaf, rand));
  }
  out.push(block(x, top - 2 * B, palLeaf, rand));
  return out.join('');
}

function farHills(seed = 7) {
  const rand = rng(seed);
  const out = [];
  let height = 2;

  // Рельеф «лесенкой»: высота меняется на один блок за шаг,
  // иначе холмы выглядят случайным частоколом.
  for (let col = 0; col * B < W; col++) {
    const x = col * B;
    if (rand() < 0.3) height += rand() < 0.5 ? 1 : -1;
    height = Math.max(1, Math.min(5, height));

    for (let i = 0; i < height; i++) {
      const y = GROUND - B - i * B;
      out.push(block(x, y, i === height - 1 ? P.far : P.dirt, rand));
    }
    if (rand() < 0.14) out.push(cubeTree(x, GROUND - height * B, 2, rand));
  }
  return svg(out.join('\n'));
}

function farCave(seed = 11) {
  const rand = rng(seed);
  const out = [`<rect width="${W}" height="${H}" fill="#2b2b31"/>`];
  for (let r = 0; r * B < H; r++) {
    for (let c = 0; c * B < W; c++) {
      let pal = P.deep;
      const roll = rand();
      if (roll < 0.06) pal = P.coal;
      else if (roll < 0.075) pal = P.diamond;
      out.push(block(c * B, r * B, pal, rand));
    }
  }
  return svg(out.join('\n'));
}

/* ---------------- ближний план ---------------- */

/** Земля: верхний ряд дёрна, ниже грунт до нижнего края кадра. */
function groundRows(rand, topPal = P.grass, underPal = P.dirt) {
  const out = [];
  for (let r = 0; GROUND + r * B < H; r++) {
    for (let c = 0; c * B < W; c++) {
      out.push(block(c * B, GROUND + r * B, r === 0 ? topPal : underPal, rand));
    }
  }
  return out.join('\n');
}

function torch(x, y) {
  return `<rect x="${x + 24}" y="${y + 18}" width="12" height="42" fill="#7a5630"/>
<rect x="${x + 18}" y="${y + 4}" width="24" height="18" fill="#ffb13b"/>
<rect x="${x + 24}" y="${y}" width="12" height="10" fill="#fff0b0"/>`;
}

function nearForest(seed = 31) {
  const rand = rng(seed);
  // Деревья по краям кадра: центр остаётся свободным под персонажей.
  return svg(`${groundRows(rand)}
${cubeTree(0, GROUND, 4, rand)}
${cubeTree(B * 2, GROUND, 3, rand)}
${cubeTree(W - B * 2, GROUND, 4, rand)}
${cubeTree(W - B * 4, GROUND, 3, rand)}`);
}

function nearCraft(seed = 41) {
  const rand = rng(seed);
  const tx = W * 0.62, ty = GROUND - B;
  // Верстак: блок досок с тёмной столешницей и инструментами.
  const bench = `${block(tx, ty, P.plank, rand)}
<rect x="${n(tx)}" y="${n(ty)}" width="${B}" height="14" fill="#6b4f2a"/>
<rect x="${n(tx + 10)}" y="${n(ty + 20)}" width="16" height="16" fill="#7a5630"/>
<rect x="${n(tx + 34)}" y="${n(ty + 26)}" width="14" height="22" fill="#8a8a8a"/>`;
  const chest = `${block(tx + B * 2, ty, P.wood, rand)}
<rect x="${n(tx + B * 2)}" y="${n(ty + B * 0.45)}" width="${B}" height="8" fill="#5a3f22"/>
<rect x="${n(tx + B * 2 + B * 0.42)}" y="${n(ty + B * 0.38)}" width="10" height="16" fill="#e8c35a"/>`;

  return svg(`${groundRows(rand)}
${bench}
${chest}
${cubeTree(0, GROUND, 4, rand)}
${cubeTree(W - B * 2, GROUND, 4, rand)}`);
}

function nearCave(seed = 51) {
  const rand = rng(seed);
  const floor = [];
  for (let r = 0; GROUND + r * B < H; r++) {
    for (let c = 0; c * B < W; c++) floor.push(block(c * B, GROUND + r * B, P.stone, rand));
  }
  // Факелы из сюжета: Стив расставляет их, чтобы не заблудиться.
  const torches = [B * 2, B * 9, B * 17, W - B * 4]
    .map(x => torch(x, GROUND - B * 2)).join('\n');

  return svg(`${floor.join('\n')}
${torches}
<rect x="0" y="0" width="${B * 2}" height="${H}" fill="#1e1e24"/>
<rect x="${W - B * 2}" y="0" width="${B * 2}" height="${H}" fill="#1e1e24"/>`);
}

function nearBuild(seed = 61) {
  const rand = rng(seed);
  // Недостроенная стена: ровно то, что ребёнок будет достраивать в задании.
  const wall = [];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 5; c++) {
      wall.push(block(W * 0.60 + c * B, GROUND - B - r * B, P.stone, rand));
    }
  }
  wall.push(block(W * 0.60 + 5 * B, GROUND - B, P.stone, rand));

  return svg(`${groundRows(rand)}
${wall.join('\n')}
${cubeTree(0, GROUND, 4, rand)}
${cubeTree(W - B, GROUND, 3, rand)}`);
}

function nearHouse(seed = 71) {
  const rand = rng(seed);
  const hx = W * 0.58, hy = GROUND - B * 4;
  const house = [];

  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 6; c++) {
      const isDoor = r >= 2 && c === 2;
      const isWindow = r === 1 && (c === 0 || c === 4);
      if (isDoor) continue;
      house.push(block(hx + c * B, hy + r * B, isWindow ? P.plank : P.stone, rand));
      if (isWindow) {
        house.push(`<rect x="${n(hx + c * B + 8)}" y="${n(hy + r * B + 8)}" width="${B - 16}" height="${B - 16}" fill="#ffd98a" opacity="0.85"/>`);
      }
    }
  }
  // Дверной проём светится изнутри — видно, что дом обитаемый.
  house.push(`<rect x="${n(hx + 2 * B)}" y="${n(hy + 2 * B)}" width="${B}" height="${B * 2}" fill="#2a1d10"/>`);
  house.push(`<rect x="${n(hx + 2 * B + 10)}" y="${n(hy + 2 * B + 10)}" width="${B - 20}" height="${B * 2 - 20}" fill="#ffc247" opacity="0.5"/>`);
  for (let c = -1; c < 7; c++) house.push(block(hx + c * B, hy - B, P.wood, rand));

  return svg(`${groundRows(rand)}
${house.join('\n')}
${torch(hx - B, GROUND - B * 2)}
${cubeTree(0, GROUND, 4, rand)}`);
}

/* ---------------- персонажи ---------------- */

// width/height обязаны совпадать с viewBox: иначе браузер берёт пропорции
// из атрибутов, рисунок летербоксится внутри квадрата, и персонаж висит
// в воздухе на высоту пустого поля. На ёжике это уже ловилось.
const charSvg = (body, bw, bh, style = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${bw} ${bh}" width="${bw}" height="${bh}">
<style>
  .idle { animation: idle 3.2s ease-in-out infinite; transform-origin: 50% 100%; }
  @keyframes idle { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-6px) } }
  @media (prefers-reduced-motion: reduce) { .idle { animation: none } }
  ${style}
</style>
<g class="idle">
${body}
</g>
</svg>\n`;

const px = (x, y, w, h, fill, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra}/>`;

function steve() {
  const U = 20;                       // сторона «пикселя» модели
  const skin = '#b58057', hair = '#3b2a18', shirt = '#00a8a8';
  const legs = '#3b3f8f', shoe = '#4a4a4a', eye = '#ffffff', iris = '#3b2a18';

  const body = `
<!-- голова -->
${px(4 * U, 0, 8 * U, 8 * U, skin)}
${px(4 * U, 0, 8 * U, 2 * U, hair)}
${px(4 * U, 2 * U, U, U, hair)}
${px(11 * U, 2 * U, U, U, hair)}
${px(5.5 * U, 3 * U, 1.5 * U, U, eye)}
${px(8.5 * U, 3 * U, 1.5 * U, U, eye)}
${px(6 * U, 3 * U, U, U, iris)}
${px(9 * U, 3 * U, U, U, iris)}
${px(6.5 * U, 5.5 * U, 3 * U, 0.8 * U, '#8a5c3a')}

<!-- туловище и руки -->
${px(4 * U, 8 * U, 8 * U, 12 * U, shirt)}
${px(0, 8 * U, 4 * U, 9 * U, shirt)}
${px(12 * U, 8 * U, 4 * U, 9 * U, shirt)}
${px(0, 17 * U, 4 * U, 3 * U, skin)}
${px(12 * U, 17 * U, 4 * U, 3 * U, skin)}

<!-- ноги -->
${px(4 * U, 20 * U, 4 * U, 10 * U, legs)}
${px(8 * U, 20 * U, 4 * U, 10 * U, legs)}
${px(4 * U, 30 * U, 4 * U, 2 * U, shoe)}
${px(8 * U, 30 * U, 4 * U, 2 * U, shoe)}`;

  return charSvg(body, 16 * U, 32 * U);
}

function creeper() {
  const U = 20;
  const g = '#5ca64c', gd = '#4a8a3d', gl = '#74bd63', face = '#0d1a0d';

  const spots = [];
  const rand = rng(99);
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rand() * 8) * U;
    const y = Math.floor(rand() * 26) * U;
    spots.push(px(x, y, U, U, rand() < 0.5 ? gd : gl, ' opacity="0.55"'));
  }

  const body = `
${px(0, 0, 8 * U, 8 * U, g)}
${px(2 * U, 8 * U, 4 * U, 12 * U, g)}
${px(0, 20 * U, 4 * U, 6 * U, g)}
${px(4 * U, 20 * U, 4 * U, 6 * U, g)}
${spots.join('\n')}

<!-- лицо крипера: две глазницы и рот «подковой» -->
${px(1 * U, 2 * U, 2 * U, 2 * U, face)}
${px(5 * U, 2 * U, 2 * U, 2 * U, face)}
${px(3 * U, 4 * U, 2 * U, 2 * U, face)}
${px(2 * U, 5 * U, 1 * U, 2 * U, face)}
${px(5 * U, 5 * U, 1 * U, 2 * U, face)}`;

  return charSvg(body, 8 * U, 26 * U);
}

function cow() {
  const U = 20;
  const white = '#e8e4dc', dark = '#3a3028', snout = '#d9a8a0', horn = '#cfc6a8';

  const body = `
<!-- туловище -->
${px(0, 0, 12 * U, 8 * U, white)}
${px(1 * U, 1 * U, 3 * U, 3 * U, dark)}
${px(6 * U, 0, 4 * U, 3 * U, dark)}
${px(3 * U, 5 * U, 3 * U, 3 * U, dark)}

<!-- голова -->
${px(12 * U, 2 * U, 5 * U, 6 * U, dark)}
${px(13 * U, 5 * U, 4 * U, 3 * U, snout)}
${px(14 * U, 6 * U, 0.8 * U, 0.8 * U, dark)}
${px(15.6 * U, 6 * U, 0.8 * U, 0.8 * U, dark)}
${px(13 * U, 3 * U, 1 * U, 1 * U, white)}
${px(12 * U, 1 * U, 1 * U, 1 * U, horn)}
${px(16 * U, 1 * U, 1 * U, 1 * U, horn)}

<!-- ноги -->
${px(1 * U, 8 * U, 2.5 * U, 5 * U, dark)}
${px(5 * U, 8 * U, 2.5 * U, 5 * U, white)}
${px(9 * U, 8 * U, 2.5 * U, 5 * U, dark)}`;

  return charSvg(body, 17 * U, 13 * U);
}

/* ---------------- сборка ---------------- */

console.log('Небо:');
write('assets/mc/sky-day.svg', skyDay());
write('assets/mc/sky-sunset.svg', skySunset());
write('assets/mc/sky-night.svg', skyNight());
write('assets/mc/sun-day.svg', celestial(1500, 220, 88, '#ffe873', '#fff3b0'));
write('assets/mc/sun-sunset.svg', celestial(1420, 600, 86, '#ffc24d', '#ff9d5c'));
write('assets/mc/moon-night.svg', celestial(1500, 230, 74, '#f2f5fb', '#c9d8f2', 90));

console.log('Дальний план:');
write('assets/mc/far-hills.svg', farHills());
write('assets/mc/far-cave.svg', farCave());

console.log('Ближний план:');
write('assets/mc/near-forest.svg', nearForest());
write('assets/mc/near-craft.svg', nearCraft());
write('assets/mc/near-cave.svg', nearCave());
write('assets/mc/near-build.svg', nearBuild());
write('assets/mc/near-house.svg', nearHouse());

console.log('Персонажи:');
write('assets/mc/steve.svg', steve());
write('assets/mc/creeper.svg', creeper());
write('assets/mc/cow.svg', cow());

console.log('\nГотово.');
