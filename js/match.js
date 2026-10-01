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
const NUMBERS = ['ноль','один','два','три','четыре','пять','шесть','семь','восемь','девять','десять'];
function expand(word) {
  const out = [word];
  const asNum = NUMBERS.indexOf(word);
  if (asNum >= 0) out.push(String(asNum));
  if (/^\d+$/.test(word) && +word < NUMBERS.length) out.push(NUMBERS[+word]);
  return out;
}

/**
 * @returns {{choice:object, score:number}|null} — score 0 это точное попадание
 */
export function matchChoice(transcript, choices) {
  const phrase = normalize(transcript);
  if (!phrase) return null;
  const words = phrase.split(' ').flatMap(expand);

  let best = null;
  let bestScore = Infinity;

  for (const choice of choices) {
    const variants = [...(choice.keywords || []), choice.label].filter(Boolean);
    for (const variant of variants) {
      const key = normalize(variant);
      if (!key) continue;

      // вся фраза целиком прозвучала
      if (phrase.includes(key) && 0 < bestScore) { best = choice; bestScore = 0; continue; }

      for (const kw of key.split(' ').flatMap(expand)) {
        // короткие слова ошибок почти не прощают, длинные — до двух
        const tolerance = kw.length <= 3 ? 0 : kw.length <= 5 ? 1 : 2;
        for (const w of words) {
          const d = levenshtein(w, kw);
          if (d <= tolerance && d < bestScore) { best = choice; bestScore = d; }
        }
      }
    }
  }
  return best ? { choice: best, score: bestScore } : null;
}
