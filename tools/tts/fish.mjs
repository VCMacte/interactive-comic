// Озвучка корпуса через fish.audio. Делает то же, что делала render.py:
// проходит манифест и кладёт в tools/tts/wav/ по WAV на реплику. Дальше всё
// как было — `transcodeAudio` в tools/raster.html сжимает в MP3 40 кбит/с,
// `prune.mjs` чистит осиротевшее и пересобирает index.json.
//
//   node tools/tts/fish.mjs               # всё, чего ещё нет
//   node tools/tts/fish.mjs --only=wolf   # одна роль
//   node tools/tts/fish.mjs --force       # переозвучить, даже если WAV есть
//   node tools/tts/fish.mjs --dry         # только посчитать
//
// Ключ: переменная FISH_API_KEY или файл tools/tts/fish-key.txt (он
// в .gitignore). Голоса ролей — fish-voices.json, поправки произношения —
// fish-say-as.json.
//
// Готовые WAV пропускаются, как и у render.py: прогон можно прерывать и
// повторять. Но причина здесь важнее — вывод модели невоспроизводим
// (параметра seed у них нет), и лишняя переозвучка меняет темп реплики.
// Поэтому --force существует, но по умолчанию выключен.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath, а не разбор URL руками: в пути проекта есть пробел,
// и в URL он приезжает как %20 — ручная склейка ломается именно на этом.
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const WAV = join(ROOT, 'tools', 'tts', 'wav');

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const cfg = read(join(HERE, 'fish-voices.json'));
const sayAsRules = read(join(HERE, 'fish-say-as.json')).rules;
const manifest = read(join(ROOT, 'tools', 'tts', 'manifest.json'));

const key = process.env.FISH_API_KEY
  || (existsSync(join(HERE, 'fish-key.txt')) && readFileSync(join(HERE, 'fish-key.txt'), 'utf8').trim());
if (!key) {
  console.error('нет ключа: переменная FISH_API_KEY или файл tools/tts/fish-key.txt');
  process.exit(1);
}

const args = process.argv.slice(2);
const only = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const force = args.includes('--force');
const dry = args.includes('--dry');

/**
 * Точка в конце — только для синтеза.
 *
 * Реплика в «ёлочках» кончается без знака: точка стоит снаружи кавычек
 * и в запись не попадает. Модель читает такой текст с интонацией
 * продолжения — фраза звучит оборванной на полуслове. Лечится точкой,
 * но дописать её можно только здесь, на последнем шаге: имя файла
 * считается от «роль|текст» в двух местах сразу (`js/audio.js` и
 * `collect.mjs`), и правка текста в любом из них разводит их между собой.
 * Здесь же не меняется ни идентификатор, ни то, что видно на экране.
 *
 * Одно слово под правило не попадает: подписи кнопок («Шесть», «Нить»)
 * предложением никто не писал, и точка там ни к чему — так решено
 * на прослушивании.
 */
function finished(text) {
  const t = text.trim();
  if (!/\p{L}$/u.test(t)) return text;   // знак уже есть
  if (!/\s/.test(t)) return text;        // одно слово — подпись кнопки
  return t + '.';
}

/**
 * Текст для синтеза: правила из fish-say-as.json или сам текст.
 *
 * Правило бывает двух видов. `from` — вся реплика целиком: так лечится
 * ровно одно место и ничего больше. `word` — слово в любой реплике: так
 * лечится слово, которое модель читает неверно везде, где встретит
 * (у «колокола» таких реплик тринадцать, и перечислять их поштучно
 * значило бы забыть одну).
 *
 * Границы слова заданы вручную: `` в JS считает буквами только латиницу,
 * и правило на «замок» задело бы «замочек». Регистр не важен — иначе
 * правило промахивалось бы мимо слова в начале предложения, — но заглавная
 * в тексте остаётся заглавной и в замене.
 */
function sayAs(clip) {
  const exact = sayAsRules.find((r) => r.from && r.role === clip.role && r.from === clip.text);
  if (exact) return finished(exact.to);

  let text = clip.text;
  for (const rule of sayAsRules) {
    if (!rule.word) continue;
    if (rule.role && rule.role !== clip.role) continue;
    const re = new RegExp(`(?<![а-яёa-z])${rule.word}(?![а-яёa-z])`, 'giu');
    text = text.replace(re, (hit) => {
      const upper = hit[0] === hit[0].toUpperCase() && hit[0] !== hit[0].toLowerCase();
      return upper ? rule.to[0].toUpperCase() + rule.to.slice(1) : rule.to;
    });
  }
  return finished(text);
}

const voiceOf = (role) => cfg.voices[role]?.id;

const noVoice = manifest.filter((c) => !voiceOf(c.role));
if (noVoice.length) {
  const roles = [...new Set(noVoice.map((c) => c.role))];
  console.log(`без голоса (${roles.join(', ')}): ${noVoice.length} реплик — они останутся неозвученными`);
}

const todo = manifest
  .filter((c) => voiceOf(c.role))
  .filter((c) => !only.length || only.includes(c.role))
  .filter((c) => force || !existsSync(join(WAV, `${c.id}.wav`)));

const byRole = {};
for (const c of todo) byRole[c.role] = (byRole[c.role] || 0) + 1;
const bytes = todo.reduce((n, c) => n + Buffer.byteLength(sayAs(c), 'utf8'), 0);

console.log(`в манифесте ${manifest.length}, озвучить ${todo.length}`);
console.log(`по ролям: ${Object.entries(byRole).map(([r, n]) => `${r} ${n}`).join(', ') || '—'}`);
console.log(`текста ${bytes} байт — на платном тарифе это $${(bytes / 1e6 * 15).toFixed(2)}`);
if (dry || !todo.length) process.exit(0);

mkdirSync(WAV, { recursive: true });

async function one(clip) {
  const res = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      model: cfg.model,
    },
    body: JSON.stringify({
      text: sayAs(clip),
      reference_id: voiceOf(clip.role),
      format: 'wav',
      temperature: cfg.temperature,
      top_p: cfg.top_p,
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) throw new Error(`пустой ответ, ${buf.length} байт`);
  writeFileSync(join(WAV, `${clip.id}.wav`), buf);
}

// Три запроса в полёте: у тарифа Starter предел пять, и упираться в него
// незачем — отказ по превышению пришлось бы разбирать отдельно.
const LANES = 3;
let next = 0, done = 0;
const failed = [];

async function lane() {
  while (next < todo.length) {
    const clip = todo[next++];
    try {
      await one(clip);
      done++;
    } catch (e) {
      failed.push([clip.id, clip.role, e.message]);
    }
    const seen = done + failed.length;
    if (seen % 50 === 0 || seen === todo.length) {
      console.log(`  ${seen}/${todo.length}  (отказов ${failed.length})`);
    }
  }
}

await Promise.all(Array.from({ length: LANES }, lane));

console.log(`\nготово: ${done}, отказов ${failed.length}`);
for (const [id, role, msg] of failed) console.log(`  ${id} [${role}] ${msg}`);

// Список для transcodeAudio: ровно те, у кого теперь есть WAV, но нет MP3.
const pending = manifest
  .filter((c) => existsSync(join(WAV, `${c.id}.wav`)))
  .filter((c) => !existsSync(join(ROOT, 'assets', 'audio', `${c.id}.mp3`)))
  .map((c) => c.id);
writeFileSync(join(HERE, 'fish-pending.json'), JSON.stringify(pending));
console.log(`без MP3: ${pending.length} — список в tools/tts/fish-pending.json`);
if (failed.length) process.exit(1);
