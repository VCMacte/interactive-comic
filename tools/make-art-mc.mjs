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
  nether: { base: '#6b3a3a', dark: '#4e2a2c', light: '#834a46' },
  lava:   { base: '#e2561a', dark: '#b23a10', light: '#ffa534' },
  obsidian:{ base: '#2a2140', dark: '#1a1430', light: '#3f3260' },
  portal: { base: '#6a2bb5', dark: '#4a1b85', light: '#a05ce0' },
  iron:   { base: '#d2d2d8', dark: '#9ea0a8', light: '#eff0f4' },
  anvil:  { base: '#4a4a52', dark: '#33333a', light: '#6a6a74' },
  // Нижний мир: песок душ сероват и темнее породы, иначе берег сливается
  // со стеной; кирпич крепости холоднее и темнее самой породы, иначе
  // постройка не отличается от пещеры, в которой стоит.
  soul:   { base: '#4a3a33', dark: '#372b26', light: '#5d4a41' },
  nbrick: { base: '#43242a', dark: '#2e181d', light: '#5a333c' },
  quartz: { base: '#e3ddd4', dark: '#c2bbb0', light: '#f4f1ec' },
  // Подземелье пятого дня: мох на камне и гнилая доска заброшенной деревни.
  // Мох холоднее травы — тёплый зелёный под землёй читается как луг, а не
  // как сырой камень. Гнилая доска темнее и серее обычной: с палитрой plank
  // дома выглядели жилыми, а деревня должна читаться брошенной.
  moss:   { base: '#49684a', dark: '#365038', light: '#5c7f5c' },
  rot:    { base: '#6d5a3f', dark: '#51422d', light: '#857050' },
  // Мокрый камень ущелья. Он темнее и синее обычного: на первой покраске
  // дальняя стена вышла светлее ближней земли, и глубина перевернулась —
  // дальний план обязан быть темнее переднего, иначе кадр плоский.
  wet:    { base: '#2f3640', dark: '#222932', light: '#3e4854' },
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

// Берег огненной реки. Этот слой уходит в img2img, поэтому важна геометрия:
// река идёт ВЫСОКО, за спиной у героев. На уровне ног она читалась так,
// будто Стив стоит прямо в лаве — проверено на снимке сцены.
function farLava(seed = 161) {
  const rand = rng(seed);
  const out = [`<rect width="${W}" height="${H}" fill="#1d1418"/>`];

  // Стена пещеры: та же сетка, что в far-deep, но в тёплых тонах —
  // рядом лава, и холодный камень возле неё читается как ошибка цвета.
  for (let r = 0; r * B < H; r++) {
    for (let c = 0; c * B < W; c++) {
      let pal = P.nether;
      const roll = rand();
      if (roll < 0.09) pal = P.coal;
      else if (roll < 0.12) pal = P.obsidian;
      out.push(block(c * B, r * B, pal, rand));
    }
  }

  // Река: две полосы лавы и тёмный берег под ними. Берег отделяет реку
  // от пола ближнего слоя, иначе огонь смыкается с землёй под ногами.
  const top = GROUND - B * 7;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c * B < W; c++) out.push(block(c * B, top + r * B, P.lava, rand));
  }
  for (let c = 0; c * B < W; c++) {
    out.push(block(c * B, top + B * 2, P.obsidian, rand));
    out.push(block(c * B, top + B * 3, P.nether, rand));
  }
  // Блики на потоке и зарево на стене над ним.
  for (let i = 0; i < 18; i++) {
    const x = Math.floor(rand() * (W / B)) * B;
    out.push(`<rect x="${n(x + 6)}" y="${n(top + B * 0.35)}" width="${B - 12}" height="10" fill="${P.lava.light}" opacity="0.85"/>`);
    out.push(`<rect x="${n(x)}" y="${n(top - B * 2)}" width="${B}" height="${B * 2}" fill="${P.lava.light}" opacity="0.12"/>`);
  }
  // Лавопады идут от самого потолка до реки. Короткие «капли» над потоком
  // читались как оранжевые столбы, висящие в воздухе.
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(rand() * (W / B)) * B;
    out.push(`<rect x="${n(x + B * 0.25)}" y="0" width="${n(B * 0.5)}" height="${n(top)}" fill="${P.lava.base}" opacity="0.92"/>`);
    out.push(`<rect x="${n(x + B * 0.38)}" y="0" width="${n(B * 0.24)}" height="${n(top)}" fill="${P.lava.light}" opacity="0.8"/>`);
  }
  return svg(out.join('\n'));
}

/**
 * Огненное море по ту сторону портала. Неба в этой истории нет вовсе:
 * сверху свод, снизу море лавы, и слой закрывает кадр целиком — маски
 * при сборке ему не нужно, как far-cave и far-deep.
 *
 * Море стоит выше линии земли: ближний слой кладёт берег поверх, и лава
 * должна оказаться ЗА ним. Если опустить её до самого низа, получится,
 * что герои стоят в огне, — на far-lava это уже проверено.
 */
function farNetherSea(seed = 221) {
  const rand = rng(seed);
  const out = [`<rect width="${W}" height="${H}" fill="#2a1416"/>`];

  // Разметка по высоте. Море стоит ПОЛОСОЙ высоко, выше макушек: ниже
  // него идёт широкий тёмный берег, и только потом — пол ближнего слоя.
  // Если опустить лаву до линии земли, Стив читается стоящим в огне —
  // проверено на предпросмотре сцены, та же грабля, что у far-lava.
  const seaTop = GROUND - B * 8;
  const seaBottom = seaTop + B * 4;

  // Свод во всю ширину.
  for (let r = 0; r * B < seaTop; r++) {
    for (let c = 0; c * B < W; c++) {
      out.push(block(c * B, r * B, rand() < 0.14 ? P.obsidian : P.nether, rand));
    }
  }
  // Сталактиты: свод должен читаться низким потолком, а не стеной.
  for (let i = 0; i < 9; i++) {
    const x = Math.floor(rand() * (W / B)) * B;
    const h = 1 + Math.floor(rand() * 3);
    for (let r = 0; r < h; r++) out.push(block(x, r * B, P.obsidian, rand));
  }

  // Море: карниз, три ряда лавы, тёмный берег под ними до самого низа.
  for (let c = 0; c * B < W; c++) out.push(block(c * B, seaTop, P.obsidian, rand));
  for (let r = 1; r <= 3; r++) {
    for (let c = 0; c * B < W; c++) out.push(block(c * B, seaTop + r * B, P.lava, rand));
  }
  for (let r = 0; seaBottom + r * B < H; r++) {
    for (let c = 0; c * B < W; c++) out.push(block(c * B, seaBottom + r * B, P.nether, rand));
  }

  // Крепость стоит на дальнем берегу справа: центр и левая половина
  // остаются под Стива, волка и свинолюда (x от 24% до 62%).
  // Зубцы поднимаются в полосу лавы: на тёмном берегу крепость сливалась
  // с ним в одно пятно, а на огне читается силуэтом с первого взгляда.
  const fx = Math.round((W / B) * 0.72) * B;
  for (let c = 0; c < 5; c++) {
    const h = c % 2 ? 8 : 7;
    for (let r = 0; r < h; r++) out.push(block(fx + c * B, GROUND - B - r * B, P.nbrick, rand));
    out.push(block(fx + c * B, GROUND - B * h, P.quartz, rand));
  }
  // Проём в стене крепости — через него виден огонь внутри.
  out.push(`<rect x="${n(fx + B * 2)}" y="${n(GROUND - B * 3)}" width="${n(B * 1.6)}" height="${n(B * 2)}" fill="${P.lava.dark}"/>`);

  // Блики по поверхности и зарево на своде над морем.
  for (let i = 0; i < 22; i++) {
    const x = Math.floor(rand() * (W / B)) * B;
    const y = seaTop + (1 + Math.floor(rand() * 3)) * B;
    out.push(`<rect x="${n(x + 6)}" y="${n(y + B * 0.3)}" width="${B - 12}" height="10" fill="${P.lava.light}" opacity="0.8"/>`);
  }
  out.push(`<rect x="0" y="${n(seaTop - B * 3)}" width="${W}" height="${n(B * 3)}" fill="${P.lava.light}" opacity="0.13"/>`);

  // Лавопады от свода до моря: во всю высоту, иначе читаются как
  // оранжевые столбы, висящие в воздухе.
  for (let i = 0; i < 3; i++) {
    const x = Math.floor(rand() * (W / B)) * B;
    out.push(`<rect x="${n(x + B * 0.25)}" y="0" width="${n(B * 0.5)}" height="${n(seaTop)}" fill="${P.lava.base}" opacity="0.9"/>`);
    out.push(`<rect x="${n(x + B * 0.38)}" y="0" width="${n(B * 0.24)}" height="${n(seaTop)}" fill="${P.lava.light}" opacity="0.78"/>`);
  }
  return svg(out.join('\n'));
}

/**
 * Ущелье с водопадом — подложка для покраски. Неба здесь тоже нет:
 * сверху свод, напротив — стена другой стороны, и слой закрывает кадр
 * целиком, поэтому маски при сборке ему не нужно, как far-nether-sea.
 *
 * Стена напротив идёт до нижнего края, а не висит полосой: под ней всё
 * равно ляжет ближний слой, зато генератор не прорубает в разрыве ложный
 * горизонт. Глубину даёт водопад, уходящий за нижний край, и дымка.
 *
 * Проём в стене стоит справа (x ≈ 88%), ровно там, куда приходит мостик
 * ближнего слоя. Центр и левая половина оставлены под Стива, волка
 * и летучую мышь — персонаж, налезший на постройку, уже был.
 */
function farRavine(seed = 251) {
  const rand = rng(seed);
  const out = [`<rect width="${W}" height="${H}" fill="#101521"/>`];

  const vaultBottom = GROUND - B * 6;   // низ свода
  const passX = Math.round((W / B) * 0.88) * B;

  // Свод во всю ширину. Светлее стены, но ненамного: источник света здесь
  // не солнце, а редкие факелы, и ровный серый потолок читался бы небом.
  for (let r = 0; r * B < vaultBottom; r++) {
    for (let c = 0; c * B < W; c++) {
      out.push(block(c * B, r * B, rand() < 0.3 ? P.deep : P.wet, rand));
    }
  }
  // Сталактиты свисают ПОД свод, а не надстраивают его сверху: иначе
  // потолок просто становится толще и низким не читается.
  for (let i = 0; i < 11; i++) {
    const x = Math.floor(rand() * (W / B)) * B;
    const h = 1 + Math.floor(rand() * 3);
    for (let r = 0; r < h; r++) out.push(block(x, vaultBottom + r * B, P.wet, rand));
  }

  // Стена другой стороны — камень до низа кадра и БЕЗ мшистой кромки:
  // с ней на предпросмотре получались две зелёные террасы, и ущелье
  // читалось не провалом, а ступенькой. Чем ниже, тем темнее: это и есть
  // глубина, и её нельзя оставлять одной полупрозрачной растяжке —
  // нейросеть такую растяжку смывает, а разницу самих блоков держит.
  for (let r = 0; vaultBottom + r * B < H; r++) {
    for (let c = 0; c * B < W; c++) {
      const pal = r < 2 ? (rand() < 0.3 ? P.deep : P.wet) : P.wet;
      out.push(block(c * B, vaultBottom + r * B, pal, rand));
    }
  }
  // Уступы: горизонтальные выходы породы посветлее. Без них стена — ровное
  // поле одинаковых кубов, и генератору не за что зацепиться; на первой
  // покраске она так и осталась серой заливкой.
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(rand() * (W / B - 6)) * B;
    const y = vaultBottom + Math.floor(rand() * 5) * B;
    const len = 3 + Math.floor(rand() * 4);
    for (let c = 0; c < len; c++) out.push(block(x + c * B, y, P.deep, rand));
    for (let c = 1; c < len - 1; c++) out.push(block(x + c * B, y - B, P.stone, rand));
  }

  // Тот самый проём, к которому ведёт мостик. Низ проёма на линии земли:
  // выше — и мостик упирался бы в стену, ниже — и его не было бы видно.
  out.push(`<rect x="${n(passX)}" y="${n(GROUND - B * 3)}" width="${n(B * 2)}" height="${n(B * 3)}" fill="#07090f"/>`);
  out.push(`<rect x="${n(passX)}" y="${n(GROUND - B * 3)}" width="${n(B * 2)}" height="10" fill="${P.deep.dark}"/>`);

  // Водопады от свода и за нижний край: обрезанные по стене они читались
  // голубыми полосами, приклеенными к камню, а не падающей водой.
  // Правый падает прямо в провал ближнего слоя (62…86%) — он и показывает,
  // что под мостиком пусто.
  for (const fx of [W * 0.16, W * 0.78]) {
    out.push(`<rect x="${n(fx)}" y="${n(vaultBottom)}" width="${n(B * 2)}" height="${n(H - vaultBottom)}" fill="${P.water.dark}"/>`);
    out.push(`<rect x="${n(fx + B * 0.25)}" y="${n(vaultBottom)}" width="${n(B * 1.5)}" height="${n(H - vaultBottom)}" fill="${P.water.base}"/>`);
    out.push(`<rect x="${n(fx + B * 0.7)}" y="${n(vaultBottom)}" width="${n(B * 0.6)}" height="${n(H - vaultBottom)}" fill="${P.water.light}"/>`);
    // Пена по струе: ровная синяя полоса читается трубой, а не водой.
    for (let i = 0; i < 16; i++) {
      const sx = fx + rand() * B * 1.7;
      const sy = vaultBottom + rand() * (H - vaultBottom);
      out.push(`<rect x="${n(sx)}" y="${n(sy)}" width="${n(B * 0.3)}" height="12" fill="#dce8f5" opacity="0.75"/>`);
    }
    // Облако брызг там, где струя уходит в темноту.
    out.push(`<rect x="${n(fx - B * 1.2)}" y="${n(GROUND - B * 1.6)}" width="${n(B * 4.4)}" height="${n(B * 1.6)}" fill="#aec6e0" opacity="0.3"/>`);
  }

  // Глубина провала. Затемнение видно ТОЛЬКО сквозь разрыв ближнего слоя —
  // всё остальное ниже линии земли он закрывает собой. Без этой растяжки
  // за мостиком стояла та же ровная стена, и ущелья не читалось вовсе:
  // проверено на предпросмотре.
  out.push(`<defs><linearGradient id="chasm" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#0a0d14" stop-opacity="0"/>
<stop offset="0.45" stop-color="#0a0d14" stop-opacity="0.82"/>
<stop offset="1" stop-color="#05070b" stop-opacity="0.97"/>
</linearGradient></defs>`);
  out.push(`<rect x="0" y="${n(GROUND - B * 3)}" width="${W}" height="${n(H - GROUND + B * 3)}" fill="url(#chasm)"/>`);

  // Сырая дымка у кромки: она отделяет свод от стены и даёт воздух.
  out.push(`<rect x="0" y="${n(vaultBottom)}" width="${W}" height="${n(B * 2.5)}" fill="#6f8bb5" opacity="0.13"/>`);
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

/**
 * Окно 3×2 с куском неба. Нужно обеим комнатам третьего дня: глухая стена
 * во весь кадр читается как сбой загрузки, а не как комната. Тот же приём
 * уже стоит в near-furnace, здесь он вынесен в общую функцию.
 */
function woodWindow(x, y, rand, tint = '#2c4a7a') {
  const out = [];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) out.push(block(x + c * B, y + r * B, P.wood, rand));
  }
  out.push(`<rect x="${n(x + 8)}" y="${n(y + 8)}" width="${n(B * 3 - 16)}" height="${n(B * 2 - 16)}" fill="${tint}"/>`);
  out.push(`<rect x="${n(x + B * 1.5 - 4)}" y="${n(y + 8)}" width="8" height="${n(B * 2 - 16)}" fill="#7a5630"/>`);
  out.push(`<rect x="${n(x + 8)}" y="${n(y + B - 4)}" width="${n(B * 3 - 16)}" height="8" fill="#7a5630"/>`);
  return out.join('\n');
}

/**
 * Кузница. Кадр закрыт целиком: горн, наковальня, стойка с доспехами.
 * Середина оставлена Стиву — он встаёт сюда персонажем (x = 54).
 *
 * Предметы нарочно крупные, в два-три блока. Первая версия рисовала их
 * «в натуральную величину», по одному блоку, и на снимке сцены кадр
 * оказался пустой серой стеной с мелкими значками по углам.
 */
function nearAnvil(seed = 171) {
  const rand = rng(seed);
  const out = [];

  for (let r = 0; r * B < H; r++) {
    for (let c = 0; c * B < W; c++) {
      out.push(block(c * B, r * B, r * B >= GROUND ? P.plank : P.brick, rand));
    }
  }
  // Швы между досками: тот же приём, что в near-furnace, иначе пол
  // не читается как пол внутри дома.
  for (let r = 0; GROUND + r * B < H; r++) {
    out.push(`<rect x="0" y="${n(GROUND + r * B)}" width="${W}" height="5" fill="#8e6c3c" opacity="0.8"/>`);
  }

  // Утреннее небо в окне: оно же связывает кузницу с остальным домом.
  out.push(woodWindow(Math.round((W / B) * 0.46) * B, GROUND - B * 7, rand, '#5b6f9a'));

  // Горн: 4×3 блока с широким устьем. Он же объясняет, почему тут жарко,
  // поэтому вокруг идёт зарево — без него огонь выглядит картинкой на стене.
  const hx = Math.round((W / B) * 0.08) * B, hy = GROUND - B * 3;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) out.push(block(hx + c * B, hy + r * B, P.brick, rand));
  }
  out.push(`<rect x="${n(hx - B * 0.6)}" y="${n(hy - B * 0.6)}" width="${n(B * 5.2)}" height="${n(B * 4.2)}" fill="#ff8c1a" opacity="0.12"/>`);
  out.push(`<rect x="${n(hx + B * 0.4)}" y="${n(hy + B * 0.6)}" width="${n(B * 3.2)}" height="${n(B * 2.4)}" fill="#20150a"/>`);
  // Огонь языками разной высоты, а не ровной полосой: ровная читается
  // как картина в раме, что и вышло в первой версии кузницы.
  const flames = [[0.2, 1.1], [0.8, 1.6], [1.5, 2.0], [2.2, 1.5], [2.7, 1.0]];
  for (const [dx, fh] of flames) {
    out.push(`<rect x="${n(hx + B * (0.45 + dx))}" y="${n(hy + B * (3 - fh))}" width="${n(B * 0.5)}" height="${n(B * fh)}" fill="#ff8c1a"/>`);
    out.push(`<rect x="${n(hx + B * (0.55 + dx))}" y="${n(hy + B * (3 - fh * 0.6))}" width="${n(B * 0.3)}" height="${n(B * fh * 0.6)}" fill="#ffd36b"/>`);
  }
  out.push(`<rect x="${n(hx + B * 0.4)}" y="${n(hy + B * 2.7)}" width="${n(B * 3.2)}" height="${n(B * 0.3)}" fill="#fff0b0"/>`);

  // Наковальня: широкий верх, перехват, тяжёлое основание. Узнаётся
  // силуэтом, поэтому собрана из полос разной ширины, а не из блоков.
  const ax = Math.round((W / B) * 0.28) * B;
  out.push(`<rect x="${n(ax - B * 0.3)}" y="${n(GROUND - B * 2)}" width="${n(B * 2.6)}" height="${n(B * 0.7)}" fill="${P.anvil.base}"/>`);
  out.push(`<rect x="${n(ax - B * 0.3)}" y="${n(GROUND - B * 2)}" width="${n(B * 2.6)}" height="${n(B * 0.18)}" fill="${P.anvil.light}"/>`);
  out.push(`<rect x="${n(ax + B * 0.5)}" y="${n(GROUND - B * 1.3)}" width="${n(B)}" height="${n(B * 0.6)}" fill="${P.anvil.dark}"/>`);
  out.push(`<rect x="${n(ax)}" y="${n(GROUND - B * 0.7)}" width="${n(B * 2)}" height="${n(B * 0.7)}" fill="${P.anvil.base}"/>`);
  out.push(`<rect x="${n(ax)}" y="${n(GROUND - B * 0.7)}" width="${n(B * 2)}" height="${n(B * 0.14)}" fill="${P.anvil.light}"/>`);
  // Слитки на наковальне — то, что в этой сцене и считают.
  for (let i = 0; i < 4; i++) {
    out.push(`<rect x="${n(ax + B * 0.1 + i * B * 0.56)}" y="${n(GROUND - B * 2.34)}" width="${n(B * 0.42)}" height="${n(B * 0.34)}" fill="${P.iron.light}" stroke="${P.iron.dark}" stroke-width="5"/>`);
  }
  // Молот прислонён к наковальне: без него кузница — просто мебель.
  out.push(`<rect x="${n(ax + B * 2.4)}" y="${n(GROUND - B * 1.9)}" width="${n(B * 0.22)}" height="${n(B * 1.9)}" fill="${P.wood.base}"/>`);
  out.push(`<rect x="${n(ax + B * 2.1)}" y="${n(GROUND - B * 2.3)}" width="${n(B * 0.8)}" height="${n(B * 0.5)}" fill="${P.anvil.base}"/>`);

  // Стойка с доспехами: столб, перекладина и нагрудник во всю её ширину.
  const sx = Math.round((W / B) * 0.76) * B;
  out.push(`<rect x="${n(sx + B * 0.9)}" y="${n(GROUND - B * 4)}" width="${n(B * 0.3)}" height="${n(B * 4)}" fill="${P.wood.base}"/>`);
  out.push(`<rect x="${n(sx)}" y="${n(GROUND - B * 4)}" width="${n(B * 3)}" height="${n(B * 0.3)}" fill="${P.wood.dark}"/>`);
  // Плечи шире туловища, у шеи вырез: силуэт доспеха держится на этом,
  // ровная плита железа читалась как белый шкаф.
  out.push(`<rect x="${n(sx + B * 0.3)}" y="${n(GROUND - B * 3.7)}" width="${n(B * 2.4)}" height="${n(B * 0.7)}" fill="${P.iron.base}" stroke="${P.iron.dark}" stroke-width="6"/>`);
  out.push(`<rect x="${n(sx + B * 0.65)}" y="${n(GROUND - B * 3.1)}" width="${n(B * 1.7)}" height="${n(B * 1.6)}" fill="${P.iron.base}" stroke="${P.iron.dark}" stroke-width="6"/>`);
  out.push(`<rect x="${n(sx + B * 1.2)}" y="${n(GROUND - B * 3.74)}" width="${n(B * 0.6)}" height="${n(B * 0.3)}" fill="${P.brick.base}"/>`);
  out.push(`<rect x="${n(sx + B * 0.4)}" y="${n(GROUND - B * 3.6)}" width="${n(B * 0.6)}" height="${n(B * 0.22)}" fill="${P.iron.light}"/>`);
  out.push(`<rect x="${n(sx + B * 2)}" y="${n(GROUND - B * 3.6)}" width="${n(B * 0.6)}" height="${n(B * 0.22)}" fill="${P.iron.light}"/>`);
  out.push(`<rect x="${n(sx + B * 1.4)}" y="${n(GROUND - B * 3)}" width="${n(B * 0.2)}" height="${n(B * 1.4)}" fill="${P.iron.dark}" opacity="0.65"/>`);
  // Поножи ниже нагрудника, с просветом между ними: комплект должен
  // читаться как доспехи целиком, а не как одна глухая плита.
  out.push(`<rect x="${n(sx + B * 0.45)}" y="${n(GROUND - B * 1.4)}" width="${n(B * 0.85)}" height="${n(B * 1.4)}" fill="${P.iron.base}" stroke="${P.iron.dark}" stroke-width="6"/>`);
  out.push(`<rect x="${n(sx + B * 1.7)}" y="${n(GROUND - B * 1.4)}" width="${n(B * 0.85)}" height="${n(B * 1.4)}" fill="${P.iron.base}" stroke="${P.iron.dark}" stroke-width="6"/>`);

  // Сундук у стены — такой же, как в доме, чтобы место узнавалось.
  const cx = Math.round((W / B) * 0.92) * B;
  for (let c = 0; c < 2; c++) out.push(block(cx + c * B, GROUND - B, P.wood, rand));
  out.push(`<rect x="${n(cx)}" y="${n(GROUND - B * 0.55)}" width="${n(B * 2)}" height="12" fill="#5a3f22"/>`);
  out.push(`<rect x="${n(cx + B * 0.85)}" y="${n(GROUND - B * 0.62)}" width="${n(B * 0.3)}" height="${n(B * 0.4)}" fill="#e8c35a"/>`);

  return svg(`${out.join('\n')}
${torch(B * 8, GROUND - B * 4)}
${torch(W - B * 2, GROUND - B * 4)}`);
}

/**
 * Варочная: стойка с бутылками, котёл и полка. Тоже закрытый кадр.
 * Стив встаёт левее середины (x = 46), поэтому стойка уходит направо.
 */
function nearBrew(seed = 181) {
  const rand = rng(seed);
  const out = [];

  for (let r = 0; r * B < H; r++) {
    for (let c = 0; c * B < W; c++) {
      out.push(block(c * B, r * B, r * B >= GROUND ? P.plank : P.brick, rand));
    }
  }
  for (let r = 0; GROUND + r * B < H; r++) {
    out.push(`<rect x="0" y="${n(GROUND + r * B)}" width="${W}" height="5" fill="#8e6c3c" opacity="0.8"/>`);
  }

  out.push(woodWindow(Math.round((W / B) * 0.38) * B, GROUND - B * 7, rand, '#5b6f9a'));

  // Полка с бутылками на стене: цветные стёкла сразу говорят, что здесь варят.
  const shx = Math.round((W / B) * 0.06) * B, shy = GROUND - B * 3.6;
  out.push(`<rect x="${n(shx)}" y="${n(shy)}" width="${n(B * 6)}" height="${n(B * 0.3)}" fill="${P.wood.dark}"/>`);
  const tints = ['#c0457f', '#4a9ad6', '#e2a33a', '#6fc04a', '#9a5ad6', '#d6584a'];
  for (let i = 0; i < tints.length; i++) {
    const bx = shx + B * 0.4 + i * B * 0.92;
    out.push(`<rect x="${n(bx)}" y="${n(shy - B * 0.9)}" width="${n(B * 0.56)}" height="${n(B * 0.9)}" fill="${tints[i]}"/>`);
    out.push(`<rect x="${n(bx + B * 0.18)}" y="${n(shy - B * 1.26)}" width="${n(B * 0.2)}" height="${n(B * 0.36)}" fill="${tints[i]}" opacity="0.8"/>`);
    out.push(`<rect x="${n(bx + B * 0.08)}" y="${n(shy - B * 0.8)}" width="${n(B * 0.14)}" height="${n(B * 0.6)}" fill="#ffffff" opacity="0.35"/>`);
  }

  // Котёл: два блока в ширину, с тёмной водой и светлым ободом.
  // Тёмный чугун, а не камень: каменные блоки на каменной стене пропадали
  // вовсе — на снимке сцены от котла осталась одна тёмная полоска.
  const kx = Math.round((W / B) * 0.2) * B;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) out.push(block(kx + c * B, GROUND - B * 2 + r * B, P.anvil, rand));
  }
  out.push(`<rect x="${n(kx + B * 0.2)}" y="${n(GROUND - B * 1.9)}" width="${n(B * 1.6)}" height="${n(B * 0.9)}" fill="#1e2a33"/>`);
  out.push(`<rect x="${n(kx + B * 0.2)}" y="${n(GROUND - B * 1.9)}" width="${n(B * 1.6)}" height="${n(B * 0.2)}" fill="#2f4a5a"/>`);
  out.push(`<rect x="${n(kx + B * 0.5)}" y="${n(GROUND - B * 1.78)}" width="${n(B * 0.5)}" height="${n(B * 0.12)}" fill="#6a93a8"/>`);

  // Варочная стойка: каменная тумба, столб с огнём и три крупные бутылки.
  // Тумба тоже чугунная: кирпичная сливалась с кирпичной стеной, и
  // бутылки висели в воздухе сами по себе.
  const bx0 = Math.round((W / B) * 0.68) * B;
  for (let c = 0; c < 3; c++) out.push(block(bx0 + c * B, GROUND - B, P.anvil, rand));
  out.push(`<rect x="${n(bx0 - B * 0.15)}" y="${n(GROUND - B * 1.1)}" width="${n(B * 3.3)}" height="${n(B * 0.2)}" fill="${P.anvil.light}"/>`);
  out.push(`<rect x="${n(bx0 + B * 1.3)}" y="${n(GROUND - B * 3.2)}" width="${n(B * 0.4)}" height="${n(B * 2.1)}" fill="${P.anvil.dark}"/>`);
  out.push(`<rect x="${n(bx0 + B * 0.9)}" y="${n(GROUND - B * 3.6)}" width="${n(B * 1.2)}" height="${n(B * 0.5)}" fill="${P.anvil.light}"/>`);
  // Огонь под стойкой — на тёмной тумбе его видно, на кирпиче не было.
  out.push(`<rect x="${n(bx0 + B * 1.15)}" y="${n(GROUND - B * 0.72)}" width="${n(B * 0.7)}" height="${n(B * 0.42)}" fill="#ff9b22"/>`);
  out.push(`<rect x="${n(bx0 + B * 1.32)}" y="${n(GROUND - B * 0.58)}" width="${n(B * 0.36)}" height="${n(B * 0.28)}" fill="#fff0b0"/>`);
  // Бутылки стоят НА тумбе, а не висят рядом с ней.
  for (const [dx, tint] of [[0.05, '#c0457f'], [1.05, '#6fc04a'], [2.05, '#4a9ad6']]) {
    const bx = bx0 + dx * B;
    out.push(`<rect x="${n(bx)}" y="${n(GROUND - B * 2.2)}" width="${n(B * 0.9)}" height="${n(B * 1.1)}" fill="${tint}"/>`);
    out.push(`<rect x="${n(bx + B * 0.28)}" y="${n(GROUND - B * 2.66)}" width="${n(B * 0.34)}" height="${n(B * 0.46)}" fill="${tint}" opacity="0.8"/>`);
    out.push(`<rect x="${n(bx + B * 0.1)}" y="${n(GROUND - B * 2.1)}" width="${n(B * 0.2)}" height="${n(B * 0.9)}" fill="#ffffff" opacity="0.35"/>`);
  }
  // Пар над стойкой: три квадрата вверх, иначе зелье выглядит остывшим.
  for (let i = 0; i < 3; i++) {
    out.push(`<rect x="${n(bx0 + B * 1.1 + i * 18)}" y="${n(GROUND - B * 4.4 + i * B * 0.32)}" width="22" height="22" fill="#e8f0ff" opacity="${n(0.32 - i * 0.08)}"/>`);
  }

  return svg(`${out.join('\n')}
${torch(B * 9, GROUND - B * 4)}
${torch(W - B * 2, GROUND - B * 4)}`);
}

/**
 * Берег лавы с жилой обсидиана. Слой НЕ закрывает кадр целиком: сквозь
 * него виден дальний план с огненной рекой, поэтому маска при сборке —
 * силуэт из этого же SVG.
 */
function nearObsidian(seed = 191) {
  const rand = rng(seed);
  const floor = [];
  for (let r = 0; GROUND + r * B < H; r++) {
    for (let c = 0; c * B < W; c++) {
      floor.push(block(c * B, GROUND + r * B, r === 0 ? P.nether : P.deep, rand));
    }
  }
  // Жила стоит стеной в четыре блока: низкая кучка на тёмной стене
  // пещеры не читалась вовсе — проверено на снимке сцены.
  const vein = [];
  const vx = Math.round((W / B) * 0.68) * B;
  const shape = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [0, 1], [1, 1], [2, 1], [3, 1],
                 [1, 2], [2, 2], [3, 2], [2, 3]];
  for (const [dx, dy] of shape) {
    vein.push(block(vx + dx * B, GROUND - B - dy * B, P.obsidian, rand));
  }
  // Фиолетовые блики по верхней кромке: обсидиан чёрный, и без искры
  // он сливается со стеной в одно пятно.
  for (const [dx, dy] of shape) {
    if (rand() < 0.55) continue;
    vein.push(`<rect x="${n(vx + dx * B + 12)}" y="${n(GROUND - B - dy * B + 10)}" width="${n(B * 0.36)}" height="${n(B * 0.36)}" fill="${P.portal.light}" opacity="0.75"/>`);
  }
  // Кирка воткнута рядом: видно, чем этот камень берут.
  vein.push(`<rect x="${n(vx - B * 0.8)}" y="${n(GROUND - B * 2.2)}" width="${n(B * 0.22)}" height="${n(B * 2.2)}" fill="${P.wood.base}"/>`);
  vein.push(`<rect x="${n(vx - B * 1.3)}" y="${n(GROUND - B * 2.5)}" width="${n(B * 1.2)}" height="${n(B * 0.3)}" fill="${P.diamond.base}"/>`);

  return svg(`${floor.join('\n')}
${vein.join('\n')}
${torch(B * 3, GROUND - B * 2)}
<rect x="0" y="0" width="${B * 2}" height="${H}" fill="#191016"/>
<rect x="${W - B}" y="0" width="${B}" height="${H}" fill="#191016"/>`);
}

/**
 * Рамка портала: обсидиановый проём с фиолетовым свечением внутри.
 * Стоит правее середины — Стив и волк встают слева (x = 34 и 24).
 */
function nearPortal(seed = 201) {
  const rand = rng(seed);
  const floor = [];
  for (let r = 0; GROUND + r * B < H; r++) {
    for (let c = 0; c * B < W; c++) {
      floor.push(block(c * B, GROUND + r * B, r === 0 ? P.nether : P.deep, rand));
    }
  }

  // Рамка 5×7 блоков: это главный предмет истории, он должен быть выше
  // Стива и читаться с дивана через сжатие трансляции.
  const fx = Math.round((W / B) * 0.56) * B, fy = GROUND - B * 7;
  const frame = [];
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 5; c++) {
      const edge = c === 0 || c === 4 || r === 0 || r === 6;
      if (edge) frame.push(block(fx + c * B, fy + r * B, P.obsidian, rand));
    }
  }
  const gx = fx + B, gy = fy + B;
  frame.push(`<rect x="${n(gx)}" y="${n(gy)}" width="${n(B * 3)}" height="${n(B * 5)}" fill="${P.portal.base}"/>`);
  for (let i = 0; i < 26; i++) {
    const x = gx + Math.floor(rand() * 3) * B + Math.floor(rand() * 3) * 20;
    const y = gy + Math.floor(rand() * 5) * B + Math.floor(rand() * 3) * 20;
    frame.push(`<rect x="${n(x)}" y="${n(y)}" width="20" height="20" fill="${rand() < 0.5 ? P.portal.light : P.portal.dark}" opacity="0.8"/>`);
  }
  // Свет портала: ореол вокруг рамки и отсвет на полу. Без них портал
  // висит сам по себе и со сценой не связан.
  frame.push(`<rect x="${n(fx - B)}" y="${n(fy - B)}" width="${n(B * 7)}" height="${n(B * 9)}" fill="${P.portal.light}" opacity="0.1"/>`);
  frame.push(`<rect x="${n(fx - B * 1.5)}" y="${n(GROUND)}" width="${n(B * 8)}" height="${n(B * 0.6)}" fill="${P.portal.light}" opacity="0.25"/>`);

  return svg(`${floor.join('\n')}
${frame.join('\n')}
${torch(B * 3, GROUND - B * 2)}
<rect x="0" y="0" width="${B}" height="${H}" fill="#191016"/>
<rect x="${W - B}" y="0" width="${B}" height="${H}" fill="#191016"/>`);
}

/**
 * Берег из песка душ. Слой кадр НЕ закрывает: выше линии земли он
 * прозрачен, и сквозь него видно огненное море дальнего плана.
 *
 * Грибы стоят по краям: центр от x = 27% до 62% занят Стивом, волком
 * и свинолюдом, а персонаж, налезший на постройку, — это уже было.
 */
function nearSoulSand(seed = 231) {
  const rand = rng(seed);
  const out = [];
  for (let r = 0; GROUND + r * B < H; r++) {
    for (let c = 0; c * B < W; c++) {
      out.push(block(c * B, GROUND + r * B, r < 2 ? P.soul : P.deep, rand));
    }
  }
  // Ямы: песок душ вязкий, и провалы объясняют, почему в нём тонет волк.
  for (let i = 0; i < 5; i++) {
    const x = Math.floor(rand() * (W / B)) * B;
    out.push(`<rect x="${n(x)}" y="${n(GROUND)}" width="${B}" height="${n(B * 0.45)}" fill="${P.soul.dark}" opacity="0.9"/>`);
  }
  // Нижнемирские грибы — то самое счётное слово из области nether,
  // поэтому они обязаны быть в кадре, а не только в вопросе.
  const mushroom = (x) => {
    const h = GROUND - B * 0.9;
    return `<rect x="${n(x + B * 0.3)}" y="${n(h)}" width="${n(B * 0.4)}" height="${n(B * 0.9)}" fill="#cdbfae"/>
<rect x="${n(x - B * 0.1)}" y="${n(h - B * 0.5)}" width="${n(B * 1.2)}" height="${n(B * 0.5)}" fill="#8c2f26"/>
<rect x="${n(x + B * 0.1)}" y="${n(h - B * 0.65)}" width="${n(B * 0.8)}" height="${n(B * 0.2)}" fill="#a83c31"/>`;
  };
  const props = [mushroom(B * 2), mushroom(B * 4.2), mushroom(W - B * 4)];

  return svg(`${out.join('\n')}
${props.join('\n')}
${torch(B * 6, GROUND - B * 2)}`);
}

/**
 * Зал крепости: кирпичные арки, кварцевые колонны, факелы. Интерьер
 * закрывает кадр целиком — ни небо, ни дальний план ему не нужны,
 * как у кузницы и варочной третьего дня.
 */
function nearFortress(seed = 241) {
  const rand = rng(seed);
  const out = [];
  // Стена во весь кадр.
  for (let r = 0; r * B < H; r++) {
    for (let c = 0; c * B < W; c++) {
      out.push(block(c * B, r * B, rand() < 0.12 ? P.nether : P.nbrick, rand));
    }
  }
  // Два проёма: сквозь них видно зарево, и зал перестаёт быть глухим
  // мешком. Проёмы по краям — центр остаётся свободным под персонажей.
  const arch = (ax) => {
    const parts = [];
    const top = GROUND - B * 5;
    parts.push(`<rect x="${n(ax)}" y="${n(top)}" width="${n(B * 3)}" height="${n(GROUND - top)}" fill="${P.lava.dark}"/>`);
    parts.push(`<rect x="${n(ax)}" y="${n(top)}" width="${n(B * 3)}" height="${n(B * 0.5)}" fill="${P.nbrick.dark}"/>`);
    for (let i = 0; i < 7; i++) {
      const gx = ax + rand() * B * 2.4, gy = top + B * 0.6 + rand() * B * 4;
      parts.push(`<rect x="${n(gx)}" y="${n(gy)}" width="${n(B * 0.5)}" height="${n(B * 0.3)}" fill="${P.lava.light}" opacity="0.55"/>`);
    }
    return parts.join('\n');
  };
  // Колонны из кварца — единственное светлое в красном зале, по ним
  // и читается, что это постройка, а не пещера.
  const column = (cx) => {
    const parts = [];
    for (let r = 0; GROUND - B - r * B > B * 1.5; r++) {
      parts.push(block(cx, GROUND - B - r * B, P.quartz, rand));
    }
    parts.push(block(cx, GROUND - B, P.nbrick, rand));
    return parts.join('\n');
  };

  const floor = [];
  for (let r = 0; GROUND + r * B < H; r++) {
    for (let c = 0; c * B < W; c++) {
      floor.push(block(c * B, GROUND + r * B, r < 2 ? P.nbrick : P.deep, rand));
    }
  }

  return svg(`${out.join('\n')}
${arch(B * 2)}
${arch(W - B * 5)}
${column(Math.round((W / B) * 0.2) * B)}
${column(Math.round((W / B) * 0.78) * B)}
${floor.join('\n')}
${torch(Math.round((W / B) * 0.36) * B, GROUND - B * 3)}
${torch(Math.round((W / B) * 0.64) * B, GROUND - B * 3)}`);
}

/**
 * Кромка обрыва и мостик через провал. Слой кадр НЕ закрывает: выше линии
 * земли он прозрачен, и сквозь провал видно ущелье дальнего плана — ровно
 * та же работа, что у берега из песка душ.
 *
 * Провал справа (62…86%), мостик лежит ровно по линии земли: Стив в сцене
 * `bats` стоит на нём (x = 66), а в сцене `ravine` — на своей стороне
 * у самого края (x = 46). Центр и левая половина свободны под персонажей.
 */
function nearRavine(seed = 261) {
  const rand = rng(seed);
  const out = [];
  const gapStart = Math.round((W / B) * 0.62) * B;
  const gapEnd = Math.round((W / B) * 0.86) * B;

  for (let r = 0; GROUND + r * B < H; r++) {
    for (let c = 0; c * B < W; c++) {
      const x = c * B;
      if (x >= gapStart && x < gapEnd) continue;
      out.push(block(x, GROUND + r * B, r === 0 ? P.moss : P.stone, rand));
    }
  }
  // Тёмные щёки провала: без них земля обрывается плоским срезом и обрыв
  // читается не глубиной, а дыркой в картинке.
  out.push(`<rect x="${n(gapStart - 10)}" y="${n(GROUND)}" width="10" height="${n(H - GROUND)}" fill="#141a23"/>`);
  out.push(`<rect x="${n(gapEnd)}" y="${n(GROUND)}" width="10" height="${n(H - GROUND)}" fill="#141a23"/>`);

  // Мостик: один ряд досок по линии земли и редкие опоры под ним, чтобы
  // он не выглядел висящим в воздухе.
  const bridge = [];
  for (let x = gapStart; x < gapEnd; x += B) bridge.push(block(x, GROUND, P.plank, rand));
  for (let x = gapStart + B * 2; x < gapEnd; x += B * 3) {
    bridge.push(`<rect x="${n(x + B * 0.4)}" y="${n(GROUND + B)}" width="${n(B * 0.2)}" height="${n(B * 1.6)}" fill="${P.wood.dark}"/>`);
  }

  return svg(`${out.join('\n')}
${bridge.join('\n')}
${torch(B * 4, GROUND - B * 2)}
${torch(W - B * 3, GROUND - B * 2)}
<rect x="0" y="0" width="${B * 2}" height="${H}" fill="#14171f"/>
<rect x="${W - B * 2}" y="0" width="${B * 2}" height="${H}" fill="#14171f"/>`);
}

/**
 * Заброшенная деревня под землёй: колодец слева, два полуразрушенных дома
 * справа, мох по всему камню. Интерьер пещеры закрывает кадр целиком —
 * ни небо, ни дальний план ей не нужны, как кузнице третьего дня.
 *
 * Колодец стоит слева (8…19%) нарочно: в сцене `well` Стив подходит к нему
 * (x = 22) и смотрит влево, а в сценах `ruin`, `chest` и `map` он стоит
 * в центре — там от 20 до 60% пусто.
 */
function nearRuin(seed = 271) {
  const rand = rng(seed);
  const out = [];

  // Стена пещеры за деревней и пол под ней.
  for (let r = 0; r * B < H; r++) {
    for (let c = 0; c * B < W; c++) {
      const y = r * B;
      const pal = y >= GROUND
        ? (y === GROUND ? P.moss : P.stone)
        : (rand() < 0.22 ? P.deep : P.stone);
      out.push(block(c * B, y, pal, rand));
    }
  }

  /** Полуразрушенный дом: гнилые доски, проём и обвалившийся угол. */
  const house = (x0, cols, rows) => {
    const parts = [];
    for (let c = 0; c < cols; c++) {
      // Правый верх обвален: ровная коробка читается жилым домом.
      const top = c > cols - 3 ? 1 : 0;
      for (let r = top; r < rows; r++) {
        parts.push(block(x0 + c * B, GROUND - B * (rows - r), P.rot, rand));
      }
    }
    // Проём: тёмный, без двери — дверь давно унесли.
    parts.push(`<rect x="${n(x0 + B)}" y="${n(GROUND - B * 2)}" width="${n(B)}" height="${n(B * 2)}" fill="#0b0d12"/>`);
    // Мох по кладке: он и говорит, что дом брошен давно.
    for (let i = 0; i < 9; i++) {
      const mx = x0 + rand() * (cols * B - B * 0.5);
      const my = GROUND - rand() * rows * B;
      parts.push(`<rect x="${n(mx)}" y="${n(my)}" width="${n(B * 0.5)}" height="12" fill="${P.moss.base}" opacity="0.7"/>`);
    }
    return parts.join('\n');
  };

  /** Колодец: каменное кольцо, стойки и перекладина, внутри — темнота. */
  const well = (x0) => {
    const w = B * 2;
    return `${block(x0, GROUND - B, P.brick, rand)}${block(x0 + B, GROUND - B, P.brick, rand)}
<rect x="${n(x0 + B * 0.35)}" y="${n(GROUND - B * 0.9)}" width="${n(w - B * 0.7)}" height="${n(B * 0.8)}" fill="#07090d"/>
<rect x="${n(x0 + B * 0.1)}" y="${n(GROUND - B * 3.2)}" width="${n(B * 0.26)}" height="${n(B * 2.3)}" fill="${P.wood.base}"/>
<rect x="${n(x0 + w - B * 0.36)}" y="${n(GROUND - B * 3.2)}" width="${n(B * 0.26)}" height="${n(B * 2.3)}" fill="${P.wood.base}"/>
<rect x="${n(x0 - B * 0.1)}" y="${n(GROUND - B * 3.4)}" width="${n(w + B * 0.2)}" height="${n(B * 0.3)}" fill="${P.wood.dark}"/>
<rect x="${n(x0 + B * 0.9)}" y="${n(GROUND - B * 3.1)}" width="6" height="${n(B * 1.1)}" fill="#d8d4c8"/>
<rect x="${n(x0 + B * 0.6)}" y="${n(GROUND - B * 2)}" width="${n(B * 0.7)}" height="${n(B * 0.45)}" fill="${P.wood.dark}"/>`;
  };

  const props = [
    well(Math.round((W / B) * 0.08) * B),
    house(Math.round((W / B) * 0.62) * B, 4, 4),
    house(Math.round((W / B) * 0.82) * B, 4, 3),
  ];

  return svg(`${out.join('\n')}
${props.join('\n')}
${torch(B * 6, GROUND - B * 2)}
${torch(W - B * 2.5, GROUND - B * 2)}`);
}

/**
 * Рельсы в штольне: деревянные стойки, путь и две вагонетки. Кадр закрыт
 * целиком — слой служит и сцене `tracks`, и сцене `rails`, у которых
 * дальнего плана нет вовсе.
 *
 * Вагонетки стоят справа (72 и 86%): в сцене `rails` крипер сидит на 56%,
 * волк на 29%, Стив на 40% — на постройки никто не налезает.
 */
function nearRails(seed = 281) {
  const rand = rng(seed);
  const out = [];

  for (let r = 0; r * B < H; r++) {
    for (let c = 0; c * B < W; c++) {
      const y = r * B;
      out.push(block(c * B, y, y >= GROUND ? P.stone : (rand() < 0.2 ? P.deep : P.stone), rand));
    }
  }

  // Путь: шпалы и две железные нитки по линии земли. Рельсы лежат НА полу,
  // поэтому у самой кромки, а не ниже: герои стоят ногами на этой линии.
  const track = [];
  for (let x = 0; x < W; x += B * 0.75) {
    track.push(`<rect x="${n(x)}" y="${n(GROUND + 10)}" width="${n(B * 0.5)}" height="12" fill="${P.wood.dark}"/>`);
  }
  for (const dy of [4, 26]) {
    track.push(`<rect x="0" y="${n(GROUND + dy)}" width="${W}" height="7" fill="${P.iron.base}"/>`);
    track.push(`<rect x="0" y="${n(GROUND + dy)}" width="${W}" height="3" fill="${P.iron.light}"/>`);
  }

  /** Деревянная крепь: две стойки и перекладина. */
  const support = (x0) => `<rect x="${n(x0)}" y="${n(GROUND - B * 5)}" width="${n(B * 0.4)}" height="${n(B * 5)}" fill="${P.wood.base}"/>
<rect x="${n(x0 + B * 3.6)}" y="${n(GROUND - B * 5)}" width="${n(B * 0.4)}" height="${n(B * 5)}" fill="${P.wood.base}"/>
<rect x="${n(x0 - B * 0.2)}" y="${n(GROUND - B * 5.4)}" width="${n(B * 4.4)}" height="${n(B * 0.4)}" fill="${P.wood.dark}"/>`;

  /** Вагонетка с породой: железный кузов, колёса и горка камня сверху. */
  const cart = (x0) => `<rect x="${n(x0)}" y="${n(GROUND - B * 2)}" width="${n(B * 2.4)}" height="${n(B * 1.9)}" fill="${P.anvil.base}"/>
<rect x="${n(x0)}" y="${n(GROUND - B * 2)}" width="${n(B * 2.4)}" height="${n(B * 0.28)}" fill="${P.iron.base}"/>
<rect x="${n(x0 + B * 0.25)}" y="${n(GROUND - B * 2.4)}" width="${n(B * 1.9)}" height="${n(B * 0.5)}" fill="${P.stone.base}"/>
<rect x="${n(x0 + B * 0.7)}" y="${n(GROUND - B * 2.7)}" width="${n(B * 0.8)}" height="${n(B * 0.4)}" fill="${P.stone.light}"/>
<rect x="${n(x0 + B * 0.3)}" y="${n(GROUND - B * 0.25)}" width="${n(B * 0.45)}" height="${n(B * 0.45)}" fill="${P.anvil.dark}"/>
<rect x="${n(x0 + B * 1.65)}" y="${n(GROUND - B * 0.25)}" width="${n(B * 0.45)}" height="${n(B * 0.45)}" fill="${P.anvil.dark}"/>`;

  const props = [
    support(Math.round((W / B) * 0.04) * B),
    support(Math.round((W / B) * 0.18) * B),
    cart(Math.round((W / B) * 0.72) * B),
    cart(Math.round((W / B) * 0.86) * B),
  ];

  return svg(`${out.join('\n')}
${track.join('\n')}
${props.join('\n')}
${torch(290, GROUND - B * 2)}
${torch(1266, GROUND - B * 2)}`);
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

function villager() {
  const U = 20;
  const robe = '#7b5f3a', robeDark = '#5e482b', trim = '#9a7a4e';
  const skin = '#c6996f', nose = '#b3855d', brow = '#3b2a18', eye = '#ffffff', iris = '#4a6a8a';

  // Жителя выдают нос и сложенные на животе руки. И то и другое должно
  // читаться после сжатия при зеркалировании, поэтому они крупные.
  const body = `
<!-- голова -->
${px(4 * U, 0, 8 * U, 8 * U, skin)}
${px(4 * U, 0, 8 * U, 1.4 * U, brow)}
${px(5 * U, 2.6 * U, 6 * U, 0.8 * U, brow)}
${px(5.4 * U, 3.6 * U, 1.6 * U, 1.2 * U, eye)}
${px(9 * U, 3.6 * U, 1.6 * U, 1.2 * U, eye)}
${px(6 * U, 3.8 * U, 0.8 * U, 0.8 * U, iris)}
${px(9.6 * U, 3.8 * U, 0.8 * U, 0.8 * U, iris)}
${px(7 * U, 3.6 * U, 2 * U, 4 * U, nose)}

<!-- балахон -->
${px(3.4 * U, 8 * U, 9.2 * U, 13 * U, robe)}
${px(3.4 * U, 8 * U, 9.2 * U, 1 * U, trim)}
${px(7.6 * U, 9 * U, 0.8 * U, 12 * U, robeDark)}

<!-- сложенные руки -->
${px(2.4 * U, 11 * U, 2.4 * U, 6 * U, robe)}
${px(11.2 * U, 11 * U, 2.4 * U, 6 * U, robe)}
${px(4.4 * U, 15 * U, 7.2 * U, 2.6 * U, skin)}
${px(4.4 * U, 15 * U, 7.2 * U, 0.6 * U, trim)}

<!-- ноги -->
${px(4.4 * U, 21 * U, 3.2 * U, 9 * U, robeDark)}
${px(8.4 * U, 21 * U, 3.2 * U, 9 * U, robeDark)}
${px(4.4 * U, 30 * U, 3.2 * U, 2 * U, '#4a3a28')}
${px(8.4 * U, 30 * U, 3.2 * U, 2 * U, '#4a3a28')}`;

  return charSvg(body, 16 * U, 32 * U);
}

/**
 * Свинолюд-торговец. Узнают его по двум вещам: пятачок и золото.
 * И то и другое крупное — после сжатия при зеркалировании мелочь
 * на телевизоре пропадает, это уже проверено на носе жителя.
 */
function piglin() {
  const U = 20;
  const skin = '#d59a86', skinDark = '#b57a68', snout = '#eab5a2';
  const tunic = '#5c4a6a', tunicDark = '#453657';
  const gold = '#e8c04a', goldDark = '#bf9526', eye = '#2b1a16';

  const body = `
<!-- голова -->
${px(4 * U, 0, 8 * U, 7.6 * U, skin)}
${px(2.6 * U, 1.2 * U, 1.4 * U, 2.6 * U, skinDark)}
${px(12 * U, 1.2 * U, 1.4 * U, 2.6 * U, skinDark)}
${px(5.4 * U, 3 * U, 1.4 * U, 1 * U, eye)}
${px(9.2 * U, 3 * U, 1.4 * U, 1 * U, eye)}

<!-- пятачок -->
${px(5.8 * U, 4.6 * U, 4.4 * U, 2.6 * U, snout)}
${px(6.8 * U, 5.4 * U, 0.9 * U, 1 * U, skinDark)}
${px(8.4 * U, 5.4 * U, 0.9 * U, 1 * U, skinDark)}

<!-- золотые бусы -->
${px(3.8 * U, 7.6 * U, 8.4 * U, 1.2 * U, gold)}
${px(5 * U, 8.8 * U, 1.2 * U, 1 * U, goldDark)}
${px(7.4 * U, 8.8 * U, 1.2 * U, 1 * U, goldDark)}
${px(9.8 * U, 8.8 * U, 1.2 * U, 1 * U, goldDark)}

<!-- туника -->
${px(3.6 * U, 8.8 * U, 8.8 * U, 12 * U, tunic)}
${px(7.6 * U, 9.8 * U, 0.8 * U, 11 * U, tunicDark)}

<!-- руки: в одной слиток, который он никому не отдаёт -->
${px(2.2 * U, 10.6 * U, 2.4 * U, 6.4 * U, tunic)}
${px(11.4 * U, 10.6 * U, 2.4 * U, 6.4 * U, tunic)}
${px(2.2 * U, 17 * U, 2.4 * U, 2 * U, skin)}
${px(11.4 * U, 17 * U, 2.4 * U, 2 * U, skin)}
${px(11 * U, 18.2 * U, 3.2 * U, 2 * U, gold)}
${px(11 * U, 18.2 * U, 3.2 * U, 0.6 * U, goldDark)}

<!-- ноги -->
${px(4.6 * U, 20.8 * U, 3 * U, 9.2 * U, skinDark)}
${px(8.4 * U, 20.8 * U, 3 * U, 9.2 * U, skinDark)}
${px(4.6 * U, 30 * U, 3 * U, 2 * U, '#3a2a24')}
${px(8.4 * U, 30 * U, 3 * U, 2 * U, '#3a2a24')}`;

  return charSvg(body, 16 * U, 32 * U);
}

/**
 * Летучая мышь. Единственный персонаж не на земле: в сценарии у неё
 * y = 46, то есть она висит под сводом, а не стоит. Поэтому и пропорции
 * вытянуты в ширину — узнают её по размаху крыльев, а не по силуэту.
 *
 * Глаза крупные и круглые: ночной зверь в детской истории не должен
 * выглядеть угрозой, это тот же приём, что у коровы и овцы.
 */
function bat() {
  const U = 20;
  const fur = '#5b4a59', furDark = '#443648', wing = '#705d6e', wingDark = '#534354';
  const ear = '#8a7287', eye = '#ffffff', iris = '#2b1f2b', nose = '#c4a0b4';

  const body = `
<!-- крылья: размах во всю ширину, иначе мышь читается мышью обычной -->
${px(0, 3 * U, 7.6 * U, 3 * U, wing)}
${px(0.4 * U, 6 * U, 6.8 * U, 1 * U, wingDark)}
${px(12.4 * U, 3 * U, 7.6 * U, 3 * U, wing)}
${px(12.8 * U, 6 * U, 6.8 * U, 1 * U, wingDark)}
${px(2.6 * U, 3 * U, 0.3 * U, 3.6 * U, wingDark)}
${px(5.2 * U, 3 * U, 0.3 * U, 3.6 * U, wingDark)}
${px(14.5 * U, 3 * U, 0.3 * U, 3.6 * U, wingDark)}
${px(17.1 * U, 3 * U, 0.3 * U, 3.6 * U, wingDark)}

<!-- уши -->
${px(7.9 * U, 0.6 * U, 1.5 * U, 2.2 * U, fur)}
${px(10.6 * U, 0.6 * U, 1.5 * U, 2.2 * U, fur)}
${px(8.3 * U, 1.1 * U, 0.7 * U, 1.4 * U, ear)}
${px(11 * U, 1.1 * U, 0.7 * U, 1.4 * U, ear)}

<!-- тело -->
${px(7.4 * U, 2.4 * U, 5.2 * U, 6.6 * U, fur)}
${px(9.6 * U, 3.2 * U, 0.8 * U, 5.4 * U, furDark)}

<!-- глаза -->
${px(8.2 * U, 3.9 * U, 1.4 * U, 1.4 * U, eye)}
${px(10.4 * U, 3.9 * U, 1.4 * U, 1.4 * U, eye)}
${px(8.6 * U, 4.3 * U, 0.7 * U, 0.8 * U, iris)}
${px(10.8 * U, 4.3 * U, 0.7 * U, 0.8 * U, iris)}

<!-- нос и лапки -->
${px(9.4 * U, 5.9 * U, 1.2 * U, 0.8 * U, nose)}
${px(8.1 * U, 9 * U, 1.3 * U, 1.2 * U, furDark)}
${px(10.6 * U, 9 * U, 1.3 * U, 1.2 * U, furDark)}`;

  return charSvg(body, 20 * U, 11 * U);
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
write('assets/mc/far-lava.svg', farLava());
write('assets/mc/far-nether-sea.svg', farNetherSea());
write('assets/mc/far-ravine.svg', farRavine());

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
write('assets/mc/near-anvil.svg', nearAnvil());
write('assets/mc/near-brew.svg', nearBrew());
write('assets/mc/near-obsidian.svg', nearObsidian());
write('assets/mc/near-portal.svg', nearPortal());
write('assets/mc/near-soul-sand.svg', nearSoulSand());
write('assets/mc/near-fortress.svg', nearFortress());
write('assets/mc/near-ravine.svg', nearRavine());
write('assets/mc/near-ruin.svg', nearRuin());
write('assets/mc/near-rails.svg', nearRails());

console.log('Персонажи:');
write('assets/mc/steve.svg', steve());
write('assets/mc/creeper.svg', creeper());
write('assets/mc/cow.svg', cow());
write('assets/mc/sheep.svg', sheep());
write('assets/mc/wolf.svg', wolf());
write('assets/mc/villager.svg', villager());
write('assets/mc/piglin.svg', piglin());
write('assets/mc/bat.svg', bat());

console.log('\nГотово.');
