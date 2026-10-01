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

const wanted = process.argv.slice(2);
const names = wanted.length ? wanted : Object.keys(LAYERS);

for (const name of names) {
  const layer = LAYERS[name];
  if (!layer) { console.log(`пропуск: ${name} — нет такого слоя`); continue; }

  console.log(`\n=== ${name} (strength ${layer.strength}) ===`);
  const res = spawnSync(process.execPath, [
    'tools/ed-generate.mjs',
    '--init', `tools/init/${name}.png`,
    '--out', `tools/painted/${name}.png`,
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
