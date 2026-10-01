// Пересобирает список офлайн-кэша в sw.js по тому, что реально лежит на диске.
//
// Список перевалил за полтысячи путей, и вести его руками бессмысленно:
// забытый файл не ломает разработку (там всё берётся из сети), он ломает
// установленное приложение — ровно у ребёнка и ровно тогда, когда сети нет.
//
// Номер кэша поднимается тем же запуском: без нового номера установленное
// приложение продолжит отдавать прошлую версию, и правок никто не увидит.
//
// Запуск: node tools/make-sw.mjs [--keep-version]

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SW = join(ROOT, 'sw.js');

// Корневые файлы перечислены явно: в корне лежит и то, чему в кэше делать
// нечего — serve.js, тесты, инструменты.
const ROOT_FILES = [
  './', './index.html', './comics.json', './manifest.webmanifest',
  './css/style.css',
  './js/app.js', './js/voice.js', './js/match.js',
  './js/tasks.js', './js/stage.js', './js/audio.js',
];

// Каталоги целиком, с разрешёнными расширениями.
const DIRS = [
  ['assets', ['.svg', '.png', '.webp', '.mp3', '.json']],
  ['stories', ['.json']],
];

function walk(rel, exts, out = []) {
  const names = readdirSync(join(ROOT, rel)).sort();
  const painted = new Set(names.filter(f => f.endsWith('.webp')).map(f => f.slice(0, -5)));

  for (const name of names) {
    const sub = posix.join(rel, name);
    if (statSync(join(ROOT, sub)).isDirectory()) { walk(sub, exts, out); continue; }
    if (!exts.some(e => name.endsWith(e))) continue;
    // У расписанных нейросетью слоёв вектор остаётся на диске как init-картинка
    // для следующего прогона. В приложении он не нужен, а офлайн-кэш целиком
    // уезжает на телефон.
    if (name.endsWith('.svg') && painted.has(name.slice(0, -4))) continue;
    out.push('./' + sub);
  }
  return out;
}

const assets = [...ROOT_FILES];
for (const [dir, exts] of DIRS) walk(dir, exts, assets);

let src = readFileSync(SW, 'utf8');

if (!process.argv.includes('--keep-version')) {
  src = src.replace(/const CACHE = 'comic-v(\d+)';/, (_, v) =>
    `const CACHE = 'comic-v${Number(v) + 1}';`);
}

src = src.replace(/const ASSETS = \[[\s\S]*?\n\];/,
  'const ASSETS = [\n' + assets.map(a => `  '${a}',`).join('\n') + '\n];');

writeFileSync(SW, src, 'utf8');

const version = src.match(/const CACHE = '([^']+)'/)[1];
console.log(`${version}: ${assets.length} файлов в офлайн-кэше`);
