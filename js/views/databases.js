import { esc, num, RC, RARITIES, label, uniq } from '../core/util.js';
import { RULES } from '../character/rules.js';
import { partsOf, KIND_LABEL, STAT_LABEL, statChips } from '../modules/autoshop/parts.js';

const S = {
  tab: 'items', q: '', rar: '', f: '', n: 80,
  sort: { items: ['id', 1], cards: ['id', 1], parts: ['id', 1] },
};
const TABS = [['items', 'Предметы'], ['cards', 'Карты'], ['parts', 'Детали техники'], ['rules', 'Сводки правил']];
const dl = (pairs) => `<dl>${pairs.filter(([, v]) => v && v.length).map(([k, v]) => `<dt>${k}</dt><dd>${esc(Array.isArray(v) ? v.join(', ') : v)}</dd>`).join('')}</dl>`;
const row = (cls, title, meta, price, body, o = {}) => `<details class="row ${cls}"${o.openKey ? ` data-row="${esc(o.openKey)}"` : ''}${o.open ? ' open' : ''}><summary><div>${title}<div class="meta">${meta}</div></div><span class="price">${price}</span></summary><div class="body">${body}</div></details>`;
const qtyLine = (qty) => (qty ? `<small>Кол-во: ${num(qty)}</small>` : '');

export const itemRow = (it, controls = '', o = {}) => row(RC[it.rarity] || 'c', `<span class="tag">${esc(it.tag || '—')}</span><b>${esc(it.name)}</b>`,
  `${esc(it.rarity)} · ${esc(it.category)}${it.iconic ? ' · культовый' : ''}${it.organization !== 'Общедоступно' ? ' · ' + esc(it.organization) : ''}`, `${num(it.cost)}${qtyLine(o.qty)}`,
  `${controls}<p class="desc">${esc(it.description)}</p>`, o);

export const cardRow = (c, controls = '', o = {}) => row(RC[c.rarity] || 'c', `<span class="tag">${esc(c.tag || '—')}</span><b>${esc(c.name)}</b>`,
  `${esc(c.rarity)} · ${esc(c.school)}${c.essence ? ' · ' + esc(c.essence) : ''}`, `${c.price_tali ? num(c.price_tali) + ' тали' : '—'}${qtyLine(o.qty)}<small>Кронос ${c.kronos}</small>`,
  `${controls}<div class="chips">${c.classes.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}${c.consumable ? '<span class="chip warn">расходуется</span>' : ''}</div>
   <p class="desc">${esc(c.mechanics)}</p>${dl([['Параметры', c.params], ['Тип урона', c.damage_type], ['Дальность', c.distance], ['Срабатывание', c.activation], ['Эффекты', c.effects], ['Испытание', c.test], ['Усиление', c.amplify], ['Сотворение', c.creation === 'Базис' ? '' : c.creation]])}`, o);

const partRow = (p) => row(RC[p.item.rarity] || 'c', `<span class="tag">${KIND_LABEL[p.stats.kind] || '?'}</span><b>${esc(p.item.name)}</b>`, esc(p.item.rarity), num(p.item.cost),
  `<div class="chips">${statChips(p.stats)}</div><p class="desc">${esc(p.stats.unique)}</p>`);

const RARITY_RANK = new Map(RARITIES.map((r, i) => [r, i]));
const cmpText = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'ru');
const cmpNum = (a, b) => (Number(a) || 0) - (Number(b) || 0);
const cmpBool = (a, b) => Number(!!a) - Number(!!b);
const cmpRarity = (a, b) => (RARITY_RANK.get(a) ?? 99) - (RARITY_RANK.get(b) ?? 99);
const sdef = (name, get, cmp = cmpText) => ({ name, get, cmp });
const arr = (v) => (Array.isArray(v) ? v.join(', ') : (v ?? ''));
const sell = (it) => it.sell_price ?? Math.round(it.cost * RULES.sellPriceRate);
const firstNum = (v) => { const m = String(v ?? '').match(/-?\d+/); return m ? Number(m[0]) : 0; };

const ITEM_SORT = {
  name: sdef('Название', (it) => label(it)),
  tag: sdef('Тег', (it) => it.tag || ''),
  rarity: sdef('Редкость', (it) => it.rarity, cmpRarity),
  category: sdef('Категория', (it) => it.category),
  organization: sdef('Организация', (it) => it.organization),
  iconic: sdef('Культовый', (it) => it.iconic, cmpBool),
  cost: sdef('Цена', (it) => it.cost, cmpNum),
  sell: sdef('Цена продажи', (it) => sell(it), cmpNum),
  issue: sdef('Проблема оформления', (it) => it.issue || ''),
  id: sdef('ID', (it) => it.id),
};

const CARD_SORT = {
  name: sdef('Название', (c) => label(c)),
  tag: sdef('Тег', (c) => c.tag || ''),
  rarity: sdef('Редкость', (c) => c.rarity, cmpRarity),
  school: sdef('Школа', (c) => c.school || ''),
  essence: sdef('Сущность', (c) => c.essence || ''),
  classes: sdef('Классы', (c) => arr(c.classes)),
  params: sdef('Параметры', (c) => c.params || ''),
  damage: sdef('Тип урона', (c) => c.damage_type || ''),
  distance: sdef('Дальность', (c) => firstNum(c.distance), cmpNum),
  activation: sdef('Срабатывание', (c) => arr(c.activation)),
  effects: sdef('Эффекты', (c) => arr(c.effects)),
  test: sdef('Испытание', (c) => c.test || ''),
  mechanics: sdef('Механика', (c) => c.mechanics || ''),
  amplify: sdef('Усиление', (c) => arr(c.amplify)),
  consumable: sdef('Расходуемая', (c) => c.consumable, cmpBool),
  kronos: sdef('Кронос', (c) => c.kronos, cmpNum),
  tali: sdef('Цена в тали', (c) => c.price_tali, cmpNum),
  creation: sdef('Сотворение', (c) => c.creation || ''),
  iconic: sdef('Культовый', (c) => c.iconic, cmpBool),
  id: sdef('ID', (c) => c.id),
};

const PART_SORT = {
  name: sdef('Название', (p) => p.item.name),
  kind: sdef('Тип детали', (p) => KIND_LABEL[p.stats.kind] || ''),
  rarity: sdef('Редкость', (p) => p.item.rarity, cmpRarity),
  cost: sdef('Цена', (p) => p.item.cost, cmpNum),
  hp: sdef(STAT_LABEL.hp, (p) => p.stats.hp, cmpNum),
  extraHp: sdef(STAT_LABEL.extraHp, (p) => p.stats.extraHp, cmpNum),
  defP: sdef(STAT_LABEL.defP, (p) => p.stats.defP, cmpNum),
  evasion: sdef(STAT_LABEL.evasion, (p) => p.stats.evasion, cmpNum),
  speed: sdef(STAT_LABEL.speed, (p) => p.stats.speed, cmpNum),
  screen: sdef(STAT_LABEL.screen, (p) => p.stats.screen, cmpNum),
  flight: sdef(STAT_LABEL.flight, (p) => p.stats.flight, cmpNum),
  seats: sdef(STAT_LABEL.seats, (p) => p.stats.seats, cmpNum),
  weaponSlots: sdef(STAT_LABEL.weaponSlots, (p) => p.stats.weaponSlots, cmpNum),
  heavySlots: sdef(STAT_LABEL.heavySlots, (p) => p.stats.heavySlots, cmpNum),
  atk: sdef(STAT_LABEL.atk, (p) => p.stats.atk, cmpNum),
  accuracy: sdef(STAT_LABEL.accuracy, (p) => p.stats.accuracy, cmpNum),
  avx: sdef(STAT_LABEL.avx, (p) => p.stats.avx, cmpNum),
  cd: sdef(STAT_LABEL.cd, (p) => p.stats.cd, cmpNum),
  kc: sdef(STAT_LABEL.kc, (p) => p.stats.kc, cmpNum),
  ksh: sdef(STAT_LABEL.ksh, (p) => p.stats.ksh, cmpNum),
  act: sdef(STAT_LABEL.act, (p) => p.stats.act, cmpNum),
  range: sdef('Дистанция', (p) => firstNum(p.stats.range), cmpNum),
  unique: sdef('Уникальный эффект', (p) => p.stats.unique || ''),
  id: sdef('ID', (p) => p.item.id),
};

const SORT_GROUPS = {
  items: [
    ['Основное', ['name', 'tag', 'rarity', 'category', 'organization', 'iconic']],
    ['Цены', ['cost', 'sell']],
    ['Служебное', ['issue', 'id']],
  ],
  cards: [
    ['Основное', ['name', 'tag', 'rarity', 'school', 'essence', 'classes', 'creation', 'iconic']],
    ['Параметры', ['params', 'damage', 'distance', 'activation', 'effects', 'test', 'amplify', 'consumable']],
    ['Текст', ['mechanics']],
    ['Цены', ['tali', 'kronos']],
    ['Служебное', ['id']],
  ],
  parts: [
    ['Основное', ['name', 'kind', 'rarity', 'cost', 'unique', 'id']],
    ['Защита и ход', ['hp', 'extraHp', 'defP', 'evasion', 'screen', 'flight', 'speed']],
    ['Бой', ['atk', 'accuracy', 'avx', 'cd', 'kc', 'ksh', 'act', 'range']],
    ['Комплектация', ['seats', 'weaponSlots', 'heavySlots']],
  ],
};

function sortDefs(kind) {
  return kind === 'items' ? ITEM_SORT : kind === 'cards' ? CARD_SORT : PART_SORT;
}

function sortBar(kind) {
  const defs = sortDefs(kind), st = S.sort[kind] || [];
  const key = defs[st[0]] ? st[0] : (defs.id ? 'id' : Object.keys(defs)[0]);
  const dir = st[1] === -1 ? -1 : 1;
  const options = (SORT_GROUPS[kind] || []).map(([g, keys]) =>
    `<optgroup label="${esc(g)}">${keys.filter((k) => defs[k]).map((k) => `<option value="${k}"${k === key ? ' selected' : ''}>${esc(defs[k].name)}</option>`).join('')}</optgroup>`).join('');
  return `<div class="sortbar"><label>Сортировка<select data-sort="${kind}">${options}</select></label>
    <button type="button" class="sortdir" data-dir="${kind}" title="Направление: ${dir > 0 ? 'по возрастанию' : 'по убыванию'}" aria-label="Направление сортировки: ${dir > 0 ? 'по возрастанию' : 'по убыванию'}">${dir > 0 ? '↑' : '↓'}</button></div>`;
}

function sortRows(kind, rows) {
  const defs = sortDefs(kind), st = S.sort[kind] || [];
  const key = defs[st[0]] ? st[0] : (defs.id ? 'id' : Object.keys(defs)[0]);
  const def = defs[key], sign = st[1] === -1 ? -1 : 1;
  return [...rows].sort((a, b) => sign * def.cmp(def.get(a), def.get(b)));
}

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
  let rows, draw, sortKind = null;
  if (S.tab === 'items') { rows = d.items.filter((i) => ok(i, label(i) + i.description) && (!S.f || i.category === S.f)); draw = (i) => itemRow(i); sortKind = 'items'; }
  else if (S.tab === 'cards') { rows = d.cards.filter((c) => ok(c, c.name + c.mechanics + c.school + arr(c.classes)) && (!S.f || c.classes.includes(S.f))); draw = (c) => cardRow(c); sortKind = 'cards'; }
  else if (S.tab === 'parts') { rows = partsOf(d).filter((p) => ok(p.item, label(p.item) + p.item.description) && (!S.f || p.stats.kind === S.f)); draw = partRow; sortKind = 'parts'; }
  else { rows = rules(d).filter((r) => !q || (r[1] + r[2]).toLowerCase().includes(q)); draw = (r) => row('', `<span class="tag">${esc(r[0])}</span><b>${esc(r[1])}</b>`, esc(r[3]), '', `<p class="desc">${esc(r[2])}</p>`); }
  if (sortKind) rows = sortRows(sortKind, rows);
  return `<p class="meta">Найдено: ${rows.length}</p>${rows.length ? `<div class="list">${rows.slice(0, S.n).map(draw).join('')}</div>` : '<div class="empty">Ничего не найдено. Сбросьте часть фильтров.</div>'}
    ${rows.length > S.n ? `<button class="more">Показать ещё (${rows.length - S.n})</button>` : ''}`;
}

export function render(ctx) {
  const d = ctx.data, sel = (k, title, list, cur) => `<select data-k="${k}"><option value="">${title}</option>${list.map(([v, t]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const filter = { items: ['Категория', uniq(d.items, 'category').map((x) => [x, x])], cards: ['Класс', [...new Set(d.cards.flatMap((c) => c.classes))].sort().map((x) => [x, x])],
    parts: ['Тип детали', Object.entries(KIND_LABEL)] }[S.tab];
  const hasFilters = S.tab !== 'rules';
  return `<div class="tabs db-tabs">${TABS.map(([id, t]) => `<button data-tab="${id}" class="${S.tab === id ? 'on' : ''}">${t}</button>`).join('')}</div>
    <select class="tabs-select" data-tab-select="1" aria-label="Раздел базы данных">${TABS.map(([id, t]) => `<option value="${id}"${S.tab === id ? ' selected' : ''}>${t}</option>`).join('')}</select>
    <div class="toolbar db-toolbar"><input type="search" data-k="q" placeholder="Поиск" value="${esc(S.q)}">${hasFilters ? `<button type="button" class="filters-btn" data-filters-open aria-expanded="false">Фильтры</button>
      <div class="db-filters" data-filters-panel>
        <div class="filters-head"><b>Фильтры и сортировка</b><button type="button" class="x" data-filters-close title="Закрыть">✕</button></div>
        ${S.tab !== 'rules' ? sel('rar', 'Любая редкость', RARITIES.map((x) => [x, x]), S.rar) : ''}${filter ? sel('f', filter[0], filter[1], S.f) : ''}${sortBar(S.tab)}
        <button type="button" class="filters-apply" data-filters-close>Готово</button>
      </div>` : ''}</div>
    ${hasFilters ? '<div class="filters-backdrop" data-filters-close hidden></div>' : ''}
    <div id="res">${results(d)}</div>`;
}

export function bind(root, ctx) {
  const res = () => { root.querySelector('#res').innerHTML = results(ctx.data); };
  const panel = () => root.querySelector('[data-filters-panel]');
  const backdrop = () => root.querySelector('.filters-backdrop');
  const btn = () => root.querySelector('[data-filters-open]');
  const setOpen = (open) => {
    panel()?.classList.toggle('open', open);
    if (backdrop()) backdrop().hidden = !open;
    document.body.classList.toggle('drawer-open', open);
    btn()?.setAttribute('aria-expanded', String(open));
  };
  const setTab = (id) => {
    setOpen(false);
    Object.assign(S, { tab: id, q: '', rar: '', f: '', n: 80 });
    ctx.rerender();
  };
  document.body.classList.remove('drawer-open');
  root.oninput = (e) => { if (e.target.dataset.k === 'q') { S.q = e.target.value; S.n = 80; res(); } };
  root.onchange = (e) => {
    const k = e.target.dataset.k;
    if (k === 'rar' || k === 'f') { S[k] = e.target.value; S.n = 80; res(); return; }
    if (e.target.dataset.sort) {
      const kind = e.target.dataset.sort, prev = S.sort[kind] || ['name', 1];
      S.sort[kind] = [e.target.value, prev[1] === -1 ? -1 : 1];
      res(); return;
    }
    if (e.target.dataset.tabSelect !== undefined) setTab(e.target.value);
  };
  root.onclick = (e) => {
    if (e.target.closest('[data-filters-open]')) { setOpen(true); return; }
    if (e.target.closest('[data-filters-close]')) { setOpen(false); return; }
    const t = e.target.closest('[data-tab]');
    if (t) { setTab(t.dataset.tab); return; }
    const dir = e.target.closest('[data-dir]');
    if (dir) {
      const kind = dir.dataset.dir, prev = S.sort[kind] || ['name', 1];
      const next = prev[1] === -1 ? 1 : -1;
      S.sort[kind] = [prev[0], next];
      dir.textContent = next > 0 ? '↑' : '↓';
      const title = `Направление: ${next > 0 ? 'по возрастанию' : 'по убыванию'}`;
      dir.title = title;
      dir.setAttribute('aria-label', `Направление сортировки: ${next > 0 ? 'по возрастанию' : 'по убыванию'}`);
      res(); return;
    }
    if (e.target.closest('.more')) { S.n += 80; res(); }
  };
}
