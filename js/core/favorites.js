// Избранные записи базы: звезда у строки и фильтр «только избранное».
// Храним плоский список «раздел:id» — раздел совпадает с видом пермалинка:
// items, cards или rules (составной ID строк справочника).
const KEY = 'infusion.favs';
const PREFIX_RE = /^(items|cards|rules):.+$/;

function all() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    return new Set(Array.isArray(raw) ? raw.filter((x) => typeof x === 'string' && PREFIX_RE.test(x)) : []);
  } catch {
    return new Set();
  }
}

function save(set) {
  try { localStorage.setItem(KEY, JSON.stringify([...set])); } catch { /* память браузера недоступна */ }
}

export const favoriteKey = (kind, id) => `${kind}:${id}`;
export const isFavorite = (kind, id) => all().has(favoriteKey(kind, id));
export const favoriteCount = () => all().size;

export function toggleFavorite(kind, id) {
  if (!id) return false;
  const key = favoriteKey(kind, id), set = all();
  if (set.has(key)) set.delete(key);
  else set.add(key);
  save(set);
  return set.has(key);
}
