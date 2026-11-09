import { esc, num, label, opts, set, fieldValue, RARITIES, optLabel } from '../core/util.js';
import { derive, sellPrice, skillLimit } from '../character/derive.js';
import { RULES, allowedClasses } from '../character/rules.js';
import { itemRow, cardRow } from './databases.js';

const OPEN = new Set(); // раскрытые описания навыков, чтобы состояние переживало перерисовку
const OPEN_ROWS = new Set(); // раскрытые карточки предметов и карт
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
const ov = (title, path, v) => `<label class="ov${v.overridden ? ' on' : ''}"><span>${title}</span><b class="${v.value < 0 ? 'bad' : ''}">${num(v.value)}</b>
  <input type="number" data-p="${path}" value="${v.overridden ? v.value : ''}" placeholder="авто ${num(v.auto)}"></label>`;
const del = (kind, i) => `<button class="x" data-del="${kind}.${i}" title="Убрать">✕</button>`;
const missing = (kind, i, id) => `<div class="line miss">Записи ${esc(id)} больше нет в базе ${del(kind, i)}</div>`;
const slots = (rows) => `<div class="chips">${rows.map((s) => `<span class="lim ${s.status === 'ОК' ? 'o' : s.status === 'Занято' ? 'b' : s.status === 'Свободно' ? 'f' : 'x2'}">${esc(s.tag)} ${s.used}/${s.limit} · ${s.status}</span>`).join('')}</div>`;
const optionLabel = (it) => optLabel(it);
const abilityText = (a) => `${a.kind === 'mutation' ? 'Мутация' : 'Способность'}: ${a.name}${a.class_requirement ? ' (' + a.class_requirement + ')' : ''}`;
const abilityRows = (d) => d.abilities.map((a) => ({ id: a.id, text: abilityText(a), group: a.kind === 'mutation' ? 'Мутации' : 'Способности' }));
const comboRows = (kind, c, d) => (kind.startsWith('abilities.') ? abilityRows(d) : adderRows(kind, c, d));

// Состояние подвкладок и сортировки переживает перерисовку, как и OPEN у навыков.
const UI = {
  tab: 'pockets',
  sort: {
    pockets: ['id', 1], equipment: ['id', 1], implants: ['id', 1],
    repository: ['id', 1], beasts: ['id', 1],
  },
};

const RARITY_RANK = new Map(RARITIES.map((r, i) => [r, i]));
const cmpText = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'ru');
const cmpNum = (a, b) => (Number(a) || 0) - (Number(b) || 0);
const cmpRarity = (a, b) => (RARITY_RANK.get(a) ?? 99) - (RARITY_RANK.get(b) ?? 99);
const sdef = (name, get, cmp = cmpText) => ({ name, get, cmp });

function adderRows(kind, c, d) {
  if (kind === 'skills') return d.skills.map((s) => ({ id: s.id, text: `${s.name} · ${d.statMap.get(s.stat)?.name || s.stat} ${s.tier}`, group: d.statMap.get(s.stat)?.name || 'Навыки' }));
  if (kind === 'pockets') return d.items.map((it) => ({ id: it.id, text: optionLabel(it), group: it.category || 'Без категории' }));
  if (kind === 'repository') return d.cards.map((x) => {
    const own = c.class && x.classes.includes(c.class), general = x.classes.includes('Общие');
    return { id: x.id, text: optLabel(x), group: own ? c.class : general ? 'Общие' : 'Другие классы', rank: own ? 0 : general ? 1 : 2 };
  });
  // Импланты ставятся сразу из справочника и не занимают места в хранилище.
  if (kind === 'implants') return d.items.filter((it) => it.category === 'Имплант').map((it) => ({ id: it.id, text: optionLabel(it), group: 'Импланты' }));
  return c.pockets.map((e) => d.itemMap.get(e.id)).filter(Boolean).filter((it) => it.tag !== STORAGE_TAG).map((it) => ({ id: it.id, text: optionLabel(it), group: it.category || 'Без категории' }));
}

function grouped(rows) {
  const groups = new Map();
  for (const r of rows) {
    const g = r.group || 'Без группы';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  }
  return [...groups.entries()].sort(([a, la], [b, lb]) => ((la[0]?.rank ?? 0) - (lb[0]?.rank ?? 0)) || cmpText(a, b))
    .map(([g, list]) => [g, [...list].sort((a, b) => cmpText(a.text, b.text))]);
}

function groupOptions(rows) {
  return grouped(rows).map(([g, list]) =>
    `<optgroup label="${esc(g)}">${list.map((r) => `<option value="${esc(r.id)}">${esc(r.text)}</option>`).join('')}</optgroup>`).join('');
}

function comboList(rows) {
  if (!rows.length) return '<p class="combo-empty">Ничего не найдено</p>';
  return grouped(rows).map(([g, list]) =>
    `<div class="combo-group"><div class="combo-group-name">${esc(g)}</div>${list.map((r) => `<button type="button" class="combo-opt" role="option" data-combo-opt="${esc(r.id)}">${esc(r.text)}</button>`).join('')}</div>`).join('');
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
    sell: sdef('Цена продажи', (x) => (x.it ? sellPrice(x.it, c).value : 0), cmpNum),
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

const beastSortDefs = () => ({
  name: sdef('Название', (x) => x.b?.name || ''),
  group: sdef('Группа', (x) => x.b?.group_name || 'Без группы'),
  id: sdef('ID', (x) => x.b?.id || ''),
});

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
  const s = { count: 0, cost: 0, sell: 0, tali: 0, cards: 0, capacity: RULES.pocketLimit, over: false };
  // Установленные импланты не занимают место в хранилище, даже если остались в старом списке.
  const installed = new Map();
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
    s.count += qty;
    s.cost += (it.cost || 0) * qty;
    s.sell += sellPrice(it, c).value * qty;
  }
  for (const id of c.implants) {
    const it = d.itemMap.get(id);
    if (!it) continue;
    s.cost += it.cost || 0;
    s.sell += sellPrice(it, c).value;
  }
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
  const qty = (rows) => rows.reduce((a, e) => a + (Number(e.qty) || 0), 0);
  return [
    { id: 'pockets', label: 'Хранилище', ok: true, count: qty(c.pockets) },
    { id: 'equipment', label: 'Экипировка', ok: true, count: c.equipment.length },
    { id: 'implants', label: 'Импланты', ok: !!race?.implants_allowed, hint: 'только Поляриец и Новуссит', count: c.implants.length },
    { id: 'repository', label: 'Репозиторий', ok: race?.name === 'Новуссит', hint: 'только Новуссит', count: qty(c.repository) },
    { id: 'beasts', label: 'Способности Зверя', ok: race?.name === 'Хуманиец' && c.class === 'Зверь', hint: 'Хуманиец с классом Зверь', wip: true, count: Array.isArray(c.beasts) ? c.beasts.length : 0 },
  ];
}

function beastRow(b, chosen) {
  const selected = chosen.has(b.id);
  return `<details class="line beast${selected ? ' picked' : ''}">
    <summary><span class="grow"><b>${esc(b.name)}</b> <span class="meta">${esc(b.group_name || 'Без группы')}</span></span>${selected ? '<span class="chip">взято</span>' : ''}</summary>
    <div class="body"><label class="pick"><input type="checkbox" data-beast="${esc(b.id)}"${selected ? ' checked' : ''}> Взять способность</label>
      <p class="desc">${esc(b.description || 'Описание пока не заполнено.')}</p></div>
  </details>`;
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

function abilityCombo(id, i, d) {
  const chosen = id ? d.abilityMap.get(id) : null, key = `abilities.${i}`, hint = `Слот ${i + 1}: пусто`;
  return `<div class="line"><select class="grow ability-native" data-p="${key}"><option value="">${esc(hint)}</option>${opts(d.abilities, id, abilityText)}</select>
    <div class="combo grow" data-combo="${key}" data-combo-target="${key}">
      <button type="button" class="combo-btn" data-combo-btn="${key}" aria-haspopup="listbox" aria-expanded="false"><span data-combo-label="${key}">${esc(chosen ? abilityText(chosen) : hint)}</span><span class="combo-caret" aria-hidden="true">▾</span></button>
      <div class="combo-pop" data-combo-pop="${key}" hidden>
        <input type="search" class="combo-search" data-combo-search="${key}" placeholder="Поиск…" autocomplete="off" aria-label="Поиск: ${esc(hint)}">
        <div class="combo-list" role="listbox" aria-label="${esc(hint)}" data-combo-list="${key}"></div>
      </div>
    </div></div>${chosen ? `<p class="desc meta">${esc(chosen.description)}</p>` : ''}`;
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
      const sp = sellPrice(it, c), key = `pockets.${it.id}`;
      return itemRow(it, `<div class="ctl"><label>Кол-во <input type="number" min="1" data-p="pockets.${i}.qty" value="${e.qty}"></label>
        <label>Цена продажи <input type="number" data-p="overrides.sellPrice.${it.id}" value="${sp.overridden ? sp.value : ''}" placeholder="авто ${num(sp.auto)}"></label>${del('pockets', i)}</div>`,
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
      return itemRow(it, `<div class="ctl">${del(active, i)}</div>`, { openKey: key, open: OPEN_ROWS.has(key) });
    };
    body = `<div class="inv-tools">${adder(active, active === 'implants' ? 'Выбрать имплант…' : 'Выбрать из хранилища…', c, d)}${sortBar(active, defs)}</div>
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
    const chosen = new Set(Array.isArray(c.beasts) ? c.beasts : []);
    const defs = beastSortDefs();
    const rows = sortRows('beasts', d.beasts.map((b) => ({ b })), defs);
    body = `<div class="wip-note"><span class="chip warn">WIP</span><span class="meta">Раздел в разработке: правила способностей Зверя ещё уточняются.</span></div>
      <div class="chips"><span class="chip">Взято способностей: ${chosen.size}</span><span class="chip">n для расчётов: ${chosen.size}</span></div>
      <div class="inv-tools">${sortBar('beasts', defs)}</div>
      <div class="list">${rows.map(({ b }) => beastRow(b, chosen)).join('') || '<div class="empty">В базе пока нет способностей зверя.</div>'}</div>`;
  }

  return `<section class="panel inventory">
    <div class="inv-head"><h2>Инвентарь</h2>
      <div class="chips inv-summary">
        <span class="chip${sum.over ? ' bad' : ''}" title="Занято мест в хранилище / всего мест (базовые ${RULES.pocketLimit} + бонус [K])">Позиций: ${num(sum.count)} / ${num(sum.capacity)}</span>
        <span class="chip total" title="Сумма по номиналу: хранилище, импланты и репозиторий. 1 Тали = ${RULES.taliToCredits} кредитов">Сумма: ${num(sum.cost)}</span>
        <span class="chip" title="Сколько получится при продаже всего по правилам (5% или ручная цена)">Продажа: ${num(sum.sell)}</span>
        ${sum.cards ? `<span class="chip" title="Суммарная цена карт в тали; в сумму идёт с переводом в кредиты">Карты: ${num(sum.tali)} тали</span>` : ''}
      </div>
    </div>
    <div class="subtabs" role="tablist">${available.map((t) => `<button type="button" role="tab" data-itab="${t.id}" class="${active === t.id ? 'on' : ''}" aria-selected="${active === t.id}">${esc(t.label)}${t.count ? ` <span class="tabcount">${t.count}</span>` : ''}${t.wip ? ' <span class="wip">WIP</span>' : ''}</button>`).join('')}</div>
    <select class="subtabs-select" data-itab-select="1" aria-label="Раздел инвентаря">${available.map((t) => `<option value="${t.id}"${active === t.id ? ' selected' : ''}>${esc(t.label)}${t.count ? ` (${t.count})` : ''}${t.wip ? ' — WIP' : ''}</option>`).join('')}</select>
    ${hidden.length ? `<p class="meta inv-note">Скрыты разделы: ${hidden.map((t) => `<span title="${esc(t.hint)}">${esc(t.label)}</span>`).join(', ')}. Доступность зависит от расы и класса.</p>` : ''}
    ${body}
  </section>`;
}

export function render(ctx) {
  const c = ctx.char, d = ctx.data, r = derive(c, d);
  const race = d.raceMap.get(c.race), trait = d.traitMap.get(c.trait);
  const isNovus = race?.name === 'Новуссит';
  if (!isNovus && c.essence) c.essence = null;
  const classes = allowedClasses(c.race, d.classes);
  if (!classes.some((x) => x.name === c.class)) c.class = classes[0]?.name || '';
  const stats = [...d.stats].sort((a, b) => STAT_ORDER.indexOf(a.key) - STAT_ORDER.indexOf(b.key));
  const stat = (s) => {
    const issue = r.statIssues[s.key];
    return `<label class="${issue ? 'stat-bad' : ''}"${issue ? ` title="Не хватает для навыков: ${esc(issue.skills.join(', '))}"` : ''}>${esc(s.name)}${issue ? ` <span class="bad">нужно ${issue.need}</span>` : ''}<input type="number" min="1" max="${s.max}" step="1" data-p="stats.${s.key}" value="${c.stats[s.key]}"${issue ? ' class="err"' : ''}></label>`;
  };
  const ab = Array.from({ length: 9 }, (_, i) => c.abilities[i] || null);
  const rankText = (x) => `${x.level} · ${x.name}`;
  const full = r.skillCount >= r.skillLimit;
  const issues = Object.entries(r.statIssues);

  return `<div class="char-layout">
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
      <section class="panel"><div class="grid">${ov('Свободные очки', 'overrides.freePoints', r.freePoints)}${ov('Макс. ОЗ', 'overrides.hpMax', r.hpMax)}${ov('Макс. Кронос', 'overrides.kronosMax', r.kronosMax)}</div></section>
      <section class="panel"><h2>Характеристики</h2><div class="grid">${stats.map(stat).join('')}</div></section>
      <section class="panel"><h2>Навыки</h2>
        <div class="chips"><span class="chip ${r.skillsOverLimit ? 'bad' : ''}">Навыки: ${r.skillCount} / ${r.skillLimit}</span><span class="chip">Щепки: ${num(r.shardsTotal)}</span><span class="chip">Лимит: 4 × ранг ${r.rankLevel}</span></div>
        ${issues.length ? `<p class="bad">Не хватает характеристик: ${issues.map(([k, v]) => `${esc(d.statMap.get(k)?.name || k)} (нужно ${v.need}, есть ${v.have})`).join('; ')}</p>` : ''}
        ${adder('skills', full ? `Лимит навыков: ${r.skillLimit}` : 'Найти навык…', c, d, full)}
        ${full ? `<p class="meta bad">Лимит навыков: ${r.skillLimit} (4 × ранг ${r.rankLevel}).</p>` : ''}
        ${r.skills.map((s) => skillRow(s, d)).join('') || '<p class="meta">Навыки не выбраны.</p>'}</section>
      <section class="panel"><h2>Способности и мутации</h2>${ab.map((id, i) => abilityCombo(id, i, d)).join('')}</section>
    </div>
    <div class="char-col">
      ${inventoryPanel(c, d, r, race)}
      <section class="panel"><h2>Заметки</h2><textarea data-p="notes" rows="4" style="width:100%">${esc(c.notes)}</textarea></section>
    </div>
  </div>`;
}

export function bind(root, ctx) {
  const c = ctx.char, done = () => { ctx.save(); ctx.rerender(); };
  const closeCombos = () => root.querySelectorAll?.('[data-combo-pop]')?.forEach?.((pop) => {
    pop.hidden = true;
    pop.closest('[data-combo]')?.querySelector('[data-combo-btn]')?.setAttribute('aria-expanded', 'false');
  });
  root.oninput = (e) => {
    const comboKind = e.target.dataset.comboSearch;
    if (comboKind) {
      const box = e.target.closest('[data-combo]');
      if (!box) return;
      const q = e.target.value.trim().toLowerCase();
      const rows = comboRows(comboKind, c, ctx.data).filter((r) => !q || `${r.text} ${r.group}`.toLowerCase().includes(q));
      box.querySelector('[data-combo-list]').innerHTML = comboList(rows);
      return;
    }
    const kind = e.target.dataset.search;
    if (!kind) return;
    const box = e.target.closest('[data-addbox]'), select = box?.querySelector(`[data-in="${kind}"]`);
    if (!select) return;
    const q = e.target.value.trim().toLowerCase();
    const rows = adderRows(kind, c, ctx.data).filter((r) => !q || `${r.text} ${r.group}`.toLowerCase().includes(q));
    const hint = box.dataset.hint || 'Выберите…';
    select.innerHTML = `<option value="">${esc(hint)}</option>${rows.length ? groupOptions(rows) : '<option value="" disabled>Ничего не найдено</option>'}`;
  };
  root.onchange = (e) => {
    if (e.target.dataset.p) {
      const path = e.target.dataset.p;
      set(c, path, fieldValue(e.target));
      if (path.startsWith('stats.')) {
        const key = path.slice(6), max = ctx.data.statMap.get(key)?.max || 10;
        c.stats[key] = Math.min(max, Math.max(1, Math.round(Number(c.stats[key]) || 1)));
      }
      if (path === 'race') {
        const allowed = allowedClasses(c.race, ctx.data.classes);
        if (!allowed.some((x) => x.name === c.class)) c.class = allowed[0]?.name || '';
        if (ctx.data.raceMap.get(c.race)?.name !== 'Новуссит') c.essence = null;
      }
      done(); return;
    }
    if (e.target.dataset.itabSelect !== undefined) { UI.tab = e.target.value; ctx.rerender(); return; }
    if (e.target.dataset.sort) {
      const kind = e.target.dataset.sort, prev = UI.sort[kind] || ['name', 1];
      UI.sort[kind] = [e.target.value, prev[1] === -1 ? -1 : 1];
      ctx.rerender(); return;
    }
    if (e.target.dataset.beast) {
      const id = e.target.dataset.beast;
      if (!Array.isArray(c.beasts)) c.beasts = [];
      if (e.target.checked) { if (!c.beasts.includes(id)) c.beasts.push(id); }
      else c.beasts = c.beasts.filter((x) => x !== id);
      done();
    }
  };
  root.onclick = (e) => {
    const comboBtn = e.target.closest('[data-combo-btn]');
    if (comboBtn) {
      const combo = comboBtn.closest('[data-combo]'), pop = combo?.querySelector('[data-combo-pop]');
      const willOpen = !!pop?.hidden;
      closeCombos();
      if (willOpen) {
        pop.hidden = false;
        const btnRect = comboBtn.getBoundingClientRect(), gap = 8;
        const below = innerHeight - btnRect.bottom - gap, above = btnRect.top - gap;
        const up = below < 352 && above > below;
        pop.classList.toggle('up', up);
        pop.style.maxHeight = `${Math.min(352, Math.max(160, up ? above : below))}px`;
        comboBtn.setAttribute('aria-expanded', 'true');
        const search = pop.querySelector('[data-combo-search]');
        search.value = '';
        pop.querySelector('[data-combo-list]').innerHTML = comboList(comboRows(combo.dataset.combo, c, ctx.data));
        search.focus();
      }
      return;
    }
    const comboOpt = e.target.closest('[data-combo-opt]');
    if (comboOpt) {
      const combo = comboOpt.closest('[data-combo]'), kind = combo?.dataset.combo, target = combo?.dataset.comboTarget;
      const select = target ? root.querySelector(`[data-p="${target}"]`) : (kind ? root.querySelector(`[data-in="${kind}"]`) : null);
      if (select) {
        select.value = comboOpt.dataset.comboOpt;
        if (target) { closeCombos(); select.dispatchEvent(new Event('change', { bubbles: true })); return; }
      }
      const label = combo?.querySelector('[data-combo-label]');
      if (label) label.textContent = comboOpt.textContent;
      closeCombos();
      return;
    }
    if (!e.target.closest('[data-combo]')) closeCombos();
    const itab = e.target.closest('[data-itab]');
    if (itab) { UI.tab = itab.dataset.itab; ctx.rerender(); return; }
    const dir = e.target.closest('[data-dir]');
    if (dir) {
      const kind = dir.dataset.dir, prev = UI.sort[kind] || ['name', 1];
      UI.sort[kind] = [prev[0], prev[1] === -1 ? 1 : -1];
      ctx.rerender(); return;
    }
    const add = e.target.closest('[data-add]'), rm = e.target.closest('[data-del]');
    if (rm) { const [kind, i] = rm.dataset.del.split('.'); c[kind].splice(Number(i), 1); if (c.storage && !c.pockets.some((x) => x.id === c.storage)) c.storage = null; done(); }
    if (!add) return;
    const kind = add.dataset.add, input = root.querySelector(`[data-in="${kind}"]`);
    const id = input?.value;
    if (!id) { input?.classList.add('err'); return; }
    if (kind === 'skills') {
      if (c.skills.length >= skillLimit(c, ctx.data)) { input.classList.add('err'); return; }
      c.skills.push({ id, level: 5 });
    }
    else if (kind === 'pockets' || kind === 'repository') { const e2 = c[kind].find((x) => x.id === id); if (e2) e2.qty++; else c[kind].push({ id, qty: 1 }); }
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
  if (!root._comboKeys) {
    root._comboKeys = (e) => {
      const combo = e.target.closest?.('[data-combo]');
      if (!combo) return;
      const btn = combo.querySelector('[data-combo-btn]'), pop = combo.querySelector('[data-combo-pop]');
      if (e.key === 'Escape') {
        pop.hidden = true;
        btn?.setAttribute('aria-expanded', 'false');
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
    };
    root.addEventListener('keydown', root._comboKeys);
  }
  if (typeof document !== 'undefined' && !document._infusionComboClose) {
    document._infusionComboClose = (e) => {
      if (e.target.closest?.('[data-combo]')) return;
      document.querySelectorAll('[data-combo-pop]:not([hidden])').forEach((pop) => {
        pop.hidden = true;
        pop.closest('[data-combo]')?.querySelector('[data-combo-btn]')?.setAttribute('aria-expanded', 'false');
      });
    };
    document.addEventListener('click', document._infusionComboClose);
  }
}
