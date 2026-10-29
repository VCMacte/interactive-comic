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
  // Крепость шестого дня. Каменный кирпич теплее обычного камня: весь день
  // держится на свете свечей, а холодный серый под жёлтым светом сереет
  // ещё сильнее и читается тем же подземельем, из которого Стив только что
  // вышел. Рамка Края — светлый песчаник с зеленцой, и она НЕ фиолетовая:
  // фиолетовый занят горящим порталом третьего дня, а эта рамка пустая,
  // в том и весь смысл дня.
  sbrick: { base: '#7e7a70', dark: '#625f57', light: '#959186' },
  eframe: { base: '#c9c57e', dark: '#a3a05f', light: '#e2df9c' },
  // Край седьмого дня. Камень острова — бледный, выгоревший, почти без
  // цвета: вокруг лиловая пустота, и любой насыщенный тон рядом с ней
  // читается как «кусок другой истории». Кристалл малиновый — это
  // единственное яркое пятно за весь день, и гаснет оно по одному.
  estone: { base: '#ded8a8', dark: '#b8b184', light: '#f0ebc4' },
  edeep:  { base: '#6e6a52', dark: '#53503e', light: '#857f63' },
  ecrystal: { base: '#e06ad0', dark: '#a84a9e', light: '#f7a8ec' },
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

/**
 * Холмы с тремя столбами дыма — дальний план восьмого дня. Дым рваный
 * и в три столба ровно потому, что так его описывает рассказчик в первой
 * сцене: ребёнок должен увидеть на экране то, что услышал.
 *
 * Рельеф тот же, что у farHills, и это намеренно: луг у дома не изменился,
 * изменилось только то, что над ним.
 */
function farSmoke(seed = 377) {
  const rand = rng(seed);
  const out = [];
  let height = 2;

  for (let col = 0; col * B < W; col++) {
    const x = col * B;
    if (rand() < 0.3) height += rand() < 0.5 ? 1 : -1;
    height = Math.max(1, Math.min(5, height));
    for (let i = 0; i < height; i++) {
      out.push(block(x, GROUND - B - i * B, i === height - 1 ? P.far : P.dirt, rand));
    }
    if (rand() < 0.1) out.push(cubeTree(x, GROUND - height * B, 2, rand));
  }

  // Столбы дыма: кверху шире, бледнее и с отклонением по ветру. Ровный
  // столб читался бы печной трубой, а здесь горит то, что гореть не должно.
  //
  // Начинаются они ВЫШЕ гребня холмов, а не от линии земли: холм поднимается
  // до пяти блоков и прежний дым оказывался за ним — на init-картинке от него
  // оставались три тёмные полоски, и нейросети было не на что опереться.
  for (const [bx, lean] of [[W * 0.3, 0.16], [W * 0.46, 0.08], [W * 0.6, 0.22]]) {
    const base = GROUND - B * 5.4;
    // Огонь у основания: сам костёр за холмом не виден, видно его зарево.
    out.push(`<rect x="${n(bx - B * 0.3)}" y="${n(base)}" width="${n(B * 1.5)}" height="${n(B * 0.9)}" fill="#e08a30" opacity="0.75"/>`);
    let w = B * 0.85;
    for (let r = 0; r < 11; r++) {
      const y = base - B * 0.6 - r * B * 0.95;
      const x = bx + r * B * lean + (rand() - 0.5) * B * 0.9;
      out.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(B * 0.95)}" fill="#8d847c" opacity="${n(0.72 - r * 0.058)}"/>`);
      // Клок сбоку: без него столб остаётся ровной лесенкой, а дым рваный.
      if (rand() < 0.55) {
        out.push(`<rect x="${n(x + (rand() < 0.5 ? -B * 0.7 : w - B * 0.2))}" y="${n(y + B * 0.2)}" width="${n(B * 0.8)}" height="${n(B * 0.7)}" fill="#8d847c" opacity="${n(0.5 - r * 0.04)}"/>`);
      }
      w += B * 0.22;
    }
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

/**
 * Анфилада коридоров крепости — первый тёплый интерьер сезона. Под
 * нейросеть: от неё здесь нужны пыльная дымка и свет факелов на кладке,
 * то есть ровно то, чего вектор не даёт.
 *
 * Слой закрывает кадр целиком, поэтому маска при сборке ему не нужна —
 * как far-nether-sea и far-ravine. Неба нет вовсе: наружу не выходит ни
 * один проём, крепость целиком под лесом.
 *
 * Точка схода стоит правее середины (x ≈ 58%). Стив и волк в сценах
 * `door`, `wall` и `corridor` занимают полосу 29…52%, и уходящие вглубь
 * проёмы не должны оказаться ровно за ними.
 */
function farStronghold(seed = 291) {
  const rand = rng(seed);
  const out = [`<rect width="${W}" height="${H}" fill="#1a150f"/>`];

  // Кладка во весь кадр: стены, свод и пол одним материалом. Тона здесь
  // СВОИ, темнее и теплее палитры ближних слоёв: на светлой серой подложке
  // deliberate_v2 выбеливает кадр до белой комнаты — проверено, первая
  // покраска вернула именно её. Генератор тянет картинку вверх по яркости,
  // поэтому подложка должна быть с запасом вниз.
  const wall = { base: '#5b5248', dark: '#443d35', light: '#6e6457' };
  const rib = { base: '#6b6155', dark: '#524a40', light: '#7d7366' };
  // Мха в подложке нет совсем, хотя крепость сырая: любой зелёный блок
  // нейросеть возвращает плоским зелёным прямоугольником — газоном на
  // стене, и это видно на обеих пробных покрасках. Сырость отдана промпту
  // (mossy stone brick), он разводит её по швам сам.
  for (let r = 0; r * B < H; r++) {
    for (let c = 0; c * B < W; c++) {
      out.push(block(c * B, r * B, rand() < 0.28 ? rib : wall, rand));
    }
  }
  // Швы кладки: генератору нужен ряд, за который можно зацепиться, иначе
  // стена расплывается в ровную штукатурку — ровно это и вышло в первый раз.
  for (let r = 0; r * B < H; r++) {
    out.push(`<rect x="0" y="${n(r * B + B - 6)}" width="${W}" height="6" fill="#39332c" opacity="0.8"/>`);
    for (let c = 0; c * B < W; c++) {
      out.push(`<rect x="${n(c * B + (r % 2 ? B / 2 : 0))}" y="${n(r * B)}" width="6" height="${n(B)}" fill="#39332c" opacity="0.6"/>`);
    }
  }

  // Проёмы один в другом: каждый следующий у́же, ниже и темнее. Рисуются
  // сплошными рамками от дальнего к ближнему — от наличников вокруг
  // каждого проёма анфилада не получилась вовсе: наличник следующего
  // закрывал предыдущий проём, и вместо череды арок вышла стена с дырой.
  //
  // Глубину держит разница самих блоков, а не полупрозрачная растяжка:
  // растяжку нейросеть смывает, это уже проверено на стене ущелья.
  const cx = Math.round((W / B) * 0.58) * B;
  const tones = [
    { base: '#4e4639', dark: '#3b352b', light: '#5f5646' },
    { base: '#3d372d', dark: '#2e2a22', light: '#4e4639' },
    { base: '#2c2822', dark: '#201d18', light: '#3d372d' },
    { base: '#1c1a16', dark: '#141310', light: '#2c2822' },
  ];
  for (let i = 0; i < tones.length; i++) {
    const hw = 8 - i, hb = 9 - i;
    const x0 = cx - hw * B, y0 = GROUND - hb * B;
    for (let r = 0; r < hb; r++) {
      for (let c = 0; c < hw * 2; c++) out.push(block(x0 + c * B, y0 + r * B, tones[i], rand));
    }
  }
  // Самый дальний проём — провал без деталей: коридор уходит дальше, чем
  // видно, и это единственное место кадра, где совсем темно.
  const lx = cx - 4 * B, ly = GROUND - 5 * B;
  out.push(`<rect x="${n(lx)}" y="${n(ly)}" width="${n(B * 8)}" height="${n(B * 5)}" fill="#0b0a08"/>`);
  out.push(`<rect x="${n(lx)}" y="${n(ly)}" width="${n(B * 8)}" height="${n(B * 0.25)}" fill="#050403"/>`);
  // Факел в глубине: он и даёт понять, что там продолжение, а не тупик.
  out.push(torch(cx - B * 0.5, GROUND - B * 3.4));

  // Факелы на боковых стенах — тот самый тёплый свет, на котором держится
  // весь день: после синего подземелья пятого контраст должен быть виден
  // с первого кадра. Ореол вокруг обязателен, иначе огонь выглядит
  // наклейкой на стене.
  for (const tx of [B * 2, B * 7, W - B * 4]) {
    out.push(glow(tx + B * 0.5, GROUND - B * 2.6, B * 3.6));
    out.push(torch(tx, GROUND - B * 3));
  }

  // Тёплая пыльная дымка у точки схода: воздух и глубина.
  out.push(`<rect x="${n(cx - B * 9)}" y="${n(GROUND - B * 10)}" width="${n(B * 18)}" height="${n(B * 10)}" fill="#ffc46b" opacity="0.07"/>`);
  return svg(out.join('\n'), GLOW_DEF);
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

/**
 * Мягкий ореол вокруг огня. Полупрозрачный прямоугольник вместо него
 * читается коричневой заплаткой на стене — это было видно в зале шестого
 * дня с первого же предпросмотра. Определение градиента вставляется
 * в тот же svg, где ореол используется.
 */
const GLOW_DEF = `<defs><radialGradient id="glow">
<stop offset="0" stop-color="#ffb13b" stop-opacity="0.5"/>
<stop offset="0.45" stop-color="#ffb13b" stop-opacity="0.17"/>
<stop offset="1" stop-color="#ffb13b" stop-opacity="0"/>
</radialGradient></defs>`;
const glow = (x, y, r) => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="url(#glow)"/>`;

/**
 * Тот же ореол, но холодный — под кристаллы Края. Отдельное определение,
 * а не параметр: тёплый GLOW_DEF зовут семь готовых слоёв, и переделывать
 * его ради одного дня нельзя.
 */
const GLOW_END_DEF = `<defs><radialGradient id="glow-end">
<stop offset="0" stop-color="#f7a8ec" stop-opacity="0.55"/>
<stop offset="0.45" stop-color="#e06ad0" stop-opacity="0.2"/>
<stop offset="1" stop-color="#e06ad0" stop-opacity="0"/>
</radialGradient></defs>`;
const glowEnd = (x, y, r) => `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="url(#glow-end)"/>`;

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

/**
 * Библиотека крепости: стеллажи, стол и свечи. Кадр закрыт целиком,
 * поэтому сцена обходится одним этим слоем — ни небо, ни дальний план
 * ей не нужны, как в кузнице и варочной.
 *
 * Стеллажи стоят по краям (4…20% и 78…95%), стол — в правой трети
 * (66…78%). Полоса 29…68% остаётся свободной: там Стив, волк и
 * библиотекарь в сценах `library`, `pearls` и `librarian`.
 */
function nearLibrary(seed = 301) {
  const rand = rng(seed);
  const out = [];

  for (let r = 0; r * B < H; r++) {
    for (let c = 0; c * B < W; c++) {
      out.push(block(c * B, r * B, r * B >= GROUND ? P.plank : P.sbrick, rand));
    }
  }
  // Швы между досками: тот же приём, что в near-furnace, иначе пол
  // не читается полом внутри помещения.
  for (let r = 0; GROUND + r * B < H; r++) {
    out.push(`<rect x="0" y="${n(GROUND + r * B)}" width="${W}" height="5" fill="#8e6c3c" opacity="0.8"/>`);
  }
  // Швы кладки на стене. Без них верхние две трети кадра — ровное серое
  // поле из крапин: стена не читается стеной, а комната выглядит пустой
  // площадкой. Ряды смещены через один, как настоящая кладка.
  for (let r = 0; r * B < GROUND; r++) {
    out.push(`<rect x="0" y="${n(r * B + B - 5)}" width="${W}" height="5" fill="${P.sbrick.dark}" opacity="0.7"/>`);
    for (let c = 0; c * B < W; c++) {
      out.push(`<rect x="${n(c * B + (r % 2 ? B / 2 : 0))}" y="${n(r * B)}" width="5" height="${n(B)}" fill="${P.sbrick.dark}" opacity="0.5"/>`);
    }
  }

  // Свеча: столбик, язычок и тёплый ореол. Ореол обязателен — без него
  // свеча выглядит белой палочкой, приклеенной к полке, и света в комнате
  // не прибавляет.
  const candle = (x, y, h = B * 0.7) => `
${glow(x + B * 0.15, y - h - B * 0.2, B * 1.9)}
<rect x="${n(x)}" y="${n(y - h)}" width="${n(B * 0.3)}" height="${n(h)}" fill="#f4efdf"/>
<rect x="${n(x - B * 0.06)}" y="${n(y - h - B * 0.26)}" width="${n(B * 0.42)}" height="${n(B * 0.3)}" fill="#ffb13b"/>
<rect x="${n(x + B * 0.06)}" y="${n(y - h - B * 0.44)}" width="${n(B * 0.18)}" height="${n(B * 0.24)}" fill="#fff0b0"/>`;

  // Корешки книг — в полблока шириной. Мелочь на телевизоре пропадает
  // при сжатии трансляции, а книги здесь главный предмет сцены.
  const tints = ['#b5452f', '#2f6ba8', '#b58a2f', '#4a7f3a', '#7a3f8f', '#a8603a', '#3f7f7a'];
  const shelf = (x0, cols, rows) => {
    const body = [];
    const top = GROUND - rows * B;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) body.push(block(x0 + c * B, top + r * B, P.wood, rand));
    }
    for (let r = 0; r < rows; r++) {
      const y = top + r * B;
      // Ниша под книги и доска полки под ней: без тёмной ниши стеллаж —
      // просто деревянная стена, и книг на нём не видно.
      body.push(`<rect x="${n(x0 + B * 0.16)}" y="${n(y + B * 0.1)}" width="${n(cols * B - B * 0.32)}" height="${n(B * 0.76)}" fill="#2a1d12"/>`);
      body.push(`<rect x="${n(x0)}" y="${n(y + B * 0.86)}" width="${n(cols * B)}" height="${n(B * 0.14)}" fill="${P.wood.dark}"/>`);
      let bx = x0 + B * 0.3;
      while (bx < x0 + cols * B - B * 0.6) {
        const bw = B * (0.17 + rand() * 0.11);
        const bh = B * (0.5 + rand() * 0.24);
        body.push(`<rect x="${n(bx)}" y="${n(y + B * 0.86 - bh)}" width="${n(bw)}" height="${n(bh)}" fill="${tints[Math.floor(rand() * tints.length)]}"/>`);
        body.push(`<rect x="${n(bx)}" y="${n(y + B * 0.86 - bh)}" width="${n(bw)}" height="${n(B * 0.06)}" fill="#f4efdf" opacity="0.5"/>`);
        bx += bw + B * 0.07;
      }
    }
    return body.join('\n');
  };

  // Стол с раскрытой книгой: сюда библиотекарь кладёт то, что перебирает,
  // и в сцене `library` ребёнок ищет лишнее именно здесь.
  const tx = Math.round((W / B) * 0.66) * B;
  const table = [
    `<rect x="${n(tx + B * 0.2)}" y="${n(GROUND - B)}" width="${n(B * 0.25)}" height="${n(B)}" fill="${P.wood.dark}"/>`,
    `<rect x="${n(tx + B * 3.55)}" y="${n(GROUND - B)}" width="${n(B * 0.25)}" height="${n(B)}" fill="${P.wood.dark}"/>`,
    `<rect x="${n(tx)}" y="${n(GROUND - B * 1.3)}" width="${n(B * 4)}" height="${n(B * 0.3)}" fill="${P.plank.base}"/>`,
    `<rect x="${n(tx)}" y="${n(GROUND - B * 1.3)}" width="${n(B * 4)}" height="${n(B * 0.1)}" fill="${P.plank.light}"/>`,
    // Книга раскрыта: две светлые половины и тёмный корешок между ними.
    // Закрытая книга со стороны читалась бы просто доской на столе.
    `<rect x="${n(tx + B * 0.45)}" y="${n(GROUND - B * 1.62)}" width="${n(B * 1.95)}" height="${n(B * 0.32)}" fill="#efe7d2"/>`,
    `<rect x="${n(tx + B * 0.45)}" y="${n(GROUND - B * 1.62)}" width="${n(B * 1.95)}" height="${n(B * 0.08)}" fill="#fffaf0"/>`,
    `<rect x="${n(tx + B * 1.34)}" y="${n(GROUND - B * 1.68)}" width="${n(B * 0.18)}" height="${n(B * 0.38)}" fill="#6b4a2a"/>`,
    // Стопка рядом: три корешка плашмя. Это и есть «кто-то поставил не то».
    `<rect x="${n(tx + B * 2.7)}" y="${n(GROUND - B * 1.46)}" width="${n(B * 1)}" height="${n(B * 0.16)}" fill="${tints[1]}"/>`,
    `<rect x="${n(tx + B * 2.74)}" y="${n(GROUND - B * 1.62)}" width="${n(B * 0.92)}" height="${n(B * 0.16)}" fill="${tints[3]}"/>`,
    `<rect x="${n(tx + B * 2.78)}" y="${n(GROUND - B * 1.78)}" width="${n(B * 0.84)}" height="${n(B * 0.16)}" fill="${tints[0]}"/>`,
  ];

  // Факелы на стене и общий тёплый налёт поверх всего слоя. Этот слой
  // нейросеть не красит, поэтому тепло должно быть в самом векторе:
  // на холодной серой кладке библиотека выглядит тем же подземельем,
  // из которого Стив только что вышел, а весь день построен на контрасте.
  // Факелы висят на свободной стене между стеллажами и выше голов: за
  // стеллажами они пропадали вовсе, а ниже — попали бы ровно за Стива
  // и библиотекаря.
  const lamp = (x) => `
${glow(x + B * 0.5, GROUND - B * 5.6, B * 3.2)}
${torch(x, GROUND - B * 6)}`;
  const warm = [
    lamp(Math.round((W / B) * 0.24) * B),
    lamp(Math.round((W / B) * 0.73) * B),
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffb13b" opacity="0.09"/>`,
  ];

  return svg(`${out.join('\n')}
${shelf(Math.round((W / B) * 0.04) * B, 5, 5)}
${shelf(Math.round((W / B) * 0.78) * B, 5, 5)}
${table.join('\n')}
${candle(tx + B * 0.1, GROUND - B * 1.3)}
${candle(Math.round((W / B) * 0.24) * B, GROUND, B * 1.1)}
${candle(Math.round((W / B) * 0.72) * B, GROUND, B * 0.9)}
${warm.join('\n')}
<rect x="0" y="0" width="${B}" height="${H}" fill="#19130d"/>
<rect x="${W - B}" y="0" width="${B}" height="${H}" fill="#19130d"/>`, GLOW_DEF);
}

/**
 * Зал с рамкой портала Края. Кадр закрыт целиком.
 *
 * Рамка стоит правее середины (56…80%) и выше Стива: это главный предмет
 * дня, и он должен читаться с дивана через сжатие трансляции. Герои в
 * сценах `hall` и `frame` занимают полосу 24…42%, то есть рамка не
 * оказывается за ними — жила алмазов за спиной Стива уже была.
 *
 * Гнёзда в блоках пустые, и внутри рамки темнота, а не свечение: день
 * кончается тем, что рамке не хватает глаз. Кладка идёт чередованием
 * светлого и тёмного блока — именно её ребёнок разглядывает в задании
 * про «что дальше», поэтому ряд должен быть виден глазами.
 *
 * В ступенях площадки оставлен разрыв на два блока: в сцене `hall`
 * площадку как раз достраивают, и ровная лестница противоречила бы
 * тексту.
 */
function nearFrame(seed = 311) {
  const rand = rng(seed);
  const out = [];

  for (let r = 0; r * B < H; r++) {
    for (let c = 0; c * B < W; c++) {
      out.push(block(c * B, r * B, r * B >= GROUND ? P.sbrick : P.deep, rand));
    }
  }

  // Швы кладки на стене: без них верх кадра — ровное тёмное поле крапин,
  // и зал не читается залом. Тот же приём, что в библиотеке.
  for (let r = 0; r * B < GROUND; r++) {
    out.push(`<rect x="0" y="${n(r * B + B - 5)}" width="${W}" height="5" fill="${P.deep.dark}" opacity="0.8"/>`);
    for (let c = 0; c * B < W; c++) {
      out.push(`<rect x="${n(c * B + (r % 2 ? B / 2 : 0))}" y="${n(r * B)}" width="5" height="${n(B)}" fill="${P.deep.dark}" opacity="0.6"/>`);
    }
  }

  // Возвышение под рамкой: сплошная площадка в два блока. Ступеней к ней
  // НЕТ — их-то и разобрали, и об этом вся сцена `hall`. Блоки, которыми
  // Стив их заложит, лежат тут же на полу.
  const dx = Math.round((W / B) * 0.5) * B;
  for (let c = 2; c < 10; c++) {
    for (let r = 0; r < 2; r++) out.push(block(dx + c * B, GROUND - B * (r + 1), P.stone, rand));
  }
  out.push(`<rect x="${n(dx + B * 2)}" y="${n(GROUND - B * 2)}" width="${n(B * 8)}" height="${n(B * 0.16)}" fill="${P.stone.light}"/>`);
  for (let i = 0; i < 3; i++) {
    out.push(block(dx - B * 1.6 + i * B * 0.95, GROUND - B * 0.85, P.stone, rand, B * 0.8));
  }

  // Рамка 5×7: кольцо из блоков с пустой темнотой внутри. Чередование
  // светлого и тёмного блока по кольцу — кладка «по правилу».
  const fx = Math.round((W / B) * 0.56) * B, fy = GROUND - B * 9;
  const ring = [];
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 5; c++) {
      if (!(c === 0 || c === 4 || r === 0 || r === 6)) continue;
      // Один блок в кладке отсутствует: в сцене `frame` речь ровно о том,
      // какой блок идёт следующим.
      if (r === 2 && c === 4) continue;
      const pal = (r + c) % 2 === 0 ? P.eframe : { base: P.eframe.dark, dark: '#8a8750', light: P.eframe.base };
      ring.push(block(fx + c * B, fy + r * B, pal, rand));
      // Гнездо для глаза: тёмный квадрат сверху блока. Пустое гнездо —
      // и есть тот крючок, на котором висит седьмой день.
      ring.push(`<rect x="${n(fx + c * B + B * 0.28)}" y="${n(fy + r * B + B * 0.2)}" width="${n(B * 0.44)}" height="${n(B * 0.44)}" fill="#2b2a1c"/>`);
      ring.push(`<rect x="${n(fx + c * B + B * 0.28)}" y="${n(fy + r * B + B * 0.2)}" width="${n(B * 0.44)}" height="${n(B * 0.1)}" fill="#1a190f"/>`);
    }
  }
  // Внутри рамки темнота, а не портал: он не работает и работать пока
  // не может.
  ring.push(`<rect x="${n(fx + B)}" y="${n(fy + B)}" width="${n(B * 3)}" height="${n(B * 5)}" fill="#0b0d12"/>`);
  ring.push(`<rect x="${n(fx + B)}" y="${n(fy + B)}" width="${n(B * 3)}" height="${n(B * 0.2)}" fill="#05070a"/>`);

  // Факелы по стенам зала с ореолами: единственный свет здесь, потому что
  // сама рамка не светит. Ореол обязателен — без него огонь выглядит
  // наклейкой на стене, это уже ловилось в кузнице.
  const lamp = (x) => `
${glow(x + B * 0.5, GROUND - B * 4, B * 3.4)}
${torch(x, GROUND - B * 4.4)}`;

  return svg(`${out.join('\n')}
${ring.join('\n')}
${lamp(Math.round((W / B) * 0.14) * B)}
${lamp(Math.round((W / B) * 0.86) * B)}
<rect x="0" y="0" width="${B}" height="${H}" fill="#14141a"/>
<rect x="${W - B}" y="0" width="${B}" height="${H}" fill="#14141a"/>`, GLOW_DEF);
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

/**
 * Брошенная телега. Ставится не слоем, а персонажем: слой пришлось бы
 * красить отдельно ради одной сцены, а телега нужна ровно в одной —
 * и стоять она должна рядом со Стивом, на той же линии земли.
 *
 * Она сломана, и это видно силуэтом: одно колесо лежит, кузов
 * перекошен, оглобля задрана. Целая телега читалась бы как обоз
 * торговца, а здесь её бросали на бегу.
 */
function cart() {
  const U = 20;
  const wood = '#8a6336', woodDark = '#664825', woodLight = '#a87d47';
  const iron = '#9aa0a8', ironDark = '#70767e';

  const body = `
<!-- кузов, перекошенный на левый бок -->
<g transform="rotate(-7 ${9 * U} ${9 * U})">
${px(2 * U, 5 * U, 14 * U, 4.4 * U, wood)}
${px(2 * U, 5 * U, 14 * U, 0.9 * U, woodLight)}
${px(2 * U, 8.5 * U, 14 * U, 0.9 * U, woodDark)}
${px(5 * U, 5 * U, 0.7 * U, 4.4 * U, woodDark)}
${px(9 * U, 5 * U, 0.7 * U, 4.4 * U, woodDark)}
${px(13 * U, 5 * U, 0.7 * U, 4.4 * U, woodDark)}
<!-- выломанная доска борта -->
${px(10.5 * U, 3.4 * U, 3.6 * U, 1.4 * U, wood)}
</g>

<!-- оглобля задрана вверх -->
${px(15.4 * U, 1.6 * U, 5.6 * U, 1 * U, wood)}
${px(15.4 * U, 1.6 * U, 5.6 * U, 0.35 * U, woodLight)}

<!-- уцелевшее колесо -->
${px(11.4 * U, 9.6 * U, 4 * U, 4 * U, ironDark)}
${px(12.2 * U, 10.4 * U, 2.4 * U, 2.4 * U, wood)}
${px(13.1 * U, 9.6 * U, 0.6 * U, 4 * U, iron)}
${px(11.4 * U, 11.3 * U, 4 * U, 0.6 * U, iron)}

<!-- второе колесо слетело и лежит на земле -->
${px(1 * U, 12 * U, 4.6 * U, 1.6 * U, ironDark)}
${px(2 * U, 12.4 * U, 2.6 * U, 0.8 * U, wood)}

<!-- рассыпанное снаряжение: щит у колеса и шлем поодаль -->
${px(6.4 * U, 11.6 * U, 2.8 * U, 2 * U, '#5a6472')}
${px(7.2 * U, 12.2 * U, 1.2 * U, 1.2 * U, iron)}
${px(17 * U, 12.2 * U, 2.4 * U, 1.4 * U, iron)}
${px(17 * U, 12.2 * U, 2.4 * U, 0.5 * U, '#c9ccd2')}`;

  // Покачивание charSvg тут лишнее: телега брошена и лежит.
  return charSvg(body, 21 * U, 14 * U, '.idle { animation: none }');
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
${px(5.4 * U, 9 * U, 2 * U, 2.4 * U, light)}`;
  // Лап ровно две — задняя и передняя. Третья была лишней вдвойне: она
  // стояла правее туловища, под самой головой, и шла до пола отдельной
  // полосой. На экране это читалось ногой, растущей из морды.

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
 * Оружие в руке персонажа. Рисуется в своих координатах и ставится
 * в кадр одним поворотом: вертикальный клинок с поперечиной читается
 * крестом, а не мечом — на арбалете Алекс это уже поймали.
 *
 * @param {string} kind sword | axe | mace | bow
 * @param {number} hx,hy где кулак, в единицах модели
 * @param {number} deg наклон; отрицательный — остриём вперёд-вверх
 */
function weapon(kind, hx, hy, deg, U, tint = {}) {
  const steel = tint.steel ?? '#c8ccd2', steelDark = tint.steelDark ?? '#8f949c';
  const haft = tint.haft ?? '#7a5630', haftDark = tint.haftDark ?? '#5a3e20';
  const cord = tint.cord ?? '#e8e4d8';
  const q = (x, y, w, h, fill) => px(x * U, y * U, w * U, h * U, fill);
  let body = '';

  if (kind === 'sword') {
    // Клинок сужается к острию, поперечина короткая: длинная превращает
    // меч в крест.
    body = `
${q(-0.45, -9.2, 0.9, 7.4, steel)}
${q(-0.45, -9.2, 0.35, 7.4, '#eef1f5')}
${q(-0.2, -10.1, 0.4, 0.9, steel)}
${q(-1.1, -1.8, 2.2, 0.7, steelDark)}
${q(-0.4, -1.1, 0.8, 2.4, haftDark)}
${q(-0.6, 1.3, 1.2, 0.6, steelDark)}`;
  } else if (kind === 'axe') {
    body = `
${q(-0.4, -8.4, 0.8, 10, haft)}
${q(-0.4, -8.4, 0.3, 10, haftDark)}
${q(0.4, -8.6, 2.6, 4, steel)}
${q(0.4, -8.6, 2.6, 0.9, '#eef1f5')}
${q(3, -7.9, 0.9, 2.6, steelDark)}
${q(-1.4, -7.4, 1, 1.6, steelDark)}`;
  } else if (kind === 'mace') {
    body = `
${q(-0.35, -6.6, 0.7, 8.4, haft)}
${q(-0.35, -6.6, 0.25, 8.4, haftDark)}
${q(-1.5, -9.4, 3, 3, steelDark)}
${q(-1.1, -9, 2.2, 2.2, steel)}
${q(-2.2, -8.6, 0.7, 1.2, steelDark)}
${q(1.5, -8.6, 0.7, 1.2, steelDark)}
${q(-0.35, -10.1, 0.7, 0.7, steelDark)}`;
  } else {
    // Лук: две дуги лесенкой и тетива между концами. Поперечины нет вовсе.
    body = `
${q(-0.4, -8.6, 0.8, 1.6, haft)}
${q(0.2, -7.2, 0.8, 1.6, haft)}
${q(0.6, -5.6, 0.8, 3.2, haft)}
${q(0.2, -2.4, 0.8, 1.6, haft)}
${q(-0.4, -1, 0.8, 1.6, haft)}
${q(-0.25, -8.4, 0.25, 8.8, cord)}`;
  }

  return `<g transform="translate(${hx * U} ${hy * U}) rotate(${deg})">${body}</g>`;
}

/**
 * Алекс — напарница Стива со второго сезона. Рост и ширина ровно как
 * у Стива: они работают вместе, и разница в размере читалась бы
 * как «взрослая и ребёнок».
 *
 * Узнают её по двум вещам: рыжая коса набок и арбалет в руке. Коса
 * вынесена за силуэт головы, иначе после сжатия при зеркалировании
 * она слипается с волосами — на носе жителя это уже проходили.
 */
function alex() {
  const U = 20;
  const skin = '#d8a27c', hair = '#b85c1e', hairDark = '#8e4414';
  const shirt = '#4e9a52', shirtDark = '#3c7a40';
  const legs = '#6b5a3a', shoe = '#4a3a28', eye = '#ffffff', iris = '#3a6b4a';

  const body = `
<!-- голова -->
${px(4 * U, 0, 8 * U, 8 * U, skin)}
${px(4 * U, 0, 8 * U, 2 * U, hair)}
${px(4 * U, 2 * U, U, 2 * U, hair)}
${px(11 * U, 2 * U, U, 2 * U, hair)}
${px(5.4 * U, 3 * U, 1.6 * U, 1.2 * U, eye)}
${px(8.8 * U, 3 * U, 1.6 * U, 1.2 * U, eye)}
${px(6 * U, 3.2 * U, 0.9 * U, 0.9 * U, iris)}
${px(9.4 * U, 3.2 * U, 0.9 * U, 0.9 * U, iris)}
${px(6.4 * U, 5.6 * U, 3.2 * U, 0.7 * U, '#a66a48')}

<!-- коса набок: выходит за голову, чтобы её было видно силуэтом -->
${px(12 * U, 1.4 * U, 2.6 * U, 2 * U, hair)}
${px(13.4 * U, 3.4 * U, 2 * U, 5 * U, hair)}
${px(13.4 * U, 5 * U, 2 * U, 0.6 * U, hairDark)}
${px(13.4 * U, 7 * U, 2 * U, 0.6 * U, hairDark)}
${px(13.8 * U, 8.4 * U, 1.2 * U, 1 * U, hairDark)}

<!-- туловище и руки -->
${px(4 * U, 8 * U, 8 * U, 12 * U, shirt)}
${px(4 * U, 8 * U, 8 * U, 1 * U, shirtDark)}
${px(0, 8 * U, 4 * U, 9 * U, shirt)}
${px(12 * U, 8 * U, 4 * U, 9 * U, shirt)}
${px(0, 17 * U, 4 * U, 3 * U, skin)}
${px(12 * U, 17 * U, 4 * U, 3 * U, skin)}

<!-- меч в правой руке, остриём вперёд-вверх -->
${weapon('sword', 14.2, 18.6, -28, U)}

<!-- ноги -->
${px(4 * U, 20 * U, 4 * U, 10 * U, legs)}
${px(8 * U, 20 * U, 4 * U, 10 * U, legs)}
${px(4 * U, 30 * U, 4 * U, 2 * U, shoe)}
${px(8 * U, 30 * U, 4 * U, 2 * U, shoe)}`;

  return charSvg(body, 17 * U, 32 * U);
}

/**
 * Железный голем. Оживлён ритуалом, и это видно: знак на груди —
 * единственное тёплое пятно на холодном железе. Он же и объясняет
 * ребёнку, почему голем вообще двигается.
 *
 * Пропорции против правила «все персонажи одного роста»: голем выше
 * Стива вчетверо шире. В сценарии он ставится w: 13 при w: 8 у Стива —
 * то есть в кадре он ровно такой, каким его описывает рассказчик.
 * Руки длинные и опущены ниже колен: так силуэт узнаётся даже издали.
 */
function golem() {
  const U = 20;
  const iron = '#c9ccd2', ironDark = '#9a9ea8', ironLight = '#e4e7ec';
  const moss = '#5e7f52', mossDark = '#46603c';
  const eye = '#2b2f36', rune = '#ffb13b', runeCore = '#ffe3a8';
  const vine = '#4f7a3e';
  const rust = '#a2653a', rustDark = '#7d4a28';

  // Ржавчина по корпусу и рукам: голем стоит под дождём не первый год,
  // и пятна говорят это раньше рассказчика. Раскладка детерминированная —
  // иначе в истории правок не видно, что реально изменилось.
  const rand = rng(371);
  const patches = [
    [7.4, 13.6, 2.2, 1.4], [14.6, 15.2, 2.6, 1.2], [8.6, 21.4, 3.2, 1.6],
    [15.2, 20.6, 1.8, 2.2], [2.4, 14.2, 2.2, 1.6], [19.2, 17.4, 2.4, 1.4],
    [2.8, 22.6, 1.8, 2.4], [19.6, 23.2, 2.2, 1.8], [8.2, 28.4, 2.4, 1.4],
    [13.4, 31.2, 2.6, 1.6], [10.4, 9.8, 2.8, 1.2],
  ].map(([x, y, w, h]) => px(x * U, y * U, w * U, h * U, rand() < 0.5 ? rust : rustDark,
    ' opacity="0.7"'));

  const body = `
<!-- голова: тяжёлая, с выступом носа во всю высоту лица -->
${px(7 * U, 0, 10 * U, 8 * U, iron)}
${px(7 * U, 0, 10 * U, 1.4 * U, ironLight)}
${px(8.4 * U, 2.6 * U, 2.4 * U, 1.4 * U, eye)}
${px(13.2 * U, 2.6 * U, 2.4 * U, 1.4 * U, eye)}
${px(10.6 * U, 2.6 * U, 2.8 * U, 5 * U, ironDark)}
${px(9 * U, 8 * U, 6 * U, 1.4 * U, ironDark)}

<!-- плечи и туловище -->
${px(4 * U, 9.4 * U, 16 * U, 3 * U, ironDark)}
${px(6 * U, 12.4 * U, 12 * U, 12 * U, iron)}
${px(6 * U, 12.4 * U, 12 * U, 1 * U, ironLight)}
${px(11.6 * U, 13.4 * U, 0.8 * U, 10 * U, ironDark)}

<!-- знак ритуала: он и оживил голема, и он же метка «свой» -->
${px(9.6 * U, 16 * U, 4.8 * U, 4.8 * U, rune)}
${px(10.8 * U, 17.2 * U, 2.4 * U, 2.4 * U, runeCore)}

<!-- лозы на плечах: голем стоял в деревне давно -->
${px(4.4 * U, 10 * U, 1.2 * U, 3.4 * U, moss)}
${px(18.4 * U, 10 * U, 1.2 * U, 2.6 * U, moss)}
${px(6 * U, 12.4 * U, 2.6 * U, 1.2 * U, mossDark)}
${px(15.4 * U, 12.4 * U, 2.6 * U, 1.2 * U, vine)}

<!-- руки: длинные, кулаки ниже колен -->
${px(1.6 * U, 10.4 * U, 4.4 * U, 16 * U, iron)}
${px(18 * U, 10.4 * U, 4.4 * U, 16 * U, iron)}
${px(1.6 * U, 10.4 * U, 4.4 * U, 1 * U, ironLight)}
${px(18 * U, 10.4 * U, 4.4 * U, 1 * U, ironLight)}
${px(0.6 * U, 26.4 * U, 6.4 * U, 5 * U, ironDark)}
${px(17 * U, 26.4 * U, 6.4 * U, 5 * U, ironDark)}

<!-- ноги: короткие и широкие, он тяжёлый -->
${px(7.4 * U, 24.4 * U, 4.4 * U, 13 * U, iron)}
${px(12.2 * U, 24.4 * U, 4.4 * U, 13 * U, iron)}
${px(6.6 * U, 37.4 * U, 5.2 * U, 2.6 * U, ironDark)}
${px(12.2 * U, 37.4 * U, 5.2 * U, 2.6 * U, ironDark)}

<!-- ржавые пятна поверх железа -->
${patches.join('\n')}`;

  return charSvg(body, 24 * U, 40 * U);
}

/**
 * Разбойник. Намеренно не страшный: силуэт сутулый и уже Стива,
 * лицо открыто, капюшон мягкий. Тон сезона — «страшного на ночь нет»,
 * и злодей здесь скорее нелепый, чем жуткий.
 *
 * Узнают его по серо-синему плащу и арбалету — те же две приметы,
 * что у Алекс, но холодные против её тёплых.
 */
function pillager(kind = 'axe') {
  const U = 20;
  const cloak = '#5a6472', cloakDark = '#434b57', cloakLight = '#717c8c';
  const skin = '#9aa2a8', skinDark = '#7d858b';
  const eye = '#2b2f36', brow = '#3a4048';

  const body = `
<!-- голова под капюшоном -->
${px(4.4 * U, 0.8 * U, 7.6 * U, 7.6 * U, skin)}
${px(3.8 * U, 0, 8.8 * U, 2.4 * U, cloakDark)}
${px(3.8 * U, 2.4 * U, 1.2 * U, 3 * U, cloakDark)}
${px(11.4 * U, 2.4 * U, 1.2 * U, 3 * U, cloakDark)}
${px(5.6 * U, 3.4 * U, 1.6 * U, 1 * U, eye)}
${px(9 * U, 3.4 * U, 1.6 * U, 1 * U, eye)}
${px(5.4 * U, 2.8 * U, 2 * U, 0.5 * U, brow)}
${px(8.8 * U, 2.8 * U, 2 * U, 0.5 * U, brow)}
${px(7.2 * U, 4 * U, 2 * U, 3.4 * U, skinDark)}

<!-- плащ: сутулые плечи, он ниже и уже Стива -->
${px(3.6 * U, 8.4 * U, 9.2 * U, 12 * U, cloak)}
${px(3.6 * U, 8.4 * U, 9.2 * U, 1 * U, cloakLight)}
${px(7.8 * U, 9.4 * U, 0.8 * U, 11 * U, cloakDark)}
${px(2 * U, 9.4 * U, 2.2 * U, 8 * U, cloak)}
${px(12.2 * U, 9.4 * U, 2.2 * U, 8 * U, cloak)}
${px(2 * U, 17.4 * U, 2.2 * U, 2 * U, skin)}
${px(12.2 * U, 17.4 * U, 2.2 * U, 2 * U, skin)}

<!-- оружие: у каждого своё, чтобы в кадре они не были близнецами -->
${weapon(kind, 13.6, 18.8, kind === 'bow' ? 0 : 24, U, { haft: '#6b5030', haftDark: '#4a3620', steel: '#aab0b8', steelDark: '#767d86' })}

<!-- ноги -->
${px(4.6 * U, 20.4 * U, 3.2 * U, 9.6 * U, cloakDark)}
${px(8.4 * U, 20.4 * U, 3.2 * U, 9.6 * U, cloakDark)}
${px(4.6 * U, 30 * U, 3.2 * U, 2 * U, '#2f343c')}
${px(8.4 * U, 30 * U, 3.2 * U, 2 * U, '#2f343c')}`;

  return charSvg(body, 17 * U, 32 * U);
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

/* ---------------- Край седьмого дня ---------------- */

/**
 * Пустота Края. Небо без светила вовсе — единственное такое за сезон,
 * и облаков тут нет: облако в пустоте читается как «всё-таки небо»,
 * а весь смысл места в том, что это не небо.
 */
function skyVoid() {
  const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#140a22"/><stop offset="0.55" stop-color="#241238"/>
    <stop offset="1" stop-color="#3a1d52"/></linearGradient></defs>`;
  return svg(`<rect width="${W}" height="${H}" fill="url(#g)"/>`, defs);
}

/**
 * Крапины в пустоте — отдельным прозрачным слоем, как луна и солнце.
 * Через img2img они либо раздуваются в светило, либо вымываются начисто,
 * и это уже проверено на звёздах первой ночи.
 *
 * Выше линии земли и только там: на предпросмотре крапины легли и на
 * камень острова, и получилась не пустота, а сыпь по земле.
 */
function starsVoid(seed = 17) {
  const rand = rng(seed);
  const out = [];
  for (let i = 0; i < 120; i++) {
    const x = Math.floor(rand() * (W / 20)) * 20;
    const y = Math.floor(rand() * (GROUND * 0.86 / 20)) * 20;
    const s = rand() < 0.2 ? 14 : 8;
    out.push(`<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="#e8d8ff" opacity="${n(0.22 + rand() * 0.6)}"/>`);
  }
  return svg(out.join('\n'));
}

/**
 * Парящий остров Края. Слой кадр НЕ закрывает: под островами и между ними
 * должна быть видна пустота, поэтому при сборке ему нужен chromaKey по
 * цвету init-подложки — как у холмов и реки, а не как у свода Нижнего мира.
 *
 * Дальняя кромка поднимается над линией земли всего на блок-два. Первый
 * вариант рос до четырёх, и уступ приходился Стиву ровно по пояс: вместо
 * глубины получалась вторая стена прямо за спиной. Пустоты в среднем поясе
 * кадра должно быть видно много — она тут главный герой.
 *
 * Тона дальнего плана СВОИ, темнее и холоднее ближнего камня. На одной
 * палитре с ближним планом остров и земля сливались в одно поле: в холмах
 * первого дня их разводит зелёный против травяного, здесь разводить нечем.
 *
 * Столбы стоят на 10, 22, 74 и 90%: полоса 32…64% остаётся пустой, там
 * в сценах Края стоит Стив. Жила алмазов за спиной уже была.
 */
function farEndIsland(seed = 321) {
  const rand = rng(seed);
  const out = [];
  const pale = { base: '#9e9a76', dark: '#7d7a5c', light: '#b4b08a' };
  const under = { base: '#4a4738', dark: '#38362a', light: '#5c5945' };

  let height = 1;
  for (let col = 0; col * B < W; col++) {
    const x = col * B;
    if (rand() < 0.3) height += rand() < 0.5 ? 1 : -1;
    height = Math.max(0, Math.min(2, height));
    for (let i = 0; i < height; i++) {
      out.push(block(x, GROUND - B - i * B, i === height - 1 ? pale : under, rand));
    }
    // Низ дальней кромки обрывается в пустоту, а не уходит под землю:
    // иначе остров не парит, а просто стоит на чём-то невидимом.
    for (let r = 0; r < 2 + Math.floor(rand() * 2); r++) {
      out.push(block(x, GROUND + r * B, under, rand));
    }
  }

  // Острова помельче висят сами по себе. Низ у каждого тёмный и неровный:
  // ровная плита снизу читается полкой, а не куском оторванной земли.
  for (const [cx, cy, w] of [[0.1, 0.2, 5], [0.44, 0.12, 7], [0.8, 0.25, 4]]) {
    const x0 = Math.round((W / B) * cx) * B;
    const y0 = Math.round((H / B) * cy) * B;
    for (let c = 0; c < w; c++) {
      out.push(block(x0 + c * B, y0, pale, rand));
      const d = 1 + Math.floor(rand() * 2);
      for (let r = 1; r <= d; r++) out.push(block(x0 + c * B, y0 + r * B, under, rand));
    }
  }

  // Столбы с огоньками в глубине кадра: именно их Стив обходит кругом,
  // и из них понятно, что остров больше, чем видно.
  for (const fx of [0.1, 0.22, 0.74, 0.9]) {
    const x = Math.round((W / B) * fx) * B;
    const h = 4 + Math.floor(rand() * 3);
    for (let r = 0; r < h; r++) out.push(block(x, GROUND - B * (2 + r), P.obsidian, rand));
    const top = GROUND - B * (2 + h);
    out.push(glowEnd(x + B * 0.5, top + B * 0.4, B * 2.4));
    out.push(block(x + B * 0.1, top, P.ecrystal, rand, B * 0.8));
  }

  // Лиловая дымка у кромки: она даёт воздух и отделяет дальний план от
  // ближнего. Жёсткой маской её срезает, поэтому собирать слой с softMask.
  //
  // Именно растяжка, а не ровный прямоугольник: у прямоугольника видна
  // верхняя грань, и на предпросмотре он читался не дымкой, а полосой
  // поперёк всего кадра.
  const defs = GLOW_END_DEF.replace('</defs>', `<linearGradient id="endhaze" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="#8a5cc4" stop-opacity="0"/>
<stop offset="1" stop-color="#8a5cc4" stop-opacity="0.2"/>
</linearGradient></defs>`);
  out.push(`<rect x="0" y="${n(GROUND - B * 6)}" width="${W}" height="${n(B * 6)}" fill="url(#endhaze)"/>`);
  return svg(out.join('\n'), defs);
}

/**
 * Ближний план Края: бледный камень, два столба с кристаллами и обрыв
 * справа. Кулис по краям здесь нет намеренно — тёмная полоса у края кадра
 * во всех прежних слоях означала «дальше стена», а здесь дальше пустота,
 * и обрыв на 84% как раз и есть то, за край чего Стив свешивается в сцене
 * `look`.
 *
 * Столбы стоят на 8 и 76%, полоса 32…64% свободна под Стива. Грань столба
 * высветлена: сплошной обсидиан на лиловом фоне пропадал начисто, столбы
 * читались дырками в картинке.
 */
function nearEndPillar(seed = 331) {
  const rand = rng(seed);
  const out = [];
  const brink = Math.round((W / B) * 0.84) * B;

  // Кромка обрыва ступенькой, а не отвесным срезом: отвесный читался
  // прямоугольной дыркой в картинке, это было видно на предпросмотре.
  // Чем глубже ряд, тем раньше он кончается — камень обламывается внутрь.
  const cutAt = (r) => brink - Math.min(r, 3) * B;
  for (let r = 0; GROUND + r * B < H; r++) {
    const cut = cutAt(r);
    for (let c = 0; c * B < W; c++) {
      const x = c * B;
      if (x >= cut) continue;
      out.push(block(x, GROUND + r * B, r === 0 ? P.estone : P.edeep, rand));
    }
    out.push(`<rect x="${n(cut - 10)}" y="${n(GROUND + r * B)}" width="10" height="${n(B)}" fill="#1a1024"/>`);
  }
  // Пара блоков, оторвавшихся от кромки и повисших ниже: по ним видно,
  // что остров обламывается, а не аккуратно обрезан.
  out.push(block(brink + B * 0.4, GROUND + B * 1.4, P.edeep, rand, B * 0.7));
  out.push(block(brink - B * 1.8, GROUND + B * 2.8, P.edeep, rand, B * 0.5));

  // Столб с кристаллом. Кристалл сидит в тонкой клетке — её-то Стив
  // и сбивает в сцене `crystals`, и по клетке понятно, что огонёк не
  // просто светится, а чем-то держится.
  const pillar = (fx, h) => {
    const x = Math.round((W / B) * fx) * B;
    const body = [];
    for (let r = 0; r < h; r++) {
      body.push(block(x, GROUND - B * (r + 1), P.obsidian, rand));
      body.push(block(x + B, GROUND - B * (r + 1), P.obsidian, rand));
    }
    // Светлая грань и тёмная тень по бокам: без них столб не объёмный.
    body.push(`<rect x="${n(x)}" y="${n(GROUND - B * h)}" width="${n(B * 0.22)}" height="${n(B * h)}" fill="#6b5a7a"/>`);
    body.push(`<rect x="${n(x + B * 1.78)}" y="${n(GROUND - B * h)}" width="${n(B * 0.22)}" height="${n(B * h)}" fill="#120b1a"/>`);
    const top = GROUND - B * (h + 1.4);
    body.push(glowEnd(x + B, top + B * 0.7, B * 3.6));
    body.push(block(x + B * 0.3, top, P.ecrystal, rand, B * 1.4));
    body.push(`<rect x="${n(x + B * 0.3)}" y="${n(top)}" width="${n(B * 1.4)}" height="${n(B * 1.4)}" fill="none" stroke="#8d7aa3" stroke-width="7"/>`);
    return body.join('\n');
  };

  return svg(`${out.join('\n')}
${pillar(0.08, 7)}
${pillar(0.76, 5)}`, GLOW_END_DEF);
}

/**
 * Середина острова с порталом домой. Возвышение стоит слева (6…22%):
 * полосу 32…82% занимают Стив и дракон, и портал не должен оказаться
 * у них за спиной.
 *
 * Портал здесь РАБОТАЕТ — светлый, высокий и спокойный. В этом вся
 * разница с пустой рамкой шестого дня, и ребёнок должен увидеть её сразу.
 * Дорожка к возвышению разобрана на два блока: её достраивают в сцене
 * `open`, и ровная дорожка противоречила бы тексту.
 */
function nearEndGate(seed = 341) {
  const rand = rng(seed);
  const out = [];

  for (let r = 0; GROUND + r * B < H; r++) {
    for (let c = 0; c * B < W; c++) {
      out.push(block(c * B, GROUND + r * B, r === 0 ? P.estone : P.edeep, rand));
    }
  }

  const gx = Math.round((W / B) * 0.06) * B, gw = 5;
  const dais = [];
  for (let c = 0; c < gw; c++) {
    for (let r = 0; r < 2; r++) dais.push(block(gx + c * B, GROUND - B * (r + 1), P.obsidian, rand));
  }
  dais.push(`<rect x="${n(gx)}" y="${n(GROUND - B * 2)}" width="${n(gw * B)}" height="${n(B * 0.16)}" fill="#8d7aa3"/>`);

  // Столбики по углам возвышения: без них площадка читается ступенькой,
  // а не местом, где что-то стоит.
  for (const c of [0, gw - 1]) {
    for (let r = 0; r < 2; r++) dais.push(block(gx + c * B, GROUND - B * (r + 3), P.obsidian, rand));
  }

  // Сам портал: столб спокойного света в три блока высотой. Низкая
  // лужица света на предпросмотре читалась просто светлым камнем.
  const pw = 3, pxl = gx + B;
  const light = { base: '#d8c8f2', dark: '#b09ad6', light: '#f2e8ff' };
  dais.push(glowEnd(pxl + (pw * B) / 2, GROUND - B * 3, B * 5.2));
  for (let c = 0; c < pw; c++) {
    for (let r = 0; r < 3; r++) dais.push(block(pxl + c * B, GROUND - B * (3 + r), light, rand));
  }
  dais.push(`<rect x="${n(pxl)}" y="${n(GROUND - B * 5)}" width="${n(pw * B)}" height="${n(B * 0.14)}" fill="#fffaff"/>`);

  const path = [];
  const px0 = Math.round((W / B) * 0.24) * B;
  for (let c = 0; c < 5; c++) {
    if (c === 2 || c === 3) continue;
    path.push(block(px0 + c * B, GROUND - B, P.estone, rand));
  }
  // Блоки, которыми разрыв и закладывают, лежат тут же на камне.
  for (let i = 0; i < 3; i++) {
    path.push(block(px0 + B * 5.4 + i * B * 0.9, GROUND - B * 0.8, P.estone, rand, B * 0.75));
  }

  return svg(`${out.join('\n')}
${dais.join('\n')}
${path.join('\n')}`, GLOW_END_DEF);
}

/**
 * Дракон Края. Роль `villain` держалась свободной весь сезон именно под
 * него, но страшным он быть не должен: его не побеждают, а отпускают
 * домой. Поэтому глаза большие и круглые, морда без единого зуба, а линии
 * мягкие — тот же приём, что у коровы, овцы и летучей мыши.
 *
 * Шкура светлее и теплее пустоты, хотя дракон Края и чёрный: первый
 * вариант был почти чёрным, и на лиловом фоне получилось тёмное пятно
 * без силуэта. Это ровно то правило, что записано про зверей ёжика —
 * холодный персонаж сливается с холодным задником.
 *
 * Крылья сужаются книзу тремя ступенями: ровный прямоугольник читался
 * доской, а не крылом. Пропорции вытянуты в ширину, как у мыши: узнают
 * дракона по размаху. Стив — 16 на 32 «пикселя», дракон — 44 на 28,
 * то есть при `w: 26` в сценарии он втрое шире Стива и чуть выше его.
 */
function dragon() {
  const U = 20;
  const hide = '#5a4870', hideDark = '#3e3050', belly = '#7d6b92';
  const wing = '#6e5a86', wingDark = '#463659';
  const horn = '#c3b2d6', snout = '#4a3a60';
  const eye = '#ffffff', iris = '#d86ad0';

  // Крыло ступенями: чем ниже, тем короче. tip — внешний край.
  const wingSteps = (tip, dir) => {
    const rows = [[5, 3, 13], [8, 3, 11], [11, 2.6, 8]];
    const body = [];
    for (const [y, h, len] of rows) {
      const x = dir > 0 ? tip : tip - len * U;
      body.push(px(x, y * U, len * U, h * U, wing));
      body.push(px(x, (y + h - 0.5) * U, len * U, 0.5 * U, wingDark));
    }
    // Жилки: без них перепонка остаётся плоским пятном.
    for (const k of [0.3, 0.62]) {
      const x = dir > 0 ? tip + 13 * U * k : tip - 13 * U * k;
      body.push(px(x, 5 * U, 0.3 * U, 8.6 * U, wingDark));
    }
    return body.join('\n');
  };

  const body = `
<!-- крылья -->
${wingSteps(17 * U, -1)}
${wingSteps(27 * U, 1)}

<!-- хвост: уходит вправо и сужается, иначе дракон читается просто зверем -->
${px(27 * U, 18 * U, 4 * U, 2.4 * U, hide)}
${px(30 * U, 16 * U, 3.4 * U, 2.2 * U, hide)}
${px(32.6 * U, 14.2 * U, 2.8 * U, 2 * U, hideDark)}

<!-- туловище и шея -->
${px(17 * U, 10 * U, 10 * U, 11 * U, hide)}
${px(19 * U, 13 * U, 6 * U, 7 * U, belly)}
${px(19 * U, 6 * U, 6 * U, 5 * U, hide)}

<!-- голова -->
${px(17 * U, 1 * U, 10 * U, 6 * U, hide)}
${px(19.5 * U, 6 * U, 5 * U, 3.5 * U, snout)}
${px(17.6 * U, 0, 1.4 * U, 1.4 * U, horn)}
${px(25 * U, 0, 1.4 * U, 1.4 * U, horn)}
${px(20.4 * U, 0.3 * U, 1.1 * U, 0.9 * U, horn)}
${px(22.5 * U, 0.3 * U, 1.1 * U, 0.9 * U, horn)}

<!-- глаза: крупные и круглые, в них вся разница между зверем и страшилой -->
${px(18.2 * U, 2.6 * U, 2.6 * U, 2.2 * U, eye)}
${px(23.2 * U, 2.6 * U, 2.6 * U, 2.2 * U, eye)}
${px(19.1 * U, 3.2 * U, 1.2 * U, 1.3 * U, iris)}
${px(24.1 * U, 3.2 * U, 1.2 * U, 1.3 * U, iris)}

<!-- ноздри -->
${px(20.6 * U, 8 * U, 0.8 * U, 0.7 * U, hideDark)}
${px(22.8 * U, 8 * U, 0.8 * U, 0.7 * U, hideDark)}

<!-- лапы -->
${px(17.6 * U, 21 * U, 3.2 * U, 5 * U, hide)}
${px(23.4 * U, 21 * U, 3.2 * U, 5 * U, hide)}
${px(17 * U, 25.4 * U, 4.4 * U, 1.8 * U, hideDark)}
${px(22.8 * U, 25.4 * U, 4.4 * U, 1.8 * U, hideDark)}
${px(17.3 * U, 26.4 * U, 0.8 * U, 1 * U, horn)}
${px(19.2 * U, 26.4 * U, 0.8 * U, 1 * U, horn)}
${px(23.1 * U, 26.4 * U, 0.8 * U, 1 * U, horn)}
${px(25 * U, 26.4 * U, 0.8 * U, 1 * U, horn)}`;

  return charSvg(body, 44 * U, 28 * U);
}

/**
 * Деревня за частоколом. Кулисы по краям — частокол и ворота, центр
 * свободен: туда встают Стив, Алекс, житель и голем, а голем широкий.
 *
 * Колокол стоит слева от ворот и невысоко: он звучит в каждой серии
 * сезона, и ребёнок должен находить его в кадре глазами.
 */
function nearVillage(seed = 371) {
  const rand = rng(seed);
  const out = [];
  const LOG = '#6b4a28', LOG_TOP = '#8a6334', LOG_DARK = '#4e3519';
  const ROOF = '#9c4234', ROOF_DARK = '#7a3228';
  const BELL = '#cfae4a', BELL_DARK = '#9a7f2c';

  // Частокол рисуется брёвнами с просветами, а не блоками: сквозь просветы
  // видно небо, и стена читается силуэтом. Блоками она сливалась с землёй —
  // цвет дерева и цвет грунта в этой палитре почти совпадают.
  const palisade = (x0, cols) => {
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * B + 5;
      const w = B - 10;
      const top = GROUND - B * 3.4 - 10 * rand();
      out.push(`<rect x="${n(x)}" y="${n(top)}" width="${n(w)}" height="${n(GROUND - top)}" fill="${LOG}"/>`);
      out.push(`<rect x="${n(x)}" y="${n(top)}" width="${n(w)}" height="12" fill="${LOG_TOP}"/>`);
      out.push(`<rect x="${n(x + w - 7)}" y="${n(top)}" width="7" height="${n(GROUND - top)}" fill="${LOG_DARK}"/>`);
    }
    // Поперечина: без неё частокол распадается на отдельные палки.
    out.push(`<rect x="${n(x0)}" y="${n(GROUND - B * 1.6)}" width="${n(cols * B)}" height="14" fill="${LOG_DARK}"/>`);
  };

  // Крыши за стеной: деревня живёт, но домов целиком не видно. Красные
  // крыши — единственное тёплое пятно выше стены, их видно первыми.
  const roofs = [[B * 7, 4, 2], [B * 12.5, 3, 2], [B * 21, 4, 3]];
  for (const [hx, hw, hh] of roofs) {
    for (let c = 0; c < hw; c++) {
      for (let r = 0; r < hh; r++) out.push(block(hx + c * B, GROUND - B * (r + 2.2), P.plank, rand));
    }
    for (let c = -1; c <= hw; c++) {
      out.push(`<rect x="${n(hx + c * B)}" y="${n(GROUND - B * (hh + 2.2))}" width="${B}" height="${B}" fill="${c % 2 ? ROOF : ROOF_DARK}"/>`);
    }
  }

  palisade(0, 5);
  palisade(W - B * 5, 5);

  // Ворота: две створки по краям проёма и перекладина над ним. Проём пустой —
  // в него уходят персонажи, и туда же смотрит ребёнок.
  const gx = B * 5;
  for (const x of [gx, gx + B * 2]) {
    out.push(`<rect x="${n(x + 4)}" y="${n(GROUND - B * 3.6)}" width="${n(B - 8)}" height="${n(B * 3.6)}" fill="${LOG}"/>`);
    out.push(`<rect x="${n(x + 4)}" y="${n(GROUND - B * 3.6)}" width="${n(B - 8)}" height="14" fill="${LOG_TOP}"/>`);
  }
  out.push(`<rect x="${n(gx)}" y="${n(GROUND - B * 3.9)}" width="${n(B * 3)}" height="18" fill="${LOG_DARK}"/>`);

  // Колокол на столбе. Он звонит в каждой серии сезона, поэтому крупный
  // и тёплого металла: ребёнок должен находить его в кадре глазами.
  const bx = B * 2.2;
  out.push(`<rect x="${n(bx)}" y="${n(GROUND - B * 4.4)}" width="${n(B * 0.5)}" height="${n(B * 4.4)}" fill="${LOG}"/>`);
  out.push(`<rect x="${n(bx)}" y="${n(GROUND - B * 4.4)}" width="${n(B * 1.9)}" height="16" fill="${LOG_DARK}"/>`);
  const cx = bx + B * 1.05;
  out.push(`<rect x="${n(cx)}" y="${n(GROUND - B * 4.2)}" width="${n(B * 0.8)}" height="${n(B * 1.1)}" fill="${BELL}"/>`);
  out.push(`<rect x="${n(cx - 6)}" y="${n(GROUND - B * 3.1)}" width="${n(B * 0.8 + 12)}" height="14" fill="${BELL_DARK}"/>`);
  out.push(`<rect x="${n(cx + B * 0.3)}" y="${n(GROUND - B * 2.9)}" width="${n(B * 0.2)}" height="12" fill="${BELL_DARK}"/>`);

  return svg(`${groundRows(rand)}
${out.join('\n')}
${torch(gx + B * 3.4, GROUND - B * 2)}`);
}

/* ---- девятый день ---- */

/**
 * Ритуальная площадка. Железо складывают крестом — четыре блока, как
 * в самой игре, — и оставляют пустое место под тыкву: иначе из кадра
 * не видно, чего не хватает, а сцена ровно про это.
 *
 * Крест стоит справа, книга на подставке слева, центр пустой: туда
 * встают Стив с Алекс, а потом поднимается голем — он выше Стива
 * в полтора раза и широкий, и любая постройка в центре оказалась бы
 * у него за спиной.
 */
function nearRitual(seed = 379) {
  const rand = rng(seed);
  const out = [];
  const IRON = { base: '#c9ccd2', dark: '#9a9ea8', light: '#e4e7ec' };
  const EDGE = '#5d6068';
  const WOOD = '#8a6334', WOOD_DARK = '#5e4322';
  const PAGE = '#efe6c8', PAGE_DARK = '#cdbf98', INK = '#5a4a38';

  // Блоки крупнее обычных и с тёмной обводкой. Первый предпросмотр показал,
  // почему: серое железо на буром склоне дальнего плана читалось блёклым
  // пятном, и креста в кадре попросту не было видно.
  const S = B * 1.4;
  const ironBlock = (x, y) => {
    out.push(`<rect x="${n(x - 5)}" y="${n(y - 5)}" width="${n(S + 10)}" height="${n(S + 10)}" fill="${EDGE}"/>`);
    out.push(block(x, y, IRON, rand, S));
  };

  // Крест из четырёх блоков, как в самой игре: столб из двух и две руки.
  // Верхнее место пустое и обведено пунктиром — туда в сцене ритуала
  // встаёт тыква, и из кадра видно, чего не хватает.
  const rx = W * 0.72;
  ironBlock(rx, GROUND - S);
  ironBlock(rx, GROUND - S * 2);
  ironBlock(rx - S, GROUND - S * 2);
  ironBlock(rx + S, GROUND - S * 2);
  out.push(`<rect x="${n(rx)}" y="${n(GROUND - S * 3)}" width="${n(S)}" height="${n(S)}" fill="none" stroke="${IRON.light}" stroke-width="7" stroke-dasharray="18 12"/>`);

  // Выложенная дорожка: площадка, а не случайная трава. Ровно один ряд
  // обычных блоков — крупные перекрывали травяную кромку и читались
  // серой полосой поперёк кадра.
  for (let c = -3; c <= 4; c++) out.push(block(rx - S + c * B, GROUND, P.brick, rand));

  // Подставка с книгой. Высокая и светлая: страницы — единственное светлое
  // пятно слева, и глаз находит книгу раньше, чем рассказчик про неё скажет.
  const lx = W * 0.18, lh = B * 2.8;
  out.push(`<rect x="${n(lx)}" y="${n(GROUND - lh)}" width="${n(B * 0.8)}" height="${n(lh)}" fill="${WOOD}"/>`);
  out.push(`<rect x="${n(lx + B * 0.56)}" y="${n(GROUND - lh)}" width="${n(B * 0.24)}" height="${n(lh)}" fill="${WOOD_DARK}"/>`);
  out.push(`<rect x="${n(lx - B * 0.8)}" y="${n(GROUND - lh - B * 0.5)}" width="${n(B * 2.4)}" height="${n(B * 0.5)}" fill="${WOOD_DARK}"/>`);
  out.push(`<rect x="${n(lx - B * 0.75)}" y="${n(GROUND - lh - B * 1.1)}" width="${n(B * 1.15)}" height="${n(B * 0.6)}" fill="${PAGE}"/>`);
  out.push(`<rect x="${n(lx + B * 0.45)}" y="${n(GROUND - lh - B * 1.1)}" width="${n(B * 1.15)}" height="${n(B * 0.6)}" fill="${PAGE_DARK}"/>`);
  for (const dy of [0.18, 0.34]) {
    out.push(`<rect x="${n(lx - B * 0.6)}" y="${n(GROUND - lh - B * (1.1 - dy))}" width="${n(B * 0.85)}" height="5" fill="${INK}"/>`);
  }

  // Запасные блоки горкой: в сцене их приносит Алекс, и считать ребёнок
  // должен то, что видит.
  // Горка стоит правее середины: на первом предпросмотре её закрывала
  // собой Алекс, а считать ребёнок должен то, что видит.
  const px0 = W * 0.56;
  ironBlock(px0, GROUND - S);
  ironBlock(px0 + S, GROUND - S);
  ironBlock(px0 + S * 0.5, GROUND - S * 2);

  return svg(`${groundRows(rand)}
${out.join('\n')}
${torch(W * 0.88, GROUND - B * 2)}
${torch(W * 0.08, GROUND - B * 2)}`, GLOW_DEF);
}

/**
 * Тыква — отдельный персонаж, а не часть слоя: предмет, который называет
 * текст, обязан быть в кадре, а красить слой ради одной сцены незачем.
 * Тот же приём, что у телеги восьмого дня.
 *
 * Лицо вырезано: у целой тыквы и у вырезанной в игре разные рецепты,
 * а ребёнок узнаёт именно вырезанную.
 */
function pumpkin() {
  const U = 20;
  const skin = '#d97a1e', skinDark = '#b35f12', skinLight = '#eb9a3c';
  const stem = '#5e7f3a', stemDark = '#46603c', hole = '#3a2410';

  const body = `
<!-- стебель -->
${px(4.5 * U, 0, 3 * U, 1.6 * U, stem)}
${px(4.5 * U, 1.2 * U, 3 * U, 0.6 * U, stemDark)}

<!-- тело с рёбрами: ровный квадрат читался бы просто ящиком -->
${px(0.5 * U, 1.6 * U, 11 * U, 9.4 * U, skin)}
${px(0.5 * U, 1.6 * U, 11 * U, 0.8 * U, skinLight)}
${px(2.6 * U, 1.6 * U, 0.6 * U, 9.4 * U, skinDark)}
${px(5.7 * U, 1.6 * U, 0.6 * U, 9.4 * U, skinDark)}
${px(8.8 * U, 1.6 * U, 0.6 * U, 9.4 * U, skinDark)}
${px(0.5 * U, 10.2 * U, 11 * U, 0.8 * U, skinDark)}

<!-- вырезанное лицо -->
${px(1.8 * U, 4 * U, 2.4 * U, 1.8 * U, hole)}
${px(7.8 * U, 4 * U, 2.4 * U, 1.8 * U, hole)}
${px(3.4 * U, 7.2 * U, 5.2 * U, 1.4 * U, hole)}
${px(4.6 * U, 6.4 * U, 1.1 * U, 0.9 * U, hole)}
${px(6.4 * U, 6.4 * U, 1.1 * U, 0.9 * U, hole)}`;

  return charSvg(body, 12 * U, 11 * U);
}
/* ---- пасхалка: свинолюд ---- */

/**
 * След свинолюда: горстка золота и пара отпечатков копытец.
 *
 * Это деталь-намёк пасхалки, и она сделана ОТДЕЛЬНЫМ предметом для `cast`,
 * а не нарисована в ближнем слое. Причина простая: слои `near-village`,
 * `near-wall`, `near-bell` и `near-house` делятся между сериями, и золото
 * в них вылезло бы в каждой — а пасхалка выходит раз в две серии. `cast`
 * же задаётся сценой, то есть ровно там, где нужно.
 *
 * Правило «деталь прячется в векторе» при этом соблюдено и по букве,
 * и по смыслу: предметы `cast` в покраску не идут вовсе, а нейросеть
 * мелкую крапину раздувает или вымывает.
 *
 * Размер считан с четырнадцатого дня: там самородок пришлось увеличить
 * с 22 до 34 пикселей, потому что после сжатия при зеркалировании
 * на телевизор он превращался в точку.
 */
function goldGlint() {
  const U = 20;
  const gold = '#e8c04a', goldHi = '#fff0b0', goldDark = '#b8912c';
  const hoof = '#5e4a35';

  const body = `
<!-- самородок покрупнее и блик на нём -->
${px(2.2 * U, 2.4 * U, 3.4 * U, 2.6 * U, gold)}
${px(2.2 * U, 4.4 * U, 3.4 * U, 0.6 * U, goldDark)}
${px(2.8 * U, 2.8 * U, 1.4 * U, 1 * U, goldHi)}

<!-- вторая крупинка рядом: одна читается случайной, две — следом -->
${px(6.2 * U, 3.6 * U, 1.8 * U, 1.4 * U, gold)}
${px(6.2 * U, 4.6 * U, 1.8 * U, 0.4 * U, goldDark)}

<!-- копытца: по две половинки, как у настоящего следа -->
${px(0.2 * U, 0.6 * U, 1.1 * U, 1.4 * U, hoof)}
${px(1.5 * U, 0.9 * U, 1.1 * U, 1.4 * U, hoof)}
${px(4.2 * U, 0.2 * U, 1.1 * U, 1.4 * U, hoof)}
${px(5.5 * U, 0.5 * U, 1.1 * U, 1.4 * U, hoof)}
${px(8.0 * U, 0.8 * U, 1.1 * U, 1.4 * U, hoof)}
${px(9.3 * U, 1.1 * U, 1.1 * U, 1.4 * U, hoof)}`;

  // Не дышит: это не персонаж, а след на земле.
  return charSvg(body, 11 * U, 5.2 * U, '.idle { animation: none }');
}

/* ---- десятый день ---- */

/**
 * Грозовые сумерки. Светила нет вовсе — это единственное небо сезона без
 * солнца и без луны, и на обложке по нему история узнаётся с первого
 * взгляда: у девяти прежних в каталоге либо день, либо закат, либо ночь
 * со звёздами.
 *
 * Тон холодный и ровный: вечером у стены единственный тёплый свет должен
 * идти от факелов на кладке, а не с неба. Облака тяжёлые и низкие, темнее
 * самого неба, — иначе сумерки читаются обычным пасмурным днём.
 */
function skyStorm() {
  const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#1b2030"/><stop offset="0.5" stop-color="#36404f"/>
    <stop offset="0.82" stop-color="#5a6270"/><stop offset="1" stop-color="#7d838c"/></linearGradient></defs>`;
  return svg(`<rect width="${W}" height="${H}" fill="url(#g)"/>
${clouds(71, '#242a38', 0.85)}
${clouds(72, '#454f60', 0.55)}`, defs);
}

/**
 * Стена деревни на стройке — слой пяти сцен десятого дня: в нём кладут
 * кладку, носят щиты, ждут и отбивают первую волну. Поэтому он сделан
 * фоном-панорамой, а не постройкой в углу: стена идёт через весь кадр
 * невысокой полосой, и персонажи стоят перед ней, никого не закрывая.
 *
 * Гребень намеренно неровный: столбцы разной высоты, слева готовая часть
 * с воротами, справа пролом в один блок и россыпь булыжника под ним.
 * Из кадра видно, что стена недостроена, — вся серия ровно про это,
 * и пролом нужен следующей: в двенадцатом дне его держит голем.
 *
 * Пролом справа, а не в центре: в ночной сцене туда встают двое
 * разбойников, а центр остаётся Стиву с Алекс.
 */
function nearWall(seed = 613) {
  const rand = rng(seed);
  const out = [];
  const LOG = '#7a5630', LOG_TOP = '#8f6a40', LOG_DARK = '#5a3f22';
  const ROOF = '#9c4b3c', ROOF_DARK = '#7a392c';
  const EDGE = '#3f3c35';
  const SHIELD = '#8a6334', SHIELD_EDGE = '#45301a', SHIELD_IRON = '#d2d2d8';

  const cols = Math.ceil(W / B) + 1;
  const gate = [6, 7, 8];          // проём ворот
  const breach = [23, 24, 25, 26, 27];   // пролом
  // Высота столбца. Готовая часть высокая, недостроенная ниже, пролом
  // почти вровень с землёй: из кадра должно читаться, где стена держит,
  // а где её нет. На первом предпросмотре стена была в три блока и
  // сливалась с дальними холмами в серую полосу.
  const heightAt = (c) => {
    if (gate.includes(c)) return 0;
    if (breach.includes(c)) return 0;
    if (c === breach[0] - 1) return 2;
    if (c === breach[breach.length - 1] + 1) return 3;
    if (c < 18) return 5;
    if (c < 23) return 3;
    return 5;
  };

  // Крыши деревни ЗА стеной, и потому выше неё: иначе их не видно вовсе,
  // а деревня должна читаться жилой. Скат ступенькой, как у всех крыш
  // этого мира.
  const roof = (hx, hw) => {
    const base = GROUND - B * 5.6;
    for (let c = 0; c < hw; c++) {
      for (let r = 0; r < 2; r++) out.push(block(hx + c * B, base - r * B, P.plank, rand));
    }
    for (let step = 0; step < 3; step++) {
      const y = base - B * (2 + step);
      for (let c = step; c < hw - step; c++) {
        out.push(`<rect x="${n(hx + c * B)}" y="${n(y)}" width="${B}" height="${B}" fill="${step % 2 ? ROOF_DARK : ROOF}"/>`);
      }
    }
  };
  roof(B * 1.5, 5);
  roof(B * 12, 5);

  // Кладка. Тёмная кромка по верхнему ряду: без неё светлый камень
  // сливается с дальними холмами, и стены в кадре нет.
  for (let c = 0; c < cols; c++) {
    const h = heightAt(c);
    for (let r = 0; r < h; r++) out.push(block(c * B, GROUND - B * (r + 1), P.sbrick, rand));
    if (h) out.push(`<rect x="${n(c * B)}" y="${n(GROUND - B * h)}" width="${B}" height="10" fill="${EDGE}"/>`);
  }

  // Щиты стоят НА гребне, а не у подножия: внизу их закрывает панель
  // с текстом, а сцена ровно про то, чтобы их посчитать. Разнесены по
  // краям от центра — на 47% ширины горку девятого дня закрывала собой
  // Алекс, и урок тот же.
  const stacks = [{ col: 2.6, k: 3 }, { col: 14.6, k: 4 }];
  const busy = new Set(stacks.flatMap(st => [0, 1, 2].map(d => Math.floor(st.col) + d)));

  // Зубцы на готовой части — через один. По ним и видно, что это стена,
  // а не насыпь.
  for (let c = 0; c < 18; c += 2) {
    if (gate.includes(c) || gate.includes(c + 1)) continue;
    if (busy.has(c)) continue;
    out.push(block(c * B, GROUND - B * 6, P.sbrick, rand));
    out.push(`<rect x="${n(c * B)}" y="${n(GROUND - B * 6)}" width="${B}" height="10" fill="${EDGE}"/>`);
  }

  // Пролом: выбитый край с обеих сторон и булыжник под ним. Без камней
  // это просто незастроенное место, а нужно, чтобы было видно — стену
  // здесь проломили, и её не успели закрыть.
  for (const [bx, by, s] of [[22.6, 0.02, 0.9], [23.6, 0.1, 0.7], [24.9, 0.0, 0.95], [26.3, 0.12, 0.65], [27.4, 0.04, 0.8]]) {
    out.push(block(bx * B, GROUND + by * B, P.stone, rand, B * s));
  }

  // Ворота: створки по краям проёма и перекладина над ним. Проём пустой —
  // в него уходят персонажи, и туда же смотрит ребёнок.
  const gx = gate[0] * B;
  for (const x of [gx, gx + B * 2]) {
    out.push(`<rect x="${n(x + 4)}" y="${n(GROUND - B * 4.4)}" width="${n(B - 8)}" height="${n(B * 4.4)}" fill="${LOG}"/>`);
    out.push(`<rect x="${n(x + 4)}" y="${n(GROUND - B * 4.4)}" width="${n(B - 8)}" height="14" fill="${LOG_TOP}"/>`);
    out.push(`<rect x="${n(x + B - 11)}" y="${n(GROUND - B * 4.4)}" width="7" height="${n(B * 4.4)}" fill="${LOG_DARK}"/>`);
  }
  out.push(`<rect x="${n(gx - 10)}" y="${n(GROUND - B * 4.7)}" width="${n(B * 3 + 20)}" height="22" fill="${LOG_DARK}"/>`);

  // Леса на недостроенном участке: два столба, два настила и раскос.
  // Без раскоса конструкция читалась столом — это было видно на первом
  // же предпросмотре.
  const sx = B * 19;
  for (const x of [sx, sx + B * 3]) {
    out.push(`<rect x="${n(x)}" y="${n(GROUND - B * 5.4)}" width="16" height="${n(B * 5.4)}" fill="${LOG}"/>`);
  }
  out.push(`<path d="M ${n(sx + 16)} ${n(GROUND - B * 1.2)} L ${n(sx + B * 3)} ${n(GROUND - B * 4.2)} l 0 22 L ${n(sx + 16)} ${n(GROUND - B * 1.2 + 22)} Z" fill="${LOG_DARK}"/>`);
  for (const h of [5.4, 3.3]) {
    out.push(`<rect x="${n(sx - 12)}" y="${n(GROUND - B * h)}" width="${n(B * 3 + 40)}" height="16" fill="${LOG_TOP}"/>`);
  }

  // Щиты у кладки — два штабеля, их в сцене считают. Рисуются силуэтом
  // с железным умбоном, а не кубиком: серые кубики в предпросмотре
  // читались камнями, то есть предмета, который называет текст,
  // в кадре не было.
  const shield = (x, y, s) => {
    const h = s * 1.3;
    out.push(`<path d="M ${n(x)} ${n(y)} h ${n(s)} v ${n(h * 0.6)} l ${n(-s / 2)} ${n(h * 0.4)} l ${n(-s / 2)} ${n(-h * 0.4)} Z" fill="${SHIELD}" stroke="${SHIELD_EDGE}" stroke-width="6"/>`);
    out.push(`<rect x="${n(x + s * 0.14)}" y="${n(y + h * 0.26)}" width="${n(s * 0.72)}" height="${n(h * 0.16)}" fill="${SHIELD_IRON}"/>`);
    out.push(`<rect x="${n(x + s * 0.4)}" y="${n(y + h * 0.1)}" width="${n(s * 0.2)}" height="${n(h * 0.52)}" fill="${SHIELD_IRON}"/>`);
  };
  for (const st of stacks) {
    for (let i = 0; i < st.k; i++) {
      shield(st.col * B + i * B * 0.62, GROUND - B * 5 - B * 0.86 + i * 6, B * 0.78);
    }
  }

  // Факелы по гребню. В ночных сценах они единственный свет, поэтому
  // с ореолом: полупрозрачный прямоугольник на их месте читается
  // заплаткой (урок шестого дня).
  const fires = [[B * 3, 6], [B * 11, 6], [B * 15, 6], [B * 22, 3]];
  const halo = fires.map(([x, h]) => glow(x + B * 0.5, GROUND - B * h - B * 0.2, B * 2.2)).join('\n');
  const flame = fires.map(([x, h]) => torch(x, GROUND - B * (h + 1))).join('\n');

  return svg(`${groundRows(rand)}
${out.join('\n')}
${halo}
${flame}`, GLOW_DEF);
}

/**
 * Колокольня. Колокол висит под крышей и сделан крупным, с тёмной
 * обводкой: предмет, который называет текст, обязан читаться в кадре —
 * этому научили телега восьмого дня и тыква девятого. Мелкий колокол
 * из слоя деревни для такой сцены не годится: там он на столбе у самого
 * края кадра, а здесь серия названа его именем.
 *
 * Башня справа от центра, как крест ритуала: в центр встают Стив с Алекс,
 * а слева остаётся место жителю, который держит верёвку.
 */
function nearBell(seed = 647) {
  const rand = rng(seed);
  const out = [];
  const LOG = '#7a5630', LOG_TOP = '#8f6a40', LOG_DARK = '#5a3f22';
  const ROOF = '#9c4b3c', ROOF_DARK = '#7a392c';
  const ROPE = '#c9b68c';
  const BELL = '#cfae4a', BELL_DARK = '#8f7526', BELL_LIGHT = '#e8ca6a';
  const EDGE = '#4a3c16';

  // Крыши деревни слева: колокольня стоит не в поле, а над домами.
  for (const [hx, hw, hh] of [[B * 1.5, 3, 2], [B * 7, 3, 2]]) {
    for (let c = 0; c < hw; c++) {
      for (let r = 0; r < hh; r++) out.push(block(hx + c * B, GROUND - B * (r + 1), P.plank, rand));
    }
    for (let c = -1; c <= hw; c++) {
      out.push(`<rect x="${n(hx + c * B)}" y="${n(GROUND - B * (hh + 1))}" width="${B}" height="${B}" fill="${c % 2 ? ROOF : ROOF_DARK}"/>`);
    }
  }

  const tx = W * 0.66;        // левый столб
  const span = B * 3.2;       // расстояние между столбами
  const top = GROUND - B * 6; // верхняя перекладина

  // Каменное основание: иначе деревянные столбы растут прямо из травы
  // и башня выглядит воткнутой, а не построенной.
  for (let c = 0; c < 4; c++) out.push(block(tx - B * 0.5 + c * B, GROUND - B, P.sbrick, rand));

  // Столбы и раскосы. Раскосы нужны: два вертикальных бруса читаются
  // лестницей, а не каркасом.
  for (const x of [tx, tx + span]) {
    out.push(`<rect x="${n(x)}" y="${n(top)}" width="22" height="${n(GROUND - B - top)}" fill="${LOG}"/>`);
    out.push(`<rect x="${n(x + 15)}" y="${n(top)}" width="7" height="${n(GROUND - B - top)}" fill="${LOG_DARK}"/>`);
  }
  out.push(`<path d="M ${n(tx + 22)} ${n(top + B * 1.2)} L ${n(tx + span)} ${n(top + B * 2.6)} l 0 24 L ${n(tx + 22)} ${n(top + B * 1.2 + 24)} Z" fill="${LOG_DARK}"/>`);
  out.push(`<path d="M ${n(tx + span)} ${n(top + B * 1.2)} L ${n(tx + 22)} ${n(top + B * 2.6)} l 0 24 L ${n(tx + span)} ${n(top + B * 1.2 + 24)} Z" fill="${LOG_DARK}"/>`);

  // Перекладина и крыша. Крыша из блоков доски с красным гребнем —
  // той же парой цветов, что крыши домов: башня деревенская.
  out.push(`<rect x="${n(tx - B * 0.4)}" y="${n(top)}" width="${n(span + B * 0.8 + 22)}" height="24" fill="${LOG_DARK}"/>`);
  for (let c = 0; c < 5; c++) out.push(block(tx - B * 0.9 + c * B, top - B, P.plank, rand));
  for (let c = -1; c <= 5; c++) {
    out.push(`<rect x="${n(tx - B * 0.9 + c * B)}" y="${n(top - B * 2)}" width="${B}" height="${B}" fill="${c % 2 ? ROOF : ROOF_DARK}"/>`);
  }

  // Колокол. Обводка отдельным прямоугольником под ним: на предпросмотре
  // девятого дня тёплый металл на бурой земле читался блёклым пятном,
  // и обводка — ровно то, что это починило.
  const cw = B * 1.5, ch = B * 1.9;
  const cx = tx + span * 0.5 + 11 - cw * 0.5;
  const cy = top + 40;
  // Тулово трапецией, а не прямоугольником: ровный жёлтый прямоугольник
  // на предпросмотре читался фонарём, а не колоколом. Узкий верх,
  // широкая губа и язык под ней — три приметы, по которым предмет
  // узнаётся с одного взгляда.
  const lip = cw * 0.34;
  const bodyPath = (ox, oy, ex) =>
    `M ${n(cx + cw * 0.17 - ex + ox)} ${n(cy + oy)} 
     L ${n(cx + cw * 0.83 + ex + ox)} ${n(cy + oy)} 
     L ${n(cx + cw + lip + ex + ox)} ${n(cy + ch + oy)} 
     L ${n(cx - lip - ex + ox)} ${n(cy + ch + oy)} Z`;
  out.push(`<path d="${bodyPath(0, 0, 9)}" fill="${EDGE}"/>`);
  out.push(`<path d="${bodyPath(0, 0, 0)}" fill="${BELL}"/>`);
  out.push(`<rect x="${n(cx - lip * 0.6)}" y="${n(cy + ch * 0.45)}" width="${n(cw * 0.26)}" height="${n(ch * 0.5)}" fill="${BELL_LIGHT}"/>`);
  out.push(`<rect x="${n(cx + cw * 0.74)}" y="${n(cy + ch * 0.45)}" width="${n(cw * 0.26)}" height="${n(ch * 0.5)}" fill="${BELL_DARK}"/>`);
  // Губа и язык.
  out.push(`<rect x="${n(cx - lip - 9)}" y="${n(cy + ch - 4)}" width="${n(cw + lip * 2 + 18)}" height="26" fill="${BELL_DARK}"/>`);
  out.push(`<rect x="${n(cx - lip - 9)}" y="${n(cy + ch + 22)}" width="${n(cw + lip * 2 + 18)}" height="12" fill="${EDGE}"/>`);
  out.push(`<rect x="${n(cx + cw * 0.42)}" y="${n(cy + ch + 34)}" width="${n(cw * 0.16)}" height="30" fill="${EDGE}"/>`);
  // Серьга, которой колокол висит на перекладине.
  out.push(`<rect x="${n(cx + cw * 0.38)}" y="${n(top + 18)}" width="${n(cw * 0.24)}" height="26" fill="${EDGE}"/>`);

  // Верёвка до самой земли: за неё в сцене дёргают, и из кадра должно быть
  // видно, кому до неё дотянуться.
  out.push(`<rect x="${n(cx + cw * 0.46)}" y="${n(cy + ch + 60)}" width="9" height="${n(GROUND - cy - ch - 60)}" fill="${ROPE}"/>`);


  return svg(`${groundRows(rand)}
${out.join('\n')}
${glow(cx + cw * 0.5, cy + ch * 0.5, B * 2.4)}`, GLOW_DEF);
}

/* ---- одиннадцатый день ---- */

// Трава и грунт в тумане. Обычные P.grass и P.dirt дают яркий дневной луг,
// и на обложке одиннадцатый день становился неотличим от девятого
// и восьмого — ребёнок выбирает историю по картинке, а не по подписи.
// Тона холоднее и глуше: туман съедает насыщенность у самой земли тоже,
// а не только на дальнем плане.
const FOG_GRASS = { base: '#5c7a4e', dark: '#47603c', light: '#6d8b5d' };
const FOG_DIRT = { base: '#6d5740', dark: '#544331', light: '#7f674d' };

/** Полоса дымки над линией земли: туман виден и внизу, а не только в небе. */
const fogBand = () => {
  const out = [`<defs><linearGradient id="fogband" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0" stop-color="#cdd6c6" stop-opacity="0.42"/>`
    + `<stop offset="1" stop-color="#cdd6c6" stop-opacity="0"/>`
    + `</linearGradient></defs>`];
  out.push(`<rect x="0" y="${n(GROUND - B * 2.6)}" width="${W}" height="${n(B * 3.2)}" fill="url(#fogband)"/>`);
  return out.join('');
};

/**
 * Туманное утро. Светила нет, как в грозовом небе десятого дня, но повод
 * другой: там тучи, здесь молоко. Градиент снизу светлее верха —
 * у настоящего тумана свет идёт от земли, а не с неба, и без этого
 * переворота кадр читается обычным пасмурным днём.
 *
 * Облака двумя слоями и оба мягкие: туман не даёт им кромки. Это
 * подложка под нейросеть — дымку рисует она, вектору она недоступна.
 */
function skyFog() {
  const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#55615c"/><stop offset="0.42" stop-color="#78857c"/>
    <stop offset="0.76" stop-color="#a1ac9f"/><stop offset="1" stop-color="#c6cdc0"/></linearGradient></defs>`;
  return svg(`<rect width="${W}" height="${H}" fill="url(#g)"/>
${clouds(83, '#8b978d', 0.4)}
${clouds(84, '#b8c1b3', 0.3)}`, defs);
}

/**
 * Сосняк в тумане. От `far-pines` отличается не деревьями, а глубиной:
 * три яруса от бледного к тёмному, и чем дальше, тем выше стоит основание.
 * Один ярус дал бы ровную гребёнку, а нужна именно даль — ею потом
 * и займётся нейросеть.
 *
 * Фона нет нарочно: подложку заливает `rasterInit` цветом `#0a1430`,
 * и `composeLayer` снимает его по `chromaKey` — сквозь дальний план
 * должно быть видно небо.
 */
function farPinesFog(seed = 653) {
  const rand = rng(seed);
  const out = [];
  const BANDS = [
    { lift: B * 2.6, pal: { base: '#6f7d72', dark: '#637066', light: '#7d8a7e' }, count: 16, tiers: 2 },
    { lift: B * 1.3, pal: { base: '#54654f', dark: '#495a46', light: '#5f7158' }, count: 13, tiers: 3 },
    { lift: 0, pal: P.pine, count: 10, tiers: 4 },
  ];
  for (const band of BANDS) {
    const baseY = GROUND - B - band.lift;
    for (let col = 0; col * B < W; col++) out.push(block(col * B, baseY, band.pal, rand));
    for (let t = 0; t < band.count; t++) {
      const x = Math.floor(rand() * (W / B)) * B;
      const tiers = band.tiers + Math.floor(rand() * 2);
      for (let r = 0; r < tiers; r++) {
        const wide = tiers - r;
        for (let c = -wide + 1; c < wide; c++) {
          out.push(block(x + c * B, baseY - (r + 1) * B, band.pal, rand));
        }
      }
    }
  }
  return svg(out.join('\n'));
}

/**
 * Тропа с ловушками. Сцена ровно про чередование, и оно обязано читаться
 * из кадра: колышек, нить, колышек, нить — иначе вопрос «что дальше»
 * висит в воздухе.
 *
 * Высота кольев взята замером, а не на глаз. Текст сцены занимает
 * 3…65% ширины и всё, что ниже 56% высоты; свободны, значит, две полосы:
 * выше 56% по всей ширине и правее 65% до самого низа. Первая версия
 * ставила колышки в полтора блока — их верх приходился на 62%, то есть
 * под текст, и ровно то, что надо было сосчитать, было не видно. Это
 * второй раз та же ошибка: на десятом дне так ушли под панель щиты.
 * Теперь колья в три блока, их верхушки и нить — на 53…55%.
 *
 * Ветка и камень — остальные два слова чередования, и они тоже в кадре:
 * ветки прислонены к кольям на той же высоте, камни лежат правее 70%.
 *
 * Ели кулисами по краям, как в `near-pines`: середина остаётся троим.
 * Яма на 70% — в правой чистой полосе, и там никто не стоит ни в одной
 * сцене; по тексту её как раз закладывают блоками.
 */
function nearTraps(seed = 659) {
  const rand = rng(seed);
  const out = [groundRows(rand, FOG_GRASS, FOG_DIRT)];
  const PEG = '#7a5630', PEG_DARK = '#5a3f22', STRING = '#d8d2bc';

  // Тропа светлее дёрна: без неё ловушки стоят просто в траве.
  out.push(`<rect x="0" y="${n(GROUND)}" width="${W}" height="${n(B * 0.8)}" fill="#8d7b4e" opacity="0.75"/>`);

  // Ели кулисами. Не вплотную к краю — у обрезанной ели ярусы не читаются.
  for (const [x, tiers] of [[B, 5], [B * 4, 4], [W - B * 2, 5], [W - B * 5, 4]]) {
    out.push(block(x, GROUND - B, P.wood, rand));
    for (let r = 0; r < tiers; r++) {
      const wide = tiers - r;
      for (let c = -wide + 1; c < wide; c++) {
        out.push(block(x + c * B, GROUND - B * 2 - r * B, P.pine, rand));
      }
    }
  }

  // Колья с нитью. Шаг два блока: при шаге в один блок нить получается
  // короче самого кола, и чередования не видно.
  const pegH = B * 3, top = GROUND - pegH;
  for (let i = 0; i * B * 2 < W; i++) {
    const x = i * B * 2 + B * 0.6;
    out.push(`<rect x="${n(x)}" y="${n(top)}" width="14" height="${n(pegH)}" fill="${PEG}"/>`);
    out.push(`<rect x="${n(x)}" y="${n(top)}" width="14" height="12" fill="${PEG_DARK}"/>`);
    // Нить у самых верхушек: ниже она уходит под текст.
    const nx = x + B * 2;
    if (nx < W) {
      out.push(`<path d="M ${n(x + 14)} ${n(top + 16)} Q ${n(x + B)} ${n(top + 34)} ${n(nx)} ${n(top + 16)}"`
        + ` stroke="${STRING}" stroke-width="5" fill="none"/>`);
    }
    // Ветка, прислонённая к колу через один: третье слово чередования.
    if (i % 2) {
      out.push(`<path d="M ${n(x + 6)} ${n(top + 10)} L ${n(x - B * 0.8)} ${n(GROUND)}"`
        + ` stroke="${PEG_DARK}" stroke-width="10" fill="none"/>`);
      out.push(`<path d="M ${n(x - B * 0.3)} ${n(top + B * 0.9)} L ${n(x - B * 0.75)} ${n(top + B * 0.6)}"`
        + ` stroke="${PEG_DARK}" stroke-width="7" fill="none"/>`);
    }
  }

  // Яма, прикрытая ветками: тёмный проём в дёрне и три жерди поперёк.
  const pitX = W * 0.7, pitW = B * 4;
  out.push(`<rect x="${n(pitX)}" y="${n(GROUND)}" width="${n(pitW)}" height="${n(B * 1.2)}" fill="#1d1a14"/>`);
  for (let i = 0; i < 3; i++) {
    out.push(`<rect x="${n(pitX - 6)}" y="${n(GROUND + 8 + i * 16)}" width="${n(pitW + 12)}" height="9" fill="${PEG}"/>`);
  }

  // Камни-грузики: четвёртое слово чередования. Только в правой чистой
  // полосе — слева их закрыл бы текст.
  for (const sx of [W * 0.67, W * 0.86, W * 0.93]) {
    out.push(block(sx, GROUND - B * 0.6, P.stone, rand, B * 0.6));
  }

  // Дымка кладётся ПОСЛЕ ловушек: туман стоит между зрителем и тропой,
  // а не за ней. Колья от этого не пропадают — градиент сходит в ноль
  // к их верхушкам.
  out.push(fogBand());

  return svg(out.join('\n'));
}

/**
 * Аванпост: частокол во весь кадр, бревенчатая башня со знаменем, шатёр
 * и две горки снаряжения караула. Слой держит пять сцен из десяти,
 * поэтому он панорама, а не постройка в углу.
 *
 * Расстановка считана замером, а не на глаз: текст занимает 3…65% ширины
 * и всё ниже 56% высоты. Свободны две полосы — выше 56% по всей ширине
 * и правее 65% до низа. Поэтому горки щитов стоят на 74 и 78.5%: на 44%,
 * как было в первой версии, их целиком закрывал текст, а сцена `cage`
 * ровно про то, чтобы их сосчитать. Та же ошибка уже случалась дважды:
 * на девятом дне горку закрыла Алекс, на десятом щиты ушли под панель.
 *
 * Башня с 66% — она высокая, её верх и знамя приходятся на 22…40%, то
 * есть в верхнюю чистую полосу. Шатёр с 84%: он низкий, и ему нужна
 * именно правая полоса. Разбойники в сцене боя встают на 72 и 84%, то
 * есть против светлого полотна и тумана, а не против кладки, — серого
 * на сером не получается.
 *
 * Знамя на верхушке, а не на частоколе: его должно быть «видно из самой
 * деревни», и на обложке оно работает опознавательным знаком истории.
 */
function nearOutpost(seed = 661) {
  const rand = rng(seed);
  const out = [groundRows(rand, FOG_GRASS, FOG_DIRT)];
  const LOG = '#7a5630', LOG_TOP = '#8f6a40', LOG_DARK = '#5a3f22';
  const CLOTH = '#5d4a66', CLOTH_DARK = '#473854';
  const BANNER = '#4a4f57', EYE = '#d8d2bc', EYE_DARK = '#2b2f36';
  const SHIELD = '#8a6334', SHIELD_EDGE = '#45301a', SHIELD_IRON = '#d2d2d8';

  // Частокол: заострённые брёвна в два блока. Проём слева — через него
  // троица и входит, и без него аванпост читается глухим забором.
  const gap = [1, 2];
  for (let c = 0; c * B < W; c++) {
    if (gap.includes(c)) continue;
    const x = c * B;
    for (let r = 0; r < 2; r++) {
      out.push(`<rect x="${n(x + 4)}" y="${n(GROUND - B * (r + 1))}" width="${n(B - 8)}" height="${B}" fill="${LOG}"/>`);
      out.push(`<rect x="${n(x + 4)}" y="${n(GROUND - B * (r + 1))}" width="${n(B - 8)}" height="8" fill="${LOG_TOP}"/>`);
      out.push(`<rect x="${n(x + B - 12)}" y="${n(GROUND - B * (r + 1))}" width="8" height="${B}" fill="${LOG_DARK}"/>`);
    }
    // Острый верх: ступенька из двух полос, круглого в этом мире не бывает.
    out.push(`<rect x="${n(x + 10)}" y="${n(GROUND - B * 2 - 12)}" width="${n(B - 20)}" height="12" fill="${LOG_TOP}"/>`);
    out.push(`<rect x="${n(x + 20)}" y="${n(GROUND - B * 2 - 22)}" width="${n(B - 40)}" height="10" fill="${LOG_TOP}"/>`);
  }

  // Башня. Пять венцов, площадка и флагшток со знаменем.
  const tx = W * 0.66, tw = B * 2;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 2; c++) out.push(block(tx + c * B, GROUND - B * (r + 1), P.wood, rand));
  }
  out.push(`<rect x="${n(tx - B * 0.5)}" y="${n(GROUND - B * 6)}" width="${n(tw + B)}" height="${B}" fill="${LOG}"/>`);
  out.push(`<rect x="${n(tx - B * 0.5)}" y="${n(GROUND - B * 6)}" width="${n(tw + B)}" height="10" fill="${LOG_TOP}"/>`);
  out.push(`<rect x="${n(tx + tw * 0.5 - 6)}" y="${n(GROUND - B * 8.6)}" width="12" height="${n(B * 2.6)}" fill="${LOG_DARK}"/>`);
  // Знамя с глазом — тот же знак, что на знамени восьмого дня.
  out.push(`<rect x="${n(tx + tw * 0.5)}" y="${n(GROUND - B * 8.6)}" width="${n(B * 1.6)}" height="${n(B * 1.8)}" fill="${BANNER}"/>`);
  out.push(`<rect x="${n(tx + tw * 0.5 + B * 0.3)}" y="${n(GROUND - B * 8.1)}" width="${n(B)}" height="${n(B * 0.5)}" fill="${EYE}"/>`);
  out.push(`<rect x="${n(tx + tw * 0.5 + B * 0.65)}" y="${n(GROUND - B * 8.05)}" width="${n(B * 0.3)}" height="${n(B * 0.4)}" fill="${EYE_DARK}"/>`);

  // Шатёр: скат ступенькой, как все крыши этого мира.
  const sx = W * 0.84, sw = B * 4;
  out.push(`<rect x="${n(sx)}" y="${n(GROUND - B * 1.6)}" width="${n(sw)}" height="${n(B * 1.6)}" fill="${CLOTH}"/>`);
  for (let step = 0; step < 3; step++) {
    out.push(`<rect x="${n(sx + step * B * 0.6)}" y="${n(GROUND - B * (2.2 + step * 0.6))}"`
      + ` width="${n(sw - step * B * 1.2)}" height="${n(B * 0.6)}" fill="${step % 2 ? CLOTH_DARK : CLOTH}"/>`);
  }
  out.push(`<rect x="${n(sx + sw * 0.42)}" y="${n(GROUND - B * 1.6)}" width="${n(B * 0.7)}" height="${n(B * 1.6)}" fill="${CLOTH_DARK}"/>`);

  // Две горки щитов. Силуэт с железным умбоном, а не кубик палитры iron:
  // кубики читались камнями, это выяснилось на десятом дне.
  // Щит крупнее блока частокола и с тёмной кромкой: в первой версии он был
  // в 0.8 блока, стоял вровень с кольями забора и читался их тенью.
  const SW = B * 1.1, SH = B * 1.2;
  const shield = (x, y) => {
    out.push(`<rect x="${n(x - 4)}" y="${n(y - 4)}" width="${n(SW + 8)}" height="${n(SH + 8)}" fill="${SHIELD_EDGE}"/>`);
    out.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(SW)}" height="${n(SH)}" fill="${SHIELD}"/>`);
    out.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(SW)}" height="10" fill="${SHIELD_EDGE}"/>`);
    out.push(`<rect x="${n(x + SW * 0.3)}" y="${n(y + SH * 0.34)}" width="${n(SW * 0.4)}" height="${n(SH * 0.34)}" fill="${SHIELD_IRON}"/>`);
    out.push(`<rect x="${n(x + SW * 0.3)}" y="${n(y + SH * 0.34)}" width="${n(SW * 0.4)}" height="8" fill="#f0f0f4"/>`);
  };
  // Горки в три и в два щита: вершина верхнего поднимается до 48% высоты,
  // то есть выше частокола и выше текста. Считать ребёнок должен то,
  // что видит целиком.
  for (let i = 0; i < 3; i++) shield(W * 0.735 + i * 10, GROUND - SH - i * SH * 0.72);
  for (let i = 0; i < 2; i++) shield(W * 0.785 + i * 10, GROUND - SH - i * SH * 0.72);

  // Дымка поверх построек, но под факелами: иначе их свет гаснет в тумане,
  // а он здесь единственный тёплый.
  out.push(fogBand());

  // Факелы на частоколе: единственный тёплый свет в этом тумане.
  return svg(`${out.join('\n')}
${torch(B * 6, GROUND - B * 3)}
${torch(W - B * 3, GROUND - B * 3)}`, GLOW_DEF);
}

/**
 * Клетка — персонажем, а не частью слоя: предмет, который называет текст,
 * обязан быть в кадре, а красить слой ради одной сцены незачем. Тот же
 * приём, что у телеги восьмого дня и тыквы девятого.
 *
 * Прутья редкие и тёмные: сквозь них видно жителя, который в сценарии
 * встаёт персонажем ЗА клеткой (в `cast` он идёт раньше). При плотной
 * решётке пленника в кадре просто нет.
 */
function cage() {
  const U = 20;
  const iron = '#9a9aa2', ironDark = '#6e6e76', ironLight = '#c2c2ca';
  const lock = '#d9a93a', lockDark = '#a87c1c';

  const bars = [];
  for (let i = 0; i < 5; i++) {
    bars.push(px((0.8 + i * 2.1) * U, 0.9 * U, 0.5 * U, 9.2 * U, iron));
  }

  const body = `
<!-- верхняя и нижняя обвязка -->
${px(0.3 * U, 0, 9.4 * U, 1 * U, iron)}
${px(0.3 * U, 0, 9.4 * U, 0.3 * U, ironLight)}
${px(0.3 * U, 9.9 * U, 9.4 * U, 1.1 * U, iron)}
${px(0.3 * U, 10.6 * U, 9.4 * U, 0.4 * U, ironDark)}

<!-- стойки по углам толще прутьев -->
${px(0.3 * U, 0.9 * U, 0.9 * U, 9.2 * U, iron)}
${px(8.8 * U, 0.9 * U, 0.9 * U, 9.2 * U, iron)}
${px(8.8 * U, 0.9 * U, 0.3 * U, 9.2 * U, ironDark)}

<!-- прутья -->
${bars.join('\n')}

<!-- поперечина и замок: по тексту он поддаётся с третьего раза -->
${px(0.3 * U, 5 * U, 9.4 * U, 0.5 * U, ironDark)}
${px(4.1 * U, 5.4 * U, 1.8 * U, 1.6 * U, lock)}
${px(4.1 * U, 6.5 * U, 1.8 * U, 0.5 * U, lockDark)}
${px(4.7 * U, 5.9 * U, 0.6 * U, 0.7 * U, lockDark)}`;

  return charSvg(body, 10 * U, 11 * U);
}


/* ---------------- двенадцатый день: ночь рейда ---------------- */

// Небо пожара. Градиент перевёрнут не по светлоте, как у тумана, а по
// теплу: верх — остывшая ночь, низ — зарево от того, что горит за ёлками.
// Светила нет, как у грозы и у ночи: луну над пожаром искать незачем,
// а нейросеть из белого круга делает второе солнце.
//
// Облака двумя слоями, как в skyStorm, но нижний тёплый: дым над огнём
// подсвечен снизу, и без этого слоя небо читается обычным закатом.
//
// Жар поднят в полосу 34…52% высоты, и это замер, а не вкус. Первая
// версия держала оранжевое у самого низа кадра — как у заката, — и небо
// само по себе выходило отличным, а в сцене не читалось вовсе: кладка
// стены занимает 42…70% высоты и весь жар закрывала. Над стеной
// оставался только тёмный верх, то есть обычная ночь. Видимая полоса
// неба в сценах у стены — это 0…42%, в неё зарево и уложено.
function skyFire() {
  const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#090c1a"/><stop offset="0.16" stop-color="#141025"/>
    <stop offset="0.34" stop-color="#4a2418"/><stop offset="0.52" stop-color="#9c461a"/>
    <stop offset="0.74" stop-color="#cf6520"/><stop offset="1" stop-color="#e07a24"/></linearGradient></defs>`;
  return svg(`<rect width="${W}" height="${H}" fill="url(#g)"/>
${clouds(81, '#17131f', 0.82)}
${clouds(82, '#8a4420', 0.5)}`, defs);
}

// Искры — вектором и отдельным слоем, как звёзды Края.
//
// Через img2img такая крапина либо раздувается во второе светило, либо
// вымывается начисто — это записано в таблице «что чем рисуется». Поэтому
// слой прозрачный и в покраску не идёт вовсе.
//
// Ограничены линией земли: на седьмом дне крапины легли и на камень
// острова, и кадр стал грязным. Смещены к правой половине — туда, где
// у дальнего плана горит; слева искр заметно меньше.
function starsEmbers(seed = 820) {
  const rand = rng(seed);
  const out = [];
  for (let i = 0; i < 90; i++) {
    const x = W * (0.08 + Math.pow(rand(), 0.62) * 0.9);
    const y = rand() * (GROUND - B * 1.2);
    const s = 3 + rand() * 4;
    // чем выше, тем бледнее: искра остывает, пока летит
    const hot = 1 - y / GROUND;
    const fill = rand() < 0.35 ? '#ffd27a' : '#ff8a3d';
    out.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(s)}" height="${n(s)}" fill="${fill}" opacity="${n(0.25 + hot * 0.55)}"/>`);
  }
  return svg(out.join('\n'));
}

// Дальний план в зареве. Геометрия взята у farSmoke — те же холмы и те же
// три столба дыма выше гребня, — но холмы здесь силуэтом: ночью цвета
// у них нет, есть только край, за которым светло.
//
// Полоса зарева лежит ПОД гребнем холмов и просвечивает сквозь дым. Без
// неё на init-картинке нет указания, откуда свет, и нейросеть красит
// обычную ночь.
function farFire(seed = 821) {
  const rand = rng(seed);
  const out = [];
  const HILL = { base: '#1d1a22', dark: '#15131a', light: '#27222b' };
  const GLOW = '#e8742a';
  let height = 2;

  // зарево за холмами — первым, холмы закрывают его снизу
  out.push(`<defs><linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${GLOW}" stop-opacity="0"/>
    <stop offset="0.55" stop-color="${GLOW}" stop-opacity="0.55"/>
    <stop offset="1" stop-color="#ffb04a" stop-opacity="0.8"/></linearGradient></defs>`);
  out.push(`<rect x="0" y="${n(GROUND - B * 7.5)}" width="${W}" height="${n(B * 7.5)}" fill="url(#fg)"/>`);

  for (let col = 0; col * B < W; col++) {
    const x = col * B;
    if (rand() < 0.3) height += rand() < 0.5 ? 1 : -1;
    height = Math.max(1, Math.min(5, height));
    for (let i = 0; i < height; i++) out.push(block(x, GROUND - B - i * B, HILL, rand));
    if (rand() < 0.1) out.push(cubeTree(x, GROUND - height * B, 2, rand, HILL, HILL));
  }

  // Столбы дыма — как у farSmoke, но подсвечены снизу: у основания они
  // почти оранжевые и остывают кверху. Ровный серый столб над пожаром
  // читается печной трубой.
  for (const [bx, lean] of [[W * 0.52, 0.14], [W * 0.68, 0.07], [W * 0.84, 0.2]]) {
    const base = GROUND - B * 5.4;
    out.push(`<rect x="${n(bx - B * 0.35)}" y="${n(base)}" width="${n(B * 1.7)}" height="${n(B * 1.1)}" fill="#ffae46" opacity="0.85"/>`);
    let w = B * 0.85;
    for (let r = 0; r < 11; r++) {
      const y = base - B * 0.6 - r * B * 0.95;
      const x = bx + r * B * lean + (rand() - 0.5) * B * 0.9;
      const fill = r < 3 ? '#b5663a' : '#6e6159';
      out.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(B * 0.95)}" fill="${fill}" opacity="${n(0.74 - r * 0.056)}"/>`);
      if (rand() < 0.55) {
        out.push(`<rect x="${n(x + (rand() < 0.5 ? -B * 0.7 : w - B * 0.2))}" y="${n(y + B * 0.2)}" width="${n(B * 0.8)}" height="${n(B * 0.7)}" fill="${fill}" opacity="${n(0.5 - r * 0.04)}"/>`);
      }
      w += B * 0.22;
    }
  }

  return svg(out.join('\n'));
}

// Стена с проломом — тот же приём, что nearWall, и намеренно та же кладка:
// ребёнок должен узнать стену, которую строил в десятом дне.
//
// Два замера держат этот слой, и оба про чистую зону кадра (текст занимает
// 3…65% ширины и всё ниже 56% высоты):
//
// * пролом на столбцах 18…23, то есть 56…75% ширины. Шире дневного (там
//   было пять столбцов) и доходит до земли: вторая волна прошла насквозь;
// * БУЛЫЖНИК — то, что в сцене считают, — вынесен за пролом направо,
//   на 75.6…88.8% ширины. На земле он лежит ниже 56% высоты, и левее 65%
//   его закрыла бы панель с текстом. Это тот же промах, что прятал горку
//   железа за Алекс и щиты под панелью. Голем в сцене стоит левее, в самом
//   проломе, и кучу собой не закрывает — это проверено по `cast`.
function nearBreach(seed = 822) {
  const rand = rng(seed);
  const out = [];
  const EDGE = '#3f3c35';
  const SHIELD = '#8a6334', SHIELD_EDGE = '#45301a', SHIELD_IRON = '#d2d2d8';
  const LOG = '#7a5630', LOG_DARK = '#5a3f22';

  const cols = Math.ceil(W / B) + 1;
  const gate = [6, 7, 8];
  const breach = [18, 19, 20, 21, 22, 23];

  const heightAt = (c) => {
    if (gate.includes(c)) return 0;
    if (breach.includes(c)) return 0;
    if (c === breach[0] - 1) return 2;                   // выбитый край слева
    if (c === breach[breach.length - 1] + 1) return 3;   // выбитый край справа
    return 5;
  };

  for (let c = 0; c < cols; c++) {
    const h = heightAt(c);
    for (let r = 0; r < h; r++) out.push(block(c * B, GROUND - B * (r + 1), P.sbrick, rand));
    if (h) out.push(`<rect x="${n(c * B)}" y="${n(GROUND - B * h)}" width="${B}" height="10" fill="${EDGE}"/>`);
  }

  // Зубцы через один по уцелевшей части. Горка щитов занимает три столбца,
  // и зубец там не ставится: он торчал бы прямо из щитов.
  const stacks = [{ col: 2.6, k: 3 }, { col: 14.6, k: 4 }];
  const busy = new Set(stacks.flatMap(st => [0, 1, 2].map(d => Math.floor(st.col) + d)));
  for (let c = 0; c < 18; c += 2) {
    if (gate.includes(c) || gate.includes(c + 1)) continue;
    if (busy.has(c)) continue;
    out.push(block(c * B, GROUND - B * 6, P.sbrick, rand));
    out.push(`<rect x="${n(c * B)}" y="${n(GROUND - B * 6)}" width="${B}" height="10" fill="${EDGE}"/>`);
  }

  // Сломанные леса у правого края пролома: стойка держится, раскос вырван
  // и повис. Целые леса десятого дня здесь читались бы «стройка идёт».
  const sx = (breach[breach.length - 1] + 2) * B;
  out.push(`<rect x="${n(sx)}" y="${n(GROUND - B * 4.4)}" width="16" height="${n(B * 4.4)}" fill="${LOG}"/>`);
  out.push(`<path d="M ${n(sx + 16)} ${n(GROUND - B * 3.6)} L ${n(sx + B * 2.2)} ${n(GROUND - B * 1.1)} l 0 22 L ${n(sx + 16)} ${n(GROUND - B * 3.6 + 22)} Z" fill="${LOG_DARK}"/>`);

  // Булыжник: рядами, а не кучей — кучу не посчитать. Два ряда, нижний
  // на земле, верхний чуть выше, чтобы читались отдельные камни.
  for (const [bx, by, s] of [
    [24.2, 0.04, 0.95], [25.3, 0.12, 0.72], [26.4, 0.02, 0.88], [27.5, 0.14, 0.66],
    [24.8, -0.52, 0.7], [26.0, -0.6, 0.8], [27.1, -0.5, 0.62],
  ]) {
    out.push(block(bx * B, GROUND + by * B, P.stone, rand, B * s));
  }

  // Ворота: одна створка держится, вторая сорвана и валяется плашмя.
  out.push(`<rect x="${n(gate[0] * B)}" y="${n(GROUND - B * 3)}" width="${n(B * 1.5)}" height="${n(B * 3)}" fill="${LOG}"/>`);
  out.push(`<rect x="${n(gate[0] * B + B * 1.7)}" y="${n(GROUND - B * 0.5)}" width="${n(B * 2.6)}" height="${n(B * 0.5)}" fill="${LOG_DARK}"/>`);

  const shield = (x, y, s) => {
    const h = s * 1.3;
    out.push(`<path d="M ${n(x)} ${n(y)} h ${n(s)} v ${n(h * 0.6)} l ${n(-s / 2)} ${n(h * 0.4)} l ${n(-s / 2)} ${n(-h * 0.4)} Z" fill="${SHIELD}" stroke="${SHIELD_EDGE}" stroke-width="6"/>`);
    out.push(`<rect x="${n(x + s * 0.14)}" y="${n(y + h * 0.26)}" width="${n(s * 0.72)}" height="${n(h * 0.16)}" fill="${SHIELD_IRON}"/>`);
    out.push(`<rect x="${n(x + s * 0.4)}" y="${n(y + h * 0.1)}" width="${n(s * 0.2)}" height="${n(h * 0.52)}" fill="${SHIELD_IRON}"/>`);
  };
  for (const st of stacks) {
    for (let i = 0; i < st.k; i++) {
      shield(st.col * B + i * B * 0.62, GROUND - B * 5 - B * 0.86 + i * 6, B * 0.78);
    }
  }

  // Факелы по гребню — в ночных сценах единственный свет, поэтому с
  // ореолом. Над проломом факела нет: там кладки больше нет.
  const fires = [[B * 3, 6], [B * 11, 6], [B * 15, 6], [B * 25, 5]];
  const halo = fires.map(([x, h]) => glow(x + B * 0.5, GROUND - B * h - B * 0.2, B * 2.2)).join('\n');
  const flame = fires.map(([x, h]) => torch(x, GROUND - B * (h + 1))).join('\n');

  return svg(`${groundRows(rand)}
${out.join('\n')}
${halo}
${flame}`, GLOW_DEF);
}

/* ---------------- тринадцатый день ---------------- */

// Туман тринадцатого дня лиловый, а не зелёный, как у одиннадцатого:
// в каталоге лилового нет вовсе (`sky-void` — это пустота Края, там неба
// нет), и история узнаётся цветом с первого взгляда. Несут его небо,
// дальний план и полоса дымки — но НЕ земля: соседние сцены дня берут
// готовые near-breach, near-wall и near-bell с обычной травой, и своя
// палитра грунта здесь означала бы, что земля меняет цвет от сцены
// к сцене. У одиннадцатого дня было наоборот: там свои были почти все
// ближние слои, и FOG_GRASS красил весь день целиком.

/** Полоса лиловой дымки над линией земли — как `fogBand`, но холодная. */
const mistBand = () => {
  const out = [`<defs><linearGradient id="mistband" x1="0" y1="0" x2="0" y2="1">`
    + `<stop offset="0" stop-color="#cfc6dc" stop-opacity="0.46"/>`
    + `<stop offset="1" stop-color="#cfc6dc" stop-opacity="0"/>`
    + `</linearGradient></defs>`];
  out.push(`<rect x="0" y="${n(GROUND - B * 2.8)}" width="${W}" height="${n(B * 3.4)}" fill="url(#mistband)"/>`);
  return out.join('');
};

/**
 * Предрассветный лиловый туман. Светила нет — третья такая история после
 * грозы десятого дня и молока одиннадцатого, и повод снова свой: там тучи,
 * там молоко, здесь холодная мгла перед рассветом.
 *
 * Градиент снизу светлее верха, как у `sky-fog`: у настоящего тумана свет
 * идёт от земли. Без этого переворота кадр читается обычной ночью, а ночей
 * в каталоге уже четыре.
 *
 * Облака двумя слоями и оба мягкие — это подложка под нейросеть, кромку
 * тумана вектор не нарисует.
 */
function skyMist() {
  const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#312b40"/><stop offset="0.4" stop-color="#4d4462"/>
    <stop offset="0.74" stop-color="#8a7c9e" stop-opacity="1"/>
    <stop offset="1" stop-color="#c6bbd4"/></linearGradient></defs>`;
  return svg(`<rect width="${W}" height="${H}" fill="url(#g)"/>
${clouds(131, '#6d6183', 0.42)}
${clouds(132, '#b4a8c6', 0.3)}`, defs);
}

/**
 * Ряды одинаковых ёлок, уходящие в туман. От `far-pines-fog` отличается
 * не деревьями, а порядком: там ели расставлены случайно, здесь — через
 * равный шаг, и в каждом ярусе их ровно столько же. Повторение и есть
 * смысл кадра: мир сам начал двоиться ещё до того, как вышли копии.
 *
 * Шаг у ярусов разный (пять, четыре и три блока), поэтому гребёнка
 * не складывается в одну решётку, а остаётся тремя разными рядами.
 *
 * Фона нет нарочно: подложку заливает `rasterInit` цветом `#0a1430`.
 * Ели здесь заметно светлее этой подложки, поэтому слой собирается
 * `chromaKey`, а не маской — в отличие от `far-fire`, где холмы были
 * почти чёрными и хромакей стёр их начисто.
 */
function farDoubles(seed = 877) {
  const rand = rng(seed);
  const out = [];
  const BANDS = [
    { lift: B * 2.6, step: 5, tiers: 2, pal: { base: '#6b6480', dark: '#5d5772', light: '#7a7290' } },
    { lift: B * 1.3, step: 4, tiers: 3, pal: { base: '#55506b', dark: '#49455d', light: '#625c7a' } },
    { lift: 0, step: 3, tiers: 4, pal: { base: '#403c54', dark: '#352f45', light: '#4b4663' } },
  ];
  for (const band of BANDS) {
    const baseY = GROUND - B - band.lift;
    for (let col = 0; col * B < W; col++) out.push(block(col * B, baseY, band.pal, rand));
    // Через равный шаг, а не случайно: в этом вся разница с сосняком тумана.
    for (let x = band.step * B; x < W; x += band.step * B) {
      for (let r = 0; r < band.tiers; r++) {
        const wide = band.tiers - r;
        for (let c = -wide + 1; c < wide; c++) {
          out.push(block(x + c * B, baseY - (r + 1) * B, band.pal, rand));
        }
      }
    }
  }
  return svg(out.join('\n'));
}

/**
 * Улица деревни в тумане. Домики нарочно одинаковые до последнего блока
 * и через равный шаг: сцена про копии, и двоиться должно всё, а не только
 * Стив. Три домика — больше кадр не держит, четвёртый лезет в правую
 * чистую полосу.
 *
 * Крыши подняты до 42% высоты, то есть выше 56% — там, где текста нет
 * ни при какой длине. Поставь их ниже, и от улицы в кадре остался бы один
 * конёк: это та же ловушка, на которой уже погорели щиты десятого дня
 * и ловушки одиннадцатого.
 *
 * Горки вещей — предмет задания сцены `count`, и они стоят на 75.6…89%
 * ширины. Контракт обещает, что текст кончается на 65%, но замер на кадре
 * 1280×760 даёт 68.5%: размеры в `vmin`, и на низком кадре блок шире.
 * Поэтому запас, а не впритык. Две горки, а не одна: вопрос звучит как
 * «сколько всего», то есть слагаемых должно быть видно два.
 */
function nearCopies(seed = 881) {
  const rand = rng(seed);
  const out = [];
  const LOG = '#6b4a28', LOG_TOP = '#8a6334', LOG_DARK = '#4e3519';
  const ROOF = '#6a4a62', ROOF_DARK = '#4f3749';
  const PANE = '#c9bda8';
  const SHIELD = '#8a6334', SHIELD_EDGE = '#4e3519', SHIELD_IRON = '#b9bcc6';

  // Домик: четыре блока в высоту, конёк из двух рядов, окно по центру.
  // Все три собираются одним и тем же кодом с одним и тем же seed-шагом —
  // иначе «одинаковые» перестанут быть одинаковыми.
  const house = (x0) => {
    for (let c = 0; c < 3; c++) {
      for (let r = 0; r < 4; r++) out.push(block(x0 + c * B, GROUND - B * (r + 1), P.plank, rand));
    }
    for (let c = -1; c <= 3; c++) {
      out.push(`<rect x="${n(x0 + c * B)}" y="${n(GROUND - B * 5)}" width="${B}" height="${B}" fill="${c % 2 ? ROOF : ROOF_DARK}"/>`);
    }
    out.push(`<rect x="${n(x0 + B * 1.2)}" y="${n(GROUND - B * 3.3)}" width="${n(B * 0.6)}" height="${n(B * 0.6)}" fill="${PANE}"/>`);
    out.push(`<rect x="${n(x0 + B * 1.1)}" y="${n(GROUND - B * 1.9)}" width="${n(B * 0.8)}" height="${n(B * 1.9)}" fill="${LOG}"/>`);
    out.push(`<rect x="${n(x0 + B * 1.1)}" y="${n(GROUND - B * 1.9)}" width="${n(B * 0.8)}" height="10" fill="${LOG_TOP}"/>`);
  };
  for (const col of [1, 8, 15]) house(col * B);

  // Фонарный столб между домиками: единственный тёплый огонёк в кадре,
  // и по нему видно, насколько густ туман.
  const lx = B * 4.6;
  out.push(`<rect x="${n(lx)}" y="${n(GROUND - B * 3.4)}" width="${n(B * 0.3)}" height="${n(B * 3.4)}" fill="${LOG_DARK}"/>`);

  // Две горки в правой чистой полосе — предмет задания сцены `count`.
  // Нарисованы ЩИТАМИ, а не блоками: вопрос там из области `raid`, то есть
  // про щиты, арбалеты, шлемы и плащи, а серый куб читается ровно «блоком»
  // и уводит ребёнка не туда. Проверено в прогоне: при блоках выпало
  // «сколько будет шесть плащей», и на экране лежали кубы.
  //
  // Щит тот же, что на гребне стены двенадцатого дня, только мельче:
  // силуэт у него свой, и в тумане он не спутается с постройкой.
  const shield = (x, y, sz) => {
    const h = sz * 1.3;
    out.push(`<path d="M ${n(x)} ${n(y)} h ${n(sz)} v ${n(h * 0.6)} l ${n(-sz / 2)} ${n(h * 0.4)} l ${n(-sz / 2)} ${n(-h * 0.4)} Z" fill="${SHIELD}" stroke="${SHIELD_EDGE}" stroke-width="6"/>`);
    out.push(`<rect x="${n(x + sz * 0.14)}" y="${n(y + h * 0.26)}" width="${n(sz * 0.72)}" height="${n(h * 0.16)}" fill="${SHIELD_IRON}"/>`);
    out.push(`<rect x="${n(x + sz * 0.4)}" y="${n(y + h * 0.1)}" width="${n(sz * 0.2)}" height="${n(h * 0.52)}" fill="${SHIELD_IRON}"/>`);
  };
  const pile = (x0, k) => {
    for (let i = 0; i < k; i++) {
      shield(x0 + i * B * 0.74, GROUND - B * 1.05 - (i % 2 ? B * 0.3 : 0), B * 0.66);
    }
  };
  pile(W * 0.73, 3);
  pile(W * 0.855, 3);

  return svg(`${groundRows(rand)}
${out.join('\n')}
${glow(lx + B * 0.15, GROUND - B * 3.5, B * 1.8)}
${torch(lx - B * 0.35, GROUND - B * 4)}
${mistBand()}`, GLOW_DEF);
}

/**
 * Иллюзионер. Роль `villain` освободилась вместе с драконом, и злодей
 * сезона — он. Сделан по тем же правилам, что разбойник: не страшный.
 * Лицо открыто, капюшон мягкий, руки подняты не для удара, а показывают
 * фокус — он скорее хвастается, чем угрожает.
 *
 * Узнают его по лиловому плащу: цвет дня и цвет тумана, из которого
 * выходят копии. У разбойников плащ серо-синий, у Алекс тёплый —
 * спутать не с кем.
 *
 * Пропорции взяты у Стива (16×32 «пикселей»), и это не лень, а замер:
 * первая версия была шире, с руками отдельными столбиками по краям,
 * и в прогоне читалась не человеком, а лиловым ящиком с двумя серыми
 * квадратами наверху. Руки теперь ПРИМЫКАЮТ к плащу — заходят на него
 * по высоте плеча, — а искры сидят ниже верха капюшона, чтобы самой
 * высокой точкой силуэта осталась голова.
 */
function illusioner() {
  const U = 20;
  const cloak = '#6b5a86', cloakDark = '#4a3d63', cloakLight = '#8273a0';
  const skin = '#9aa2a8', skinDark = '#7d858b';
  const eye = '#e4d8f2', brow = '#3a4048', spark = '#d9c9f2';

  const body = `
<!-- капюшон: самая высокая точка силуэта -->
${px(3.5 * U, 0, 9 * U, 3 * U, cloakDark)}
${px(3.5 * U, 3 * U, 1.2 * U, 5.4 * U, cloakDark)}
${px(11.3 * U, 3 * U, 1.2 * U, 5.4 * U, cloakDark)}

<!-- лицо открыто, как у разбойника -->
${px(4.7 * U, 2.6 * U, 6.6 * U, 5.8 * U, skin)}
${px(5.6 * U, 4.4 * U, 1.5 * U, U, eye)}
${px(8.9 * U, 4.4 * U, 1.5 * U, U, eye)}
${px(5.4 * U, 3.8 * U, 1.9 * U, 0.5 * U, brow)}
${px(8.7 * U, 3.8 * U, 1.9 * U, 0.5 * U, brow)}
${px(7.3 * U, 5.2 * U, 1.4 * U, 2.4 * U, skinDark)}

<!-- плащ -->
${px(3.5 * U, 8.4 * U, 9 * U, 12.8 * U, cloak)}
${px(3.5 * U, 8.4 * U, 9 * U, 0.9 * U, cloakLight)}
${px(7.6 * U, 9.3 * U, 0.8 * U, 11.9 * U, cloakDark)}

<!-- руки: подняты, но примыкают к плащу на высоте плеча -->
${px(0.9 * U, 4.6 * U, 2.6 * U, 5 * U, cloak)}
${px(12.5 * U, 4.6 * U, 2.6 * U, 5 * U, cloak)}
${px(0.9 * U, 3 * U, 2.6 * U, 1.6 * U, skin)}
${px(12.5 * U, 3 * U, 2.6 * U, 1.6 * U, skin)}
${px(1.3 * U, 1.3 * U, 1.8 * U, 1.5 * U, spark, ' opacity="0.85"')}
${px(12.9 * U, 1.3 * U, 1.8 * U, 1.5 * U, spark, ' opacity="0.85"')}

<!-- ноги -->
${px(4.2 * U, 21.2 * U, 3.6 * U, 8.8 * U, cloakDark)}
${px(8.2 * U, 21.2 * U, 3.6 * U, 8.8 * U, cloakDark)}
${px(4.2 * U, 30 * U, 3.6 * U, 2 * U, '#352c44')}
${px(8.2 * U, 30 * U, 3.6 * U, 2 * U, '#352c44')}`;

  return charSvg(body, 16 * U, 32 * U);
}

/**
 * Двойник Стива. Тот же силуэт блок в блок — иначе ребёнок отличал бы
 * копию по рисунку, а не по тому, что говорит история, и задание сцены
 * `street` пропало бы зря. Разница ровно одна и видна только вместе
 * с настоящим рядом: копия вымыта в лиловое и прозрачна.
 *
 * Прозрачность задана группе целиком, а не каждому блоку: иначе края
 * соседних прямоугольников просвечивают друг через друга и копия
 * выходит в полоску. Покачивания `idle` у неё нет — она не дышит,
 * и в сцене `nose` про это сказано вслух.
 */
function steveGhost() {
  const U = 20;
  const skin = '#9b93b0', hair = '#53496b', shirt = '#7f9fb8';
  const legs = '#6a6a9c', shoe = '#5e5a74', eye = '#e8e4f2', iris = '#53496b';

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
${px(6.5 * U, 5.5 * U, 3 * U, 0.8 * U, '#7d7593')}

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

  // Копия не дышит: `idle` ей не нужен, нужна прозрачность группы.
  return charSvg(body, 16 * U, 32 * U,
    '.idle { animation: none; opacity: 0.62 }');
}

/* ---------------- сборка ---------------- */

/* ---- пятнадцатый день: тёмный лес ---- */

// Палитры тёмного леса. Трава и земля здесь свои, и это можно: все четыре
// ближних слоя опушки и чащи — свои же, а `near-gate`, `near-river`
// и `near-library` — другие места, где земля и должна быть другой.
// Тон зелёный, а не чёрный: лес сумрачный, но не страшный.
const WOODS = {
  grass: { base: '#3f6b3a', dark: '#2f5230', light: '#4f7f45' },
  dirt:  { base: '#5e4a33', dark: '#46372a', light: '#715a3e' },
  // Ближние ели темнее дальних: на первом предпросмотре они были одного
  // цвета с нижним рядом `far-dark-woods` и пропадали в нём.
  pine:  { base: '#143520', dark: '#0d2716', light: '#1d452a' },
  oak:   { base: '#4a3420', dark: '#36261a', light: '#5c4229' },
};

/**
 * Сумрак под кронами днём. Такого цвета в каталоге не было: зелёный сверху
 * и светлая дымка у горизонта. Светила нет — его закрывают кроны.
 */
function skyWoods() {
  const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#1d3527"/><stop offset="0.45" stop-color="#365c42"/>
    <stop offset="0.78" stop-color="#7f9f7a"/>
    <stop offset="1" stop-color="#b9cfa8"/></linearGradient></defs>`;
  return svg(`<rect width="${W}" height="${H}" fill="url(#g)"/>
${clouds(151, '#2b4a35', 0.45)}
${clouds(152, '#9fbb92', 0.22)}`, defs);
}

/**
 * Стена ёлок в три ряда, густо и вплотную: чаща, а не роща. Ели темнее
 * подложки `rasterInit` только в нижнем ряду, поэтому слой собирается
 * маской-силуэтом (`keepAlpha`), как `far-doubles`, — хромакей стёр бы его.
 */
function farDarkWoods(seed = 941) {
  const rand = rng(seed);
  const out = [];
  const BANDS = [
    { lift: B * 2.8, step: 2, tiers: 3, pal: { base: '#4d6e55', dark: '#43614a', light: '#58795f' } },
    { lift: B * 1.4, step: 2, tiers: 4, pal: { base: '#33573d', dark: '#2a4a33', light: '#3d6447' } },
    { lift: 0, step: 3, tiers: 5, pal: { base: '#28503a', dark: '#204430', light: '#315c43' } },
  ];
  for (const band of BANDS) {
    const baseY = GROUND - B - band.lift;
    for (let col = 0; col * B < W; col++) out.push(block(col * B, baseY, band.pal, rand));
    for (let x = Math.floor(rand() * band.step) * B; x < W + B; x += band.step * B) {
      const tiers = band.tiers + Math.floor(rand() * 2);
      for (let r = 0; r < tiers; r++) {
        const wide = Math.ceil((tiers - r) / 2);
        for (let c = -wide + 1; c < wide; c++) {
          out.push(block(x + c * B, baseY - (r + 1) * B, band.pal, rand));
        }
      }
    }
  }
  return svg(out.join('\n'));
}

/** Тёмная ель из кубов: ствол и ярусы хвои, нижний ярус шире. */
function darkPine(x, tiers, rand) {
  const out = [block(x, GROUND - B, WOODS.oak, rand)];
  for (let r = 0; r < tiers; r++) {
    const wide = Math.ceil((tiers - r) / 2) + 1;
    for (let c = -wide + 1; c < wide; c++) {
      out.push(block(x + c * B, GROUND - B * 2 - r * B, WOODS.pine, rand));
    }
  }
  return out.join('\n');
}

/**
 * Опушка: слева ели кулисой, справа ещё светлый край луга. Ели только
 * у левого края и одна справа — середина под героев, правая полоса
 * под предмет задания (искры, факелы).
 */
function nearWoodsEdge(seed = 947) {
  const rand = rng(seed);
  return svg(`${groundRows(rand, WOODS.grass, WOODS.dirt)}
${darkPine(B, 7, rand)}
${darkPine(B * 5, 6, rand)}
${darkPine(W - B, 7, rand)}`);
}

/**
 * Чаща. Ели по обоим краям, слева поперёк лежит упавший ствол — о нём
 * говорит развилка `fork`. Ручья здесь нет: правая полоса у земли занята
 * предметом задания сцены `circle`, и ряд шишек лёг бы прямо в воду.
 * Ручей показан в своей сцене `brook`.
 */
function nearThicket(seed = 953) {
  const rand = rng(seed);
  const out = [];
  // Упавшее дерево: ствол лежит на земле, у комля торчат корни.
  for (let c = 0; c < 5; c++) out.push(block(B * (3 + c), GROUND - B, WOODS.oak, rand));
  out.push(`<rect x="${n(B * 3 - 18)}" y="${n(GROUND - B * 0.9)}" width="18" height="${n(B * 0.5)}" fill="${WOODS.oak.dark}"/>`);
  return svg(`${groundRows(rand, WOODS.grass, WOODS.dirt)}
${out.join('\n')}
${darkPine(B, 8, rand)}
${darkPine(B * 4, 6, rand)}
${darkPine(W - B * 2, 8, rand)}
${darkPine(W - B * 5, 6, rand)}`);
}

/**
 * Стена поперёк тропы — предмет задания сцены `wall`: из неё «сняли»
 * столько-то блоков и камней. Стоит на 60…90% ширины и поднимается
 * до 42% высоты, то есть видна над текстом и правее его. Кладка
 * вперемешку из блока (дерево) и камня — оба слова области `blocks`.
 */
function nearBlockWall(seed = 959) {
  const rand = rng(seed);
  const out = [];
  const EDGE = '#2e2a24';
  for (let c = 19; c < 29; c++) {
    const h = 5 - (c % 3 === 0 ? 1 : 0);
    for (let r = 0; r < h; r++) {
      const pal = (c + r) % 2 ? P.stone : P.plank;
      out.push(block(c * B, GROUND - B * (r + 1), pal, rand));
      out.push(`<rect x="${n(c * B)}" y="${n(GROUND - B * (r + 1))}" width="${B}" height="${B}" fill="none" stroke="${EDGE}" stroke-width="3"/>`);
    }
  }
  return svg(`${groundRows(rand, WOODS.grass, WOODS.dirt)}
${darkPine(B, 8, rand)}
${darkPine(B * 4, 6, rand)}
${out.join('\n')}
${darkPine(W - B, 8, rand)}`);
}

/**
 * Огромный тёмный дом на поляне — крючок на шестнадцатый день. Стоит
 * в правой половине и поднимается до 15% высоты: и над текстом, и правее
 * его. В верхнем окне светится тыква с ворот — её увели в первой сцене,
 * и тут её надо узнать с первого взгляда, поэтому она крупная.
 * Дверь внизу справа: у неё стоят копии из `cast`.
 */
function nearDarkHouse(seed = 967) {
  const rand = rng(seed);
  const out = [];
  const HX = 17, HW = 13, FLOORS = 7;
  const PUMPKIN = '#d98022', PUMPKIN_DARK = '#7a3f0c', LILAC = '#b58be8';
  for (let c = 0; c < HW; c++) {
    for (let r = 0; r < FLOORS; r++) {
      // Тёмный дуб с колоннами из брёвен через каждые четыре блока.
      const pal = c % 4 === 0 ? WOODS.oak : P.deep;
      out.push(block((HX + c) * B, GROUND - B * (r + 1), pal, rand));
    }
  }
  // Крыша ступенями.
  for (let step = 0; step < 3; step++) {
    const y = GROUND - B * (FLOORS + 1 + step);
    for (let c = step - 1; c < HW - step + 1; c++) {
      out.push(`<rect x="${n((HX + c) * B)}" y="${n(y)}" width="${B}" height="${B}" fill="${step % 2 ? '#2a1f2e' : '#3a2b3f'}"/>`);
    }
  }
  // Окна: тёмные, кроме одного — лиловый свет и тыква.
  for (const [c, r] of [[2, 5], [6, 5], [10, 2], [2, 2], [6, 2]]) {
    out.push(`<rect x="${n((HX + c) * B)}" y="${n(GROUND - B * (r + 1))}" width="${B}" height="${n(B * 1.3)}" fill="#1a1622"/>`);
  }
  const wx = (HX + 9.5) * B, wy = GROUND - B * 6.2;
  out.push(`<rect x="${n(wx)}" y="${n(wy)}" width="${n(B * 2)}" height="${n(B * 1.8)}" fill="${LILAC}"/>`);
  const px0 = wx + B * 0.3, py0 = wy + B * 0.3, ps = B * 1.4;
  out.push(`<rect x="${n(px0)}" y="${n(py0)}" width="${n(ps)}" height="${n(ps)}" fill="${PUMPKIN}"/>`);
  out.push(`<rect x="${n(px0 + ps * 0.18)}" y="${n(py0 + ps * 0.28)}" width="${n(ps * 0.18)}" height="${n(ps * 0.18)}" fill="${PUMPKIN_DARK}"/>`);
  out.push(`<rect x="${n(px0 + ps * 0.64)}" y="${n(py0 + ps * 0.28)}" width="${n(ps * 0.18)}" height="${n(ps * 0.18)}" fill="${PUMPKIN_DARK}"/>`);
  out.push(`<rect x="${n(px0 + ps * 0.28)}" y="${n(py0 + ps * 0.62)}" width="${n(ps * 0.44)}" height="${n(ps * 0.14)}" fill="${PUMPKIN_DARK}"/>`);
  // Дверь в две створки.
  const dx = (HX + 5) * B;
  out.push(`<rect x="${n(dx)}" y="${n(GROUND - B * 2.4)}" width="${n(B * 2)}" height="${n(B * 2.4)}" fill="#24180f"/>`);
  out.push(`<rect x="${n(dx + B - 3)}" y="${n(GROUND - B * 2.4)}" width="6" height="${n(B * 2.4)}" fill="#3a2a1c"/>`);
  return svg(`${groundRows(rand, WOODS.grass, WOODS.dirt)}
${darkPine(B, 8, rand)}
${darkPine(B * 4, 6, rand)}
${out.join('\n')}`);
}

/**
 * Цепочка лиловых искр — след иллюзиониста. Предмет `cast`, а не часть
 * слоя: тот же след лежит и у ворот, и на опушке. Цвет его плаща и тумана
 * тринадцатого дня, чтобы ребёнок узнал хозяина без подсказки.
 */
function sparks() {
  const U = 20;
  const lilac = '#b58be8', hi = '#f0e2ff', dark = '#7a52b5';
  const dots = [[0.4, 3.4, 1.1], [2.4, 2.6, 0.9], [4.2, 3.2, 1.2], [6.2, 2.2, 0.8],
    [8, 2.9, 1.1], [9.8, 1.8, 0.9], [11.4, 2.5, 1]];
  const body = dots.map(([x, y, s]) => `
${px(x * U, y * U, s * U, s * U, lilac)}
${px((x + s * 0.3) * U, (y - s * 0.6) * U, s * 0.4 * U, s * 0.4 * U, hi)}
${px(x * U, (y + s) * U, s * U, 0.25 * U, dark)}`).join('');
  return charSvg(body, 12.6 * U, 4.6 * U, '.idle { animation: none }');
}

/**
 * Факелы вдоль тропы — предмет задания сцены `torches`. Две кучки, а не
 * ряд: вопрос звучит «столько и ещё столько», и слагаемых должно быть
 * видно два.
 */
function torchRow() {
  const U = 20;
  const stick = '#7a5630', flame = '#ffb13b', core = '#fff0b0';
  const one = (x) => `
${px(x * U + 0.7 * U, 1.6 * U, 0.6 * U, 3.4 * U, stick)}
${px(x * U + 0.4 * U, 0.5 * U, 1.2 * U, 1.2 * U, flame)}
${px(x * U + 0.7 * U, 0.2 * U, 0.6 * U, 0.6 * U, core)}`;
  const body = [0, 2, 4, 9, 11, 13, 15].map(one).join('');
  return charSvg(body, 17 * U, 5 * U, '.idle { animation: none }');
}

/**
 * Ряд лесных вещей по очереди — предмет задания сцены `circle`. Именно
 * чередование ПАРЫ, шишка-ягода, а не шесть разных вещей: вопрос
 * у `pattern` всегда про пару (урок четырнадцатого дня).
 */
function coneRow() {
  const U = 20;
  const cone = '#7a5230', coneDark = '#553619', berry = '#c0392b', berryHi = '#f19a8e', leaf = '#3d8148';
  const shishka = (x) => `
${px(x * U + 0.3 * U, 0.8 * U, 1.4 * U, 2.6 * U, cone)}
${px(x * U + 0.3 * U, 1.6 * U, 1.4 * U, 0.3 * U, coneDark)}
${px(x * U + 0.3 * U, 2.5 * U, 1.4 * U, 0.3 * U, coneDark)}
${px(x * U + 0.7 * U, 0.3 * U, 0.6 * U, 0.6 * U, coneDark)}`;
  // Ягода, а не гриб: «гриб» — слово Нижнего мира, и в тройки леса
  // он не попал. Ряд показывает ту же пару, о которой спрашивают.
  const yagoda = (x) => `
${px(x * U + 0.7 * U, 0.4 * U, 0.8 * U, 0.6 * U, leaf)}
${px(x * U + 0.2 * U, 1.0 * U, 1.8 * U, 1.8 * U, berry)}
${px(x * U + 0.5 * U, 1.3 * U, 0.5 * U, 0.5 * U, berryHi)}
${px(x * U + 0.2 * U, 2.6 * U, 1.8 * U, 0.3 * U, '#8e2a20')}`;
  const body = [0, 3, 6, 9, 12, 15].map((x, i) => (i % 2 ? yagoda(x) : shishka(x))).join('');
  return charSvg(body, 17.4 * U, 3.6 * U, '.idle { animation: none }');
}

console.log('Небо:');
write('assets/mc/sky-day.svg', skyDay());
write('assets/mc/sky-sunset.svg', skySunset());
write('assets/mc/sky-night.svg', skyNight());
write('assets/mc/sky-dawn.svg', skyDawn());
write('assets/mc/sky-void.svg', skyVoid());
write('assets/mc/sky-storm.svg', skyStorm());
write('assets/mc/sky-fog.svg', skyFog());
write('assets/mc/sky-fire.svg', skyFire());
write('assets/mc/sky-mist.svg', skyMist());
write('assets/mc/sky-woods.svg', skyWoods());
write('assets/mc/sun-day.svg', celestial(1500, 220, 88, '#ffe873', '#fff3b0'));
write('assets/mc/sun-sunset.svg', celestial(1420, 600, 86, '#ffc24d', '#ff9d5c'));
write('assets/mc/moon-night.svg', celestial(1500, 230, 74, '#f2f5fb', '#c9d8f2', 90));
write('assets/mc/sun-dawn.svg', celestial(430, 640, 80, '#ffd98a', '#ffb878'));
write('assets/mc/stars-void.svg', starsVoid());
write('assets/mc/stars-embers.svg', starsEmbers());

console.log('Дальний план:');
write('assets/mc/far-hills.svg', farHills());
write('assets/mc/far-cave.svg', farCave());
write('assets/mc/far-river.svg', farRiver());
write('assets/mc/far-pines.svg', farPines());
write('assets/mc/far-deep.svg', farDeep());
write('assets/mc/far-lava.svg', farLava());
write('assets/mc/far-nether-sea.svg', farNetherSea());
write('assets/mc/far-ravine.svg', farRavine());
write('assets/mc/far-stronghold.svg', farStronghold());
write('assets/mc/far-end-island.svg', farEndIsland());
write('assets/mc/far-smoke.svg', farSmoke());
write('assets/mc/far-pines-fog.svg', farPinesFog());
write('assets/mc/far-fire.svg', farFire());
write('assets/mc/far-doubles.svg', farDoubles());
write('assets/mc/far-dark-woods.svg', farDarkWoods());

/* ---------------- четырнадцатый день ---------------- */

/**
 * Ворота деревни утром после рейда: стена починена, над проёмом висит
 * оберег, по гребню стоят щиты.
 *
 * Проём стоит СПРАВА, на 69…78% ширины, а не в середине, как у прежних
 * стен. Причина не в композиции, а в замере чистой зоны: текст занимает
 * 3…65% ширины и всё ниже 56% высоты, поэтому середина у земли — это
 * «под панелью». А у этой сцены у самых ворот лежит деталь-намёк
 * пасхалки, и её надо видеть.
 *
 * Щиты — предмет задания сцены `gate`, и считают их по этому кадру.
 * Поэтому они на ГРЕБНЕ (выше 56% высоты), как в десятом дне, а не
 * у подножия. И именно щиты, а не кубы: вопрос идёт из области `raid`,
 * где слова — щит, арбалет, шлем и плащ, и в тринадцатом дне горка
 * железных блоков под такой вопрос уже оказалась не тем предметом.
 *
 * Ряд вдоль правого участка гребня — предмет задания сцены `charm`:
 * чередование из блока, тыквы, факела, щита, кирпича и камня лежит
 * по порядку, и это то, про что спрашивает вопрос.
 *
 * Земля обычная, `P.grass`/`P.dirt`: свою палитру заводить нельзя —
 * день берёт готовые near-breach, near-bell, near-village и near-house,
 * и земля запрыгала бы от сцены к сцене (грабля тринадцатого дня).
 */
function nearGate(seed = 914, { bare = false } = {}) {
  const rand = rng(seed);
  const out = [];
  const EDGE = '#3f3c35';
  const SHIELD = '#8a6334', SHIELD_EDGE = '#45301a', SHIELD_IRON = '#d2d2d8';
  const LOG = '#7a5630', LOG_TOP = '#8f6a40', LOG_DARK = '#5a3f22';
  const ROOF = '#9c4b3c', ROOF_DARK = '#7a392c';
  const GOLD = '#e8c04a', GOLD_HI = '#fff0b0';
  const PUMPKIN = '#d98022', PUMPKIN_DARK = '#a85c14', STEM = '#4e7c3a';
  const IRON = '#d2d2d8', IRON_DARK = '#9a9aa2';

  const cols = Math.ceil(W / B) + 1;
  const gate = [22, 23, 24];

  // Крыши деревни за стеной: она жилая, и это должно читаться без
  // подписи. Выше стены, иначе их не видно вовсе.
  const roof = (hx, hw) => {
    const base = GROUND - B * 5.6;
    for (let c = 0; c < hw; c++) {
      for (let r = 0; r < 2; r++) out.push(block(hx + c * B, base - r * B, P.plank, rand));
    }
    for (let step = 0; step < 3; step++) {
      const y = base - B * (2 + step);
      for (let c = step; c < hw - step; c++) {
        out.push(`<rect x="${n(hx + c * B)}" y="${n(y)}" width="${B}" height="${B}" fill="${step % 2 ? ROOF_DARK : ROOF}"/>`);
      }
    }
  };
  roof(B * 2, 5);
  roof(B * 12.5, 5);

  // Стена целая на всю длину: пролом как раз и заделали. Тёмная кромка
  // по верхнему ряду — без неё светлый камень сливается с холмами.
  for (let c = 0; c < cols; c++) {
    if (gate.includes(c)) continue;
    for (let r = 0; r < 5; r++) out.push(block(c * B, GROUND - B * (r + 1), P.sbrick, rand));
    out.push(`<rect x="${n(c * B)}" y="${n(GROUND - B * 5)}" width="${B}" height="10" fill="${EDGE}"/>`);
  }

  // Свежая заплата на месте пролома двенадцатого дня: тот же камень,
  // но светлее. Из кадра видно, что стену именно починили.
  for (let c = 17; c < 21; c++) {
    for (let r = 0; r < 5; r++) out.push(block(c * B, GROUND - B * (r + 1), P.stone, rand));
  }

  // Щиты на гребне — две стопки по краям от середины, их считают.
  const stacks = [{ col: 3.6, k: 3 }, { col: 13.6, k: 4 }];
  const busy = new Set(stacks.flatMap(st => [0, 1, 2].map(d => Math.floor(st.col) + d)));

  // Зубцы через один по левой части: по ним и видно, что это стена.
  for (let c = 0; c < 17; c += 2) {
    if (busy.has(c)) continue;
    out.push(block(c * B, GROUND - B * 6, P.sbrick, rand));
    out.push(`<rect x="${n(c * B)}" y="${n(GROUND - B * 6)}" width="${B}" height="10" fill="${EDGE}"/>`);
  }

  const shield = (x, y, s) => {
    const h = s * 1.3;
    out.push(`<path d="M ${n(x)} ${n(y)} h ${n(s)} v ${n(h * 0.6)} l ${n(-s / 2)} ${n(h * 0.4)} l ${n(-s / 2)} ${n(-h * 0.4)} Z" fill="${SHIELD}" stroke="${SHIELD_EDGE}" stroke-width="6"/>`);
    out.push(`<rect x="${n(x + s * 0.14)}" y="${n(y + h * 0.26)}" width="${n(s * 0.72)}" height="${n(h * 0.16)}" fill="${SHIELD_IRON}"/>`);
    out.push(`<rect x="${n(x + s * 0.4)}" y="${n(y + h * 0.1)}" width="${n(s * 0.2)}" height="${n(h * 0.52)}" fill="${SHIELD_IRON}"/>`);
  };
  for (const st of stacks) {
    for (let i = 0; i < st.k; i++) {
      shield(st.col * B + i * B * 0.62, GROUND - B * 5 - B * 0.86 + i * 6, B * 0.78);
    }
  }

  // Ворота: створки по краям проёма и перекладина над ним. Проём пустой —
  // в него уходят персонажи, и туда же смотрит ребёнок.
  const gx = gate[0] * B;
  for (const x of [gx, gx + B * 2]) {
    out.push(`<rect x="${n(x + 4)}" y="${n(GROUND - B * 4.4)}" width="${n(B - 8)}" height="${n(B * 4.4)}" fill="${LOG}"/>`);
    out.push(`<rect x="${n(x + 4)}" y="${n(GROUND - B * 4.4)}" width="${n(B - 8)}" height="14" fill="${LOG_TOP}"/>`);
    out.push(`<rect x="${n(x + B - 11)}" y="${n(GROUND - B * 4.4)}" width="7" height="${n(B * 4.4)}" fill="${LOG_DARK}"/>`);
  }
  const beamY = GROUND - B * 4.7;
  out.push(`<rect x="${n(gx - 10)}" y="${n(beamY)}" width="${n(B * 3 + 20)}" height="22" fill="${LOG_DARK}"/>`);

  // Оберег над проёмом: тыква в железном ободке на двух верёвках.
  // Висит на 41% высоты — выше панели с текстом, и он же даёт обложке
  // цветное пятно, какого нет ни у одной прежней.
  const cx = gx + B * 1.5, cy = beamY + B * 1.5;
  for (const dx of [-B * 0.42, B * 0.42]) {
    // У пустых ворот пятнадцатого дня тыкву унесли: верёвки обрываются
    // короче, и пустота под перекладиной видна сразу.
    const rope = bare ? B * 0.3 : B * 0.62;
    out.push(`<rect x="${n(cx + dx - 4)}" y="${n(beamY + 20)}" width="8" height="${n(rope)}" fill="${LOG_DARK}"/>`);
  }
  if (!bare) {
  out.push(`<rect x="${n(cx - B * 0.66)}" y="${n(cy - B * 0.66)}" width="${n(B * 1.32)}" height="${n(B * 1.32)}" fill="${PUMPKIN}"/>`);
  out.push(`<rect x="${n(cx - B * 0.66)}" y="${n(cy + B * 0.32)}" width="${n(B * 1.32)}" height="${n(B * 0.34)}" fill="${PUMPKIN_DARK}"/>`);
  out.push(`<rect x="${n(cx - B * 0.12)}" y="${n(cy - B * 0.9)}" width="${n(B * 0.24)}" height="${n(B * 0.26)}" fill="${STEM}"/>`);
  // Глаза и рот кубиками: без них тыква читается оранжевым кубом.
  out.push(`<rect x="${n(cx - B * 0.44)}" y="${n(cy - B * 0.3)}" width="${n(B * 0.2)}" height="${n(B * 0.2)}" fill="${PUMPKIN_DARK}"/>`);
  out.push(`<rect x="${n(cx + B * 0.24)}" y="${n(cy - B * 0.3)}" width="${n(B * 0.2)}" height="${n(B * 0.2)}" fill="${PUMPKIN_DARK}"/>`);
  out.push(`<rect x="${n(cx - B * 0.3)}" y="${n(cy + B * 0.04)}" width="${n(B * 0.6)}" height="${n(B * 0.16)}" fill="${PUMPKIN_DARK}"/>`);
  // Железный ободок — уголками, а не рамкой: рамка закрыла бы лицо.
  for (const [ox, oy] of [[-0.72, -0.72], [0.52, -0.72], [-0.72, 0.52], [0.52, 0.52]]) {
    out.push(`<rect x="${n(cx + B * ox)}" y="${n(cy + B * oy)}" width="${n(B * 0.2)}" height="${n(B * 0.2)}" fill="${IRON}"/>`);
    out.push(`<rect x="${n(cx + B * ox)}" y="${n(cy + B * oy + B * 0.14)}" width="${n(B * 0.2)}" height="${n(B * 0.06)}" fill="${IRON_DARK}"/>`);
  }
  }

  // Чередование вдоль правого участка гребня — предмет задания сцены
  // `charm`. Шесть вещей по порядку: блок, тыква, факел, щит, кирпич,
  // камень. Стоят выше 56% высоты и правее 65% ширины, то есть в чистой
  // зоне дважды.
  //
  // Под рядом — деревянная полка с тёмной кромкой. Без неё в предпросмотре
  // серый блок и серый камень сливались с гребнем, и из шести вещей
  // читались четыре: ряд, который надо продолжить, был неполон.
  if (!bare) {
  const rowY = GROUND - B * 5 - B * 0.92;
  const rowX = 24.9 * B, rowW = B * 6.5;
  out.push(`<rect x="${n(rowX - 10)}" y="${n(rowY + B * 0.82)}" width="${n(rowW)}" height="18" fill="${LOG}"/>`);
  out.push(`<rect x="${n(rowX - 10)}" y="${n(rowY + B * 0.82 + 18)}" width="${n(rowW)}" height="8" fill="${LOG_DARK}"/>`);
  //
  // Ряд — именно ЧЕРЕДОВАНИЕ щита и кирпича, а не шесть разных вещей.
  // Сперва было шесть: блок, тыква, факел, щит, кирпич, камень — по одной
  // на каждое слово троек. Но вопрос у `pattern` всегда про пару
  // («щит, кирпич, щит, кирпич, а потом?»), и шесть разных предметов
  // показывали ребёнку не то, о чём спрашивают. Остальные слова троек
  // в кадре и так есть: тыква — это оберег над проёмом, факел — на гребне,
  // блок и камень — сама стена.
  const row = [
    ['shield'], ['brick', P.plank], ['shield'],
    ['brick', P.plank], ['shield'], ['brick', P.plank],
  ];
  row.forEach(([kind, pal], i) => {
    const x = rowX + i * B * 1.06;
    if (kind === 'pumpkin') {
      out.push(`<rect x="${n(x)}" y="${n(rowY + B * 0.1)}" width="${n(B * 0.7)}" height="${n(B * 0.7)}" fill="${PUMPKIN}"/>`);
      out.push(`<rect x="${n(x + B * 0.26)}" y="${n(rowY - B * 0.08)}" width="${n(B * 0.18)}" height="${n(B * 0.18)}" fill="${STEM}"/>`);
    } else if (kind === 'torch') {
      out.push(torch(x - B * 0.15, rowY - B * 0.1));
    } else if (kind === 'shield') {
      shield(x, rowY + B * 0.04, B * 0.64);
    } else {
      out.push(block(x, rowY + B * 0.1, pal, rand, B * 0.7));
      out.push(`<rect x="${n(x)}" y="${n(rowY + B * 0.1)}" width="${n(B * 0.7)}" height="${n(B * 0.7)}" fill="none" stroke="${EDGE}" stroke-width="5"/>`);
    }
  });
  }

  // ПАСХАЛКА. Деталь-намёк: следы копытец из проёма и золотой самородок
  // рядом. Мелкая нарочно — намёк, а не эпизод; поэтому и слой в покраску
  // не идёт, нейросеть такую крапину раздувает или вымывает.
  // Место — 69…79% ширины у самой земли: правее 65% текста, то есть
  // видно; и ровно «у самых ворот», как сказано в тексте сцены.
  // Пасхалка выходит только по чётным дням: у пустых ворот её нет.
  if (!bare) {
  const HOOF = '#5e4a35';
  for (const [hx, hy, s] of [
    [22.4, 0.22, 1], [22.9, 0.44, 0.92], [23.5, 0.3, 1], [24.1, 0.56, 0.88],
    [24.7, 0.4, 0.95], [25.3, 0.66, 0.84],
  ]) {
    const x = hx * B, y = GROUND + hy * B, w = 15 * s;
    out.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(w * 1.2)}" fill="${HOOF}" opacity="0.72"/>`);
    out.push(`<rect x="${n(x + w * 1.25)}" y="${n(y + w * 0.3)}" width="${n(w)}" height="${n(w * 1.2)}" fill="${HOOF}" opacity="0.72"/>`);
  }
  const nx = 25.9 * B, ny = GROUND + B * 0.5;
  // Самородок крупнее первого замера: на 22 пикселя ширины он после
  // сжатия при зеркалировании на телевизор превращался в точку, а намёк,
  // который не разглядеть, — это отсутствующий намёк.
  out.push(`<rect x="${n(nx)}" y="${n(ny)}" width="34" height="26" fill="${GOLD}"/>`);
  out.push(`<rect x="${n(nx + 6)}" y="${n(ny + 4)}" width="14" height="10" fill="${GOLD_HI}"/>`);
  out.push(`<rect x="${n(nx - 20)}" y="${n(ny + 12)}" width="18" height="14" fill="${GOLD}"/>`);
  out.push(`<rect x="${n(nx + 44)}" y="${n(ny - 6)}" width="13" height="11" fill="${GOLD}"/>`);
  }

  // Факелы по гребню с ореолом: на рассвете они ещё горят, и это
  // единственное тёплое пятно на левой половине кадра.
  const fires = [[B * 7, 6], [B * 11, 6], [B * 19, 5]];
  const halo = fires.map(([x, h]) => glow(x + B * 0.5, GROUND - B * h - B * 0.2, B * 2.2)).join('\n');
  const flame = fires.map(([x, h]) => torch(x, GROUND - B * (h + 1))).join('\n');

  return svg(`${groundRows(rand)}
${out.join('\n')}
${halo}
${flame}`, GLOW_DEF);
}

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
write('assets/mc/near-library.svg', nearLibrary());
write('assets/mc/near-frame.svg', nearFrame());
write('assets/mc/near-end-pillar.svg', nearEndPillar());
write('assets/mc/near-end-gate.svg', nearEndGate());
write('assets/mc/near-village.svg', nearVillage());
write('assets/mc/near-ritual.svg', nearRitual());
write('assets/mc/near-wall.svg', nearWall());
write('assets/mc/near-bell.svg', nearBell());
write('assets/mc/near-traps.svg', nearTraps());
write('assets/mc/near-outpost.svg', nearOutpost());
write('assets/mc/near-breach.svg', nearBreach());
write('assets/mc/near-copies.svg', nearCopies());
write('assets/mc/near-gate.svg', nearGate());
write('assets/mc/near-gate-bare.svg', nearGate(914, { bare: true }));
write('assets/mc/near-woods-edge.svg', nearWoodsEdge());
write('assets/mc/near-thicket.svg', nearThicket());
write('assets/mc/near-block-wall.svg', nearBlockWall());
write('assets/mc/near-dark-house.svg', nearDarkHouse());

console.log('Персонажи:');
write('assets/mc/steve.svg', steve());
write('assets/mc/creeper.svg', creeper());
write('assets/mc/cow.svg', cow());
write('assets/mc/sheep.svg', sheep());
write('assets/mc/wolf.svg', wolf());
write('assets/mc/villager.svg', villager());
write('assets/mc/piglin.svg', piglin());
write('assets/mc/bat.svg', bat());
write('assets/mc/dragon.svg', dragon());
write('assets/mc/alex.svg', alex());
write('assets/mc/golem.svg', golem());
write('assets/mc/cart.svg', cart());
write('assets/mc/pumpkin.svg', pumpkin());
write('assets/mc/gold-glint.svg', goldGlint());
write('assets/mc/pillager-axe.svg', pillager('axe'));
write('assets/mc/pillager-mace.svg', pillager('mace'));
write('assets/mc/pillager-bow.svg', pillager('bow'));
write('assets/mc/pillager-sword.svg', pillager('sword'));
write('assets/mc/cage.svg', cage());
write('assets/mc/illusioner.svg', illusioner());
write('assets/mc/steve-ghost.svg', steveGhost());
write('assets/mc/sparks.svg', sparks());
write('assets/mc/torch-row.svg', torchRow());
write('assets/mc/cone-row.svg', coneRow());

console.log('\nГотово.');
