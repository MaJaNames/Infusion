import { esc, num, RC, RARITIES, label, uniq } from '../core/util.js';
import { partsOf, KIND_LABEL, statChips } from '../modules/autoshop/parts.js';

const S = { tab: 'items', q: '', rar: '', f: '', n: 80 };
const TABS = [['items', 'Предметы'], ['cards', 'Карты'], ['parts', 'Детали техники'], ['rules', 'Сводки правил']];
const dl = (pairs) => `<dl>${pairs.filter(([, v]) => v && v.length).map(([k, v]) => `<dt>${k}</dt><dd>${esc(Array.isArray(v) ? v.join(', ') : v)}</dd>`).join('')}</dl>`;
const row = (cls, title, meta, price, body) => `<details class="row ${cls}"><summary><div>${title}<div class="meta">${meta}</div></div><span class="price">${price}</span></summary><div class="body">${body}</div></details>`;

export const itemRow = (it, controls = '') => row(RC[it.rarity] || 'c', `<span class="tag">${esc(it.tag || '—')}</span><b>${esc(it.name)}</b>`,
  `${esc(it.rarity)} · ${esc(it.category)}${it.iconic ? ' · культовый' : ''}${it.organization !== 'Общедоступно' ? ' · ' + esc(it.organization) : ''}`, num(it.cost),
  `${controls}<p class="desc">${esc(it.description)}</p>`);

export const cardRow = (c, controls = '') => row(RC[c.rarity] || 'c', `<span class="tag">${esc(c.tag || '—')}</span><b>${esc(c.name)}</b>`,
  `${esc(c.rarity)} · ${esc(c.school)}${c.essence ? ' · ' + esc(c.essence) : ''}`, `${c.price_tali ? num(c.price_tali) + ' тали' : '—'}<small>Кронос ${c.kronos}</small>`,
  `${controls}<div class="chips">${c.classes.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}${c.consumable ? '<span class="chip warn">расходуется</span>' : ''}</div>
   <p class="desc">${esc(c.mechanics)}</p>${dl([['Параметры', c.params], ['Тип урона', c.damage_type], ['Дальность', c.distance], ['Срабатывание', c.activation], ['Эффекты', c.effects], ['Испытание', c.test], ['Усиление', c.amplify], ['Сотворение', c.creation === 'Базис' ? '' : c.creation]])}`);

const partRow = (p) => row(RC[p.item.rarity] || 'c', `<span class="tag">${KIND_LABEL[p.stats.kind] || '?'}</span><b>${esc(p.item.name)}</b>`, esc(p.item.rarity), num(p.item.cost),
  `<div class="chips">${statChips(p.stats)}</div><p class="desc">${esc(p.stats.unique)}</p>`);

function rules(d) {
  const r = [];
  d.ranks.forEach((x) => r.push(['Ранг', `${x.level}. ${x.name}`, `ОЗ ${x.hp_base}, Кронос ${x.kronos_max}`, '']));
  d.skills.forEach((x) => r.push(['Навык', x.name, x.description, `${d.statMap.get(x.stat)?.name} ${x.tier}`]));
  d.abilities.forEach((x) => r.push([x.kind === 'mutation' ? 'Мутация' : 'Способность', x.name, x.description, x.class_requirement || '']));
  d.traits.forEach((x) => r.push(['Черта', x.name, x.description, '']));
  d.essences.forEach((x) => r.push(['Сущность', x.name, x.description, '']));
  d.beasts.forEach((x) => r.push(['Зверь', x.name, x.description, x.group_name || '']));
  return r;
}

function results(d) {
  const q = S.q.toLowerCase(), ok = (x, text) => (!q || text.toLowerCase().includes(q)) && (!S.rar || x.rarity === S.rar);
  let rows, draw;
  if (S.tab === 'items') { rows = d.items.filter((i) => ok(i, label(i) + i.description) && (!S.f || i.category === S.f)); draw = (i) => itemRow(i); }
  else if (S.tab === 'cards') { rows = d.cards.filter((c) => ok(c, c.name + c.mechanics + c.school) && (!S.f || c.classes.includes(S.f))); draw = (c) => cardRow(c); }
  else if (S.tab === 'parts') { rows = partsOf(d).filter((p) => ok(p.item, label(p.item) + p.item.description) && (!S.f || p.stats.kind === S.f)); draw = partRow; }
  else { rows = rules(d).filter((r) => !q || (r[1] + r[2]).toLowerCase().includes(q)); draw = (r) => row('', `<span class="tag">${esc(r[0])}</span><b>${esc(r[1])}</b>`, esc(r[3]), '', `<p class="desc">${esc(r[2])}</p>`); }
  return `<p class="meta">Найдено: ${rows.length}</p>${rows.length ? `<div class="list">${rows.slice(0, S.n).map(draw).join('')}</div>` : '<div class="empty">Ничего не найдено. Сбросьте часть фильтров.</div>'}
    ${rows.length > S.n ? `<button class="more">Показать ещё (${rows.length - S.n})</button>` : ''}`;
}

export function render(ctx) {
  const d = ctx.data, sel = (k, title, list, cur) => `<select data-k="${k}"><option value="">${title}</option>${list.map(([v, t]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const filter = { items: ['Категория', uniq(d.items, 'category').map((x) => [x, x])], cards: ['Класс', [...new Set(d.cards.flatMap((c) => c.classes))].sort().map((x) => [x, x])],
    parts: ['Тип детали', Object.entries(KIND_LABEL)] }[S.tab];
  return `<div class="tabs">${TABS.map(([id, t]) => `<button data-tab="${id}" class="${S.tab === id ? 'on' : ''}">${t}</button>`).join('')}</div>
    <div class="toolbar"><input type="search" data-k="q" placeholder="Поиск" value="${esc(S.q)}">${S.tab !== 'rules' ? sel('rar', 'Любая редкость', RARITIES.map((x) => [x, x]), S.rar) : ''}${filter ? sel('f', filter[0], filter[1], S.f) : ''}</div>
    <div id="res">${results(d)}</div>`;
}

export function bind(root, ctx) {
  const res = () => { root.querySelector('#res').innerHTML = results(ctx.data); };
  root.oninput = (e) => { if (e.target.dataset.k === 'q') { S.q = e.target.value; S.n = 80; res(); } };
  root.onchange = (e) => { const k = e.target.dataset.k; if (k === 'rar' || k === 'f') { S[k] = e.target.value; S.n = 80; res(); } };
  root.onclick = (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { Object.assign(S, { tab: t.dataset.tab, q: '', rar: '', f: '', n: 80 }); ctx.rerender(); }
    if (e.target.closest('.more')) { S.n += 80; res(); }
  };
}
