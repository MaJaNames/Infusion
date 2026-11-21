// Списки посредника: фильтры, сортировка, нечёткий поиск и страницы.
// Логика повторяет вкладку «База данных» (предметы), но работает со строками витрины.
import { RARITIES, label, esc } from '../../core/util.js';
import { RULES } from '../../character/rules.js';
import { fuzzyFilter } from '../../core/fuzzy.js';
import { isFavorite } from '../../core/favorites.js';

export const PAGE_SIZE = 40;
const cmpText = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'ru');
const cmpNum = (a, b) => (Number(a) || 0) - (Number(b) || 0);
const cmpBool = (a, b) => Number(!!a) - Number(!!b);
const RARITY_RANK = new Map(RARITIES.map((r, i) => [r, i]));
const cmpRarity = (a, b) => (RARITY_RANK.get(a) ?? 99) - (RARITY_RANK.get(b) ?? 99);
const sdef = (name, get, cmp = cmpText) => ({ name, get, cmp });
const sellOf = (it) => it.sell_price ?? Math.round((Number(it.cost) || 0) * RULES.sellPriceRate);

export const ITEM_SORT = {
  name: sdef('Название', (r) => label(r.item)),
  tag: sdef('Тег', (r) => r.item.tag || ''),
  rarity: sdef('Редкость', (r) => r.item.rarity, cmpRarity),
  category: sdef('Категория', (r) => r.category || r.item.category || ''),
  organization: sdef('Организация', (r) => r.item.organization || ''),
  iconic: sdef('Культовый', (r) => r.item.iconic, cmpBool),
  price: sdef('Цена продавца', (r) => r.price, cmpNum),
  cost: sdef('Цена базы', (r) => r.base, cmpNum),
  sell: sdef('Цена продажи', (r) => sellOf(r.item), cmpNum),
  discount: sdef('Скидка', (r) => r.discount, cmpNum),
  id: sdef('ID', (r) => r.id),
};
export const SORT_GROUPS = [
  ['Основное', ['name', 'tag', 'rarity', 'category', 'organization', 'iconic']],
  ['Цены', ['price', 'cost', 'sell', 'discount']],
  ['Служебное', ['id']],
];
export const DEFAULT_SORT = ['id', 1];

export const blankListState = () => ({
  q: '',
  filters: { rar: [], category: [], organization: [], iconic: [] },
  sort: [...DEFAULT_SORT],
  showIds: false,
  favOnly: false,
  page: 1,
  filtersOpen: false,
});

export const normFilter = (v) => (Array.isArray(v) ? v.filter(Boolean).map(String) : v ? [String(v)] : []);

// Внутри одного фильтра — ИЛИ, между разными — И.
const matches = (row, f) => Object.entries(f).every(([k, v]) => {
  const wanted = normFilter(v);
  if (!wanted.length) return true;
  const x = row[k];
  const have = Array.isArray(x) ? x.map(String) : [String(x ?? '')];
  return wanted.some((w) => have.includes(w));
});

export function filterDefs(items) {
  const base = items || [];
  return [
    { k: 'rar', label: 'Любая редкость', options: RARITIES.map((x) => [x, x]) },
    { k: 'category', label: 'Любая категория', options: [...new Set(base.map((it) => it.category || '').filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')).map((x) => [x, x]) },
    { k: 'organization', label: 'Любая организация', options: [...new Set(base.map((it) => it.organization || '').filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru')).map((x) => [x, x]) },
    { k: 'iconic', label: 'Культовый: любой', options: [['0', 'Без статуса'], ['1', 'Культовые']] },
  ];
}

export function collectRows(state, rows) {
  const f = state.filters || {};
  const filtered = rows.filter((r) => matches({
    rar: r.item.rarity,
    category: r.category || r.item.category,
    organization: r.item.organization,
    iconic: r.item.iconic ? '1' : '0',
  }, f) && (!state.favOnly || isFavorite('items', r.id)));
  const { rows: found, scores } = fuzzyFilter(filtered, state.q, (r) =>
    `${label(r.item)} ${r.item.description || ''} ${r.category || ''} ${r.item.organization || ''} ${r.item.tag || ''}`);
  const key = ITEM_SORT[state.sort?.[0]] ? state.sort[0] : 'id';
  const def = ITEM_SORT[key];
  const sign = state.sort?.[1] === -1 ? -1 : 1;
  // Точность поиска первична, выбранная сортировка — вторична.
  found.sort((a, b) => {
    if (scores) {
      const byScore = (scores.get(b) || 0) - (scores.get(a) || 0);
      if (byScore) return byScore;
    }
    return sign * def.cmp(def.get(a), def.get(b));
  });
  return { rows: found, total: found.length };
}

export function pageRows(rows, state) {
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  state.page = Math.min(Math.max(1, Number(state.page) || 1), pages);
  const start = (state.page - 1) * PAGE_SIZE;
  return {
    slice: rows.slice(start, start + PAGE_SIZE), pages,
    from: rows.length ? start + 1 : 0, to: Math.min(start + PAGE_SIZE, rows.length),
  };
}

export function pager(state, total, pages, from, to, listId) {
  if (!total) return '<p class="page-info meta">Ничего не найдено</p>';
  const page = state.page;
  const parts = [];
  const add = (n) => parts.push(`<button type="button" data-list-page="${listId}" data-page="${n}" class="${n === page ? 'on' : ''}"${n === page ? ' aria-current="page"' : ''}>${n}</button>`);
  const dots = () => parts.push('<span class="page-ellipsis">…</span>');
  const near = new Set([1, pages, page - 1, page, page + 1]);
  let last = 0;
  for (let n = 1; n <= pages; n++) {
    if (near.has(n)) {
      if (last && n - last > 1) dots();
      add(n);
      last = n;
    }
  }
  return `<div class="broker-pager">
    <button type="button" data-list-page="${listId}" data-page="${page - 1}"${page <= 1 ? ' disabled' : ''} aria-label="Предыдущая страница">←</button>
    ${parts.join('')}
    <button type="button" data-list-page="${listId}" data-page="${page + 1}"${page >= pages ? ' disabled' : ''} aria-label="Следующая страница">→</button>
    <span class="page-info meta">Страница ${page} из ${pages} · ${from}–${to} из ${total}</span>
  </div>`;
}

export function toolbarMarkup(listId, state, items) {
  const multi = (f) => `<div class="db-multi">
      <div class="meta">${esc(f.label)}</div>
      <select data-list-add-k="${listId}" data-k="${esc(f.k)}" aria-label="${esc(f.label)}"><option value="">+ добавить…</option>${f.options.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select>
      <div class="db-multi-values">${normFilter(state.filters[f.k]).map((v) => `<button type="button" class="chip chip-filter" data-list-filter-del="${listId}" data-k="${esc(f.k)}" data-value="${esc(v)}" title="Убрать значение">${esc(v)} ×</button>`).join('')}</div>
    </div>`;
  const key = ITEM_SORT[state.sort?.[0]] ? state.sort[0] : 'id';
  const options = SORT_GROUPS.map(([g, keys]) =>
    `<optgroup label="${esc(g)}">${keys.map((k) => `<option value="${k}"${k === key ? ' selected' : ''}>${esc(ITEM_SORT[k].name)}</option>`).join('')}</optgroup>`).join('');
  return `<div class="toolbar db-toolbar">
    <input type="search" data-list-q="${listId}" value="${esc(state.q)}" placeholder="Поиск" autocomplete="off">
    <button type="button" class="filters-btn" data-list-filters-open="${listId}" aria-expanded="${state.filtersOpen}">Фильтры</button>
    <div class="db-filters${state.filtersOpen ? ' open' : ''}" data-list-filters-panel="${listId}">
      <div class="filters-head"><b>Фильтры и сортировка</b><button type="button" class="x" data-list-filters-close="${listId}" title="Закрыть">✕</button></div>
      ${filterDefs(items).map(multi).join('')}
      <div class="sortbar"><label>Сортировка<select data-list-sort="${listId}">${options}</select></label>
        <button type="button" class="sortdir" data-list-dir="${listId}" title="Направление сортировки">${state.sort?.[1] === -1 ? '↓' : '↑'}</button></div>
      <label class="db-show-ids"><input type="checkbox" data-list-ids="${listId}"${state.showIds ? ' checked' : ''}> Показывать ID</label>
      <label class="db-show-ids"><input type="checkbox" data-list-fav="${listId}"${state.favOnly ? ' checked' : ''}> ★ Только избранное</label>
      <button type="button" class="filters-apply" data-list-filters-close="${listId}">Готово</button>
    </div>
  </div>
  <div class="filters-backdrop" data-list-filters-close="${listId}"${state.filtersOpen ? '' : ' hidden'}></div>`;
}
