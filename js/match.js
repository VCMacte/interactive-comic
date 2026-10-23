// Нечёткое сопоставление услышанного с вариантами ответа.
// Детская речь распознаётся с ошибками, поэтому точное совпадение бесполезно.

const normalize = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = cur;
  }
  return prev[n];
}

// Числа ребёнок может назвать словом, а распознавание вернуть цифрой — и наоборот.
// Список обязан доходить до двадцати: предел счёта в заданиях — двадцать, а
// пока он кончался десяткой, услышанное «12» не узнавало вариант «двенадцать».
const NUMBERS = ['ноль','один','два','три','четыре','пять','шесть','семь','восемь','девять','десять',
                 'одиннадцать','двенадцать','тринадцать','четырнадцать','пятнадцать',
                 'шестнадцать','семнадцать','восемнадцать','девятнадцать','двадцать'];
function expand(word) {
  const out = [word];
  const asNum = NUMBERS.indexOf(word);
  if (asNum >= 0) out.push(String(asNum));
  if (/^\d+$/.test(word) && +word < NUMBERS.length) out.push(NUMBERS[+word]);
  return out;
}

// Служебные слова сами по себе ответом не бывают. Союз «и» лежит внутри
// ключей «шерсть и вода», «палки и уголёк» — и сравнение по словам давало ему
// точное совпадение: услышанное «железо и» уезжало в «Шерсть и вода». Тем же
// путём одинокое «по» выбирало между «По мосту над лавой» и «По песку»
// порядком перебора, а не смыслом. Внутри целой фразы они по-прежнему
// считаются — запрет только на одиночное слово.
const STOPWORDS = new Set([
  'и', 'а', 'но', 'да', 'или', 'либо',
  'в', 'во', 'на', 'по', 'с', 'со', 'к', 'ко', 'у', 'за', 'из', 'от', 'до',
  'о', 'об', 'при', 'про', 'под', 'над', 'для', 'без', 'через',
  'не', 'ни', 'же', 'бы', 'ли', 'вот', 'уже',
]);

/** Идут ли слова ключа подряд среди услышанных слов. */
function hasWords(said, keys) {
  if (!keys.length || keys.length > said.length) return false;
  for (let i = 0; i + keys.length <= said.length; i++) {
    let all = true;
    for (let j = 0; j < keys.length; j++) if (said[i + j] !== keys[j]) { all = false; break; }
    if (all) return true;
  }
  return false;
}

// Надбавка за попадание одним словом вместо целой фразы: дробная, чтобы
// точное слово (0.5) всё равно шло впереди фразы, расслышанной с ошибкой.
const PART_PENALTY = 0.5;

/**
 * @returns {{choice:object, score:number}|null} — score 0 это точное попадание
 */
export function matchChoice(transcript, choices) {
  const phrase = normalize(transcript);
  if (!phrase) return null;
  const said = phrase.split(' ');
  const words = said.flatMap(expand);

  let best = null;
  let bestScore = Infinity;

  for (const choice of choices) {
    const variants = [...(choice.keywords || []), choice.label].filter(Boolean);
    for (const variant of variants) {
      const key = normalize(variant);
      if (!key) continue;

      // вся фраза целиком прозвучала — но именно словами, а не буквами
      // внутри слова. Простым `includes` ключ «2» попадал в услышанное «12»,
      // и верный ответ «двенадцать» засчитывался вариантом «два»; тем же
      // путём «двадцать» уходило в «два», а «одиннадцать» — в «один».
      if (hasWords(said, key.split(' ')) && 0 < bestScore) { best = choice; bestScore = 0; continue; }

      for (const kw of key.split(' ').flatMap(expand)) {
        if (STOPWORDS.has(kw)) continue;
        // короткие слова ошибок почти не прощают, длинные — до двух
        const tolerance = kw.length <= 3 ? 0 : kw.length <= 5 ? 1 : 2;
        for (const w of words) {
          const d = levenshtein(w, kw);
          // Одно слово ключа — слабее целой фразы, поэтому PART_PENALTY:
          // услышанное «по песку» обязано уехать в «По песку», а не в «По
          // мосту над лавой», где тоже нашлось слово «по». Без надбавки
          // побеждал тот вариант, что стоял в списке раньше.
          const s = d + PART_PENALTY;
          if (d <= tolerance && s < bestScore) { best = choice; bestScore = s; }
        }
      }
    }
  }
  return best ? { choice: best, score: bestScore } : null;
}

/**
 * Одна и та же фраза или её продолжение? Распознавание Android отдаёт долгую
 * фразу нарастающими кусками, и каждый кусок приходит отдельным готовым
 * результатом: «Мам», «Мам я», «Мам я уже». Промах считался за каждый, и одно
 * постороннее предложение выжигало все четыре попытки сразу — сцена уходила
 * на кнопки, хотя ребёнок ещё и не отвечал.
 *
 * Продолжение считается словами, а не буквами: «тридцать» после «три» — это
 * новая попытка, а не то же слово.
 */
export function isSameUtterance(prev, next) {
  const a = normalize(prev).split(' ').filter(Boolean);
  const b = normalize(next).split(' ').filter(Boolean);
  if (!a.length || !b.length || b.length < a.length) return false;
  return a.every((w, i) => w === b[i]);
}
