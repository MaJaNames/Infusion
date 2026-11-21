import { esc, num, RC, RARITIES, label, uniq, money, copyText } from '../core/util.js';
import { fuzzyFilter } from '../core/fuzzy.js';
import { RULES } from '../character/rules.js';
import { partsOf, KIND_LABEL, STAT_LABEL, statChips, droneChips } from '../modules/autoshop/parts.js';
import { showToast } from '../core/toast.js';
import { rulesRows } from '../core/rules-rows.js';
import { permalinkPath } from '../core/links.js';
import { canonKey } from '../core/ids.js';
import { isFavorite, toggleFavorite, favoriteKey } from '../core/favorites.js';

const TABS = [['items', 'Предметы'], ['cards', 'Карты'], ['parts', 'Детали Кочевника'], ['rules', 'Справочник']];
const DEFAULT_SORT = { items: ['id', 1], cards: ['id', 1], parts: ['id', 1], rules: ['group', 1] };
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
  // ID из БД скрыты по умолчанию; включаются галочкой в фильтрах.
  showIds: false,
  // Избранное: фильтр по подвкладкам (в адресе — fav=1).
  favOnly: { items: false, cards: false, parts: false, rules: false },
  // Drawer фильтров должен оставаться открытым после перерисовки при добавлении значения.
  filtersOpen: false,
  // Запись, открытая по прямой ссылке (#db/items/0x0c9).
  openId: null,
  scrollToOpen: false,
};
// Бесконечная лента: сколько записей подгружается за раз и сколько уже показано.
const BATCH = { items: 40, cards: 40, parts: 40, rules: 30 };
const shownCount = (kind) => S.shown[kind] ?? BATCH[kind];
const resetShown = (kind) => { S.shown[kind] = BATCH[kind]; };
const RULE_GROUPS = ['Константы', 'Способности', 'Зверь', 'Черта', 'Навыки'];
const RULE_GROUP_RANK = new Map(RULE_GROUPS.map((g, i) => [g, i]));
const RULE_SUB_RANK = new Map([['Ранги', 0], ['Сущности', 1], ['Способности', 2], ['Мутации', 3], ['Черты', 4]]);

const dl = (pairs) => `<dl>${pairs.filter(([, v]) => v && v.length).map(([k, v]) => `<dt>${k}</dt><dd>${esc(Array.isArray(v) ? v.join(', ') : v)}</dd>`).join('')}</dl>`;
const row = (cls, title, meta, price, body, o = {}) => `<details class="row ${cls}${o.permalink ? ' is-permalink' : ''}"${o.openKey ? ` data-row="${esc(o.openKey)}"` : ''}${o.open ? ' data-deep-open="1" open' : ''}><summary><div>${o.ord ? `<span class="row-no" title="Порядковый номер в data.json">#${num(o.ord)}</span>` : ''}${title}<div class="meta">${meta}${o.id ? ` <span class="row-id" title="ID в БД">ID ${esc(o.id)}</span>` : ''}</div></div><span class="row-side">${o.badge || ''}${o.fav ? `<button type="button" class="row-fav${isFavorite(o.fav.kind, o.fav.id) ? ' on' : ''}" data-fav="${esc(favoriteKey(o.fav.kind, o.fav.id))}" title="В избранное" aria-label="В избранное">★</button>` : ''}<span class="price">${price}</span>${o.share ? `<button type="button" class="row-share" data-share="${esc(o.share)}" title="${esc(o.shareTitle || 'Скопировать ссылку')}" aria-label="${esc(o.shareTitle || 'Скопировать ссылку')}">🔗</button>` : ''}</span></summary><div class="body">${body}</div></details>`;
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
  `${credits(o.cost ?? it.cost)}${qtyLine(o.qty)}<small class="sell">${credits(sell(it))}</small>`,
  `${controls}<p class="desc">${esc(it.description)}</p>`, o);

export const cardRow = (c, controls = '', o = {}) => row(RC[c.rarity] || 'c', `<span class="tag">${esc(c.tag || '—')}</span><b>${esc(c.name)}</b>`,
  `${esc(c.rarity)} · ${esc(c.school)}${c.essence ? ' · ' + esc(c.essence) : ''}`,
  `${c.price_tali ? tali(c.price_tali) : '—'}${qtyLine(o.qty)}${c.kronos ? `<small>Кронос ${num(c.kronos)}</small>` : ''}`,
  `${controls}<div class="chips">${(c.classes || []).map((x) => `<span class="chip">${esc(x)}</span>`).join('')}${c.consumable ? '<span class="chip warn">расходуется</span>' : ''}</div>
   <p class="desc">${esc(c.mechanics)}</p>${dl([['Параметры', c.params], ['Тип урона', c.damage_type], ['Дальность', c.distance], ['Срабатывание', c.activation], ['Эффекты', c.effects], ['Испытание', c.test], ['Усиление', c.amplify], ['Сотворение', c.creation === 'Базис' ? '' : c.creation]])}`, o);

const partRow = (p, o = {}) => row(RC[p.item.rarity] || 'c', `<span class="tag">${KIND_LABEL[p.stats.kind] || '?'}</span><b>${esc(p.item.name)}</b>`, esc(p.item.rarity), credits(p.item.cost),
  `<div class="chips">${p.drone ? `${droneChips(p.drone)}<span class="chip drone">Дрон</span>` : statChips(p.stats)}</div><p class="desc">${esc(p.stats.unique)}</p>`, o);

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

function sortRows(kind, rows, scores = null) {
  const defs = sortDefs(kind), st = S.sort[kind] || [];
  const key = defs[st[0]] ? st[0] : (defs.id ? 'id' : Object.keys(defs)[0]);
  const def = defs[key], sign = st[1] === -1 ? -1 : 1;
  return [...rows].sort((a, b) => {
    // При поиске сначала идут самые точные совпадения, затем — выбранная сортировка.
    if (scores) {
      const byScore = (scores.get(b) || 0) - (scores.get(a) || 0);
      if (byScore) return byScore;
    }
    return sign * def.cmp(def.get(a), def.get(b));
  });
}

const RULE_COLOR = { 'Ранг': 'c', 'Сущность': 'e', 'Способность': 'u', 'Мутация': 'u', 'Зверь': 'r', 'Черта': 'l', 'Навык': 'c' };
const ruleRow = (r, o = {}) => row(r.rc || RULE_COLOR[r.type] || 'c', `<span class="tag">${esc(r.sub || r.type)}</span><b>${esc(r.name)}</b>`,
  `${esc(r.group)}${r.detail ? ' · ' + esc(r.detail) : ''}${r.rarity ? ' · ' + esc(r.rarity) : ''}`, '',
  `<p class="desc">${esc(r.description)}</p>`, o);

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

// Одно значение в фильтре хранится массивом; старые строки из адреса тоже работают.
const normFilter = (v) => (Array.isArray(v) ? v.filter(Boolean).map(String) : v ? [String(v)] : []);

// Внутри одного фильтра — ИЛИ, между разными фильтрами — И.
const matches = (row, f) => Object.entries(f).every(([k, v]) => {
  const wanted = normFilter(v);
  if (!wanted.length) return true;
  const x = row[k];
  const have = Array.isArray(x) ? x.map(String) : [String(x ?? '')];
  return wanted.some((w) => have.includes(w));
});

// Состояние раздела в адресе: #db/items/0x0c9?q=…&sort=cost&dir=-1
function routeString(openId = S.openId) {
  const params = new URLSearchParams();
  if (S.q.trim()) params.set('q', S.q.trim());
  const f = S.filters[S.tab] || {};
  for (const [k, v] of Object.entries(f)) for (const value of normFilter(v)) params.append(k, value);
  const [sortKey, dir] = S.sort[S.tab] || DEFAULT_SORT[S.tab];
  if (sortKey && sortKey !== DEFAULT_SORT[S.tab][0]) params.set('sort', sortKey);
  if (dir === -1) params.set('dir', '-1');
  if (S.showIds) params.set('ids', '1');
  if (S.favOnly[S.tab]) params.set('fav', '1');
  const path = openId ? `${S.tab}/${encodeURIComponent(openId)}` : S.tab;
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

function shareUrl(path) {
  if (typeof document === 'undefined') return path;
  try { return new URL(path, document.baseURI).href; } catch { return path; }
}

const deepIdOf = (kind, r) => (kind === 'parts' ? r.item?.id : r.id);

// Избранное хранится по виду пермалинка, а фильтр включается для подвкладки.
const favKeep = (kind, tab, list, idOf = (x) => x.id) => (S.favOnly[tab] ? list.filter((x) => isFavorite(kind, idOf(x))) : list);

// Собирает отфильтрованный и отсортированный список для текущей вкладки.
function collect(d) {
  const q = S.q.trim(), f = S.filters[S.tab] || {};
  const isOpen = (key) => !!S.openId && String(S.openId) === String(key);
  let rows, draw, sortKind = null, scores = null, ord = null;
  if (S.tab === 'items') {
    ({ rows, scores } = fuzzyFilter(favKeep('items', 'items', d.items.filter((i) => matches({ rar: i.rarity, category: i.category, organization: i.organization, iconic: i.iconic ? '1' : '0' }, f))),
      q, (i) => `${label(i)} ${i.description} ${i.category} ${i.organization} ${i.tag}`));
    draw = (it, controls, o = {}) => itemRow(it, controls, { ...o, id: S.showIds ? it.id : null, openKey: `items:${it.id}`, open: isOpen(it.id), permalink: isOpen(it.id), share: permalinkPath('items', it.id), fav: { kind: 'items', id: it.id } });
    sortKind = 'items';
    ord = new Map(d.items.map((x, i) => [x, i + 1]));
  } else if (S.tab === 'cards') {
    ({ rows, scores } = fuzzyFilter(favKeep('cards', 'cards', d.cards.filter((c) => matches({ rar: c.rarity, classes: c.classes, school: c.school, essence: c.essence, creation: c.creation, consumable: c.consumable ? '1' : '0', iconic: c.iconic ? '1' : '0' }, f))),
      q, (c) => `${c.name} ${c.mechanics} ${c.school} ${arr(c.classes)} ${c.essence || ''}`));
    draw = (cd, controls, o = {}) => cardRow(cd, controls, { ...o, id: S.showIds ? cd.id : null, openKey: `cards:${cd.id}`, open: isOpen(cd.id), permalink: isOpen(cd.id), share: permalinkPath('cards', cd.id), fav: { kind: 'cards', id: cd.id } });
    sortKind = 'cards';
    ord = new Map(d.cards.map((x, i) => [x, i + 1]));
  } else if (S.tab === 'parts') {
    ({ rows, scores } = fuzzyFilter(favKeep('items', 'parts', partsOf(d).filter((p) => matches({ rar: p.item.rarity, kind: p.stats.kind, organization: p.item.organization }, f)), (p) => p.item.id),
      q, (p) => `${label(p.item)} ${p.item.description} ${p.stats.unique || ''}`));
    draw = (p, controls, o = {}) => partRow(p, { ...o, id: S.showIds ? p.item.id : null, openKey: `parts:${p.item.id}`, open: isOpen(p.item.id), permalink: isOpen(p.item.id), share: permalinkPath('items', p.item.id), shareTitle: 'Скопировать ссылку на предмет', fav: { kind: 'items', id: p.item.id } });
    sortKind = 'parts';
  } else {
    ({ rows, scores } = fuzzyFilter(favKeep('rules', 'rules', rulesRows(d).filter((r) => matches({ group: r.group, sub: r.sub, rar: r.rarity }, f))),
      q, (r) => `${r.name} ${r.description} ${r.detail} ${r.group} ${r.sub}`));
    draw = (r, controls, o = {}) => ruleRow(r, { ...o, id: S.showIds ? r.dbId : null, openKey: `rules:${r.id}`, open: isOpen(r.id), permalink: isOpen(r.id), share: permalinkPath('rules', r.id), fav: { kind: 'rules', id: r.id } });
    sortKind = 'rules';
  }
  // При поиске первична точность совпадения, выбранная сортировка — вторична.
  if (sortKind) rows = sortRows(sortKind, rows, scores);
  return { rows, draw, ord };
}

const renderRows = (rows, draw, ord = null) => rows.map((r) => (ord ? draw(r, '', { ord: ord.get(r) }) : draw(r))).join('');

function moreInner(kind, shown, total) {
  if (shown >= total) return `<p class="page-info meta">Показаны все ${num(total)}</p>`;
  const left = total - shown, step = Math.min(BATCH[kind] || 40, left);
  return `<button type="button" class="more" data-more="${kind}">Показать ещё ${num(step)}</button>
    <p class="page-info meta">Показано ${num(shown)} из ${num(total)}</p>`;
}

const moreBlock = (kind, shown, total) => (total ? `<div class="more-wrap" data-more-sentinel>${moreInner(kind, shown, total)}</div>` : '');

function results(d) {
  const { rows, draw, ord } = collect(d);
  const kind = S.tab, total = rows.length;
  let limit = Math.min(shownCount(kind), total);
  // Прямая ссылка должна показать запись, даже если она дальше первой порции.
  if (S.openId) {
    const i = rows.findIndex((r) => String(deepIdOf(kind, r)) === String(S.openId));
    if (i >= 0) limit = Math.max(limit, Math.min(total, i + 1));
  }
  S.shown[kind] = limit;
  const list = total
    ? `<div class="list">${renderRows(rows.slice(0, limit), draw, ord)}</div>`
    : '<div class="empty">Ничего не найдено. Сбросьте часть фильтров.</div>';
  return `<p class="meta">Найдено: ${num(total)}</p>${list}${moreBlock(kind, limit, total)}`;
}

// Догружает следующую порцию в конец ленты, не перерисовывая уже открытые строки.
function appendMore(root, ctx) {
  const resEl = root.querySelector('#res');
  if (!resEl) return;
  const { rows, draw, ord } = collect(ctx.data);
  const kind = S.tab, total = rows.length, start = Math.min(shownCount(kind), total);
  if (start >= total) return;
  const list = resEl.querySelector('.list');
  if (!list) return;
  const next = rows.slice(start, start + (BATCH[kind] || 40));
  list.insertAdjacentHTML('beforeend', renderRows(next, draw, ord));
  S.shown[kind] = start + next.length;
  const sentinel = root.querySelector('[data-more-sentinel]');
  if (sentinel) sentinel.innerHTML = moreInner(kind, S.shown[kind], total);
}

export function render(ctx) {
  const d = ctx.data, cur = S.filters[S.tab] || {};
  const multi = (k, title, options, values) => `<div class="db-multi">
        <div class="meta">${esc(title)}</div>
        <select data-add-k="${esc(k)}" aria-label="${esc(title)}"><option value="">+ добавить…</option>${options.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select>
        <div class="db-multi-values">${normFilter(values).map((v) => `<button type="button" class="chip chip-filter" data-filter-del="${esc(k)}" data-value="${esc(v)}" title="Убрать значение">${esc(v)} ×</button>`).join('')}</div>
      </div>`;
  return `<div class="tabs db-tabs">${TABS.map(([id, t]) => `<button data-tab="${id}" class="${S.tab === id ? 'on' : ''}">${t}</button>`).join('')}</div>
    <select class="tabs-select" data-tab-select="1" aria-label="Раздел базы данных">${TABS.map(([id, t]) => `<option value="${id}"${S.tab === id ? ' selected' : ''}>${t}</option>`).join('')}</select>
    <div class="toolbar db-toolbar"><input type="search" data-k="q" placeholder="Поиск" value="${esc(S.q)}"><button type="button" class="filters-btn" data-filters-open aria-expanded="false">Фильтры</button>
      <div class="db-filters" data-filters-panel>
        <div class="filters-head"><b>Фильтры и сортировка</b><button type="button" class="x" data-filters-close title="Закрыть">✕</button></div>
        ${filterDefs(d, S.tab).map((f) => multi(f.k, f.label, f.options, cur[f.k])).join('')}${sortBar(S.tab)}
        <label class="db-show-ids"><input type="checkbox" data-show-ids${S.showIds ? ' checked' : ''}> Показывать ID</label>
        <label class="db-show-ids"><input type="checkbox" data-fav-only${S.favOnly[S.tab] ? ' checked' : ''}> ★ Только избранное</label>
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
    S.filtersOpen = open;
    panel()?.classList.toggle('open', open);
    if (backdrop()) backdrop().hidden = !open;
    if (typeof document !== 'undefined') document.body.classList.toggle('drawer-open', open);
    btn()?.setAttribute('aria-expanded', String(open));
  };
  const setTab = (id) => {
    setOpen(false);
    S.tab = id; S.q = ''; S.openId = null;
    resetShown(id);
    const f = S.filters[id];
    if (f) for (const k of Object.keys(f)) f[k] = [];
    ctx.route?.(routeString());
    ctx.rerender();
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
  };
  const syncRoute = () => ctx.route?.(routeString());
  if (typeof document !== 'undefined') setOpen(S.filtersOpen);
  root.oninput = (e) => {
    if (e.target.dataset.k !== 'q') return;
    S.q = e.target.value; resetShown(S.tab); res(); syncRoute();
  };
  root.onchange = (e) => {
    if (e.target.dataset.showIds !== undefined) {
      S.showIds = !!e.target.checked;
      res(); syncRoute();
      return;
    }
    if (e.target.dataset.favOnly !== undefined) {
      S.favOnly[S.tab] = !!e.target.checked;
      resetShown(S.tab); res(); syncRoute();
      return;
    }
    const add = e.target.dataset.addK;
    if (add !== undefined) {
      const val = e.target.value;
      if (val) {
        const f = S.filters[S.tab] || (S.filters[S.tab] = {});
        const list = normFilter(f[add]);
        if (!list.includes(val)) list.push(val);
        f[add] = list;
        // В справочнике подразделы зависят от раздела: смена раздела сбрасывает их.
        if (S.tab === 'rules' && add === 'group') S.filters.rules.sub = [];
        resetShown(S.tab);
        res();
        // Сначала адрес, потом перерисовка: draw() заново читает фильтры из маршрута.
        syncRoute();
        ctx.rerender();
      }
      return;
    }
    if (e.target.dataset.k === 'q') return;
    if (e.target.dataset.sort) {
      const kind = e.target.dataset.sort, prev = S.sort[kind] || ['name', 1];
      S.sort[kind] = [e.target.value, prev[1] === -1 ? -1 : 1];
      resetShown(kind); res(); syncRoute(); return;
    }
    if (e.target.dataset.tabSelect !== undefined) setTab(e.target.value);
  };
  root.onclick = (e) => {
    const del = e.target.closest('[data-filter-del]');
    if (del) {
      const k = del.dataset.filterDel, val = del.dataset.value;
      const f = S.filters[S.tab];
      if (f) f[k] = normFilter(f[k]).filter((x) => x !== val);
      if (S.tab === 'rules' && k === 'group') S.filters.rules.sub = [];
      resetShown(S.tab);
      res();
      syncRoute();
      ctx.rerender();
      return;
    }
    const star = e.target.closest('[data-fav]');
    if (star) {
      e.preventDefault();
      e.stopPropagation();
      const i = star.dataset.fav.indexOf(':');
      toggleFavorite(star.dataset.fav.slice(0, i), star.dataset.fav.slice(i + 1));
      res();
      return;
    }
    const share = e.target.closest('[data-share]');
    if (share) {
      e.preventDefault();
      e.stopPropagation();
      copyText(shareUrl(share.dataset.share)).then((ok) => {
        showToast(ok ? 'Ссылка скопирована' : 'Не удалось скопировать ссылку');
      });
      return;
    }
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
      res(); syncRoute(); return;
    }
    if (e.target.closest('[data-more]')) loadMore();
  };
  observeMore();
  root._dbObserver = io;
  if (S.scrollToOpen) {
    S.scrollToOpen = false;
    const el = root.querySelector('[data-deep-open]');
    // Прокрутка после отрисовки: main.draw() сбрасывает позицию в начало страницы,
    // а браузер при перезагрузке с якорем восстанавливает прокрутку на событии load.
    if (el && typeof el.scrollIntoView === 'function') {
      const scroll = () => el.scrollIntoView({ block: 'center' });
      // setTimeout, а не requestAnimationFrame: в фоновой вкладке кадры не приходят.
      const later = () => {
        if (typeof setTimeout === 'function') setTimeout(scroll, 0);
        else scroll();
      };
      if (typeof document !== 'undefined' && document.readyState !== 'complete' && typeof addEventListener === 'function') {
        addEventListener('load', later, { once: true });
      } else later();
    }
  }
}

// Подссылки вида #db/cards или #db/items/0x0c9?q=…: раздел и состояние открываются напрямую.
const TAB_IDS = new Set(TABS.map(([id]) => id));
function applyRoute(sub) {
  // Пустой подраздел не сбрасывает выбор: при возврате на вкладку остаётся последняя подвкладка.
  if (!sub) return;
  const raw = String(sub);
  const cut = raw.indexOf('?');
  const path = cut >= 0 ? raw.slice(0, cut) : raw;
  const query = cut >= 0 ? raw.slice(cut + 1) : '';
  const [tab, idPart] = path.split('/');
  if (!TAB_IDS.has(tab)) return;
  // Старая ссылка вида #db/items/0x0c9 открывает ту же запись: ID приводим к канону,
  // а draw() затем переписывает адрес через replaceState — получается тихий редирект.
  const openId = idPart ? canonKey(decodeURIComponent(idPart)) : null;
  S.scrollToOpen = !!openId && openId !== S.openId;
  S.tab = tab;
  S.openId = openId;
  S.q = '';
  const f = S.filters[tab];
  if (f) for (const k of Object.keys(f)) f[k] = [];
  S.sort[tab] = [...DEFAULT_SORT[tab]];
  S.showIds = false;
  const params = new URLSearchParams(query);
  S.q = params.get('q') || '';
  // Повторяющиеся параметры (rar=Обычный&rar=Редкий) = несколько выбранных значений.
  if (f) for (const k of Object.keys(f)) f[k] = params.getAll(k);
  const sortKey = params.get('sort');
  if (sortKey) S.sort[tab][0] = sortKey;
  if (params.get('dir') === '-1') S.sort[tab][1] = -1;
  S.showIds = params.get('ids') === '1';
  for (const t of TAB_IDS) S.favOnly[t] = false;
  S.favOnly[tab] = params.get('fav') === '1';
  resetShown(tab);
}
export function setRoute(sub) {
  applyRoute(sub);
}
export function currentRoute() {
  return routeString();
}
