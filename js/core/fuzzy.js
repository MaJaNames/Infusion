// Нечёткий поиск без внешних зависимостей: точное слово, начало слова, подстрока,
// подпоследовательность, опечатки (включая перестановки), раскладка (EN↔RU),
// склеенные/разорванные пробелами слова и учёт порядка слов. Работает офлайн и на GitHub Pages.
const norm = (s) => String(s ?? '').toLowerCase().replace(/ё/g, 'е');
const words = (s) => norm(s).split(/[^a-zа-я0-9]+/).filter(Boolean);

// Карта раскладки QWERTY ↔ ЙЦУКЕН для запросов, набранных не в той раскладке.
const EN_KEYS = "`qwertyuiop[]asdfghjkl;'zxcvbnm,.";
const RU_KEYS = 'ейцукенгшщзхъфывапролджэячсмитьбю';
const EN_TO_RU = Object.create(null);
const RU_TO_EN = Object.create(null);
for (let i = 0; i < EN_KEYS.length; i++) {
  EN_TO_RU[EN_KEYS[i]] = RU_KEYS[i];
  if (RU_KEYS[i] !== 'е' || EN_KEYS[i] === 't') RU_TO_EN[RU_KEYS[i]] = EN_KEYS[i];
}

function switchLayout(s) {
  let hasEn = false;
  let hasRu = false;
  for (const ch of s) {
    if (ch >= 'a' && ch <= 'z') hasEn = true;
    else if (ch >= 'а' && ch <= 'я') hasRu = true;
  }
  if (hasEn === hasRu) return s;
  const map = hasEn ? EN_TO_RU : RU_TO_EN;
  let out = '';
  for (const ch of s) out += map[ch] ?? ch;
  return out;
}

// Расстояние Дамерау — Левенштейна (OSA): соседняя перестановка («режми» → «режим») = 1 правка.
function distance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d = Math.min(d, prev2[j - 2] + 1);
      }
      row[j] = d;
    }
    prev2 = prev;
    prev = row;
  }
  return prev[b.length];
}

// Лучшее плотное совпадение подпоследовательности (ищет самое компактное окно в слове).
function bestSubseqDensity(q, w) {
  let best = 0;
  for (let s = 0; s < w.length; s++) {
    if (w[s] !== q[0]) continue;
    let qi = 1;
    let end = s;
    for (let i = s + 1; i < w.length && qi < q.length; i++) {
      if (w[i] === q[qi]) {
        end = i;
        qi++;
      }
    }
    if (qi === q.length) {
      const density = q.length / (end - s + 1);
      if (density > best) best = density;
      if (best === 1) break;
    }
  }
  return best;
}

// Насколько одно слово похоже на токен запроса. 0 — не похоже.
function wordScore(q, w) {
  if (!q || !w) return 0;
  if (w === q) return 1;
  if (w.startsWith(q)) return 0.94 - Math.min(0.12, (w.length - q.length) * 0.008);
  const at = w.indexOf(q);
  if (at >= 0) return 0.84 - Math.min(0.18, at * 0.015 + (w.length - q.length) * 0.004);

  // Подпоследовательность: «ржм» найдёт «режим», но только при плотном совпадении.
  if (q.length >= 3) {
    const density = bestSubseqDensity(q, w);
    const minDensity = q.length === 3 ? 0.6 : 0.72;
    if (density >= minDensity) return 0.5 + density * 0.18;
  }

  // Опечатка: «перчатко» → «перчатка», «режми» → «режим». Сравниваем слова близкой длины.
  if (q.length >= 4) {
    const max = q.length >= 8 ? 2 : 1;
    if (Math.abs(w.length - q.length) <= max) {
      const d = distance(q, w);
      if (d <= max) return Math.max(0.45, 0.78 - d * 0.14);
    }
  }
  return 0;
}

function scoreTokens(tokens, list, normText, normQuery) {
  if (!tokens.length || !list.length) return 0;

  let total = 0;
  const matchedIdx = [];

  for (const token of tokens) {
    let best = 0;
    let bestIdx = -1;

    for (let i = 0; i < list.length; i++) {
      const s = wordScore(token, list[i]);
      if (s > best) {
        best = s;
        bestIdx = i;
      }
      if (best === 1) break;
    }

    // Склеенное слово в запросе: «ремперчатка» → «рем перчатка».
    if (best < 0.85 && token.length >= 5) {
      for (let i = 0; i < list.length - 1; i++) {
        const joined = list[i] + list[i + 1];
        const s = wordScore(token, joined) * 0.92;
        if (s > best) {
          best = s;
          bestIdx = i;
        }
      }
    }

    if (!best) {
      // Случайный пробел в запросе: «пер чатка» / «ре жми» → «перчатка» / «режим».
      if (tokens.length >= 2) {
        const merged = tokens.join('');
        if (merged.length >= 4) {
          let mergedBest = 0;
          for (const w of list) {
            const s = wordScore(merged, w) * 0.9;
            if (s > mergedBest) mergedBest = s;
          }
          return mergedBest;
        }
      }
      return 0;
    }

    total += best;
    matchedIdx.push(bestIdx);
  }

  const avg = total / tokens.length;
  if (tokens.length === 1) return avg;

  // Бонус за точный порядок и близость слов (для многословных запросов).
  if (normText && normQuery && normText.includes(normQuery)) {
    return Math.min(1, avg * 0.95 + 0.05);
  }

  let inOrder = 0;
  let close = 0;
  for (let i = 1; i < matchedIdx.length; i++) {
    const gap = matchedIdx[i] - matchedIdx[i - 1];
    if (gap > 0) inOrder++;
    if (gap > 0 && gap <= 2) close++;
  }
  const pairs = tokens.length - 1;
  const orderFactor = (inOrder / pairs) * 0.6 + (close / pairs) * 0.4;
  return avg * (0.92 + 0.08 * orderFactor);
}

// 0 — запрос не найден; 1 — точное совпадение. Все слова запроса должны найтись.
export function fuzzyScore(query, text) {
  const q = norm(query).trim();
  if (!q) return 1;
  const normText = norm(text);
  const list = words(normText);
  if (!list.length) return 0;

  const tokens = words(q);
  let score = scoreTokens(tokens, list, normText, q);

  // Если не нашлось (или слабо) — пробуем переключить раскладку (EN↔RU).
  const switched = switchLayout(q);
  if (switched !== q) {
    const altTokens = words(switched);
    const altScore = scoreTokens(altTokens, list, normText, switched) * 0.96;
    if (altScore > score) score = altScore;
  }

  return score;
}

// Оценка по массиву полей с весами: [{ text, weight }, ...] или строке.
function scoreEntry(q, qSwitched, entry) {
  if (typeof entry === 'string' || entry == null) {
    const normText = norm(entry);
    const list = words(normText);
    if (!list.length) return 0;
    let s = scoreTokens(words(q), list, normText, q);
    if (qSwitched !== q) {
      const alt = scoreTokens(words(qSwitched), list, normText, qSwitched) * 0.96;
      if (alt > s) s = alt;
    }
    return s;
  }

  let best = 0;
  let maxWeight = 1;
  for (const part of entry) {
    const text = Array.isArray(part) ? part[0] : part?.text;
    const weight = (Array.isArray(part) ? part[1] : part?.weight) ?? 1;
    if (weight > maxWeight) maxWeight = weight;
    const s = fuzzyScore(q, text) * weight;
    if (s > best) best = s;
  }
  return maxWeight > 0 ? Math.min(1, best / maxWeight) : best;
}

// Удобный фильтр для массивов: возвращает строки с оценкой и сортирует по точности.
// textOf(row) может возвращать строку или массив полей [{ text, weight }, ...].
export function fuzzyFilter(rows, query, textOf) {
  const q = norm(query).trim();
  if (!q) return { rows: [...rows], scores: null };
  const qSwitched = switchLayout(q);
  const scores = new Map();
  const out = [];
  for (const row of rows) {
    const s = scoreEntry(q, qSwitched, textOf(row));
    if (s > 0) {
      out.push(row);
      scores.set(row, s);
    }
  }
  out.sort((a, b) => scores.get(b) - scores.get(a));
  return { rows: out, scores };
}