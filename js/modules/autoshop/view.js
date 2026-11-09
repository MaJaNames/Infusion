import { esc, num, label, opts, set, fieldValue, optLabel } from '../../core/util.js';
import { partsOf, KIND_LABEL, statChips } from './parts.js';
import { summarize } from './aggregate.js';

const KEY = 'infusion.build';
const blank = () => ({ body: null, wheels: null, engine: null, weapons: [null, null, null], modules: [null, null, null, null, null], discount: 0 });
const load = () => { try { return { ...blank(), ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return blank(); } };
const save = (b) => { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch { /* память браузера недоступна */ } };
let B = load();

const TOTALS = [['maxHp', 'Макс. ОЗ'], ['defP', 'ДЕФ.П'], ['evasion', 'Уклонение'], ['speed', 'Скороход'], ['screen', 'Экранирование'], ['flight', 'Полёт'],
  ['weaponSlots', 'Слоты оружий'], ['heavySlots', 'Макс. сверхтяж'], ['seats', 'Кол-во мест'], ['cost', 'Стоимость']];

export function render(ctx) {
  const parts = partsOf(ctx.data), of = (kind) => parts.filter((p) => p.stats.kind === kind);
  const find = (id) => parts.find((p) => p.item.id === id);
  const pick = (id) => { const p = id && find(id); return p ? { cost: p.item.cost, stats: p.stats, name: label(p.item) } : null; };
  const select = (path, kind, cur) => `<select data-b="${path}"><option value="">—</option>${opts(of(kind), cur, (p) => optLabel(p.item), (p) => p.item.id)}</select>`;
  const sum = summarize({ body: pick(B.body), wheels: pick(B.wheels), engine: pick(B.engine), weapons: B.weapons.map(pick), modules: B.modules.map(pick), discount: B.discount });
  const picked = [B.body, B.wheels, B.engine, ...B.weapons, ...B.modules].map(find).filter(Boolean);

  return `<section class="panel"><div class="grid">
    <label>${KIND_LABEL.body}${select('body', 'body', B.body)}</label><label>${KIND_LABEL.wheels}${select('wheels', 'wheels', B.wheels)}</label><label>${KIND_LABEL.engine}${select('engine', 'engine', B.engine)}</label>
    ${B.weapons.map((w, i) => `<label>Оружие ${i + 1}${select(`weapons.${i}`, 'weapon', w)}</label>`).join('')}
    ${B.modules.map((m, i) => `<label>Модуль ${i + 1}${select(`modules.${i}`, 'module', m)}</label>`).join('')}
    <label>Скидка, %<input type="number" min="0" max="100" data-b="discount" value="${B.discount}"></label></div></section>
  <section class="panel"><h2>Итоги</h2><table>${TOTALS.map(([k, t]) => `<tr><th>${t}</th><td>${num(sum[k])}</td></tr>`).join('')}</table>
    ${sum.warnings.map((w) => `<p class="bad">${esc(w)}</p>`).join('')}</section>
  <section class="panel"><h2>Состав</h2>${picked.map((p) => `<p><b>${esc(label(p.item))}</b><span class="chips">${statChips(p.stats)}</span>${p.stats.unique ? `<span class="meta">${esc(p.stats.unique)}</span>` : ''}</p>`).join('') || '<p class="meta">Выберите детали выше.</p>'}
    <button data-b-clear class="danger">Очистить сборку</button></section>`;
}

export function bind(root, ctx) {
  root.onchange = (e) => { if (e.target.dataset.b) { set(B, e.target.dataset.b, fieldValue(e.target) ?? (e.target.type === 'number' ? 0 : null)); save(B); ctx.rerender(); } };
  root.onclick = (e) => { if (e.target.closest('[data-b-clear]')) { B = blank(); save(B); ctx.rerender(); } };
}
