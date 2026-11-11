// Общий поисковый выпадающий список: разметка, открытие с ограничением высоты и клавиатура.
// Используется в «Персонаже» и в «Автомастерской», чтобы меню вело себя одинаково.
import { esc } from './util.js';

const cmpText = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'ru');
const MAX_POP = 352; // выше списка не раскрываем: меню не растягивается на весь экран

// Группы сортируются по rank (важность), внутри группы — по order (например, ID), иначе по названию.
export function groupedRows(rows) {
  const groups = new Map();
  for (const r of rows) {
    const g = r.group || 'Без группы';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  }
  return [...groups.entries()]
    .sort(([a, la], [b, lb]) => ((la[0]?.rank ?? 0) - (lb[0]?.rank ?? 0)) || cmpText(a, b))
    .map(([g, list]) => [g, [...list].sort((a, b) => cmpText(a.order ?? a.text, b.order ?? b.text))]);
}

export function comboList(rows) {
  if (!rows.length) return '<p class="combo-empty">Ничего не найдено</p>';
  const opt = (r) => `<button type="button" class="combo-opt" role="option" data-combo-opt="${esc(r.id)}">${esc(r.text)}</button>`;
  // Плоский режим: строки без группы выводятся в исходном порядке (детали Кочевника — по ID).
  if (rows.every((r) => !r.group)) return rows.map(opt).join('');
  return groupedRows(rows).map(([g, list]) =>
    `<div class="combo-group"><div class="combo-group-name">${esc(g)}</div>${list.map(opt).join('')}</div>`).join('');
}

export function closeComboPop(pop) {
  if (!pop) return;
  pop.hidden = true;
  pop.closest('[data-combo]')?.querySelector('[data-combo-btn]')?.setAttribute('aria-expanded', 'false');
}

export function closeCombos(scope) {
  scope?.querySelectorAll?.('[data-combo-pop]')?.forEach?.(closeComboPop);
}

// Открывает список под кнопкой, а если снизу мало места — над ней. Высота всегда влезает в экран.
export function openCombo(btn, rows, scope) {
  const combo = btn.closest('[data-combo]'), pop = combo?.querySelector('[data-combo-pop]');
  if (!pop) return;
  closeCombos(scope || (typeof document !== 'undefined' ? document : null));
  pop.hidden = false;
  const rect = btn.getBoundingClientRect(), gap = 8;
  const below = innerHeight - rect.bottom - gap, above = rect.top - gap;
  const up = below < MAX_POP && above > below;
  pop.classList.toggle('up', up);
  pop.style.maxHeight = `${Math.min(MAX_POP, Math.max(160, up ? above : below))}px`;
  btn.setAttribute('aria-expanded', 'true');
  const search = pop.querySelector('[data-combo-search]');
  if (search) { search.value = ''; search.focus(); }
  pop.querySelector('[data-combo-list]').innerHTML = comboList(rows);
}

export function comboKeydown(e) {
  const combo = e.target.closest?.('[data-combo]');
  if (!combo) return;
  const btn = combo.querySelector('[data-combo-btn]'), pop = combo.querySelector('[data-combo-pop]');
  if (e.key === 'Escape') {
    closeComboPop(pop);
    btn?.focus();
    return;
  }
  if (e.key === 'Enter' && e.target.matches('[data-combo-search]')) {
    const first = combo.querySelector('.combo-opt');
    if (first) { e.preventDefault(); first.click(); }
    return;
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const opts = [...combo.querySelectorAll('.combo-opt')];
    if (!opts.length) return;
    e.preventDefault();
    const i = opts.indexOf(e.target);
    const next = e.key === 'ArrowDown' ? (i < 0 ? 0 : Math.min(opts.length - 1, i + 1)) : (i <= 0 ? 0 : i - 1);
    opts[next].focus();
  }
}

// Клик мимо списка закрывает все открытые меню. Один слушатель на страницу.
export function installComboClose() {
  if (typeof document === 'undefined' || document._infusionComboClose) return;
  document._infusionComboClose = (e) => {
    if (e.target.closest?.('[data-combo]')) return;
    document.querySelectorAll('[data-combo-pop]:not([hidden])').forEach(closeComboPop);
  };
  document.addEventListener('click', document._infusionComboClose);
}
