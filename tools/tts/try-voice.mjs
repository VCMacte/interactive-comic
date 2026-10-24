// Пробы голоса: одна и та же реплика несколькими голосами из библиотеки
// fish.audio, чтобы выбрать ухом. Выбирает ЧЕЛОВЕК — мои замеры тут
// не годятся, слышно только на слух.
//
//   node tools/tts/try-voice.mjs волк "У-у-у…" "Ав! Ав!"
//
// Первый аргумент — что искать в библиотеке, дальше реплики. Результат
// ложится в tools/voice-try/ вместе со страницей index.html; открыть
// http://localhost:8099/tools/voice-try/ при поднятом serve.js.
//
// Папка временная: выбрали голос, вписали в fish-voices.json — удалили.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const cfg = JSON.parse(readFileSync('tools/tts/fish-voices.json', 'utf8'));
const key = process.env.FISH_API_KEY
  || (existsSync('tools/tts/fish-key.txt') && readFileSync('tools/tts/fish-key.txt', 'utf8').trim());
if (!key) { console.error('нет ключа: FISH_API_KEY или tools/tts/fish-key.txt'); process.exit(1); }

const [query, ...lines] = process.argv.slice(2);
if (!query || !lines.length) { console.error('нужны: что искать и хотя бы одна реплика'); process.exit(1); }

const OUT = 'tools/voice-try';
const HOW_MANY = 6;

const found = await (await fetch(
  `https://api.fish.audio/model?page_size=${HOW_MANY}&title=${encodeURIComponent(query)}`,
  { headers: { Authorization: `Bearer ${key}` } })).json();

const models = (found.items || []).slice(0, HOW_MANY);
if (!models.length) { console.error('в библиотеке ничего не нашлось'); process.exit(1); }

mkdirSync(OUT, { recursive: true });
const rows = [];

for (const m of models) {
  for (const [i, text] of lines.entries()) {
    const res = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', model: cfg.model },
      body: JSON.stringify({
        text, reference_id: m._id, format: 'wav',
        temperature: cfg.temperature, top_p: cfg.top_p,
      }),
    });
    if (!res.ok) { console.error(`  ${m.title}: ${res.status}`); continue; }
    const name = `${m._id}-${i}.wav`;
    writeFileSync(join(OUT, name), Buffer.from(await res.arrayBuffer()));
    rows.push({ id: m._id, title: m.title, tags: (m.tags || []).join(', '), text, name });
    console.log(`  ${m.title} — «${text}»`);
  }
}

const byModel = new Map();
for (const r of rows) {
  if (!byModel.has(r.id)) byModel.set(r.id, { title: r.title, tags: r.tags, takes: [] });
  byModel.get(r.id).takes.push(r);
}

const html = `<!doctype html>
<meta charset="utf-8">
<title>Пробы голоса: ${query}</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; margin: 2rem; max-width: 50rem; }
  h1 { font-size: 1.3rem; }
  .m { border-top: 1px solid #ddd; padding: 1rem 0; }
  .t { font-weight: 600; }
  .id { color: #888; font-family: ui-monospace, monospace; font-size: .85em; }
  .l { margin: .4rem 0; }
  audio { vertical-align: middle; }
</style>
<h1>Пробы голоса: ${query}</h1>
<p>Выбрать ухом, потом вписать идентификатор в <code>tools/tts/fish-voices.json</code>
и переозвучить роль: <code>node tools/tts/fish.mjs --only=РОЛЬ --force</code>.</p>
${[...byModel].map(([id, m]) => `<div class="m">
  <div class="t">${m.title}</div>
  <div class="id">${id}${m.tags ? ' — ' + m.tags : ''}</div>
  ${m.takes.map((t) => `<div class="l">«${t.text}» <audio controls src="${t.name}"></audio></div>`).join('\n  ')}
</div>`).join('\n')}
`;
writeFileSync(join(OUT, 'index.html'), html);
console.log(`\nготово: ${byModel.size} голосов — http://localhost:8099/${OUT}/`);
