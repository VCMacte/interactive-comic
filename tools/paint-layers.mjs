// Прогон всех слоёв локаций через img2img Easy Diffusion.
//
// Композиция берётся с наших векторных слоёв: линия земли на 70%, свободный
// центр под персонажей, кулисы по краям. Нейросеть их только расписывает.
// Генерировать «с нуля» нельзя — вернётся красивая картинка с землёй где
// попало, и персонажи повиснут в воздухе.
//
// Запуск: node tools/paint-layers.mjs [имя слоя ...]

import { spawnSync } from 'node:child_process';

const STYLE = 'children book illustration, flat vector shapes, clean smooth gradients, '
  + 'deep blue night palette, moonlight rim light, no outlines, no texture noise';
const NEG = 'text, letters, watermark, signature, frame, border, people, person, human, '
  + 'character, animal, blurry, lowres, jpeg artifacts, cluttered, busy details';

// strength подобрана по планам: небо можно переписывать смелее — там нет
// геометрии, которую нужно беречь; у ближнего плана силуэт держит персонажей,
// поэтому вмешательство минимальное.
const LAYERS = {
  'sky': {
    strength: 0.5,
    // «одна луна» приходится проговаривать дважды: на первом прогоне
    // генератор дорисовал слева ещё и месяц.
    prompt: `night sky with exactly one single full moon in the upper right, soft halo around it, scattered small stars, deep blue vertical gradient, ${STYLE}, no ground, no trees, no horizon`,
    // На прогонах генератор дорисовывал слева то месяц, то яркую вспышку —
    // приходится запрещать любой второй источник света.
    negative: 'crescent moon, second moon, two moons, multiple moons, bright star, lens flare, glowing orb, clouds',
  },
  'far-forest': {
    strength: 0.45,
    prompt: `distant pine forest silhouettes in night mist, layered depth, soft fog band, dark blue, ${STYLE}`,
  },
  'far-hills': {
    strength: 0.45,
    prompt: `distant rolling hills at night, soft haze, dark blue silhouettes, ${STYLE}`,
  },
  'near-forest': {
    strength: 0.38,
    prompt: `dark forest floor at night with moonlit path, tall tree trunks framing the edges, near black blue silhouettes, ${STYLE}`,
  },
  'near-river': {
    strength: 0.38,
    prompt: `calm river at night with moonlight reflections, reeds on the bank, dark silhouettes, ${STYLE}`,
  },
  'near-oak': {
    strength: 0.38,
    prompt: `huge ancient oak trunk with a hollow glowing warm, night, dark silhouette, ${STYLE}`,
  },
  'near-glade': {
    strength: 0.38,
    prompt: `night forest clearing with floating fireflies, soft warm glows, grass, dark silhouettes, ${STYLE}`,
  },
  'near-burrow': {
    strength: 0.38,
    prompt: `earth mound with a round burrow entrance glowing warm inside, night, dark silhouettes, ${STYLE}`,
  },
};


// ---- мир «Первой ночи» ----
// Стиль описан нарочно жёстко: нейросеть склонна сглаживать кубы в холмики,
// а здесь вся узнаваемость держится на чётких гранях.
const MC_STYLE = 'blocky voxel game world, large cubic blocks, crisp square edges, '
  + 'flat saturated colors, pixel art texture, no blur, no soft shading';
const MC_NEG = 'text, letters, watermark, signature, frame, border, people, person, character, '
  + 'blurry, soft focus, smooth gradients, rounded shapes, realistic, photo, lowres';

const MC_LAYERS = {
  'mc/sky-day': {
    strength: 0.42,
    prompt: `bright blue daytime sky with chunky square white clouds and a square sun, ${MC_STYLE}, no ground, no trees`,
    negative: MC_NEG + ', round clouds, round sun',
  },
  'mc/sky-sunset': {
    strength: 0.42,
    prompt: `sunset sky, orange and pink bands, chunky square clouds, square sun near the horizon, ${MC_STYLE}, no ground, no trees`,
    negative: MC_NEG + ', round clouds, round sun',
  },
  'mc/sky-night': {
    strength: 0.42,
    prompt: `dark blue night sky with a square moon, ${MC_STYLE}, no ground, no trees`,
    negative: MC_NEG + ', round moon, crescent moon, second moon',
  },
  'mc/far-hills': {
    strength: 0.34,
    prompt: `distant blocky hills of grass and dirt cubes with cubic trees, layered depth, ${MC_STYLE}`,
    negative: MC_NEG,
  },
  'mc/far-cave': {
    strength: 0.34,
    prompt: `underground cave wall of stone cubes with coal and diamond ore blocks, torchlight, ${MC_STYLE}`,
    negative: MC_NEG + ', sky, sun, clouds',
  },

  // ---- второй день ----
  'mc/sky-dawn': {
    strength: 0.42,
    prompt: `early morning sky just after sunrise, pale pink and lilac bands turning to blue, chunky square clouds, ${MC_STYLE}, no ground, no trees`,
    // Светило лежит отдельным слоем: если дать его генератору, он
    // перерисовывает квадрат в пятно, и это уже проверено на закате.
    negative: MC_NEG + ', round clouds, sun, moon, stars',
  },
  'mc/far-river': {
    strength: 0.24,
    prompt: `distant blocky mountain of stone cubes rising in the centre, grassy blocky hills on both sides, hazy depth, ${MC_STYLE}`,
    negative: MC_NEG + ', water, river, lake',
  },
  'mc/far-pines': {
    strength: 0.24,
    prompt: `distant blocky spruce forest, dark green cubic conifers in tiers, evening haze between the trunks, ${MC_STYLE}`,
    negative: MC_NEG + ', round treetops, sun, moon',
  },
  'mc/far-deep': {
    strength: 0.24,
    prompt: `deep underground wall of dark stone cubes with coal blocks and a bright diamond ore vein, torchlight glow, ${MC_STYLE}`,
    negative: MC_NEG + ', sky, sun, clouds, grass',
  },

  // ---- третий день ----
  'mc/far-lava': {
    strength: 0.24,
    prompt: `huge underground cavern of dark red netherrack cubes, a wide river of glowing orange lava across the middle, lava falls from the ceiling, black obsidian bank below the stream, hot haze and glow, ${MC_STYLE}`,
    negative: MC_NEG + ', sky, sun, clouds, grass, water, trees',
  },

  // ---- четвёртый день ----
  // Неба в этой истории нет вовсе: слой закрывает кадр целиком, поэтому
  // в negative идёт не только небо, но и горизонт — генератор норовит
  // прорубить его там, где у нас свод.
  'mc/far-nether-sea': {
    strength: 0.24,
    prompt: `vast underground sea of glowing orange lava stretching to the horizon, low ceiling of dark red netherrack cubes with hanging stalactites, dark nether brick fortress with pale quartz battlements on the far bank, lava falls, hot red haze and glow, ${MC_STYLE}`,
    negative: MC_NEG + ', sky, horizon, sun, clouds, grass, water, trees, people',
  },
};

Object.assign(LAYERS, MC_LAYERS);

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
