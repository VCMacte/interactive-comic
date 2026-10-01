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
  water:  { base: '#3b6fb5', dark: '#2d589a', light: '#5a8ccd' },
  sand:   { base: '#ded3a0', dark: '#c4b884', light: '#efe6bb' },
  pine:   { base: '#2f6b3a', dark: '#23522c', light: '#3d8148' },
  brick:  { base: '#9d9d9d', dark: '#787878', light: '#b4b4b4' },
  wool:   { base: '#e9e6de', dark: '#cdc9bf', light: '#f7f5f0' },
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

// Рассвет: та же палитра, что у закатного неба, но светлее и прохладнее —
// иначе второй день начинается картинкой вчерашнего вечера.
function skyDawn() {
  const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#3f5fa8"/><stop offset="0.5" stop-color="#9c86c4"/>
    <stop offset="0.82" stop-color="#f0a97e"/><stop offset="1" stop-color="#ffd9a8"/></linearGradient></defs>`;
  return svg(`<rect width="${W}" height="${H}" fill="url(#g)"/>
${clouds(57, '#ffd2b0', 0.7)}`, defs);
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

// Гора за рекой — та, в которой «живут алмазы». Пик по центру кадра:
// он задаёт цель второго дня ещё до того, как о ней скажут словами.
function farRiver(seed = 81) {
  const rand = rng(seed);
  const out = [];
  const peakCol = Math.round((W / B) * 0.56);

  for (let col = 0; col * B < W; col++) {
    const x = col * B;
    const d = Math.abs(col - peakCol);
    // Склон лесенкой от пика: ближе к центру выше, по краям сходит в холмы.
    const height = Math.max(1, 11 - d - (rand() < 0.35 ? 1 : 0));
    for (let i = 0; i < height; i++) {
      const y = GROUND - B - i * B;
      const top = i === height - 1;
      out.push(block(x, y, height > 7 && top ? P.stone : top ? P.far : P.dirt, rand));
    }
  }
  return svg(out.join('\n'));
}

// Еловый лес: конусы вместо шапок. У волка должна быть своя чаща,
// иначе вечерняя сцена повторяет утренние холмы.
function farPines(seed = 91) {
  const rand = rng(seed);
  const out = [];
  for (let col = 0; col * B < W; col++) {
    const x = col * B;
    for (let i = 0; i < 2; i++) out.push(block(x, GROUND - B - i * B, i === 1 ? P.far : P.dirt, rand));
  }
  // Ярусы ели сужаются кверху. Кант не обводкой, а смещённой копией:
  // обводка рисует и внутренние границы ярусов, получается лестница.
  for (let t = 0; t < 14; t++) {
    const x = Math.floor(rand() * (W / B)) * B;
    const base = GROUND - B * 2;
    const tiers = 3 + Math.floor(rand() * 2);
    out.push(block(x, base, P.wood, rand));
    for (let r = 0; r < tiers; r++) {
      const wide = tiers - r;
      for (let c = -wide + 1; c < wide; c++) {
        out.push(block(x + c * B, base - (r + 1) * B, P.pine, rand));
      }
    }
  }
  return svg(out.join('\n'));
}

// Глубокая шахта: тот же приём, что в far-cave, но темнее и с жилой алмазов —
// по сюжету Стив её как раз и находит.
function farDeep(seed = 101) {
  const rand = rng(seed);
  const out = [`<rect width="${W}" height="${H}" fill="#1f1f25"/>`];
  for (let r = 0; r * B < H; r++) {
    for (let c = 0; c * B < W; c++) {
      let pal = P.deep;
      const roll = rand();
      if (roll < 0.1) pal = P.coal;
      else if (roll < 0.115) pal = P.stone;
      out.push(block(c * B, r * B, pal, rand));
    }
  }
  // Жила кучкой, а не вразброс: россыпь одиночных алмазов читается как шум.
  // Правее центра — там, где её не закроет Стив.
  const vx = Math.round((W / B) * 0.79) * B, vy = Math.round((H / B) * 0.38) * B;
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [2, 1], [1, 2]]) {
    out.push(block(vx + dx * B, vy + dy * B, P.diamond, rand));
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

function nearMeadow(seed = 111) {
  const rand = rng(seed);
  // Луг держим пустым: овца и Стив ставятся сверху как персонажи, а кусты
  // по краям не дают кадру рассыпаться.
  const tufts = [];
  for (let i = 0; i < 22; i++) {
    const x = Math.floor(rand() * (W / B)) * B;
    const h = 10 + Math.floor(rand() * 14);
    tufts.push(`<rect x="${n(x + 14)}" y="${n(GROUND - h)}" width="10" height="${h}" fill="${P.leaves.dark}"/>`);
    if (rand() < 0.3) {
      tufts.push(`<rect x="${n(x + 30)}" y="${n(GROUND - 18)}" width="12" height="12" fill="${rand() < 0.5 ? '#e4d04a' : '#d35b8c'}"/>`);
    }
  }
  return svg(`${groundRows(rand)}
${tufts.join('\n')}
${cubeTree(0, GROUND, 4, rand)}
${cubeTree(W - B * 2, GROUND, 3, rand)}`);
}

/**
 * Речка идёт полосой НАД линией земли, а берег — во всю ширину кадра.
 * Иначе персонаж, поставленный в центр, оказывается стоящим на воде:
 * на бобре у ёжика это уже проходили.
 */
function nearRiver(seed = 121) {
  const rand = rng(seed);
  const out = [];
  const top = GROUND - B * 2;

  for (let r = 0; r < 2; r++) {
    for (let c = 0; c * B < W; c++) out.push(block(c * B, top + r * B, P.water, rand));
  }
  // Блики на воде — ряд светлых полос, они же выдают, что вода течёт.
  for (let i = 0; i < 16; i++) {
    const x = Math.floor(rand() * (W / B)) * B;
    out.push(`<rect x="${n(x + 8)}" y="${n(top + B * 0.4)}" width="${B - 16}" height="8" fill="${P.water.light}" opacity="0.7"/>`);
  }
  // Начатый мост: два блока от берега. Остальное ребёнок «достроит» в задании.
  const bx = Math.round((W / B) * 0.46) * B;
  out.push(block(bx, top, P.plank, rand));
  out.push(block(bx + B, top, P.plank, rand));

  return svg(`${out.join('\n')}
${groundRows(rand, P.grass, P.sand)}
${cubeTree(0, GROUND, 3, rand)}
${cubeTree(W - B, GROUND, 3, rand)}`);
}

function nearDeep(seed = 131) {
  const rand = rng(seed);
  const floor = [];
  for (let r = 0; GROUND + r * B < H; r++) {
    for (let c = 0; c * B < W; c++) floor.push(block(c * B, GROUND + r * B, P.stone, rand));
  }
  const torches = [B * 3, B * 11, W - B * 5].map(x => torch(x, GROUND - B * 2)).join('\n');

  return svg(`${floor.join('\n')}
${torches}
<rect x="0" y="0" width="${B * 2}" height="${H}" fill="#17171c"/>
<rect x="${W - B * 2}" y="0" width="${B * 2}" height="${H}" fill="#17171c"/>`);
}

/**
 * Внутренность дома: печка, сундук и стена. Кадр закрыт целиком, поэтому
 * сцена обходится одним этим слоем — ни небо, ни дальний план ей не нужны.
 */
function nearFurnace(seed = 141) {
  const rand = rng(seed);
  const out = [];

  for (let r = 0; r * B < H; r++) {
    for (let c = 0; c * B < W; c++) {
      out.push(block(c * B, r * B, r * B >= GROUND ? P.plank : P.brick, rand));
    }
  }
  // Швы между досками: без них пол сливается с земляным и перестаёт
  // читаться как «внутри дома».
  for (let r = 0; GROUND + r * B < H; r++) {
    out.push(`<rect x="0" y="${n(GROUND + r * B)}" width="${W}" height="5" fill="#8e6c3c" opacity="0.8"/>`);
  }
  // Окно с вечерним небом: глухая серая стена во весь кадр читается
  // как сбой загрузки, а не как комната.
  const wx = Math.round((W / B) * 0.12) * B, wy = GROUND - B * 4;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) out.push(block(wx + c * B, wy + r * B, P.wood, rand));
  }
  out.push(`<rect x="${n(wx + 8)}" y="${n(wy + 8)}" width="${n(B * 3 - 16)}" height="${n(B * 2 - 16)}" fill="#2c4a7a"/>`);
  out.push(`<rect x="${n(wx + B * 1.5 - 4)}" y="${n(wy + 8)}" width="8" height="${n(B * 2 - 16)}" fill="#7a5630"/>`);

  // Печка: два блока в ширину и два в высоту, с тёмной рамой и устьем.
  const fx = Math.round((W / B) * 0.33) * B, fy = GROUND - B * 2;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) out.push(block(fx + c * B, fy + r * B, P.stone, rand));
  }
  out.push(`<rect x="${n(fx - 4)}" y="${n(fy - 4)}" width="${n(B * 2 + 8)}" height="${n(B * 2 + 8)}" fill="none" stroke="#4a4a4a" stroke-width="8"/>`);
  out.push(`<rect x="${n(fx + 12)}" y="${n(fy + B + 10)}" width="${n(B * 2 - 24)}" height="${n(B - 18)}" fill="#20150a"/>`);
  out.push(`<rect x="${n(fx + 22)}" y="${n(fy + B + 22)}" width="${n(B * 2 - 44)}" height="${n(B - 34)}" fill="#ff9b22"/>`);
  out.push(`<rect x="${n(fx + 34)}" y="${n(fy + B + 30)}" width="${n(B * 2 - 68)}" height="12" fill="#fff0b0"/>`);
  // Слитки на полу у печки — то, что в этой сцене и считают.
  for (let i = 0; i < 3; i++) {
    out.push(`<rect x="${n(fx + B * 2.3 + i * 30)}" y="${n(GROUND - 20)}" width="24" height="16" fill="${P.sand.light}" stroke="#a09060" stroke-width="3"/>`);
  }

  const cx = Math.round((W / B) * 0.74) * B;
  out.push(block(cx, GROUND - B, P.wood, rand));
  out.push(`<rect x="${n(cx)}" y="${n(GROUND - B + B * 0.45)}" width="${B}" height="8" fill="#5a3f22"/>`);
  out.push(`<rect x="${n(cx + B * 0.42)}" y="${n(GROUND - B + B * 0.38)}" width="10" height="16" fill="#e8c35a"/>`);

  return svg(`${out.join('\n')}
${torch(B, GROUND - B * 3)}
${torch(W - B * 2, GROUND - B * 3)}`);
}

function nearPines(seed = 151) {
  const rand = rng(seed);
  const trees = [];
  // Ели кулисами по краям: центр кадра остаётся под Стива и волка.
  // Не вплотную к краю — у обрезанной ели ярусы не читаются, и она
  // превращается в полосу живой изгороди.
  for (const [x, tiers] of [[B, 5], [B * 4, 4], [W - B * 2, 5], [W - B * 5, 4]]) {
    trees.push(block(x, GROUND - B, P.wood, rand));
    for (let r = 0; r < tiers; r++) {
      const wide = tiers - r;
      for (let c = -wide + 1; c < wide; c++) {
        trees.push(block(x + c * B, GROUND - B * 2 - r * B, P.pine, rand));
      }
    }
  }
  return svg(`${groundRows(rand)}
${trees.join('\n')}`);
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

function sheep() {
  const U = 20;
  const skin = '#d9c9b4', eye = '#1d1d1d';

  // Шерсть крупными блоками: овцу стригут, и это должно быть видно
  // с дивана через сжатие трансляции.
  const body = `
${px(0, 0, 11 * U, 8 * U, P.wool.base)}
${px(1 * U, 0, 3 * U, 3 * U, P.wool.light)}
${px(6 * U, 1 * U, 3 * U, 3 * U, P.wool.light)}
${px(3 * U, 5 * U, 4 * U, 3 * U, P.wool.dark)}

<!-- голова -->
${px(11 * U, 2 * U, 4 * U, 5 * U, skin)}
${px(11 * U, 1 * U, 4 * U, 2 * U, P.wool.base)}
${px(12 * U, 4 * U, 0.9 * U, 0.9 * U, eye)}
${px(13.6 * U, 4 * U, 0.9 * U, 0.9 * U, eye)}
${px(11 * U, 2 * U, 0.8 * U, 1.6 * U, '#c4b3a0')}

<!-- ноги -->
${px(1 * U, 8 * U, 2.2 * U, 4 * U, skin)}
${px(5 * U, 8 * U, 2.2 * U, 4 * U, skin)}
${px(8.5 * U, 8 * U, 2.2 * U, 4 * U, skin)}`;

  return charSvg(body, 15 * U, 12 * U);
}

function wolf() {
  const U = 20;
  const grey = '#a8aab0', dark = '#6f737a', light = '#d6d8dc', eye = '#2b2b2b';

  // Волк сидит и виляет хвостом: по сюжету он не угроза, и поза должна
  // говорить это раньше, чем рассказчик.
  const body = `
${px(0, 3 * U, 8 * U, 6 * U, grey)}
${px(1 * U, 4 * U, 3 * U, 3 * U, dark)}

<!-- голова -->
${px(7 * U, 1 * U, 5 * U, 5 * U, grey)}
${px(10 * U, 3 * U, 3 * U, 2.4 * U, light)}
${px(12 * U, 3.6 * U, 1 * U, 1 * U, eye)}
${px(8.6 * U, 2.6 * U, 0.9 * U, 0.9 * U, eye)}
${px(10.6 * U, 2.6 * U, 0.9 * U, 0.9 * U, eye)}
${px(7 * U, 0, 1.4 * U, 1.4 * U, dark)}
${px(10 * U, 0, 1.4 * U, 1.4 * U, dark)}

<!-- хвост и лапы -->
${px(0, 1.4 * U, 1.6 * U, 2.4 * U, dark)}
${px(1.4 * U, 9 * U, 2 * U, 2.4 * U, grey)}
${px(5.4 * U, 9 * U, 2 * U, 2.4 * U, light)}
${px(8.6 * U, 6 * U, 2 * U, 5.4 * U, grey)}`;

  return charSvg(body, 13 * U, 12 * U);
}

/* ---------------- сборка ---------------- */

console.log('Небо:');
write('assets/mc/sky-day.svg', skyDay());
write('assets/mc/sky-sunset.svg', skySunset());
write('assets/mc/sky-night.svg', skyNight());
write('assets/mc/sky-dawn.svg', skyDawn());
write('assets/mc/sun-day.svg', celestial(1500, 220, 88, '#ffe873', '#fff3b0'));
write('assets/mc/sun-sunset.svg', celestial(1420, 600, 86, '#ffc24d', '#ff9d5c'));
write('assets/mc/moon-night.svg', celestial(1500, 230, 74, '#f2f5fb', '#c9d8f2', 90));
write('assets/mc/sun-dawn.svg', celestial(430, 640, 80, '#ffd98a', '#ffb878'));

console.log('Дальний план:');
write('assets/mc/far-hills.svg', farHills());
write('assets/mc/far-cave.svg', farCave());
write('assets/mc/far-river.svg', farRiver());
write('assets/mc/far-pines.svg', farPines());
write('assets/mc/far-deep.svg', farDeep());

console.log('Ближний план:');
write('assets/mc/near-forest.svg', nearForest());
write('assets/mc/near-craft.svg', nearCraft());
write('assets/mc/near-cave.svg', nearCave());
write('assets/mc/near-build.svg', nearBuild());
write('assets/mc/near-house.svg', nearHouse());
write('assets/mc/near-meadow.svg', nearMeadow());
write('assets/mc/near-river.svg', nearRiver());
write('assets/mc/near-deep.svg', nearDeep());
write('assets/mc/near-furnace.svg', nearFurnace());
write('assets/mc/near-pines.svg', nearPines());

console.log('Персонажи:');
write('assets/mc/steve.svg', steve());
write('assets/mc/creeper.svg', creeper());
write('assets/mc/cow.svg', cow());
write('assets/mc/sheep.svg', sheep());
write('assets/mc/wolf.svg', wolf());

console.log('\nГотово.');
