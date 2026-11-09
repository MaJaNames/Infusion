export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const num = (n) => Number(n || 0).toLocaleString('ru-RU');
export const RC = { 'Обычный': 'c', 'Необычный': 'u', 'Редкий': 'r', 'Эпический': 'e', 'Легендарный': 'l', 'Культовый': 'k' };
export const RARITIES = Object.keys(RC);
export const label = (it) => `${it.tag ? `[${it.tag}] ` : ''}${it.name}`;
export const uniq = (rows, key) => [...new Set(rows.map((r) => r[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
export const opts = (rows, sel, text = (r) => r.name, val = (r) => r.id) =>
  rows.map((r) => `<option value="${esc(val(r))}"${String(val(r)) === String(sel) ? ' selected' : ''}>${esc(text(r))}</option>`).join('');
export const set = (obj, path, value) => { const k = path.split('.'), last = k.pop(); k.reduce((a, x) => a[x], obj)[last] = value; };
export const fieldValue = (el) => (el.type === 'number' || el.dataset.n ? (el.value === '' ? null : Number(el.value)) : el.value === '' && el.tagName === 'SELECT' ? null : el.value);

const map = (rows, key = 'id') => new Map(rows.map((r) => [r[key], r]));
export function indexData(d) {
  return { ...d, itemMap: map(d.items), cardMap: map(d.cards), skillMap: map(d.skills), abilityMap: map(d.abilities), traitMap: map(d.traits),
    essenceMap: map(d.essences), raceMap: map(d.races), rankMap: map(d.ranks, 'level'), statMap: map(d.stats, 'key'),
    rules: Object.fromEntries(d.formulas.map((f) => [f.key, f.value])) };
}
