import { esc, num, RC, RARITIES, label, uniq, money } from '../core/util.js';
import { RULES } from '../character/rules.js';
import { partsOf, KIND_LABEL, STAT_LABEL, statChips } from '../modules/autoshop/parts.js';

const TABS = [['items', 'Предметы'], ['cards', 'Карты'], ['parts', 'Детали Кочевника'], ['rules', 'Справочник']];
const S = {
  tab: 'items', q: '',
  shown: { items: 40, cards: 40, parts: 40, rules: 30 },
  filters: {
    items: { rar: '', category: '', organization: '', iconic: '' },
    cards: { rar: '', classes: '', school: '', essence: '', creation: '', consumable: '', iconic: '' },
    parts: { rar: '', kind: '', organization: '' },
    rules: { group: '', sub: '', rar: '' },
  },
  sort: { items: ['id', 1], cards: ['id', 1], parts: ['id', 1], rules: ['group', 1] },
};
// Бесконечная лента: сколько записей подгружается за раз и сколько уже показано.
const BATCH = { items: 40, cards: 40, parts: 40, rules: 30 };
const shownCount = (kind) => S.shown[kind] ?? BATCH[kind];
const resetShown = (kind) => { S.shown[kind] = BATCH[kind]; };
const RULE_GROUPS = ['Константы', 'Способности', 'Зверь', 'Черта', 'Навыки'];
const RULE_GROUP_RANK = new Map(RULE_GROUPS.map((g, i) => [g, i]));
const RULE_SUB_RANK = new Map([['Ранги', 0], ['Сущности', 1], ['Способности', 2], ['Мутации', 3], ['Черты', 4]]);

const dl = (pairs) => `<dl>${pairs.filter(([, v]) => v && v.length).map(([k, v]) => `<dt>${k}</dt><dd>${esc(Array.isArray(v) ? v.join(', ') : v)}</dd>`).join('')}</dl>`;
const row = (cls, title, meta, price, body, o = {}) => `<details class="row ${cls}"${o.openKey ? ` data-row="${esc(o.openKey)}"` : ''}${o.open ? ' open' : ''}><summary><div>${title}<div class="meta">${meta}</div></div><span class="price">${price}</span></summary><div class="body">${body}</div></details>`;
const qtyLine = (qty) => (qty ? `<small>Кол-во: ${num(qty)}</small>` : '');
const credits = (n) => money(n, 'credits');
const tali = (n) => money(n, 'tali');

const RARITY_RANK = new Map(RARITIES.map((r, i) => [r, i]));
const cmpText = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'ru');
const cmpNum = (a, b) => (Number(a) || 0) - (Number(b) || 0);
const cmpBool = (a, b) => Number(!!a) - Number(!!b);
const cmpRarity = (a, b) => (RARITY_RANK.get(a) ?? 99) - (RARITY_RANK.get(b) ?? 99);
const sdef = (name, get, cmp = cmpText) => ({ name, get, cmp });
const arr = (v) => (Array.isArray(v) ? v.join(', ') : (v ?? ''));
const sell = (it) => it.sell_price ?? Math.round(it.cost * RULES.sellPriceRate);
const firstNum = (v) => { const m = String(v ?? '').match(/-?\d+/); return m ? Number(m[0]) : 0; };

export const itemRow = (it, controls = '', o = {}) => row(RC[it.rarity] || 'c', `<span class="tag">${esc(it.tag || '—')}</span><b>${esc(it.name)}</b>`,
  `${esc(it.rarity)} · ${esc(it.category)}${it.iconic && it.rarity !== 'Культовый' ? ' · культовый' : ''}${it.organization !== 'Общедоступно' ? ' · ' + esc(it.organization) : ''}`,
  `${credits(it.cost)}${qtyLine(o.qty)}<small class="sell">${credits(sell(it))}</small>`,
  `${controls}<p class="desc">${esc(it.description)}</p>`, o);

export const cardRow = (c, controls = '', o = {}) => row(RC[c.rarity] || 'c', `<span class="tag">${esc(c.tag || '—')}</span><b>${esc(c.name)}</b>`,
  `${esc(c.rarity)} · ${esc(c.school)}${c.essence ? ' · ' + esc(c.essence) : ''}`,
  `${c.price_tali ? tali(c.price_tali) : '—'}${qtyLine(o.qty)}${c.kronos ? `<small>Кронос ${num(c.kronos)}</small>` : ''}`,
  `${controls}<div class="chips">${(c.classes || []).map((x) => `<span class="chip">${esc(x)}</span>`).join('')}${c.consumable ? '<span class="chip warn">расходуется</span>' : ''}</div>
   <p class="desc">${esc(c.mechanics)}</p>${dl([['Параметры', c.params], ['Тип урона', c.damage_type], ['Дальность', c.distance], ['Срабатывание', c.activation], ['Эффекты', c.effects], ['Испытание', c.test], ['Усиление', c.amplify], ['Сотворение', c.creation === 'Базис' ? '' : c.creation]])}`, o);

const partRow = (p) => row(RC[p.item.rarity] || 'c', `<span class="tag">${KIND_LABEL[p.stats.kind] || '?'}</span><b>${esc(p.item.name)}</b>`, esc(p.item.rarity), credits(p.item.cost),
  `<div class="chips">${statChips(p.stats)}</div><p class="desc">${esc(p.stats.unique)}</p>`);

const ITEM_SORT = {
  name: sdef('Название', (it) => label(it)),
  tag: sdef('Тег', (it) => it.tag || ''),
  rarity: sdef('Редкость', (it) => it.rarity, cmpRarity),
  category: sdef('Категория', (it) => it.category),
  organization: sdef('Организация', (it) => it.organization),
  iconic: sdef('Культовый', (it) => it.iconic, cmpBool),
  cost: sdef('Цена', (it) => it.cost, cmpNum),
  sell: sdef('Цена продажи', (it) => sell(it), cmpNum),
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

const RULE_SORT = {
  name: sdef('Название', (r) => r.sortName || r.name),
  group: sdef('Раздел', (r) => r.group, (a, b) => (RULE_GROUP_RANK.get(a) ?? 99) - (RULE_GROUP_RANK.get(b) ?? 99)),
  sub: sdef('Подраздел', (r) => r.sub, (a, b) => (RULE_SUB_RANK.get(a) ?? 99) - (RULE_SUB_RANK.get(b) ?? 99) || cmpText(a, b)),
  type: sdef('Тип', (r) => r.type),
  rarity: sdef('Редкость', (r) => r.rarity || '', cmpRarity),
  detail: sdef('Параметр', (r) => r.detail || ''),
  description: sdef('Описание', (r) => r.description || ''),
  id: sdef('ID', (r) => r.id),
};

const SORT_GROUPS = {
  items: [
    ['Основное', ['name', 'tag', 'rarity', 'category', 'organization', 'iconic']],
    ['Цены', ['cost', 'sell']],
    ['Служебное', ['id']],
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
  rules: [
    ['Основное', ['name', 'group', 'sub', 'type', 'rarity', 'detail']],
    ['Текст', ['description']],
    ['Служебное', ['id']],
  ],
};

function sortDefs(kind) {
  return kind === 'items' ? ITEM_SORT : kind === 'cards' ? CARD_SORT : kind === 'rules' ? RULE_SORT : PART_SORT;
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

function rulesRows(d) {
  const rows = [];
  d.ranks.forEach((x) => rows.push({ id: `rank-${x.level}`, group: 'Константы', sub: 'Ранги', type: 'Ранг', name: `${x.level}. ${x.name}`, sortName: `${String(x.level).padStart(3, '0')} ${x.name}`, rarity: '', detail: `Уровень ${x.level}`, description: `ОЗ ${x.hp_base}, Кронос ${x.kronos_max}` }));
  d.essences.forEach((x) => rows.push({ id: `essence-${x.id}`, group: 'Константы', sub: 'Сущности', type: 'Сущность', name: x.name, rarity: '', detail: x.full_name || '', description: x.description }));
  d.abilities.forEach((x) => rows.push({ id: `ability-${x.id}`, group: 'Способности', sub: x.kind === 'mutation' ? 'Мутации' : 'Способности', type: x.kind === 'mutation' ? 'Мутация' : 'Способность', name: x.name, rarity: '', detail: x.class_requirement || '', description: x.description }));
  d.beasts.forEach((x) => rows.push({ id: `beast-${x.id}`, group: 'Зверь', sub: x.group_name || 'Без группы', type: 'Зверь', name: x.name, rarity: x.rarity || '', detail: x.group_name || '', description: x.description }));
  d.traits.forEach((x) => rows.push({ id: `trait-${x.id}`, group: 'Черта', sub: 'Черты', type: 'Черта', name: x.name, rarity: '', detail: '', description: x.description }));
  d.skills.forEach((x) => rows.push({ id: `skill-${x.id}`, group: 'Навыки', sub: d.statMap.get(x.stat)?.name || x.stat, type: 'Навык', name: x.name, rarity: x.rarity || '', detail: `${d.statMap.get(x.stat)?.name || x.stat} ${x.tier}`, description: x.description }));
  return rows;
}

const RULE_COLOR = { 'Ранг': 'c', 'Сущность': 'e', 'Способность': 'u', 'Мутация': 'u', 'Зверь': 'r', 'Черта': 'l', 'Навык': 'c' };
const ruleRow = (r) => row(RULE_COLOR[r.type] || 'c', `<span class="tag">${esc(r.sub || r.type)}</span><b>${esc(r.name)}</b>`,
  `${esc(r.group)}${r.detail ? ' · ' + esc(r.detail) : ''}${r.rarity ? ' · ' + esc(r.rarity) : ''}`, '',
  `<p class="desc">${esc(r.description)}</p>`);

function subOptions(d, group) {
  const seen = new Map();
  for (const r of rulesRows(d)) if ((!group || r.group === group) && !seen.has(r.sub)) seen.set(r.sub, r.group);
  return [...seen.entries()]
    .sort(([sa, ga], [sb, gb]) => ((RULE_GROUP_RANK.get(ga) ?? 99) - (RULE_GROUP_RANK.get(gb) ?? 99))
      || ((RULE_SUB_RANK.get(sa) ?? 99) - (RULE_SUB_RANK.get(sb) ?? 99)) || cmpText(sa, sb))
    .map(([s]) => [s, s]);
}

const boolOpts = [['1', 'Да'], ['0', 'Нет']];
const flagOpts = [['1', 'Культовые'], ['0', 'Без статуса']];

function filterDefs(d, tab) {
  if (tab === 'items') {
    return [
      { k: 'rar', label: 'Любая редкость', options: RARITIES.map((x) => [x, x]) },
      { k: 'category', label: 'Любая категория', options: uniq(d.items, 'category').map((x) => [x, x]) },
      { k: 'organization', label: 'Любая организация', options: uniq(d.items, 'organization').map((x) => [x, x]) },
      { k: 'iconic', label: 'Культовый: любой', options: flagOpts },
    ];
  }
  if (tab === 'cards') {
    const classes = [...new Set(d.cards.flatMap((c) => c.classes || []))].sort((a, b) => a.localeCompare(b, 'ru'));
    return [
      { k: 'rar', label: 'Любая редкость', options: RARITIES.filter((r) => d.cards.some((c) => c.rarity === r)).map((x) => [x, x]) },
      { k: 'classes', label: 'Любой класс', options: classes.map((x) => [x, x]) },
      { k: 'school', label: 'Любая школа', options: uniq(d.cards, 'school').map((x) => [x, x]) },
      { k: 'essence', label: 'Любая сущность', options: uniq(d.cards, 'essence').map((x) => [x, x]) },
      { k: 'creation', label: 'Любое сотворение', options: uniq(d.cards, 'creation').map((x) => [x, x]) },
      { k: 'consumable', label: 'Расходуемая: любая', options: boolOpts },
      { k: 'iconic', label: 'Культовый: любой', options: flagOpts },
    ];
  }
  if (tab === 'parts') {
    const ps = partsOf(d);
    return [
      { k: 'rar', label: 'Любая редкость', options: uniq(ps.map((p) => ({ rar: p.item.rarity })), 'rar').map((x) => [x, x]) },
      { k: 'kind', label: 'Любой тип детали', options: Object.entries(KIND_LABEL) },
      { k: 'organization', label: 'Любая организация', options: uniq(ps.map((p) => ({ organization: p.item.organization })), 'organization').map((x) => [x, x]) },
    ];
  }
  const rows = rulesRows(d);
  return [
    { k: 'group', label: 'Все разделы', options: RULE_GROUPS.map((x) => [x, x]) },
    { k: 'sub', label: 'Все подразделы', options: subOptions(d) },
    { k: 'rar', label: 'Любая редкость', options: RARITIES.filter((r) => rows.some((x) => x.rarity === r)).map((x) => [x, x]) },
  ];
}

const matches = (row, f) => Object.entries(f).every(([k, v]) => {
  if (!v) return true;
  const x = row[k];
  return Array.isArray(x) ? x.map(String).includes(v) : String(x ?? '') === v;
});

// Собирает отфильтрованный и отсортированный список для текущей вкладки.
function collect(d) {
  const q = S.q.trim().toLowerCase(), f = S.filters[S.tab] || {};
  const hit = (text) => !q || String(text ?? '').toLowerCase().includes(q);
  let rows, draw, sortKind = null;
  if (S.tab === 'items') {
    rows = d.items.filter((i) => hit(`${label(i)} ${i.description} ${i.category} ${i.organization} ${i.tag}`)
      && matches({ rar: i.rarity, category: i.category, organization: i.organization, iconic: i.iconic ? '1' : '0' }, f));
    draw = itemRow; sortKind = 'items';
  } else if (S.tab === 'cards') {
    rows = d.cards.filter((c) => hit(`${c.name} ${c.mechanics} ${c.school} ${arr(c.classes)} ${c.essence || ''}`)
      && matches({ rar: c.rarity, classes: c.classes, school: c.school, essence: c.essence, creation: c.creation, consumable: c.consumable ? '1' : '0', iconic: c.iconic ? '1' : '0' }, f));
    draw = cardRow; sortKind = 'cards';
  } else if (S.tab === 'parts') {
    rows = partsOf(d).filter((p) => hit(`${label(p.item)} ${p.item.description} ${p.stats.unique || ''}`)
      && matches({ rar: p.item.rarity, kind: p.stats.kind, organization: p.item.organization }, f));
    draw = partRow; sortKind = 'parts';
  } else {
    rows = rulesRows(d).filter((r) => hit(`${r.name} ${r.description} ${r.detail} ${r.group} ${r.sub}`)
      && matches({ group: r.group, sub: r.sub, rar: r.rarity }, f));
    draw = ruleRow; sortKind = 'rules';
  }
  if (sortKind) rows = sortRows(sortKind, rows);
  return { rows, draw };
}

const renderRows = (rows, draw) => rows.map((r) => draw(r)).join('');

function moreInner(kind, shown, total) {
  if (shown >= total) return `<p class="page-info meta">Показаны все ${num(total)}</p>`;
  const left = total - shown, step = Math.min(BATCH[kind] || 40, left);
  return `<button type="button" class="more" data-more="${kind}">Показать ещё ${num(step)}</button>
    <p class="page-info meta">Показано ${num(shown)} из ${num(total)}</p>`;
}

const moreBlock = (kind, shown, total) => (total ? `<div class="more-wrap" data-more-sentinel>${moreInner(kind, shown, total)}</div>` : '');

function results(d) {
  const { rows, draw } = collect(d);
  const kind = S.tab, total = rows.length;
  const limit = Math.min(shownCount(kind), total);
  S.shown[kind] = limit;
  const list = total
    ? `<div class="list">${renderRows(rows.slice(0, limit), draw)}</div>`
    : '<div class="empty">Ничего не найдено. Сбросьте часть фильтров.</div>';
  return `<p class="meta">Найдено: ${num(total)}</p>${list}${moreBlock(kind, limit, total)}`;
}

// Догружает следующую порцию в конец ленты, не перерисовывая уже открытые строки.
function appendMore(root, ctx) {
  const resEl = root.querySelector('#res');
  if (!resEl) return;
  const { rows, draw } = collect(ctx.data);
  const kind = S.tab, total = rows.length, start = Math.min(shownCount(kind), total);
  if (start >= total) return;
  const list = resEl.querySelector('.list');
  if (!list) return;
  const next = rows.slice(start, start + (BATCH[kind] || 40));
  list.insertAdjacentHTML('beforeend', renderRows(next, draw));
  S.shown[kind] = start + next.length;
  const sentinel = root.querySelector('[data-more-sentinel]');
  if (sentinel) sentinel.innerHTML = moreInner(kind, S.shown[kind], total);
}

export function render(ctx) {
  const d = ctx.data, cur = S.filters[S.tab] || {};
  const sel = (k, title, list, val) => `<select data-k="${k}" aria-label="${esc(title)}"><option value="">${esc(title)}</option>${list.map(([v, t]) => `<option value="${esc(v)}"${v === val ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  return `<div class="tabs db-tabs">${TABS.map(([id, t]) => `<button data-tab="${id}" class="${S.tab === id ? 'on' : ''}">${t}</button>`).join('')}</div>
    <select class="tabs-select" data-tab-select="1" aria-label="Раздел базы данных">${TABS.map(([id, t]) => `<option value="${id}"${S.tab === id ? ' selected' : ''}>${t}</option>`).join('')}</select>
    <div class="toolbar db-toolbar"><input type="search" data-k="q" placeholder="Поиск" value="${esc(S.q)}"><button type="button" class="filters-btn" data-filters-open aria-expanded="false">Фильтры</button>
      <div class="db-filters" data-filters-panel>
        <div class="filters-head"><b>Фильтры и сортировка</b><button type="button" class="x" data-filters-close title="Закрыть">✕</button></div>
        ${filterDefs(d, S.tab).map((f) => sel(f.k, f.label, f.options, cur[f.k] || '')).join('')}${sortBar(S.tab)}
        <button type="button" class="filters-apply" data-filters-close>Готово</button>
      </div></div>
    <div class="filters-backdrop" data-filters-close hidden></div>
    <div id="res">${results(d)}</div>`;
}

export function bind(root, ctx) {
  root._dbObserver?.disconnect?.();
  const res = () => {
    const el = root.querySelector('#res');
    if (el) el.innerHTML = results(ctx.data);
    observeMore();
  };
  const loadMore = () => { appendMore(root, ctx); observeMore(); };
  let io = null;
  const observeMore = () => {
    if (typeof IntersectionObserver === 'undefined') return;
    const el = root.querySelector('[data-more-sentinel]');
    if (!el) { io?.disconnect(); io = null; return; }
    if (!io) io = new IntersectionObserver((entries) => {
      if (entries.some((x) => x.isIntersecting)) loadMore();
    }, { rootMargin: '400px 0px' });
    // Переподписка заставляет observer заново проверить позицию после догрузки.
    io.disconnect();
    io.observe(el);
  };
  const panel = () => root.querySelector('[data-filters-panel]');
  const backdrop = () => root.querySelector('.filters-backdrop');
  const btn = () => root.querySelector('[data-filters-open]');
  const setOpen = (open) => {
    panel()?.classList.toggle('open', open);
    if (backdrop()) backdrop().hidden = !open;
    if (typeof document !== 'undefined') document.body.classList.toggle('drawer-open', open);
    btn()?.setAttribute('aria-expanded', String(open));
  };
  const setTab = (id) => {
    setOpen(false);
    S.tab = id; S.q = '';
    resetShown(id);
    const f = S.filters[id];
    if (f) for (const k of Object.keys(f)) f[k] = '';
    ctx.rerender();
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  };
  if (typeof document !== 'undefined') document.body.classList.remove('drawer-open');
  root.oninput = (e) => {
    if (e.target.dataset.k !== 'q') return;
    S.q = e.target.value; resetShown(S.tab); res();
  };
  root.onchange = (e) => {
    const k = e.target.dataset.k;
    if (k === 'q') return;
    if (k) {
      if (!S.filters[S.tab]) S.filters[S.tab] = {};
      S.filters[S.tab][k] = e.target.value;
      // В справочнике подразделы зависят от выбранного раздела.
      if (S.tab === 'rules' && k === 'group') {
        S.filters.rules.sub = '';
        const sub = root.querySelector('[data-k="sub"]');
        if (sub) {
          sub.innerHTML = `<option value="">Все подразделы</option>${subOptions(ctx.data, e.target.value).map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}`;
        }
      }
      resetShown(S.tab);
      res(); return;
    }
    if (e.target.dataset.sort) {
      const kind = e.target.dataset.sort, prev = S.sort[kind] || ['name', 1];
      S.sort[kind] = [e.target.value, prev[1] === -1 ? -1 : 1];
      resetShown(kind); res(); return;
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
      resetShown(kind);
      dir.textContent = next > 0 ? '↑' : '↓';
      const title = `Направление: ${next > 0 ? 'по возрастанию' : 'по убыванию'}`;
      dir.title = title;
      dir.setAttribute('aria-label', `Направление сортировки: ${next > 0 ? 'по возрастанию' : 'по убыванию'}`);
      res(); return;
    }
    if (e.target.closest('[data-more]')) loadMore();
  };
  observeMore();
  root._dbObserver = io;
}
