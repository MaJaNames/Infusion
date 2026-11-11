// Нечёткий поиск без внешних зависимостей: точное слово, начало слова, подстрока,
// подпоследовательность и опечатки. Работает офлайн и на GitHub Pages.
const norm = (s) => String(s ?? '').toLowerCase().replace(/ё/g, 'е');
const words = (s) => norm(s).split(/[^a-zа-я0-9]+/).filter(Boolean);

// Расстояние Левенштейна: используется только для слов похожей длины.
function distance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

// Насколько одно слово похоже на токен запроса. 0 — не похоже.
function wordScore(q, w) {
  if (!q || !w) return 0;
  if (w === q) return 1;
  if (w.startsWith(q)) return 0.94 - Math.min(0.12, (w.length - q.length) * 0.008);
  const at = w.indexOf(q);
  if (at >= 0) return 0.84 - Math.min(0.18, at * 0.015 + (w.length - q.length) * 0.004);

  // Подпоследовательность: «ржм» найдёт «режим», но только при плотном совпадении.
  if (q.length >= 4) {
    let qi = 0, start = -1, end = -1;
    for (let i = 0; i < w.length && qi < q.length; i++) {
      if (w[i] === q[qi]) { if (start < 0) start = i; end = i; qi++; }
    }
    if (qi === q.length) {
      const density = q.length / (end - start + 1);
      if (density >= 0.72) return 0.52 + density * 0.18;
    }
  }

  // Опечатка: «перчатко» → «перчатка». Сравниваем только слова близкой длины.
  if (q.length >= 4) {
    const max = q.length >= 8 ? 2 : 1;
    if (Math.abs(w.length - q.length) <= max) {
      const d = distance(q, w);
      if (d <= max) return Math.max(0.45, 0.78 - d * 0.14);
    }
  }
  return 0;
}

// 0 — запрос не найден; 1 — точное совпадение. Все слова запроса должны найтись.
export function fuzzyScore(query, text) {
  const q = norm(query).trim();
  if (!q) return 1;
  const list = words(text);
  if (!list.length) return 0;
  // Запрос делим так же, как текст: «рем-перчатка» и «D.P.L» станут отдельными словами.
  const tokens = words(q);
  if (!tokens.length) return 0;
  let total = 0;
  for (const token of tokens) {
    let best = 0;
    for (const w of list) {
      const s = wordScore(token, w);
      if (s > best) best = s;
      if (best === 1) break;
    }
    if (!best) return 0;
    total += best;
  }
  return total / tokens.length;
}

// Удобный фильтр для массивов: возвращает строки с оценкой и сортирует по точности.
export function fuzzyFilter(rows, query, textOf) {
  const q = String(query ?? '').trim();
  if (!q) return { rows: [...rows], scores: null };
  const scores = new Map();
  const out = [];
  for (const row of rows) {
    const s = fuzzyScore(q, textOf(row));
    if (s > 0) { out.push(row); scores.set(row, s); }
  }
  return { rows: out, scores };
}
