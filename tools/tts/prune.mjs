// Приводит assets/audio в соответствие с манифестом.
//
// Удаляет записи, на которые больше никто не ссылается, и пересобирает
// index.json — список доступных файлов, по которому приложение решает,
// звать готовую озвучку или браузерный синтез.
//
// Без этого шага осиротевшие файлы продолжают уезжать в офлайн-кэш
// на телефон, а index.json обещает записи, которых уже нет.
//
// Запуск: node tools/tts/prune.mjs [--dry]

import { readFileSync, writeFileSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'assets', 'audio');
const dry = process.argv.includes('--dry');

const wanted = new Set(
  JSON.parse(readFileSync(join(ROOT, 'tools', 'tts', 'manifest.json'), 'utf8')).map(u => u.id));

const have = readdirSync(DIR).filter(f => f.endsWith('.mp3')).map(f => f.slice(0, -4));
const orphans = have.filter(id => !wanted.has(id));
const missing = [...wanted].filter(id => !have.includes(id));

for (const id of orphans) {
  if (!dry) unlinkSync(join(DIR, id + '.mp3'));
}

const kept = have.filter(id => wanted.has(id)).sort();
if (!dry) writeFileSync(join(DIR, 'index.json'), JSON.stringify(kept), 'utf8');

const bytes = kept.reduce((s, id) => s + statSync(join(DIR, id + '.mp3')).size, 0);

console.log(`${dry ? 'нашлось' : 'удалено'} осиротевших: ${orphans.length}`);
console.log(`записей: ${kept.length}, ${(bytes / 1048576).toFixed(1)} МБ`);

// Непрозвученные реплики — это тишина в истории, и молча проходить мимо
// такого нельзя: на телевизоре запасного синтеза нет вовсе.
if (missing.length) {
  console.log(`\nНЕ ОЗВУЧЕНО: ${missing.length} реплик — прогоните render.py и transcodeAudio`);
  process.exitCode = 1;
}
