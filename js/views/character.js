import { esc, num, label, opts, set, fieldValue, RARITIES, RC, RARITY_SHORT, optLabel, money, copyText } from '../core/util.js';
import { derive, sellPrice, skillLimit } from '../character/derive.js';
import {
  RULES, allowedClasses, RO_FACTIONS, RO_MIN, RO_MAX, RO_STATUS, RO_STATUS_LABEL,
  blankRO, blankROStatus, roRank, roRankText, normalizeROStatus, bmetLimit,
  BEAST_SLOTS, BEAST_RARITIES, BEAST_EXTRA_L_ABILITY, ROBOT_IMPLANTS,
} from '../character/rules.js';
import { exportChar, importChar, blankChar, charToCode, codeToChar } from '../core/storage.js';
import { showToast } from '../core/toast.js';
import {
  collectCharacterStats, CHAR_STAT_LABELS, CHAR_STAT_ORDER, STAT_SOURCE_TYPE_LABEL,
} from '../character/stats.js';
import { itemRow, cardRow } from './databases.js';
import { G, partCount } from '../modules/autoshop/store.js';
import { partsOf, statChips } from '../modules/autoshop/parts.js';
import { summarize } from '../modules/autoshop/aggregate.js';
import { R, saveRobots } from '../modules/robots/store.js';
import {
  isBmet, isSkeleton, isRobotModule, skeletonSlots, robotBase, robotKind, robotKindLabel,
  robotStats, robotRequirement, availableCount, hasImplant, robotMissing, moduleChecked, moduleIsActive, weaponIndex,
} from '../modules/robots/parts.js';
import { parsePart } from '../modules/autoshop/parser.js';
import { comboList, groupedRows, closeCombos, openCombo, comboKeydown, installComboClose } from '../core/combo.js';
import { fuzzyScore, fuzzyFilter } from '../core/fuzzy.js';

const OPEN = new Set(); // раскрытые описания навыков, чтобы состояние переживало перерисовку
const OPEN_ROWS = new Set(); // раскрытые карточки предметов и карт
const OPEN_STATS = new Set(); // раскрытые карточки источников на вкладке «Статы»
let OPEN_STAT = null; // выбранный параметр в «Итогах» на вкладке «Статы»
// Порядок характеристик в интерфейсе не зависит от порядка строк в базе.
const STAT_ORDER = ['strength', 'dexterity', 'intelligence', 'will', 'charisma', 'perception', 'technique', 'luck', 'constitution'];
const STORAGE_TAG = 'K';
// Запасной вариант, если описание предмета не удалось разобрать.
const STORAGE_BONUS = { 'Хранилище вер. 1': 30, 'Хранилище вер. 2': 60, 'Хранилище вер. 3': 90, 'Хранилище вер. 4': 120, 'Хранилище вер. 5': 150 };
const storageBonus = (it) => {
  if (!it) return 0;
  const text = String(it.description || '');
  const m = text.match(/свободных мест[^:]*:\s*(\d+)/i) || text.match(/(\d+)\s*$/);
  return m ? Number(m[1]) : (STORAGE_BONUS[it.name] || 0);
};
// [K] можно установить только из предметов, которые уже лежат в хранилище.
const storageItems = (c, d) => {
  const found = new Map();
  for (const e of c.pockets) {
    const it = d.itemMap.get(e.id);
    if (it?.tag === STORAGE_TAG && !found.has(it.id)) found.set(it.id, it);
  }
  return [...found.values()];
};
// Транспорт кочевника берётся из гаража в Утилитах. Доступен только классу Кочевник.
const isKochevnik = (c) => c.class === 'Кочевник';
const transportData = (c, d) => {
  if (!isKochevnik(c) || !c.transport) return null;
  const vehicle = G.vehicles.find((v) => v.id === c.transport);
  if (!vehicle) return null;
  const parts = partsOf(d);
  const pick = (id) => {
    const p = id && parts.find((x) => x.item.id === id);
    return p ? { cost: p.item.cost, stats: p.stats, name: label(p.item), drone: p.drone } : null;
  };
  const B = vehicle.build;
  const sum = summarize({ body: pick(B.body), wheels: pick(B.wheels), engine: pick(B.engine), weapons: B.weapons.map(pick), modules: B.modules.map(pick), discount: B.discount });
  return { vehicle, build: B, sum };
};
const ov = (title, path, v) => `<label class="ov${v.overridden ? ' on' : ''}"><span>${title}</span><b class="${v.value < 0 ? 'bad' : ''}">${num(v.value)}</b>
  <input type="number" data-p="${path}" value="${v.overridden ? v.value : ''}" placeholder="${num(v.auto)}"></label>`;
const ovFreePointsBonus = (title, path, v, bonusVal) => {
  return `<label class="ov${bonusVal !== 0 ? ' on' : ''}"><span>${title}</span><b class="${v.value < 0 ? 'bad' : ''}">${num(v.value)}</b>
    <input type="number" data-p-free-bonus="${path}" value="${bonusVal !== 0 ? bonusVal : ''}" placeholder="Доп. ОХ"></label>`;
};
const del = (kind, i) => `<button class="x" data-del="${kind}.${i}" title="Убрать">✕</button>`;
const missing = (kind, i, id) => `<div class="line miss">Записи ${esc(id)} больше нет в базе ${del(kind, i)}</div>`;
const slots = (rows) => `<div class="chips">${rows.map((s) => `<span class="lim ${s.status === 'ОК' ? 'o' : s.status === 'Занято' ? 'b' : s.status === 'Свободно' ? 'f' : 'x2'}">${esc(s.tag)} ${s.used}/${s.limit} · ${s.status}</span>`).join('')}</div>`;
const optionLabel = (it) => optLabel(it);
const abilityText = (a) => `${a.kind === 'mutation' ? 'Мутация' : 'Способность'}: ${a.name}${a.class_requirement ? ' (' + a.class_requirement + ')' : ''}`;
// Порядок групп: общие → способности текущего класса → мутации → способности других классов.
// Внутри группы — по ID.
function abilityRows(d, cls, c, slot = -1) {
  // Одна и та же способность не должна занимать несколько слотов.
  const used = new Set((c?.abilities || []).filter((id, i) => i !== slot && !!id));
  return d.abilities.filter((a) => !used.has(a.id)).map((a) => {
    const mutation = a.kind === 'mutation';
    const general = !mutation && !a.class_requirement;
    const own = !mutation && !!cls && a.class_requirement === cls;
    return {
      id: a.id,
      text: abilityText(a),
      group: mutation ? 'Мутации' : general ? 'Общие' : own ? cls : 'Другие классы',
      rank: mutation ? 2 : general ? 0 : own ? 1 : 3,
      order: a.id,
      search: `${a.description || ''} ${a.class_requirement || ''}`,
    };
  });
}
// На телефоне нативный select тоже получает группы, как выпадающий список на ПК.
const abilityOptions = (d, id, cls, c, slot) => groupedRows(abilityRows(d, cls, c, slot)).map(([g, list]) =>
  `<optgroup label="${esc(g)}">${list.map((r) => `<option value="${esc(r.id)}"${r.id === id ? ' selected' : ''}>${esc(r.text)}</option>`).join('')}</optgroup>`).join('');
const comboRows = (kind, c, d) => (kind.startsWith('abilities.')
  ? abilityRows(d, c.class, c, Number(kind.slice('abilities.'.length)))
  : adderRows(kind, c, d));

// fuzzyFilter во всех списках выбора: опечатки, раскладка, порядок слов и релевантность.
const searchRows = (rows, q) => {
  const query = String(q || '').trim();
  if (!query) return rows;
  return fuzzyFilter(rows, query, (r) => [
    { text: r.text, weight: 1 },
    { text: r.search || '', weight: 0.7 },
    { text: r.group || '', weight: 0.4 },
  ]).rows;
};

// Состояние подвкладок и сортировки переживает перерисовку, как и OPEN у навыков.
const UI = {
  page: 'sheet',
  tab: 'pockets',
  sort: {
    pockets: ['id', 1], equipment: ['id', 1], implants: ['id', 1],
    repository: ['id', 1], beasts: ['id', 1],
  },
};
let DATA_MSG = ''; // сообщение после импорта/сброса карточки

const RARITY_RANK = new Map(RARITIES.map((r, i) => [r, i]));
const cmpText = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'ru');
const cmpNum = (a, b) => (Number(a) || 0) - (Number(b) || 0);
const cmpRarity = (a, b) => (RARITY_RANK.get(a) ?? 99) - (RARITY_RANK.get(b) ?? 99);
const sdef = (name, get, cmp = cmpText) => ({ name, get, cmp });

function adderRows(kind, c, d) {
  // Уже добавленный навык не предлагается второй раз: дубли съедают лимит и щепки.
  if (kind === 'skills') return d.skills.filter((s) => !c.skills.some((x) => x.id === s.id)).map((s) => ({
    id: s.id, text: `${s.name} · ${d.statMap.get(s.stat)?.name || s.stat} ${s.tier}`,
    group: d.statMap.get(s.stat)?.name || 'Навыки', search: s.description || '',
  }));
  if (kind === 'beasts') return beastAdderRows(c, d);
  if (kind === 'pockets') return d.items.map((it) => ({ id: it.id, text: optionLabel(it), group: it.category || 'Без категории', search: it.description || '' }));
  if (kind === 'repository') return d.cards.map((x) => {
    const own = c.class && x.classes.includes(c.class), general = x.classes.includes('Общие');
    return { id: x.id, text: optLabel(x), group: own ? c.class : general ? 'Общие' : 'Другие классы', rank: own ? 0 : general ? 1 : 2, search: x.mechanics || '' };
  });
  // Импланты ставятся сразу из справочника и не занимают места в хранилище.
  if (kind === 'implants') return d.items.filter((it) => it.category === 'Имплант').map((it) => ({ id: it.id, text: optionLabel(it), group: 'Импланты', search: it.description || '' }));
  return c.pockets.map((e) => d.itemMap.get(e.id)).filter(Boolean).filter((it) => it.tag !== STORAGE_TAG).map((it) => ({ id: it.id, text: optionLabel(it), group: it.category || 'Без категории', search: it.description || '' }));
}

function groupOptions(rows) {
  return groupedRows(rows).map(([g, list]) =>
    `<optgroup label="${esc(g)}">${list.map((r) => `<option value="${esc(r.id)}">${esc(r.text)}</option>`).join('')}</optgroup>`).join('');
}

function adder(kind, hint, c, d, disabled = false) {
  const rows = adderRows(kind, c, d), empty = !rows.length, off = disabled || empty;
  const emptyText = kind === 'equipment' ? 'Сначала добавьте предметы в хранилище' : 'Нет доступных вариантов';
  return `<div class="add" data-addbox="${kind}" data-hint="${esc(hint)}">
    <input type="search" data-search="${kind}" placeholder="Фильтр…" autocomplete="off"${off ? ' disabled' : ''}>
    <select data-in="${kind}" aria-label="${esc(hint)}"${off ? ' disabled' : ''}><option value="">${esc(hint)}</option>${empty ? `<option value="" disabled>${esc(emptyText)}</option>` : groupOptions(rows)}</select>
    <div class="combo" data-combo="${kind}">
      <button type="button" class="combo-btn" data-combo-btn="${kind}" aria-haspopup="listbox" aria-expanded="false"${off ? ' disabled' : ''}><span data-combo-label="${kind}">${esc(hint)}</span><span class="combo-caret" aria-hidden="true">▾</span></button>
      <div class="combo-pop" data-combo-pop="${kind}" hidden>
        <input type="search" class="combo-search" data-combo-search="${kind}" placeholder="Поиск…" autocomplete="off" aria-label="Поиск: ${esc(hint)}">
        <div class="combo-list" role="listbox" aria-label="${esc(hint)}" data-combo-list="${kind}"></div>
      </div>
    </div>
    <button data-add="${kind}"${off ? ' disabled' : ''}>Добавить</button></div>`;
}

const itemSortDefs = (withQty, c) => {
  const defs = {
    name: sdef('Название', (x) => (x.it ? label(x.it) : '')),
    tag: sdef('Тег', (x) => x.it?.tag || ''),
    rarity: sdef('Редкость', (x) => x.it?.rarity || '', cmpRarity),
    category: sdef('Категория', (x) => x.it?.category || ''),
    organization: sdef('Организация', (x) => x.it?.organization || ''),
    cost: sdef('Цена', (x) => x.it?.cost || 0, cmpNum),
    sell: sdef('Цена продажи', (x) => (x.it ? sellPrice(x.it) : 0), cmpNum),
    id: sdef('ID', (x) => x.it?.id || ''),
  };
  if (withQty) {
    defs.qty = sdef('Количество', (x) => x.e?.qty || 0, cmpNum);
    defs.total = sdef('Сумма', (x) => (x.it?.cost || 0) * (x.e?.qty || 0), cmpNum);
  }
  return defs;
};

const cardSortDefs = () => ({
  name: sdef('Название', (x) => (x.cd ? label(x.cd) : '')),
  tag: sdef('Тег', (x) => x.cd?.tag || ''),
  rarity: sdef('Редкость', (x) => x.cd?.rarity || '', cmpRarity),
  school: sdef('Школа', (x) => x.cd?.school || ''),
  essence: sdef('Сущность', (x) => x.cd?.essence || ''),
  classes: sdef('Классы', (x) => x.cd?.classes?.join(', ') || ''),
  tali: sdef('Цена в тали', (x) => x.cd?.price_tali || 0, cmpNum),
  kronos: sdef('Кронос', (x) => x.cd?.kronos || 0, cmpNum),
  qty: sdef('Количество', (x) => x.e?.qty || 0, cmpNum),
  total: sdef('Сумма в тали', (x) => (x.cd?.price_tali || 0) * (x.e?.qty || 0), cmpNum),
  id: sdef('ID', (x) => x.cd?.id || ''),
});

const BEAST_GENERAL = 'Общие';
const isPathBeast = (b) => /^Путь(?:\s|$)/i.test(String(b?.name || ''));
const beastPaths = (d) => [...new Set(d.beasts.map((b) => b.group_name).filter((g) => g && g !== BEAST_GENERAL))];

// Путь берём из сохранённого выбора, а у старых карточек — из взятой способности «Путь …».
function beastPathOf(c, d) {
  const paths = beastPaths(d);
  if (paths.includes(c.beastPath)) return c.beastPath;
  const chosen = new Set(Array.isArray(c.beasts) ? c.beasts : []);
  const root = d.beasts.find((b) => chosen.has(b.id) && isPathBeast(b));
  return root && paths.includes(root.group_name) ? root.group_name : '';
}

const beastNameKey = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, '');

// Из строки «ТРЕБ: …» достаём названия способностей, которые нужно взять заранее.
function beastPrereqNames(b) {
  const line = (String(b.description || '').match(/ТРЕБ[^\n]*/i) || [''])[0];
  if (!line) return [];
  return line.split(/[;,.]/).map((part) => {
    const m = part.match(/способност\S*\s*[-–—]\s*(.+)/i);
    return m ? m[1].replace(/\s+/g, ' ').trim() : '';
  }).filter(Boolean);
}

// В описаниях встречаются опечатки («исскуство») и разный регистр — сверяем нечётко.
function findBeastByName(name, d) {
  const key = beastNameKey(name);
  const exact = d.beasts.find((b) => beastNameKey(b.name) === key);
  if (exact) return exact;
  let best = null, score = 0;
  for (const b of d.beasts) {
    const s = fuzzyScore(name, b.name);
    if (s > score) { score = s; best = b; }
  }
  return score >= 0.6 ? best : null;
}

const beastPrereqs = (b, d) => beastPrereqNames(b).map((name) => findBeastByName(name, d) || { name, id: null });
const beastMissing = (b, chosen, d) => beastPrereqs(b, d).filter((p) => !p.id || !chosen.has(p.id));

const BEAST_RARITY_CLASS = { 'Обычный': 'c', 'Редкий': 'r', 'Легендарный': 'l' };
const BEAST_RARITY_SHORT = { 'Обычный': 'О', 'Редкий': 'Р', 'Легендарный': 'Л' };
const beastRarity = (b) => (BEAST_RARITIES.includes(b?.rarity) ? b.rarity : 'Обычный');
const beastTotal = (x) => BEAST_RARITIES.reduce((a, r) => a + (x[r] || 0), 0);

// Лимиты слотов зависят от ранга; «Я Особенный» добавляет один слот Л.
function beastSlotLimits(c, d) {
  const level = Math.min(10, Math.max(1, d.rankMap.get(Number(c.rank))?.level || d.ranks[0]?.level || 1));
  const base = BEAST_SLOTS[level] || BEAST_SLOTS[10];
  const extraL = (c.abilities || []).some((id) => d.abilityMap.get(id)?.name === BEAST_EXTRA_L_ABILITY) ? 1 : 0;
  return { 'Обычный': base['Обычный'], 'Редкий': base['Редкий'], 'Легендарный': base['Легендарный'] + extraL, extraL };
}

function beastUsage(c, d) {
  const usage = { 'Обычный': 0, 'Редкий': 0, 'Легендарный': 0 };
  for (const id of c.beasts || []) {
    const b = d.beasts.find((x) => x.id === id);
    if (b) usage[beastRarity(b)]++;
  }
  return usage;
}

// Более высокий слот занимает более низкую редкость: Л — О/Р/Л, Р — О/Р, О — только О.
function beastFits(limits, usage, rarity) {
  if (rarity === 'Обычный') return beastTotal(usage) < beastTotal(limits);
  if (rarity === 'Редкий') return usage['Редкий'] + usage['Легендарный'] < limits['Редкий'] + limits['Легендарный'];
  return usage['Легендарный'] < limits['Легендарный'];
}

function beastOverflow(limits, usage) {
  const out = [];
  if (beastTotal(usage) > beastTotal(limits)) out.push('О');
  if (usage['Редкий'] + usage['Легендарный'] > limits['Редкий'] + limits['Легендарный']) out.push('Р');
  if (usage['Легендарный'] > limits['Легендарный']) out.push('Л');
  return out;
}

// Добавлять можно способности выбранного пути и «Общие»; корень пути уже взят.
function beastAdderRows(c, d) {
  const limits = beastSlotLimits(c, d), usage = beastUsage(c, d);
  const path = beastPathOf(c, d);
  const chosen = new Set(Array.isArray(c.beasts) ? c.beasts : []);
  return d.beasts
    .filter((b) => b.group_name === BEAST_GENERAL || (path && b.group_name === path))
    .filter((b) => !chosen.has(b.id) && !isPathBeast(b))
    .map((b) => {
      const missing = beastMissing(b, chosen, d);
      const rarity = beastRarity(b), free = beastFits(limits, usage, rarity);
      return {
        id: b.id,
        text: `${b.name} · ${BEAST_RARITY_SHORT[rarity]}${missing.length ? ` · нужно: ${missing.map((p) => p.name).join(', ')}` : ''}${free ? '' : ' · сверх лимита'}`,
        group: b.group_name || 'Без группы',
        rank: b.group_name === path ? 0 : 1,
        search: `${b.description || ''} ${b.rarity || ''}`,
      };
    });
}

function beastRow(b, i, chosen, d) {
  const root = isPathBeast(b);
  const prereqs = root ? [] : beastPrereqs(b, d);
  const missing = root ? [] : beastMissing(b, chosen, d);
  const rarity = beastRarity(b), short = BEAST_RARITY_SHORT[rarity];
  const reqText = prereqs.length
    ? `<p class="meta">Требует: ${prereqs.map((p) => esc(p.name)).join(', ')}</p>` : '';
  return `<details class="line beast${missing.length ? ' badline' : ''}" data-beast-row="${esc(b.id)}">
    <summary><span class="grow"><b>${esc(b.name)}</b> <span class="meta">${esc(b.group_name || 'Без группы')}${missing.length ? ` · не хватает: ${missing.map((p) => esc(p.name)).join(', ')}` : ''}</span></span>
      <span class="chip rar-${BEAST_RARITY_CLASS[rarity]}" title="${esc(rarity)}">${short}</span>
      ${root ? '<span class="chip">путь</span>' : '<span class="chip">взято</span>'}</summary>
    <div class="body"><p class="desc">${esc(b.description || 'Описание пока не заполнено.')}</p>${reqText}
      ${root
        ? '<p class="meta">Способность пути меняется вместе с выбранным путём.</p>'
        : `<div class="ctl">${del('beasts', i)}</div>`}</div>
  </details>`;
}

function beastList(c, d) {
  const chosen = new Set(Array.isArray(c.beasts) ? c.beasts : []);
  const rows = (Array.isArray(c.beasts) ? c.beasts : []).map((id, i) => {
    const b = d.beasts.find((x) => x.id === id);
    return b ? beastRow(b, i, chosen, d) : missing('beasts', i, id);
  });
  return rows.length
    ? rows.join('')
    : '<div class="empty">Способности не выбраны. Добавьте первую из меню выше.</div>';
}

function sortRows(kind, rows, defs) {
  const st = UI.sort[kind] || [];
  const key = defs[st[0]] ? st[0] : (defs.id ? 'id' : Object.keys(defs)[0]);
  const d = defs[key];
  const sign = st[1] === -1 ? -1 : 1;
  return rows.sort((a, b) => (a.miss ? 1 : 0) - (b.miss ? 1 : 0) || sign * d.cmp(d.get(a), d.get(b)));
}

function sortBar(kind, defs) {
  const st = UI.sort[kind] || [];
  const key = defs[st[0]] ? st[0] : (defs.id ? 'id' : Object.keys(defs)[0]);
  const dir = st[1] === -1 ? -1 : 1;
  return `<div class="sortbar"><label>Сортировка<select data-sort="${kind}">${Object.entries(defs).map(([k, v]) => `<option value="${k}"${k === key ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
    <button type="button" class="sortdir" data-dir="${kind}" title="Направление: ${dir > 0 ? 'по возрастанию' : 'по убыванию'}" aria-label="Направление сортировки: ${dir > 0 ? 'по возрастанию' : 'по убыванию'}">${dir > 0 ? '↑' : '↓'}</button></div>`;
}

function inventorySummary(c, d) {
  const s = { count: 0, cost: 0, sell: 0, tali: 0, cards: 0, transport: 0, capacity: RULES.pocketLimit, over: false };
  const clinic = Array.isArray(c.clinicImplants) ? c.clinicImplants : [];
  // Установленные импланты не занимают место в хранилище, даже если остались в старом списке.
  const installed = new Map();
  const counted = new Set();
  for (const id of c.implants) installed.set(id, (installed.get(id) || 0) + 1);
  for (const e of c.pockets) {
    const it = d.itemMap.get(e.id);
    if (!it) continue;
    let qty = Number(e.qty) || 0;
    if (it.category === 'Имплант' && installed.get(it.id)) {
      const used = Math.min(qty, installed.get(it.id));
      qty -= used;
      installed.set(it.id, installed.get(it.id) - used);
    }
    // Вместимость считает уникальные позиции: стопка из 422 щепок занимает 1 место.
    if (qty > 0 && !counted.has(it.id)) { s.count += 1; counted.add(it.id); }
    s.cost += (it.cost || 0) * qty;
    s.sell += sellPrice(it) * qty;
  }
  for (const id of c.implants) {
    const it = d.itemMap.get(id);
    if (!it) continue;
    s.cost += it.cost || 0;
    s.sell += sellPrice(it);
    if (clinic.includes(id)) s.cost += RULES.clinicCost[it.rarity] || 0;
  }
  // Транспорт входит в сумму по номиналу, но не в продажу.
  const transport = transportData(c, d);
  if (transport) { s.transport = transport.sum.cost; s.cost += transport.sum.cost; }
  const storage = c.storage ? storageItems(c, d).find((it) => it.id === c.storage) : null;
  s.capacity += storageBonus(storage);
  s.over = s.count > s.capacity;
  for (const e of c.repository) {
    const cd = d.cardMap.get(e.id);
    if (!cd) continue;
    const qty = Number(e.qty) || 0;
    s.cards += qty;
    s.tali += (cd.price_tali || 0) * qty;
  }
  // Сумма: хранилище + импланты + репозиторий; тали переводятся в кредиты.
  s.cost += s.tali * RULES.taliToCredits;
  return s;
}

function inventoryTabs(c, race) {
  // Счётчики подвкладок тоже показывают число уникальных позиций, а не сумму qty.
  const positions = (rows) => new Set(rows.filter((e) => (Number(e.qty) || 0) > 0).map((e) => e.id)).size;
  return [
    { id: 'pockets', label: 'Хранилище', ok: true, count: positions(c.pockets) },
    { id: 'equipment', label: 'Экипировка', ok: true, count: c.equipment.length + (isKochevnik(c) && c.transport ? 1 : 0) },
    { id: 'implants', label: 'Импланты', ok: !!race?.implants_allowed, hint: 'только Поляриец и Новуссит', count: c.implants.length },
    { id: 'repository', label: 'Репозиторий', ok: race?.name === 'Новуссит', hint: 'только Новуссит', count: positions(c.repository) },
    { id: 'beasts', label: 'Способности Зверя', ok: race?.name === 'Хуманиец' && c.class === 'Зверь', hint: 'Хуманиец с классом Зверь', count: Array.isArray(c.beasts) ? c.beasts.length : 0 },
  ];
}

const skillRow = (s, d) => {
  const st = d.statMap.get(s.sk.stat);
  const shortage = s.sk.tier - s.have;
  return `<details class="line skill${s.available ? '' : ' badline'}" data-skill="${esc(s.sk.id)}"${OPEN.has(s.sk.id) ? ' open' : ''}>
    <summary><span class="grow"><b>${esc(s.sk.name)}</b> <span class="meta">${esc(st?.name || s.sk.stat)} ${s.sk.tier}${s.available ? '' : ` · не хватает ${shortage}`}</span></span>
      <span class="chip">щепки ${num(s.shards.value)}</span></summary>
    <div class="body"><p class="desc">${esc(s.sk.description || 'Описание пока не заполнено.')}</p>
      <div class="ctl"><label>Ур. <input type="number" min="0" data-p="skills.${s.i}.level" value="${s.level}"></label>
      <label>Щепки <input type="number" data-p="overrides.shards.${s.sk.id}" value="${s.shards.overridden ? s.shards.value : ''}" placeholder="${s.shards.auto}"></label>${del('skills', s.i)}</div></div>
  </details>`;
};

function abilityCombo(id, i, d, cls, c) {
  const chosen = id ? d.abilityMap.get(id) : null, key = `abilities.${i}`, hint = `Слот ${i + 1}: пусто`;
  return `<div class="line"><select class="grow ability-native" data-p="${key}"><option value="">${esc(hint)}</option>${abilityOptions(d, id, cls, c, i)}</select>
    <div class="combo grow" data-combo="${key}" data-combo-target="${key}">
      <button type="button" class="combo-btn" data-combo-btn="${key}" aria-haspopup="listbox" aria-expanded="false"><span data-combo-label="${key}">${esc(chosen ? abilityText(chosen) : hint)}</span><span class="combo-caret" aria-hidden="true">▾</span></button>
      <div class="combo-pop" data-combo-pop="${key}" hidden>
        <input type="search" class="combo-search" data-combo-search="${key}" placeholder="Поиск…" autocomplete="off" aria-label="Поиск: ${esc(hint)}">
        <div class="combo-list" role="listbox" aria-label="${esc(hint)}" data-combo-list="${key}"></div>
      </div>
    </div></div>${chosen ? `<p class="desc meta">${esc(chosen.description)}</p>` : ''}`;
}

function transportPicker(c, d, tr) {
  const options = G.vehicles.map((v) => `<option value="${esc(v.id)}"${v.id === c.transport ? ' selected' : ''}>${esc(v.name)} · ${partCount(v.build)}</option>`).join('');
  const B = tr?.build;
  const s = tr?.sum;
  const chips = tr ? [
    `<span class="chip">Деталей: ${partCount(B)}</span>`,
    `<span class="chip">ОЗ: ${B.currentHp != null ? `${num(B.currentHp)} / ${num(s.maxHp)}` : num(s.maxHp)}</span>`,
    `<span class="chip">Деф.п: ${num(s.defP)}</span>`,
    `<span class="chip">УКЛ: ${num(s.evasion)}</span>`,
    `<span class="chip">Скороход: ${num(s.speed)}</span>`,
    `<span class="chip">Полёт: ${num(s.flight)}</span>`,
    `<span class="chip">Экранирование: ${num(s.screen)}</span>`,
    `<span class="chip total">Стоимость: ${money(s.cost)}</span>`,
  ].join('') : '';
  return `<div class="transport-slot">
    <label>[Tr] Транспорт кочевника<select data-transport><option value="">— не выбран —</option>${options}</select></label>
    ${tr ? `<article class="transport-card">
      <div class="part-main">
        <div class="part-slot">Транспорт кочевника</div>
        <b>${esc(tr.vehicle.name)}</b>
        <div class="chips">${chips}</div>
        ${s.warnings.length ? `<p class="bad">${s.warnings.map((w) => esc(w)).join('; ')}</p>` : ''}
        ${s.speedFloor ? `<p class="meta">Минимум Скорохода: ${num(s.speedFloor)} (уникальный эффект двигателя).</p>` : ''}
        ${tr.vehicle.notes ? `<p class="desc meta">${esc(tr.vehicle.notes)}</p>` : ''}
      </div>
    </article>` : '<p class="meta">Выберите транспорт из гаража в Утилитах. Он занимает слот [Tr], входит в сумму, но не в продажу.</p>'}
  </div>`;
}

function inventoryPanel(c, d, r, race) {
  const tabs = inventoryTabs(c, race);
  const available = tabs.filter((t) => t.ok);
  if (!available.some((t) => t.id === UI.tab)) UI.tab = available[0].id;
  const active = UI.tab;
  const sum = inventorySummary(c, d);
  const hidden = tabs.filter((t) => !t.ok);
  let body = '';

  if (active === 'pockets') {
    const defs = itemSortDefs(true, c);
    const rows = sortRows('pockets', c.pockets.map((e, i) => { const it = d.itemMap.get(e.id); return { e, i, it, miss: !it }; }), defs);
    const storageList = storageItems(c, d);
    const storage = c.storage ? storageList.find((it) => it.id === c.storage) : null;
    const storageSlot = `<div class="storage-slot">
      <label>[K] Хранилище<select data-p="storage"${storageList.length ? '' : ' disabled'}><option value="">${storageList.length ? '— не установлено —' : 'Сначала добавьте [K] в хранилище'}</option>${opts(storageList, c.storage, (it) => optLabel(it), (it) => it.id)}</select></label>
      ${storage ? `<span class="chip">Бонус: +${num(storageBonus(storage))} мест</span>` : ''}
    </div>${storage ? `<p class="desc meta storage-desc">${esc(storage.description)}</p>` : ''}`;
    const pocketRow = ({ e, i, it }) => {
      if (!it) return missing('pockets', i, e.id);
      const key = `pockets.${it.id}`;
      return itemRow(it, `<div class="ctl"><label>Кол-во <input type="number" min="1" data-p="pockets.${i}.qty" value="${e.qty}"></label>${del('pockets', i)}</div>`,
      { qty: e.qty, openKey: key, open: OPEN_ROWS.has(key) });
    };
    body = `${storageSlot}<div class="inv-tools">${adder('pockets', 'Найти предмет…', c, d)}${sortBar('pockets', defs)}</div>
      <div class="list">${rows.map(pocketRow).join('') || '<div class="empty">Хранилище пусто. Добавьте первый предмет.</div>'}</div>`;
  } else if (active === 'equipment' || active === 'implants') {
    const defs = itemSortDefs(false, c);
    const ids = active === 'equipment' ? c.equipment : c.implants;
    const rows = sortRows(active, ids.map((id, i) => { const it = d.itemMap.get(id); return { id, i, it, miss: !it }; }), defs);
    const idRow = ({ id, i, it }) => {
      if (!it) return missing(active, i, id);
      const key = `${active}.${id}`;
      if (active === 'implants') {
        const on = Array.isArray(c.clinicImplants) && c.clinicImplants.includes(id);
        const install = RULES.clinicCost[it.rarity] || 0;
        const badge = `<label class="clinic-toggle" title="Установка в клинике: +${num(install)}. В продажу не входит"><input type="checkbox" data-clinic="${esc(id)}"${on ? ' checked' : ''}> Клиника</label>`;
        return itemRow(it, `<div class="ctl">${del(active, i)}</div>`, { badge, cost: (it.cost || 0) + (on ? install : 0), openKey: key, open: OPEN_ROWS.has(key) });
      }
      return itemRow(it, `<div class="ctl">${del(active, i)}</div>`, { openKey: key, open: OPEN_ROWS.has(key) });
    };
    const trBlock = active === 'equipment' && isKochevnik(c) ? transportPicker(c, d, transportData(c, d)) : '';
    body = `${trBlock}<div class="inv-tools">${adder(active, active === 'implants' ? 'Выбрать имплант…' : 'Выбрать из хранилища…', c, d)}${sortBar(active, defs)}</div>
      ${slots(active === 'equipment' ? r.gearSlots : r.implantSlots)}
      <div class="list">${rows.map(idRow).join('') || `<div class="empty">${active === 'equipment' ? 'Экипировка пуста.' : 'Импланты не выбраны.'}</div>`}</div>`;
  } else if (active === 'repository') {
    const defs = cardSortDefs();
    const rows = sortRows('repository', c.repository.map((e, i) => { const cd = d.cardMap.get(e.id); return { e, i, cd, miss: !cd }; }), defs);
    const cardEntry = ({ e, i, cd }) => {
      if (!cd) return missing('repository', i, e.id);
      const key = `repository.${cd.id}`;
      return cardRow(cd, `<div class="ctl"><label>Кол-во <input type="number" min="1" data-p="repository.${i}.qty" value="${e.qty}"></label>${del('repository', i)}</div>`,
        { qty: e.qty, openKey: key, open: OPEN_ROWS.has(key) });
    };
    body = `<div class="inv-tools">${adder('repository', 'Найти карту…', c, d)}${sortBar('repository', defs)}</div>
      <div class="list">${rows.map(cardEntry).join('') || '<div class="empty">Репозиторий пуст. Добавьте первую карту.</div>'}</div>`;
  } else {
    const path = beastPathOf(c, d);
    if (path && c.beastPath !== path) c.beastPath = path;
    const chosen = new Set(Array.isArray(c.beasts) ? c.beasts : []);
    // Способность пути берётся автоматически, даже если карточка старая и её ещё нет в списке.
    const pathRoot = d.beasts.find((b) => b.group_name === path && isPathBeast(b));
    if (pathRoot && !chosen.has(pathRoot.id)) {
      c.beasts = [pathRoot.id, ...(Array.isArray(c.beasts) ? c.beasts : [])];
      chosen.add(pathRoot.id);
    }
    const paths = beastPaths(d);
    const pathButtons = paths.map((g) => {
      const all = d.beasts.filter((b) => b.group_name === g);
      const picked = all.filter((b) => chosen.has(b.id)).length;
      return `<button type="button" role="tab" aria-selected="${path === g}" class="beast-path${path === g ? ' on' : ''}" data-beast-path="${esc(g)}">${esc(g)}<span class="tabcount">${picked}/${all.length}</span></button>`;
    }).join('');
    const limits = beastSlotLimits(c, d), usage = beastUsage(c, d), overflow = beastOverflow(limits, usage);
    const slotsText = BEAST_RARITIES.map((x) => `${BEAST_RARITY_SHORT[x]} ${limits[x]}`).join(' · ');
    const usedText = BEAST_RARITIES.map((x) => `${BEAST_RARITY_SHORT[x]} ${usage[x]}`).join(' · ');
    body = `<div class="beast-paths" role="tablist" aria-label="Путь зверя">${pathButtons}</div>
      <p class="meta beast-path-note">${path
        ? `Путь: <b>${esc(path)}</b>. В меню — способности этого пути и «Общие»; способность пути берётся автоматически. Требования указаны у каждой способности, недостающие подсвечиваются.`
        : 'Выберите путь: от него зависит список способностей. «Общие» доступны всегда.'}</p>
      <div class="chips"><span class="chip">Слоты: ${slotsText}${limits.extraL ? ` (в т.ч. +${limits.extraL} Л от «${esc(BEAST_EXTRA_L_ABILITY)}»)` : ''}</span><span class="chip">Взято: ${usedText}</span><span class="chip">Взято способностей: ${chosen.size}</span><span class="chip">n для расчётов: ${chosen.size}</span></div>
      <p class="meta">Высший слот может занимать низшую редкость: Л — О/Р/Л, Р — О/Р. Корень пути тоже занимает слот.</p>
      ${overflow.length ? `<p class="bad">Превышен лимит слотов: ${overflow.join(', ')}. Можно продолжать, но набор будет сверх лимита.</p>` : ''}
      <div class="inv-tools">${adder('beasts', path ? 'Найти способность…' : 'Сначала выберите путь', c, d, !path)}</div>
      <div class="list" data-beast-list>${beastList(c, d)}</div>`;
  }

  return `<section class="panel inventory">
    <div class="inv-head"><h2>Инвентарь</h2>
      <button type="button" class="btn" data-a="copy-inventory" title="Скопировать названия и редкости предметов и карт">Скопировать список</button>
      <div class="chips inv-summary">
        <span class="chip${sum.over ? ' bad' : ''}" title="Занято мест в хранилище / всего мест (базовые ${RULES.pocketLimit} + бонус [K])">Позиций: ${num(sum.count)} / ${num(sum.capacity)}</span>
        <span class="chip total" title="Сумма по номиналу: хранилище, импланты, репозиторий и транспорт. 1 Тали = ${RULES.taliToCredits} кредитов">Сумма: ${num(sum.cost)}</span>
        <span class="chip" title="Сколько получится при продаже всего по правилам (5% от номинала)">Продажа: ${num(sum.sell)}</span>
        ${sum.cards ? `<span class="chip" title="Суммарная цена карт в тали; в сумму идёт с переводом в кредиты">Карты: ${num(sum.tali)} тали</span>` : ''}
      </div>
    </div>
    <div class="subtabs" role="tablist">${available.map((t) => `<button type="button" role="tab" data-itab="${t.id}" class="${active === t.id ? 'on' : ''}" aria-selected="${active === t.id}">${esc(t.label)}${t.count ? ` <span class="tabcount">${t.count}</span>` : ''}${t.wip ? ' <span class="wip">WIP</span>' : ''}</button>`).join('')}</div>
    <select class="subtabs-select" data-itab-select="1" aria-label="Раздел инвентаря">${available.map((t) => `<option value="${t.id}"${active === t.id ? ' selected' : ''}>${esc(t.label)}${t.count ? ` (${t.count})` : ''}${t.wip ? ' — WIP' : ''}</option>`).join('')}</select>
    ${hidden.length ? `<p class="meta inv-note">Скрыты разделы: ${hidden.map((t) => `<span title="${esc(t.hint)}">${esc(t.label)}</span>`).join(', ')}. Доступность зависит от расы и класса.</p>` : ''}
    ${body}
  </section>`;
}

// Текстовый список инвентаря: название, редкость и количество; позиции уникальны.
export function inventoryText(c, d) {
  const rarity = (r) => RARITY_SHORT[r] || String(r || '?').slice(0, 1);
  const lines = [`ИНВЕНТАРЬ · ${c.name || 'Без имени'}`];
  const qtyOf = (rows) => {
    const m = new Map();
    for (const e of rows || []) if (e?.id) m.set(e.id, (m.get(e.id) || 0) + (Number(e.qty) || 0));
    return m;
  };
  const countOf = (ids) => {
    const m = new Map();
    for (const id of ids || []) if (id) m.set(id, (m.get(id) || 0) + 1);
    return m;
  };
  const group = (title, qty, map) => {
    const out = [];
    for (const [id, n] of qty) {
      const it = map.get(id);
      if (!it || n <= 0) continue;
      out.push(`- ${label(it)} [${rarity(it.rarity)}] ×${num(n)}`);
    }
    if (out.length) lines.push('', title, ...out);
  };
  group('ХРАНИЛИЩЕ', qtyOf(c.pockets), d.itemMap);
  //group('ЭКИПИРОВКА', countOf(c.equipment), d.itemMap);
  //group('ИМПЛАНТЫ', countOf(c.implants), d.itemMap);
  //group('РЕПОЗИТОРИЙ', qtyOf(c.repository), d.cardMap);
  return lines.length > 1 ? lines.join('\n') : `${lines[0]}\n\nПусто.`;
}

const statSigned = (v) => `${v > 0 ? '+' : ''}${num(v)}`;

// Переключатель «Карточка / Статы» живёт на уровне всей вкладки «Персонаж».
function pageTabs() {
  const tabs = [['sheet', 'Карточка'], ['stats', 'Статы']];
  return `<div class="subtabs page-tabs" role="tablist" aria-label="Разделы персонажа">${tabs.map(([id, text]) => `<button type="button" role="tab" data-page-tab="${id}" class="${UI.page === id ? 'on' : ''}" aria-selected="${UI.page === id}">${text}</button>`).join('')}</div>
  <select class="subtabs-select" data-page-select aria-label="Раздел персонажа">${tabs.map(([id, text]) => `<option value="${id}"${UI.page === id ? ' selected' : ''}>${text}</option>`).join('')}</select>`;
}

const statsSourceToggle = (src) => (src.hasActive
  ? `<label class="mod-flag${src.sourceOn ? ' on' : ''}" title="Активный источник: бонусы учитываются только после включения"><input type="checkbox" data-stats-source="${esc(src.key)}"${src.sourceOn ? ' checked' : ''}> Активация</label>`
  : '<span class="mod-flag passive">Пассивный</span>');

function statsEffectChip(e) {
  const flags = [];
  if (e.conditional) flags.push('условие');
  if (e.active) flags.push(e.enabled ? 'включён' : 'выключен');
  return `<span class="chip stat-effect${e.enabled ? ' on' : ''}${e.conditional ? ' cond' : ''}">${esc(statSigned(e.value))} ${esc(CHAR_STAT_LABELS[e.stat] || e.stat)}${flags.length ? ` · ${esc(flags.join(' · '))}` : ''}</span>`;
}

// Условие действует на все бонусы источника — одна строка, один тоггл.
const statsConditionalRow = (src) => `<label class="cond-row${src.condOn ? ' on' : ''}${src.condOn ? ' counted' : ''}" title="Условие действует на все бонусы источника">
    <input type="checkbox" data-stats-effect="${esc(src.condKey)}"${src.condOn ? ' checked' : ''}>
    <span class="cond-val">Условие · ${num(src.effects.filter((e) => e.conditional).length)} бон.</span>
    <span class="cond-text meta">${esc(src.condText || '')}</span>
  </label>`;

// Одна галочка на все условия: в игре условие обычно общее для всех бонусов.
function statsCondAllToggle(rows) {
  const on = rows.filter((x) => x.toggled).length;
  return `<label class="chip stats-cond-toggle${on ? ' on' : ''}" title="Отметить все условные бонусы сразу; лишние можно снять отдельно"><input type="checkbox" data-stats-cond-all${on === rows.length ? ' checked' : ''}> Условия: ${num(on)} / ${num(rows.length)}</label>`;
}

const statsCondToggle = (src) => (src.hasConditional
  ? `<label class="mod-flag cond${src.condOn ? ' on' : ''}" title="Условие источника: действует на все его бонусы"><input type="checkbox" data-stats-cond-group="${esc(src.key)}"${src.condOn ? ' checked' : ''}> Условие</label>`
  : '');

function statsPanel(c, d) {
  const s = collectCharacterStats(c, d);
  if (OPEN_STAT && !CHAR_STAT_ORDER.includes(OPEN_STAT)) OPEN_STAT = null;
  const weaponOptions = s.weapons.map((w) => `<option value="${esc(w.id)}"${s.weapon?.id === w.id ? ' selected' : ''}>${esc(w.label)}</option>`).join('');
  const weaponSelect = s.weapons.length
    ? `<div class="stats-weapon-row"><label class="stats-weapon" title="Профиль оружия (АТК, КШ, ТЧН, АВХ, КЦ) берётся только у текущего оружия">Текущее оружие<select data-stats-weapon>${weaponOptions}</select></label>${s.ignoredWeapons.length ? `<p class="meta">Другое оружие в профиль не входит: ${s.ignoredWeapons.map((x) => esc(x)).join(', ')}.</p>` : ''}</div>`
    : '<p class="meta">Оружие не выбрано: наденьте оружие в экипировку или имплант-клинок. Профиль оружия (АТК, КШ, ТЧН, АВХ, КЦ) без него не считается.</p>';
  const statCards = CHAR_STAT_ORDER.map((k) => `<button type="button" class="stat-card${OPEN_STAT === k ? ' on' : ''}${s.totals[k] ? '' : ' zero'}" data-stat-source="${k}" aria-expanded="${OPEN_STAT === k}"><span>${esc(CHAR_STAT_LABELS[k])}</span><b>${num(s.totals[k])}</b></button>`).join('');
  const srcRows = OPEN_STAT ? (s.byStat[OPEN_STAT] || []) : [];
  const srcBlock = OPEN_STAT ? `<div class="sources">
    <div class="sources-head"><h3>Источники: ${esc(CHAR_STAT_LABELS[OPEN_STAT])}</h3><button type="button" class="x" data-stat-close title="Закрыть">✕</button></div>
    ${srcRows.length ? `<ul>${srcRows.map((x) => `<li><span>${esc(x.name)}${x.conditional ? ' <span class="chip">условие</span>' : ''}${x.active ? ' <span class="chip">активный</span>' : ''}</span><b>${esc(statSigned(x.value))}</b></li>`).join('')}</ul>` : '<p class="meta">Нет источников: параметр равен нулю.</p>'}
    <p class="sources-total">Итого: <b>${num(s.totals[OPEN_STAT])}</b></p>
  </div>` : '';

  const sourceCards = s.sources.map((src) => {
    return `<details class="part-card stats-source${(src.hasActive && !src.sourceOn) || (src.hasConditional && !src.condOn) ? ' off' : ''}" data-stats-row="${esc(src.key)}"${OPEN_STATS.has(src.key) ? ' open' : ''}>
      <summary>
        <div class="part-main">
          <div class="part-slot">${esc(STAT_SOURCE_TYPE_LABEL[src.type] || src.type)}</div>
          <b>${esc(src.label)}</b>
          <div class="chips">${src.effects.map(statsEffectChip).join('')}</div>
        </div>
        <div class="stats-source-flags">${statsCondToggle(src)}${statsSourceToggle(src)}</div>
      </summary>
      <div class="part-desc">
        <p class="desc">${esc(src.description || 'Описание не заполнено.')}</p>
        ${src.hasConditional ? `<div class="cond-list"><h4>Условие источника</h4>${statsConditionalRow(src)}</div>` : ''}
      </div>
    </details>`;
  }).join('');

  return `<section class="panel stats-panel">
    <div class="inv-head"><div><h2>Статы</h2>
      <p class="meta">Сумма бонусов от текущего оружия, экипировки и имплантов. Базовые характеристики персонажа, способности, мутации, способности зверя, транспорт и роботы сюда не входят.</p></div>
      <div class="chips"><span class="chip">Источников: ${num(s.sources.length)}</span>${s.conditional.length ? statsCondAllToggle(s.conditional) : '<span class="chip">Условных: 0</span>'}</div>
    </div>
    ${weaponSelect}
    <div class="stat-grid">${statCards}</div>
    ${srcBlock}
  </section>
  <section class="panel"><h2>Источники</h2>
    <p class="meta">Пассивные бонусы учитываются сразу. Активные эффекты включаются галочкой «Активация». Условие («если…», «только в ближнем бою») — одна галочка на весь источник и действует на все его бонусы; пассивный бонус с условием остаётся пассивным.</p>
    ${sourceCards ? `<div class="part-list">${sourceCards}</div>` : '<p class="empty">Нет источников с бонусами. Наденьте экипировку или импланты.</p>'}
  </section>`;
}

// Печатная карточка: только персонаж, без инвентаря и служебных кнопок.
function printSheet(c, d, r, stats, race, trait) {
  const skillRows = r.skills.length
    ? `<table class="print-table"><thead><tr><th>Навык</th><th>Характеристика</th><th>Ур.</th><th>Щепки</th></tr></thead><tbody>${r.skills.map((s) => `<tr><td>${esc(s.sk.name)}</td><td>${esc(d.statMap.get(s.sk.stat)?.name || s.sk.stat)}</td><td>${num(s.level)}</td><td>${num(s.shards.value)}</td></tr>`).join('')}</tbody></table>`
    : '<p class="meta">Навыки не выбраны.</p>';
  const abilities = (c.abilities || []).filter(Boolean).map((id) => d.abilityMap.get(id)).filter(Boolean);
  const abilityList = abilities.length
    ? `<ul class="print-list">${abilities.map((a) => `<li><b>${esc(a.name)}</b>${a.kind === 'mutation' ? ' (мутация)' : ''}${a.description ? ` — ${esc(a.description)}` : ''}</li>`).join('')}</ul>`
    : '<p class="meta">Способности не выбраны.</p>';
  const roLine = RO_FACTIONS.map((f) => `${esc(f)} ${num(c.ro?.[f])} (${esc(RO_STATUS_LABEL[c.roStatus?.[f]] || '—')}, ранг ${roRankText(roRank(Number(c.ro?.[f]) || 0))})`).join('; ');
  const notes = String(c.notes || '').trim();
  const issues = Object.entries(r.statIssues);
  return `<section class="print-sheet" aria-hidden="true">
    <h1>${esc(c.name || 'Без имени')}</h1>
    <p class="print-meta">${[c.player && `Игрок: ${c.player}`, race?.name, `Ранг ${r.rankLevel}`, c.class, trait?.name].filter(Boolean).map(esc).join(' · ')}</p>
    <div class="print-grid">
      <div><span>Свободные очки</span><b>${num(r.freePoints.value)}</b></div>
      <div><span>Макс. ОЗ</span><b>${num(r.hpMax.value)}</b></div>
      <div><span>Макс. Кронос</span><b>${num(r.kronosMax.value)}</b></div>
      <div><span>Навыки</span><b>${num(r.skillCount)} / ${num(r.skillLimit)}</b></div>
    </div>
    <h2>Характеристики</h2>
    <div class="print-stats">${stats.map((s) => `<span><b>${esc(s.name)}</b> ${num(c.stats[s.key])}</span>`).join('')}</div>
    ${issues.length ? `<p class="bad">Не хватает характеристик: ${issues.map(([k, v]) => `${esc(d.statMap.get(k)?.name || k)} (нужно ${v.need}, есть ${v.have})`).join('; ')}</p>` : ''}
    <h2>Навыки</h2>
    ${skillRows}
    <h2>Способности и мутации</h2>
    ${abilityList}
    <h2>РО</h2>
    <p class="print-ro">${roLine}</p>
    ${notes ? `<h2>Заметки</h2><p class="print-notes">${esc(notes)}</p>` : ''}
  </section>`;
}

const stockItems = (c, d, predicate) => {
  const found = new Map();
  for (const e of c.pockets || []) {
    const it = d.itemMap.get(e.id);
    if (it && (!predicate || predicate(it))) found.set(it.id, it);
  }
  return [...found.values()];
};

function roPanel(c) {
  const ro = { ...blankRO(), ...(c.ro || {}) };
  const status = { ...blankROStatus(), ...(c.roStatus || {}) };
  
  // Check if the user already has any active status in ANY faction
  const activeFactionWithStatus = RO_FACTIONS.find(faction => {
    const currentStatus = normalizeROStatus(faction, status[faction], Math.max(RO_MIN, Math.min(RO_MAX, Number(ro[faction]) || 0)));
    return currentStatus === RO_STATUS.association || currentStatus === RO_STATUS.membership;
  });

  const rows = RO_FACTIONS.map((f, index) => {
    const value = Math.max(RO_MIN, Math.min(RO_MAX, Number(ro[f]) || 0));
    const rank = roRank(value);
    const current = normalizeROStatus(f, status[f], value);
    
    // If another faction already has a status, disable options for this faction unless it's the one already selected
    const hasGlobalLimitReached = activeFactionWithStatus && activeFactionWithStatus !== f;

    const canAssociate = !hasGlobalLimitReached && f !== 'ГРА' && f !== 'Хиллз' && f !== 'Гончие';
    const canJoin = !hasGlobalLimitReached && f !== 'Чёрный Рынок' && (value >= 60 || f === 'Хиллз' || f === 'Гончие');
    
    const options = `<option value=""${current === '' ? ' selected' : ''}>—</option>${canAssociate ? `<option value="${RO_STATUS.association}"${current === RO_STATUS.association ? ' selected' : ''}>${RO_STATUS_LABEL.association}</option>` : ''}${canJoin ? `<option value="${RO_STATUS.membership}"${current === RO_STATUS.membership ? ' selected' : ''}>${RO_STATUS_LABEL.membership}</option>` : ''}`;
    
    return `<div class="ro-row">
      <span class="ro-name">${esc(f)} <span class="chip ro-rank" title="Ранг организации: от -3 до 3">Ранг ${roRankText(rank)}</span></span>
      <label>РО<input type="number" min="${RO_MIN}" max="${RO_MAX}" step="1" data-p="ro.${esc(f)}" data-n="1" data-enter-next="ro.${RO_FACTIONS[(index + 1) % RO_FACTIONS.length]}" value="${value}"></label>
      <label>Статус<select data-p="roStatus.${esc(f)}">${options}</select></label>
    </div>`;
  }).join('');
  
  return `<section class="panel ro-panel"><h2>РО — репутация организаций</h2>
    <p class="meta">РО — целое число от ${RO_MIN} до ${RO_MAX}. На 15, 35 и 60 (и в минусах) меняется ранг от -3 до 3. Доступна только 1 ассоциация или членство на все фракции.</p>
    <div class="ro-list">${rows}</div>
  </section>`;
}

function robotPanel(c, d) {
  if (c.class !== 'Техник') return '';
  const robots = R.robots.filter((r) => r.base);
  if (!robots.length) {
    return `<section class="panel"><h2>Роботы Техника</h2><p class="meta">Роботов пока нет. Соберите их в «Утилитах» → «Мастерская техники».</p></section>`;
  }
  const active = new Set(Array.isArray(c.robots) ? c.robots : []);
  const limit = bmetLimit(c.ro);
  const showBmet = hasImplant(c, d, ROBOT_IMPLANTS.bmet);
  const bmetsActive = robots.filter((r) => active.has(r.id) && isBmet(robotBase(r, d))).length;
  const cards = robots.map((r, index) => {
    const base = robotBase(r, d), kind = robotKind(base);
    const full = robotStats(r, d, c), stats = full.total;
    const req = robotRequirement(r, d, c);
    const missing = req.missing || [];
    const on = active.has(r.id);
    const wouldExceed = kind === 'bmet' && !on && bmetsActive >= limit;
    const disabled = !on && (!req.ok || wouldExceed);
    const reasons = [];
    if (missing.length) reasons.push(`Нет в инвентаре: ${missing.map((x) => `${label(x.item || { name: x.id })}${x.need > 1 ? ` ×${x.need}` : ''}${x.have ? ` (есть ${x.have})` : ''}`).join(', ')}`);
    if (req.needs.length) reasons.push(`Нужен имплант: ${req.needs.join(', ')}`);
    if (wouldExceed) reasons.push('Лимит БМЕТ по РО «Ацуши» исчерпан');
    if (req.reason) reasons.push(req.reason);
    const why = reasons.join('. ');
    const wi = weaponIndex(r, d);
    const weaponSelect = kind && kind !== 'bmet'
      ? `<label class="robot-hp">Текущее оружие <select data-robot-weapon="${esc(r.id)}"><option value="">— нет —</option>${r.weapons.map((id, i) => {
        const it = id ? d.itemMap.get(id) : null;
        return it ? `<option value="${i}"${wi === i ? ' selected' : ''}>${esc(label(it))}</option>` : '';
      }).join('')}</select></label>` : '';
    const gear = kind === 'bmet' ? [] : [...r.weapons.map((id, i) => ({ id, slot: `Оружие ${i + 1}`, i, mod: false })), ...r.modules.map((id, i) => ({ id, slot: `Модуль ${i + 1}`, i, mod: true }))]
      .map(({ id, slot, i, mod }) => {
        const it = id ? d.itemMap.get(id) : null;
        if (!it) return '';
        return mod
          ? (moduleIsActive(it)
              ? `<label class="chip module-toggle" title="Параметры активного модуля учитываются только при активации"><input type="checkbox" data-robot-module="${esc(r.id)}.${i}"${moduleChecked(r, i) ? ' checked' : ''}> ${esc(label(it))}${moduleChecked(r, i) ? '' : ' · выкл'}</label>`
              : `<span class="chip" title="Пассивный модуль — параметры учитываются всегда">${esc(label(it))}</span>`)
          : `<span class="chip">${esc(slot)}: ${esc(label(it))}</span>`;
      }).join('');
    const nextRobot = robots[(index + 1) % robots.length];
    const nextHpAttr = nextRobot ? ` data-enter-next="robot-hp.${nextRobot.id}"` : '';
    return `<article class="robot-card${on ? ' on' : ''}">
      <div class="robot-head"><label class="robot-use"><input type="checkbox" data-robot-use="${esc(r.id)}"${on ? ' checked' : ''}${disabled ? ' disabled' : ''}> Надеть</label><b>${esc(r.name)}</b><span class="meta">${esc(robotKindLabel[kind] || 'без основы')}</span></div>
      <div class="chips"><span class="chip">ОЗ: ${r.currentHp != null ? `${num(r.currentHp)} / ${num(stats.hp)}` : num(stats.hp)}</span>${stats.defP ? `<span class="chip">ДЕФ.П ${num(stats.defP)}</span>` : ''}${stats.defA ? `<span class="chip">ДЕФ.А ${num(stats.defA)}</span>` : ''}${stats.evasion ? `<span class="chip">УКЛ ${num(stats.evasion)}</span>` : ''}${stats.atk ? `<span class="chip">АТК ${num(stats.atk)}</span>` : ''}${on ? '<span class="chip total">надет</span>' : ''}</div>
      <label class="robot-hp">Текущее ОЗ <input type="number" min="0" data-robot-hp="${esc(r.id)}"${nextHpAttr} value="${r.currentHp ?? ''}" placeholder="${num(stats.hp)}"><span class="meta">/ ${num(stats.hp)}</span></label>
      ${weaponSelect}
      ${full.weapon ? `<div class="chips robot-weapon-stats"><span class="chip total">${esc(label(full.weapon))}</span><span class="chip">КШ ${num(full.weaponStats?.ksh || 0)}</span><span class="chip">ТЧН ${num(stats.tchn || 0)}</span><span class="chip">АВХ ${num(full.weaponStats?.avx || 0)}</span><span class="chip">КЦ ${num(full.weaponStats?.kc ?? 1)}</span></div>` : ''}
      ${gear ? `<div class="chips">${gear}</div>` : `<p class="meta">${kind === 'bmet' ? 'У БМЕТ нет слотов оружия и модулей.' : 'Оружие и модули не установлены.'}</p>`}
      ${full.unique ? `<p class="desc meta">${esc(full.unique)}</p>` : ''}
      ${r.notes ? `<p class="desc meta">${esc(r.notes)}</p>` : ''}
      ${missing.length ? `<div class="miss-note"><b>Нет в инвентаре:</b> ${missing.map((x) => `${esc(label(x.item || { name: x.id }))}${x.need > 1 ? ` ×${x.need}` : ''}${x.have ? ` (есть ${x.have})` : ''}`).join(', ')}</div>` : ''}
      ${why ? `<p class="meta">${esc(why)}</p>` : ''}
    </article>`;
  }).join('');
  return `<section class="panel"><h2>Роботы Техника</h2>
    <div class="chips">${showBmet ? `<span class="chip${bmetsActive > limit ? ' bad' : ''}">БМЕТ: ${num(bmetsActive)} / ${num(limit)}</span>` : ''}<span class="chip">Надето роботов: ${num(robots.filter((r) => active.has(r.id)).length)}</span></div>
    <p class="meta">Собранные роботы можно надевать при наличии нужного импланта и всех деталей в инвентаре. АТК считается по текущему оружию. БМЕТ ограничены РО «Ацуши»; Призмы и Ядра — без отдельного лимита.</p>
    <div class="robot-list">${cards}</div>
  </section>`;
}

function skeletonPanel(c, d) {
  if (c.class !== 'Техник') return '';
  // Подвкладка доступна только с имплантом «Догмат Единства».
  if (!hasImplant(c, d, ROBOT_IMPLANTS.skeleton)) return '';
  const equipment = Array.isArray(c.equipment) ? c.equipment : [];
  const current = equipment.map((id) => d.itemMap.get(id)).find(isSkeleton) || null;
  const skeletons = stockItems(c, d, isSkeleton);
  if (current && !skeletons.some((it) => it.id === current.id)) skeletons.unshift(current);
  const modules = equipment.map((id) => d.itemMap.get(id)).filter(isRobotModule);
  const slots = current ? skeletonSlots(current) : 0;
  const mods = stockItems(c, d, isRobotModule);
  const moduleOptions = (i) => {
    const cur = modules[i]?.id || '';
    const list = mods.filter((it) => it.id === cur || availableCount(c, R.robots, it.id) + (it.id === cur ? 1 : 0) > 0);
    const chosen = cur && !list.some((it) => it.id === cur) ? d.itemMap.get(cur) : null;
    if (chosen) list.unshift(chosen);
    return `<select data-skel-mod="${i}"><option value="">—</option>${opts(list, cur, (it) => optLabel(it), (it) => it.id)}</select>`;
  };
  const card = (it) => `<details class="line skel-card"><summary><span class="grow"><b>${esc(label(it))}</b> <span class="meta">${esc(it.category || '')}</span></span><span class="chip">${esc(it.rarity || '')}</span></summary>
    <div class="body"><div class="chips">${statChips(parsePart(it.description))}</div><p class="desc">${esc(it.description || 'Описание пока не заполнено.')}</p></div></details>`;
  const equippedCards = [current, ...modules].filter(Boolean).map(card).join('');
  const catalog = d.items.filter(isRobotModule).map(card).join('');
  return `<section class="panel"><h2>Модульный скелет</h2>
    <p class="meta">Скелет — броня в слоте [Exo], его модули занимают слоты [Acs]. Модули берутся из инвентаря и не могут использоваться дважды без второй копии.</p>
    <div class="grid"><label>Скелет<select data-skel><option value="">— не выбран —</option>${opts(skeletons, current?.id || '', (it) => optLabel(it), (it) => it.id)}</select></label></div>
    ${current ? `<p class="meta">Модулей: ${modules.length} / ${slots}.</p>
      <div class="grid">${Array.from({ length: slots }, (_, i) => `<label>Модуль ${i + 1}${moduleOptions(i)}</label>`).join('')}</div>` : '<p class="meta">Выберите модульный скелет из инвентаря.</p>'}
    ${equippedCards ? `<div class="skel-cards"><h3>Установленные карточки</h3>${equippedCards}</div>` : ''}
    ${catalog ? `<details class="skel-catalog"><summary>Посмотреть карточки модулей (${d.items.filter(isRobotModule).length})</summary><div class="list">${catalog}</div></details>` : ''}
  </section>`;
}

export function render(ctx) {
  const c = ctx.char, d = ctx.data;
  if (!c.ro) c.ro = blankRO();
  else c.ro = { ...blankRO(), ...c.ro };
  if (!c.roStatus) c.roStatus = blankROStatus();
  for (const f of RO_FACTIONS) c.roStatus[f] = normalizeROStatus(f, c.roStatus[f], c.ro[f]);
  if (!Array.isArray(c.robots)) c.robots = [];
  const race = d.raceMap.get(c.race), trait = d.traitMap.get(c.trait);
  const isNovus = race?.name === 'Новуссит';
  if (!isNovus && c.essence) c.essence = null;
  const classes = allowedClasses(c.race, d.classes);
  if (!classes.some((x) => x.name === c.class)) c.class = classes[0]?.name || '';
  // Транспорт доступен только Кочевнику и только пока машина есть в гараже.
  if (!isKochevnik(c)) c.transport = null;
  else if (c.transport && !G.vehicles.some((v) => v.id === c.transport)) c.transport = null;

  // Суммируем все характеристики персонажа
  const statsSum = Object.values(c.stats || {}).reduce((acc, val) => acc + (Number(val) || 0), 0);
  
  // База свободных очков (56 + бонус)
  const bonus = Number(c.overrides?.freePointsBonus) || 0;
  const totalPool = 56 + bonus;
  const autoFreePoints = totalPool - statsSum;

  const r = derive(c, d, isKochevnik(c) && c.transport ? ['Tr'] : []);
  // Устанавливаем свободные очки как сумму пула минус сумма характеристик
  r.freePoints = {
    value: autoFreePoints,
    auto: 56 - statsSum,
    overridden: bonus !== 0
  };

  const stats = [...d.stats].sort((a, b) => STAT_ORDER.indexOf(a.key) - STAT_ORDER.indexOf(b.key));
  const stat = (s, index) => {
    const issue = r.statIssues[s.key];
    const nextStatKey = STAT_ORDER[(index + 1) % STAT_ORDER.length];
    const nextStatAttr = nextStatKey ? ` data-enter-next="stats.${nextStatKey}"` : '';
    return `<label class="${issue ? 'stat-bad' : ''}"${issue ? ` title="Не хватает для навыков: ${esc(issue.skills.join(', '))}"` : ''}>${esc(s.name)}${issue ? ` <span class="bad">нужно ${issue.need}</span>` : ''}<input type="number" min="1" max="${s.max}" step="1" data-p="stats.${s.key}"${nextStatAttr} value="${c.stats[s.key]}"${issue ? ' class="err"' : ''}></label>`;
  };
  const ab = Array.from({ length: 9 }, (_, i) => c.abilities[i] || null);
  const rankText = (x) => `${x.level} · ${x.name}`;
  const full = r.skillCount >= r.skillLimit;
  const issues = Object.entries(r.statIssues);

  if (UI.page === 'stats') return `${pageTabs()}${statsPanel(c, d)}`;

  return `${pageTabs()}<div class="char-layout">
    <div class="char-col">
      <section class="panel"><div class="grid">
        <label>Имя<input data-p="name" value="${esc(c.name)}"></label><label>Игрок<input data-p="player" value="${esc(c.player)}"></label>
        <label>Раса<select data-p="race">${opts(d.races, c.race)}</select></label>
        <label>Ранг<select data-p="rank" data-n="1">${opts(d.ranks, c.rank, rankText, (x) => x.level)}</select></label>
        <label>Класс<select data-p="class">${opts(classes, c.class, (x) => x.name, (x) => x.name)}</select></label>
        <label>Черта<select data-p="trait"><option value="">—</option>${opts(d.traits, c.trait)}</select></label>
        ${isNovus ? `<label>Сущность<select data-p="essence"><option value="">—</option>${opts(d.essences, c.essence)}</select></label>` : ''}</div>
        ${race && !race.has_kronos ? `<p class="meta">${esc(race.name)}: Кроноса нет (справочно, расчёт не блокируется).</p>` : ''}
        ${trait ? `<p class="desc meta">${esc(trait.description)}</p>` : ''}</section>
      <section class="panel"><div class="grid">${ovFreePointsBonus('Свободные очки', 'overrides.freePointsBonus', r.freePoints, bonus)}${ov('Макс. ОЗ', 'overrides.hpMax', r.hpMax)}${ov('Макс. Кронос', 'overrides.kronosMax', r.kronosMax)}</div></section>
      <section class="panel"><h2>Характеристики</h2><div class="grid">${stats.map((s, index) => stat(s, index)).join('')}</div></section>
      <section class="panel"><h2>Навыки</h2>
        <div class="chips"><span class="chip ${r.skillsOverLimit ? 'bad' : ''}">Навыки: ${r.skillCount} / ${r.skillLimit}</span><span class="chip">Щепки: ${num(r.shardsTotal)}</span><span class="chip">Лимит: 4 × ранг ${r.rankLevel}</span></div>
        ${issues.length ? `<p class="bad">Не хватает характеристик: ${issues.map(([k, v]) => `${esc(d.statMap.get(k)?.name || k)} (нужно ${v.need}, есть ${v.have})`).join('; ')}</p>` : ''}
        ${adder('skills', full ? `Лимит навыков: ${r.skillLimit}` : 'Найти навык…', c, d, full)}
        ${full ? `<p class="meta bad">Лимит навыков: ${r.skillLimit} (4 × ранг ${r.rankLevel}).</p>` : ''}
        ${r.skills.map((s) => skillRow(s, d)).join('') || '<p class="meta">Навыки не выбраны.</p>'}</section>
      <section class="panel"><h2>Способности и мутации</h2>${ab.map((id, i) => abilityCombo(id, i, d, c.class, c)).join('')}</section>
      ${roPanel(c)}
      <section class="panel char-data"><h2>Данные персонажа</h2>
        <div class="btns"><button class="danger" data-a="reset-char">Сбросить персонажа</button>
          <button data-a="export-char">Экспорт в .json</button>
          <label class="btn">Импорт из .json<input type="file" accept=".json" data-a="import-char" hidden></label>
          <button data-a="print-char">Печать карточки</button></div>
        <details class="char-code"><summary>Код сборки для чата</summary>
          <div class="btns"><button data-a="copy-char-code">Скопировать код</button></div>
          <label>Вставить код<textarea data-char-code rows="2" placeholder="INF1.…" spellcheck="false"></textarea></label>
          <div class="btns"><button data-a="import-char-code">Загрузить код</button></div>
        </details>
        <p class="meta">Сброс очищает только карточку персонажа. Гараж, роботы, тема и кэш базы остаются. Полная выгрузка всех данных — в «Настройках».</p>
        <p id="char-msg" class="meta">${esc(DATA_MSG)}</p></section>
    </div>
    <div class="char-col">
      ${inventoryPanel(c, d, r, race)}
      ${robotPanel(c, d)}
      ${skeletonPanel(c, d)}
      <section class="panel"><h2>Заметки</h2><textarea data-p="notes" rows="4" style="width:100%">${esc(c.notes)}</textarea></section>
    </div>
  </div>${printSheet(c, d, r, stats, race, trait)}`;
}

export function bind(root, ctx) {
  const c = ctx.char, d = ctx.data, done = () => { ctx.save(); ctx.rerender(); };
  if (!c.ro) c.ro = blankRO();
  if (!c.roStatus) c.roStatus = blankROStatus();
  if (!Array.isArray(c.robots)) c.robots = [];
  if (!Array.isArray(c.equipment)) c.equipment = [];

  if (!root._statEnterHandler) {
    root._statEnterHandler = (e) => {
      if (e.key === 'Enter') {
        const targetInput = e.target.closest('input[data-p^="stats."]');
        if (targetInput) {
          e.preventDefault();
          const path = targetInput.dataset.p;
          const val = fieldValue(targetInput);
          set(c, path, val);
          if (path.startsWith('stats.')) {
            const key = path.slice(6), max = ctx.data.statMap.get(key)?.max || 10;
            c.stats[key] = Math.min(max, Math.max(1, Math.round(Number(c.stats[key]) || 1)));
          }
          ctx.save();

          const statInputs = Array.from(root.querySelectorAll('input[data-p^="stats."]'));
          const idx = statInputs.indexOf(targetInput);
          const nextInput = idx >= 0 ? statInputs[(idx + 1) % statInputs.length] : null;
          const nextPath = nextInput ? nextInput.dataset.p : null;

          ctx.rerender();

          if (nextPath) {
            const nextEl = root.querySelector(`[data-p="${nextPath}"]`);
            if (nextEl) {
              nextEl.focus();
              if (typeof nextEl.select === 'function') {
                nextEl.select();
              }
            }
          }
        }
      }
    };
    root.addEventListener('keydown', root._statEnterHandler);
  }

  root.oninput = (e) => {
    const comboKind = e.target.dataset.comboSearch;
    if (comboKind) {
      const box = e.target.closest('[data-combo]');
      if (!box) return;
      const rows = searchRows(comboRows(comboKind, c, ctx.data), e.target.value);
      box.querySelector('[data-combo-list]').innerHTML = comboList(rows);
      return;
    }
    const kind = e.target.dataset.search;
    if (!kind) return;
    const box = e.target.closest('[data-addbox]'), select = box?.querySelector(`[data-in="${kind}"]`);
    if (!select) return;
    const rows = searchRows(adderRows(kind, c, ctx.data), e.target.value);
    const hint = box.dataset.hint || 'Выберите…';
    select.innerHTML = `<option value="">${esc(hint)}</option>${rows.length ? groupOptions(rows) : '<option value="" disabled>Ничего не найдено</option>'}`;
  };
  root.onchange = (e) => {
    if (e.target.dataset.pageSelect !== undefined) {
      UI.page = e.target.value === 'stats' ? 'stats' : 'sheet';
      ctx.route?.(UI.page === 'stats' ? 'stats' : UI.tab);
      ctx.rerender();
      return;
    }
    if (e.target.dataset.statsWeapon !== undefined) {
      c.statsWeapon = e.target.value || null;
      done();
      return;
    }
    if (e.target.dataset.statsSource !== undefined) {
      if (!c.statsToggles) c.statsToggles = { sources: {}, effects: {} };
      if (!c.statsToggles.sources) c.statsToggles.sources = {};
      c.statsToggles.sources[e.target.dataset.statsSource] = !!e.target.checked;
      done();
      return;
    }
    if (e.target.dataset.statsCondAll !== undefined) {
      if (!c.statsToggles) c.statsToggles = { sources: {}, effects: {} };
      if (!c.statsToggles.effects) c.statsToggles.effects = {};
      const stats = collectCharacterStats(c, d);
      for (const x of stats.conditional) c.statsToggles.effects[x.effectKey] = !!e.target.checked;
      done();
      return;
    }
    if (e.target.dataset.statsCondGroup !== undefined) {
      if (!c.statsToggles) c.statsToggles = { sources: {}, effects: {} };
      if (!c.statsToggles.effects) c.statsToggles.effects = {};
      const stats = collectCharacterStats(c, d);
      for (const x of stats.conditional) {
        if (x.sourceKey === e.target.dataset.statsCondGroup) c.statsToggles.effects[x.effectKey] = !!e.target.checked;
      }
      done();
      return;
    }
    if (e.target.dataset.statsEffect !== undefined) {
      if (!c.statsToggles) c.statsToggles = { sources: {}, effects: {} };
      if (!c.statsToggles.effects) c.statsToggles.effects = {};
      c.statsToggles.effects[e.target.dataset.statsEffect] = !!e.target.checked;
      done();
      return;
    }
    if (e.target.dataset.pFreeBonus !== undefined) {
      const path = e.target.dataset.pFreeBonus;
      const raw = e.target.value;
      if (!c.overrides) c.overrides = {};
      set(c, path, raw === '' ? 0 : Number(raw) || 0);
      done();
      return;
    }
    if (e.target.dataset.a === 'import-char') {
      const file = e.target.files?.[0];
      if (!file) return;
      importChar(file).then((imported) => {
        ctx.char = imported;
        ctx.save();
        DATA_MSG = 'Персонаж загружен: ' + (ctx.char.name || 'без имени');
        ctx.rerender();
      }).catch((err) => {
        DATA_MSG = err.message;
        ctx.rerender();
      });
      return;
    }
    if (e.target.dataset.clinic !== undefined) {
      const id = e.target.dataset.clinic;
      if (!Array.isArray(c.clinicImplants)) c.clinicImplants = [];
      if (e.target.checked) { if (!c.clinicImplants.includes(id)) c.clinicImplants.push(id); }
      else c.clinicImplants = c.clinicImplants.filter((x) => x !== id);
      done();
      return;
    }
    if (e.target.dataset.transport !== undefined) {
      c.transport = e.target.value || null;
      done();
      return;
    }
    if (e.target.dataset.robotUse !== undefined) {
      const id = e.target.dataset.robotUse;
      if (e.target.checked) { if (!c.robots.includes(id)) c.robots.push(id); }
      else c.robots = c.robots.filter((x) => x !== id);
      done();
      return;
    }
    if (e.target.dataset.robotHp !== undefined) {
      const robot = R.robots.find((x) => x.id === e.target.dataset.robotHp);
      if (robot) {
        robot.currentHp = e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value) || 0));
        saveRobots(R);
        done();
      }
      return;
    }
    if (e.target.dataset.robotWeapon !== undefined) {
      const robot = R.robots.find((x) => x.id === e.target.dataset.robotWeapon);
      if (robot) {
        robot.weapon = e.target.value === '' ? null : Number(e.target.value);
        saveRobots(R);
        done();
      }
      return;
    }
    if (e.target.dataset.robotModule !== undefined) {
      const [id, raw] = e.target.dataset.robotModule.split('.');
      const robot = R.robots.find((x) => x.id === id);
      if (robot) {
        const i = Number(raw) || 0;
        if (!Array.isArray(robot.modulesActive)) robot.modulesActive = [false, false, false, false, false];
        robot.modulesActive[i] = !!e.target.checked;
        saveRobots(R);
        done();
      }
      return;
    }
    if (e.target.dataset.skel !== undefined) {
      const id = e.target.value || null;
      c.equipment = c.equipment.filter((x) => !isSkeleton(d.itemMap.get(x)));
      if (id && isSkeleton(d.itemMap.get(id))) c.equipment.push(id);
      done();
      return;
    }
    if (e.target.dataset.skelMod !== undefined) {
      const i = Number(e.target.dataset.skelMod) || 0;
      const current = c.equipment.map((id) => d.itemMap.get(id)).filter(isRobotModule);
      const old = current[i];
      if (old) {
        const idx = c.equipment.indexOf(old.id);
        if (idx >= 0) c.equipment.splice(idx, 1);
      }
      if (e.target.value) c.equipment.push(e.target.value);
      done();
      return;
    }
    if (e.target.dataset.p) {
      const path = e.target.dataset.p;
      set(c, path, e.target.type === 'checkbox' ? e.target.checked : fieldValue(e.target));
      if (path.startsWith('abilities.')) {
        const slot = Number(path.slice('abilities.'.length));
        const id = c.abilities[slot];
        if (id && c.abilities.some((x, i) => i !== slot && x === id)) {
          c.abilities[slot] = null;
          e.target.value = '';
        }
      }
      if (path.startsWith('stats.')) {
        const key = path.slice(6), max = ctx.data.statMap.get(key)?.max || 10;
        c.stats[key] = Math.min(max, Math.max(1, Math.round(Number(c.stats[key]) || 1)));
      }
      if (path.startsWith('ro.')) {
        const faction = path.slice(3);
        const raw = Number(c.ro?.[faction]);
        c.ro[faction] = Math.max(RO_MIN, Math.min(RO_MAX, Math.round(Number.isFinite(raw) ? raw : 0)));
        c.roStatus[faction] = normalizeROStatus(faction, c.roStatus[faction], c.ro[faction]);
      }
      if (path.startsWith('roStatus.')) {
        const faction = path.slice(9);
        c.roStatus[faction] = normalizeROStatus(faction, c.roStatus[faction], c.ro[faction]);
      }
      if (path === 'race') {
        const allowed = allowedClasses(c.race, ctx.data.classes);
        if (!allowed.some((x) => x.name === c.class)) c.class = allowed[0]?.name || '';
        if (ctx.data.raceMap.get(c.race)?.name !== 'Новуссит') c.essence = null;
      }
      if ((path === 'race' || path === 'class') && !isKochevnik(c)) c.transport = null;
      done(); return;
    }
    if (e.target.dataset.itabSelect !== undefined) {
      UI.tab = e.target.value;
      ctx.route?.(UI.tab);
      ctx.rerender();
      return;
    }
    if (e.target.dataset.sort) {
      const kind = e.target.dataset.sort, prev = UI.sort[kind] || ['name', 1];
      UI.sort[kind] = [e.target.value, prev[1] === -1 ? -1 : 1];
      ctx.rerender(); return;
    }
  };
  root.onclick = (e) => {
    const pageTab = e.target.closest('[data-page-tab]');
    if (pageTab) {
      UI.page = pageTab.dataset.pageTab === 'stats' ? 'stats' : 'sheet';
      ctx.route?.(UI.page === 'stats' ? 'stats' : UI.tab);
      ctx.rerender();
      return;
    }
    const statBtn = e.target.closest('[data-stat-source]');
    if (statBtn) {
      OPEN_STAT = OPEN_STAT === statBtn.dataset.statSource ? null : statBtn.dataset.statSource;
      ctx.rerender();
      return;
    }
    if (e.target.closest('[data-stat-close]')) {
      OPEN_STAT = null;
      ctx.rerender();
      return;
    }
    const action = e.target.closest('[data-a]')?.dataset.a;
    if (action === 'copy-inventory') {
      copyText(inventoryText(ctx.char, ctx.data)).then((ok) => {
        showToast(ok ? 'Список инвентаря скопирован' : 'Не удалось скопировать список');
      });
      return;
    }
    if (action === 'export-char') { exportChar(ctx.char); return; }
    if (action === 'copy-char-code') {
      copyText(charToCode(ctx.char)).then((ok) => {
        showToast(ok ? 'Код сборки скопирован' : 'Не удалось скопировать код');
      });
      return;
    }
    if (action === 'import-char-code') {
      const raw = root.querySelector('[data-char-code]')?.value;
      try {
        ctx.char = codeToChar(raw);
        ctx.save();
        DATA_MSG = 'Персонаж загружен из кода сборки.';
      } catch (err) {
        DATA_MSG = err.message;
      }
      ctx.rerender();
      return;
    }
    if (action === 'print-char') {
      if (typeof window === 'undefined' || typeof document === 'undefined') return;
      const body = document.body;
      const restore = () => {
        body.classList.remove('print-char');
        window.removeEventListener('afterprint', restore);
      };
      body.classList.add('print-char');
      window.addEventListener('afterprint', restore);
      window.print();
      return;
    }
    if (action === 'reset-char' && (typeof confirm !== 'function' || confirm('Сбросить персонажа? Гараж, роботы и настройки останутся.'))) {
      ctx.char = blankChar();
      ctx.save();
      DATA_MSG = 'Персонаж сброшен.';
      ctx.rerender();
      return;
    }
    const comboBtn = e.target.closest('[data-combo-btn]');
    if (comboBtn) {
      const combo = comboBtn.closest('[data-combo]');
      if (combo?.querySelector('[data-combo-pop]')?.hidden) openCombo(comboBtn, comboRows(combo.dataset.combo, c, ctx.data), root);
      else closeCombos(root);
      return;
    }
    const comboOpt = e.target.closest('[data-combo-opt]');
    if (comboOpt) {
      const combo = comboOpt.closest('[data-combo]'), kind = combo?.dataset.combo, target = combo?.dataset.comboTarget;
      const select = target ? root.querySelector(`[data-p="${target}"]`) : (kind ? root.querySelector(`[data-in="${kind}"]`) : null);
      if (select) {
        select.value = comboOpt.dataset.comboOpt;
        if (target) { closeCombos(root); select.dispatchEvent(new Event('change', { bubbles: true })); return; }
      }
      const label = combo?.querySelector('[data-combo-label]');
      if (label) label.textContent = comboOpt.textContent;
      closeCombos(root);
      return;
    }
    if (!e.target.closest('[data-combo]')) closeCombos(root);
    const beastPath = e.target.closest('[data-beast-path]');
    if (beastPath) {
      const path = beastPath.dataset.beastPath;
      if (path !== c.beastPath) {
        const general = new Set(ctx.data.beasts.filter((b) => b.group_name === BEAST_GENERAL).map((b) => b.id));
        const rootBeast = ctx.data.beasts.find((b) => b.group_name === path && isPathBeast(b));
        c.beastPath = path;
        c.beasts = [...new Set([...(Array.isArray(c.beasts) ? c.beasts : []).filter((id) => general.has(id)), ...(rootBeast ? [rootBeast.id] : [])])];
        done();
      }
      return;
    }
    const itab = e.target.closest('[data-itab]');
    if (itab) {
      UI.tab = itab.dataset.itab;
      ctx.route?.(UI.tab);
      ctx.rerender();
      return;
    }
    const dir = e.target.closest('[data-dir]');
    if (dir) {
      const kind = dir.dataset.dir, prev = UI.sort[kind] || ['name', 1];
      UI.sort[kind] = [prev[0], prev[1] === -1 ? 1 : -1];
      ctx.rerender(); return;
    }
    const add = e.target.closest('[data-add]'), rm = e.target.closest('[data-del]');
    if (rm) {
      const [kind, i] = rm.dataset.del.split('.');
      const idx = Number(i);
      const removed = c[kind]?.[idx];
      const prevStorage = c.storage;
      const prevClinic = Array.isArray(c.clinicImplants) ? [...c.clinicImplants] : null;
      if (kind === 'implants') {
        const id = c.implants[idx];
        c.implants.splice(idx, 1);
        if (id && !c.implants.includes(id) && Array.isArray(c.clinicImplants)) c.clinicImplants = c.clinicImplants.filter((x) => x !== id);
      } else c[kind].splice(idx, 1);
      if (c.storage && !c.pockets.some((x) => x.id === c.storage)) c.storage = null;
      done();
      if (removed !== undefined) {
        const id = typeof removed === 'string' ? removed : removed?.id;
        const name = kind === 'beasts'
          ? (d.beasts.find((b) => b.id === id)?.name || id)
          : kind === 'skills' ? d.skillMap.get(id)?.name
            : kind === 'repository' ? d.cardMap.get(id)?.name
              : d.itemMap.get(id)?.name;
        showToast(`Удалено: ${name || 'запись'}`, {
          label: 'Отменить',
          onAction: () => {
            if (!Array.isArray(c[kind])) return;
            c[kind].splice(Math.min(idx, c[kind].length), 0, removed);
            if (prevClinic) c.clinicImplants = prevClinic;
            if (prevStorage) c.storage = prevStorage;
            done();
          },
        });
      }
    }
    if (!add) return;
    const kind = add.dataset.add, input = root.querySelector(`[data-in="${kind}"]`);
    const id = input?.value;
    if (!id) { input?.classList.add('err'); return; }
    if (kind === 'skills') {
      if (c.skills.length >= skillLimit(c, ctx.data)) { input.classList.add('err'); return; }
      c.skills.push({ id, level: 5 });
    }
    else if (kind === 'pockets' || kind === 'repository') { const e2 = c[kind].find((x) => x.id === id); if (e2) e2.qty++; else c[kind].push({ id, qty: 1 }); }
    else if (kind === 'beasts') { if (!Array.isArray(c.beasts)) c.beasts = []; if (!c.beasts.includes(id)) c.beasts.push(id); }
    else c[kind].push(id);
    done();
  };
  if (!root._skillToggle) {
    root._skillToggle = (e) => {
      const det = e.target.closest?.('details.skill');
      if (!det) return;
      if (det.open) OPEN.add(det.dataset.skill); else OPEN.delete(det.dataset.skill);
    };
    root.addEventListener('toggle', root._skillToggle, true);
  }
  if (!root._rowToggle) {
    // Клик по «+/-» количества перерисовывает список — раскрытые карточки запоминаем.
    root._rowToggle = (e) => {
      const det = e.target.closest?.('details.row[data-row]');
      if (!det) return;
      if (det.open) OPEN_ROWS.add(det.dataset.row); else OPEN_ROWS.delete(det.dataset.row);
    };
    root.addEventListener('toggle', root._rowToggle, true);
  }
  if (!root._statsToggle) {
    root._statsToggle = (e) => {
      const det = e.target.closest?.('details.stats-source[data-stats-row]');
      if (!det) return;
      if (det.open) OPEN_STATS.add(det.dataset.statsRow); else OPEN_STATS.delete(det.dataset.statsRow);
    };
    root.addEventListener('toggle', root._statsToggle, true);
  }
  if (!root._comboKeys) {
    root._comboKeys = comboKeydown;
    root.addEventListener('keydown', root._comboKeys);
  }
  // Частично отмеченные группы условий показываем неопределённой галочкой.
  if (typeof root.querySelectorAll === 'function' && c && d) {
    const cond = collectCharacterStats(c, d).conditional;
    const allOn = cond.filter((x) => x.toggled).length;
    root.querySelectorAll('[data-stats-cond-all]').forEach((el) => {
      el.indeterminate = allOn > 0 && allOn < cond.length;
    });
    root.querySelectorAll('[data-stats-cond-group]').forEach((el) => {
      const rows = cond.filter((x) => x.sourceKey === el.dataset.statsCondGroup);
      const on = rows.filter((x) => x.toggled).length;
      el.indeterminate = on > 0 && on < rows.length;
    });
  }
  installComboClose();
}

// Подссылки вида #char/beasts открывают нужную вкладку инвентаря, #char/stats — сводку статов.
const TAB_IDS = new Set(['pockets', 'equipment', 'implants', 'repository', 'beasts']);
export function setRoute(sub) {
  if (sub === 'stats') { UI.page = 'stats'; return; }
  // Пустой подраздел не сбрасывает выбор: при возврате на вкладку остаётся последняя подвкладка.
  if (TAB_IDS.has(sub)) { UI.page = 'sheet'; UI.tab = sub; }
}
export function currentRoute() {
  return UI.page === 'stats' ? 'stats' : UI.tab;
}