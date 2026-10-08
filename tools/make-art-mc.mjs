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
/* ---------------- сборка ---------------- */

console.log('Небо:');
write('assets/mc/sky-day.svg', skyDay());
write('assets/mc/sky-sunset.svg', skySunset());
write('assets/mc/sky-night.svg', skyNight());
write('assets/mc/sky-dawn.svg', skyDawn());
write('assets/mc/sky-void.svg', skyVoid());
write('assets/mc/sun-day.svg', celestial(1500, 220, 88, '#ffe873', '#fff3b0'));
write('assets/mc/sun-sunset.svg', celestial(1420, 600, 86, '#ffc24d', '#ff9d5c'));
write('assets/mc/moon-night.svg', celestial(1500, 230, 74, '#f2f5fb', '#c9d8f2', 90));
write('assets/mc/sun-dawn.svg', celestial(430, 640, 80, '#ffd98a', '#ffb878'));
write('assets/mc/stars-void.svg', starsVoid());

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
write('assets/mc/pillager-axe.svg', pillager('axe'));
write('assets/mc/pillager-mace.svg', pillager('mace'));
write('assets/mc/pillager-bow.svg', pillager('bow'));
write('assets/mc/pillager-sword.svg', pillager('sword'));

console.log('\nГотово.');
