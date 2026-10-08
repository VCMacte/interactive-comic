// Прогон всех слоёв локаций через img2img Easy Diffusion.
//
// Композиция берётся с наших векторных слоёв: линия земли на 70%, свободный
// центр под персонажей, кулисы по краям. Нейросеть их только расписывает.
// Генерировать «с нуля» нельзя — вернётся красивая картинка с землёй где
// попало, и персонажи повиснут в воздухе.
//
// Запуск: node tools/paint-layers.mjs [имя слоя ...]

import { spawnSync } from 'node:child_process';

// Стиль описан нарочно жёстко: нейросеть склонна сглаживать кубы в холмики,
// а здесь вся узнаваемость держится на чётких гранях.
const STYLE = 'blocky voxel game world, large cubic blocks, crisp square edges, '
  + 'flat saturated colors, pixel art texture, no blur, no soft shading';
const NEG = 'text, letters, watermark, signature, frame, border, people, person, character, '
  + 'blurry, soft focus, smooth gradients, rounded shapes, realistic, photo, lowres';

const LAYERS = {
  'mc/sky-day': {
    strength: 0.42,
    prompt: `bright blue daytime sky with chunky square white clouds and a square sun, ${STYLE}, no ground, no trees`,
    negative: NEG + ', round clouds, round sun',
  },
  'mc/sky-sunset': {
    strength: 0.42,
    prompt: `sunset sky, orange and pink bands, chunky square clouds, square sun near the horizon, ${STYLE}, no ground, no trees`,
    negative: NEG + ', round clouds, round sun',
  },
  'mc/sky-night': {
    strength: 0.42,
    prompt: `dark blue night sky with a square moon, ${STYLE}, no ground, no trees`,
    negative: NEG + ', round moon, crescent moon, second moon',
  },
  'mc/far-hills': {
    strength: 0.34,
    prompt: `distant blocky hills of grass and dirt cubes with cubic trees, layered depth, ${STYLE}`,
    negative: NEG,
  },
  // Дальний план восьмого дня: те же холмы, но над ними три столба дыма.
  // Дым — единственное, ради чего слой красится отдельно от far-hills,
  // поэтому он назван в промпте дважды и вынесен в начало.
  'mc/far-smoke': {
    strength: 0.24,
    prompt: `three ragged columns of dark smoke rising from behind distant blocky hills, `
      + `smoke drifting sideways in the wind, orange glow of fire at the base, `
      + `grass and dirt cubes with cubic trees, layered depth, ${STYLE}`,
    negative: NEG + ', chimney, house, campfire ring, clouds',
  },
  'mc/far-cave': {
    strength: 0.34,
    prompt: `underground cave wall of stone cubes with coal and diamond ore blocks, torchlight, ${STYLE}`,
    negative: NEG + ', sky, sun, clouds',
  },

  // ---- второй день ----
  'mc/sky-dawn': {
    strength: 0.42,
    prompt: `early morning sky just after sunrise, pale pink and lilac bands turning to blue, chunky square clouds, ${STYLE}, no ground, no trees`,
    // Светило лежит отдельным слоем: если дать его генератору, он
    // перерисовывает квадрат в пятно, и это уже проверено на закате.
    negative: NEG + ', round clouds, sun, moon, stars',
  },
  'mc/far-river': {
    strength: 0.24,
    prompt: `distant blocky mountain of stone cubes rising in the centre, grassy blocky hills on both sides, hazy depth, ${STYLE}`,
    negative: NEG + ', water, river, lake',
  },
  'mc/far-pines': {
    strength: 0.24,
    prompt: `distant blocky spruce forest, dark green cubic conifers in tiers, evening haze between the trunks, ${STYLE}`,
    negative: NEG + ', round treetops, sun, moon',
  },
  'mc/far-deep': {
    strength: 0.24,
    prompt: `deep underground wall of dark stone cubes with coal blocks and a bright diamond ore vein, torchlight glow, ${STYLE}`,
    negative: NEG + ', sky, sun, clouds, grass',
  },

  // ---- третий день ----
  'mc/far-lava': {
    strength: 0.24,
    prompt: `huge underground cavern of dark red netherrack cubes, a wide river of glowing orange lava across the middle, lava falls from the ceiling, black obsidian bank below the stream, hot haze and glow, ${STYLE}`,
    negative: NEG + ', sky, sun, clouds, grass, water, trees',
  },

  // ---- четвёртый день ----
  // Неба в этой истории нет вовсе: слой закрывает кадр целиком, поэтому
  // в negative идёт не только небо, но и горизонт — генератор норовит
  // прорубить его там, где у нас свод.
  'mc/far-nether-sea': {
    strength: 0.24,
    prompt: `vast underground sea of glowing orange lava stretching to the horizon, low ceiling of dark red netherrack cubes with hanging stalactites, dark nether brick fortress with pale quartz battlements on the far bank, lava falls, hot red haze and glow, ${STYLE}`,
    negative: NEG + ', sky, horizon, sun, clouds, grass, water, trees, people',
  },

  // ---- пятый день ----
  // Неба здесь тоже нет, но после красного дня всё держится на холодном
  // синем. В negative идут не только небо и горизонт, но и лава с огнём:
  // «подземелье» генератор охотно подсвечивает оранжевым, и тогда ущелье
  // превращается во второй Нижний мир — а смена цвета и есть смысл дня.
  'mc/far-ravine': {
    strength: 0.24,
    prompt: `huge dark underground ravine of grey stone cubes, tall waterfalls of blue water falling into a black bottomless chasm, low ceiling of cubic rock with hanging stalactites, cold blue damp haze and mist, faint torchlight on the far wall, ${STYLE}`,
    negative: NEG + ', sky, horizon, sun, clouds, grass, trees, lava, fire, orange glow, warm light, people',
  },

  // ---- шестой день ----
  // Крепость — первый тёплый интерьер сезона, и весь её смысл в контрасте
  // с синим подземельем пятого дня. Поэтому в negative идут не огонь
  // с лавой, а холод и сырость: на «подземелье из камня» генератор
  // уверенно выдаёт ту же синюю пещеру, из которой Стив только что вышел.
  'mc/far-stronghold': {
    strength: 0.24,
    prompt: `long underground stronghold corridor of mossy stone brick cubes, receding square archways one behind another, warm yellow torchlight on the brick walls, low cubic ceiling, dusty warm haze, deep perspective into the dark, ${STYLE}`,
    negative: NEG + ', sky, horizon, sun, clouds, grass, trees, water, waterfall, lava, cold blue light, blue haze, people',
  },
  // ---- седьмой день ----
  // Край — единственное место сезона, где неба нет вовсе: вместо него
  // лиловая пустота. Генератор пустоту терпеть не умеет и норовит
  // достроить ей солнце, облака и горизонт, поэтому в negative они идут
  // первыми. Светило отдельным слоем тут тоже не появится — его нет
  // в сценарии ни в одной сцене.
  'mc/sky-void': {
    strength: 0.42,
    prompt: `deep violet purple emptiness instead of sky, no sun, no moon, faint pale specks far away in the dark lilac void, smooth deep gradient, ${STYLE}, no ground, no horizon`,
    negative: NEG + ', sun, moon, stars as big shapes, clouds, horizon, ground, grass, trees, water, lava, fire, orange glow, blue sky, daylight',
  },
  // Парящий остров. Слой кадр не закрывает — под островами видна
  // пустота, и собирается он с chromaKey, как холмы и река. Отсюда же
  // запрет на горизонт и землю в negative: стоит генератору дорисовать
  // линию горизонта, и остров перестаёт висеть.
  'mc/far-end-island': {
    strength: 0.24,
    prompt: `floating island of pale cream cubes hanging in a violet void, tall black obsidian cube pillars rising from it with small magenta crystals glowing on top, smaller islands floating separately in the emptiness, dark rocky underside, faint lilac haze, ${STYLE}`,
    negative: NEG + ', sun, moon, clouds, horizon line, solid ground, grass, trees, water, waterfall, lava, fire, warm orange light, people',
  },
};


const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : Object.keys(LAYERS);

for (const name of names) {
  const layer = LAYERS[name];
  if (!layer) { console.log(`пропуск: ${name} — нет такого слоя`); continue; }

  console.log(`\n=== ${name} (strength ${layer.strength}) ===`);
  const res = spawnSync(process.execPath, [
    'tools/ed-generate.mjs',
    '--init', `tools/init/${name.replace('/', '-')}.png`,
    '--out', `tools/painted/${name.replace('/', '-')}.png`,
    '--prompt', layer.prompt,
    '--negative', layer.negative ? `${NEG}, ${layer.negative}` : NEG,
    '--strength', String(layer.strength),
    '--w', '768', '--h', '432',
    '--steps', '30',
    '--seed', '4242',
    '--upscale', 'RealESRGAN_x4plus',
  ], { stdio: 'inherit' });

  if (res.status !== 0) { console.error(`сбой на слое ${name}`); process.exit(1); }
}

console.log('\nвсе слои расписаны -> tools/painted/');
