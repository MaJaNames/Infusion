import { esc, num, label, opts, set, fieldValue, RARITIES } from '../core/util.js';
import { derive, sellPrice, skillLimit } from '../character/derive.js';
import { itemRow, cardRow } from './databases.js';

const LIST = { skills: 'skills', pockets: 'items', repository: 'cards', equipment: 'own', implants: 'own' };
const OPEN = new Set(); // раскрытые описания навыков, чтобы состояние переживало перерисовку
const ov = (title, path, v) => `<label class="ov${v.overridden ? ' on' : ''}"><span>${title}</span><b class="${v.value < 0 ? 'bad' : ''}">${num(v.value)}</b>
  <input type="number" data-p="${path}" value="${v.overridden ? v.value : ''}" placeholder="авто ${num(v.auto)}"></label>`;
const datalist = (id, rows) => `<datalist id="dl-${id}">${rows.map(([text, rid]) => `<option value="${esc(text)}" data-id="${rid}">`).join('')}</datalist>`;
const adder = (kind, hint, disabled = false) => `<div class="add"><input list="dl-${LIST[kind]}" data-in="${kind}" placeholder="${hint}"${disabled ? ' disabled' : ''}><button data-add="${kind}"${disabled ? ' disabled' : ''}>Добавить</button></div>`;
const del = (kind, i) => `<button class="x" data-del="${kind}.${i}" title="Убрать">✕</button>`;
const missing = (kind, i, id) => `<div class="line miss">Записи ${esc(id)} больше нет в базе ${del(kind, i)}</div>`;
const slots = (rows) => `<div class="chips">${rows.map((s) => `<span class="lim ${s.status === 'ОК' ? 'o' : s.status === 'Занято' ? 'b' : s.status === 'Свободно' ? 'f' : 'x2'}">${esc(s.tag)} ${s.used}/${s.limit} · ${s.status}</span>`).join('')}</div>`;
const optionLabel = (it) => `${label(it)} · ${it.rarity} · ${it.id}`;

// Состояние подвкладок и сортировки переживает перерисовку, как и OPEN у навыков.
const UI = {
  tab: 'pockets',
  sort: {
    pockets: ['name', 1], equipment: ['name', 1], implants: ['name', 1],
    repository: ['name', 1], beasts: ['group', 1],
  },
};

const RARITY_RANK = new Map(RARITIES.map((r, i) => [r, i]));
const cmpText = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'ru');
const cmpNum = (a, b) => (Number(a) || 0) - (Number(b) || 0);
const cmpRarity = (a, b) => (RARITY_RANK.get(a) ?? 99) - (RARITY_RANK.get(b) ?? 99);
const sdef = (name, get, cmp = cmpText) => ({ name, get, cmp });

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
  const key = defs[st[0]] ? st[0] : (defs.name ? 'name' : Object.keys(defs)[0]);
  const d = defs[key];
  const sign = st[1] === -1 ? -1 : 1;
  return rows.sort((a, b) => (a.miss ? 1 : 0) - (b.miss ? 1 : 0) || sign * d.cmp(d.get(a), d.get(b)));
}

function sortBar(kind, defs) {
  const st = UI.sort[kind] || [];
  const key = defs[st[0]] ? st[0] : (defs.name ? 'name' : Object.keys(defs)[0]);
  const dir = st[1] === -1 ? -1 : 1;
  return `<div class="sortbar"><label>Сортировка<select data-sort="${kind}">${Object.entries(defs).map(([k, v]) => `<option value="${k}"${k === key ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</select></label>
    <button type="button" class="sortdir" data-dir="${kind}" title="Направление: ${dir > 0 ? 'по возрастанию' : 'по убыванию'}" aria-label="Направление сортировки: ${dir > 0 ? 'по возрастанию' : 'по убыванию'}">${dir > 0 ? '↑' : '↓'}</button></div>`;
}

function inventorySummary(c, d) {
  const s = { count: 0, cost: 0, sell: 0, tali: 0, kronos: 0, cards: 0 };
  for (const e of c.pockets) {
    const it = d.itemMap.get(e.id);
    if (!it) continue;
    const qty = Number(e.qty) || 0;
    s.count += qty;
    s.cost += it.cost * qty;
    s.sell += sellPrice(it, c).value * qty;
  }
  for (const id of [...c.equipment, ...c.implants]) {
    const it = d.itemMap.get(id);
    if (!it) continue;
    s.count += 1;
    s.cost += it.cost;
    s.sell += sellPrice(it, c).value;
  }
  for (const e of c.repository) {
    const cd = d.cardMap.get(e.id);
    if (!cd) continue;
    const qty = Number(e.qty) || 0;
    s.cards += qty;
    s.tali += (cd.price_tali || 0) * qty;
    s.kronos += (cd.kronos || 0) * qty;
  }
  return s;
}

function inventoryTabs(c, race) {
  const qty = (rows) => rows.reduce((a, e) => a + (Number(e.qty) || 0), 0);
  return [
    { id: 'pockets', label: 'Карманы', ok: true, count: qty(c.pockets) },
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
    const pocketRow = ({ e, i, it }) => {
      if (!it) return missing('pockets', i, e.id);
      const sp = sellPrice(it, c);
      return itemRow(it, `<div class="ctl"><label>Кол-во <input type="number" min="1" data-p="pockets.${i}.qty" value="${e.qty}"></label>
        <label>Цена продажи <input type="number" data-p="overrides.sellPrice.${it.id}" value="${sp.overridden ? sp.value : ''}" placeholder="авто ${num(sp.auto)}"></label>${del('pockets', i)}</div>`);
    };
    body = `<div class="inv-tools">${adder('pockets', 'Найти предмет…')}${sortBar('pockets', defs)}</div>
      <div class="list">${rows.map(pocketRow).join('') || '<div class="empty">Карманы пусты. Добавьте первый предмет.</div>'}</div>`;
  } else if (active === 'equipment' || active === 'implants') {
    const defs = itemSortDefs(false, c);
    const ids = active === 'equipment' ? c.equipment : c.implants;
    const rows = sortRows(active, ids.map((id, i) => { const it = d.itemMap.get(id); return { id, i, it, miss: !it }; }), defs);
    const idRow = ({ id, i, it }) => it ? itemRow(it, `<div class="ctl">${del(active, i)}</div>`) : missing(active, i, id);
    body = `<div class="inv-tools">${adder(active, 'Выбрать из карманов…')}${sortBar(active, defs)}</div>
      ${slots(active === 'equipment' ? r.gearSlots : r.implantSlots)}
      <div class="list">${rows.map(idRow).join('') || `<div class="empty">${active === 'equipment' ? 'Экипировка пуста.' : 'Импланты не выбраны.'}</div>`}</div>`;
  } else if (active === 'repository') {
    const defs = cardSortDefs();
    const rows = sortRows('repository', c.repository.map((e, i) => { const cd = d.cardMap.get(e.id); return { e, i, cd, miss: !cd }; }), defs);
    const cardEntry = ({ e, i, cd }) => cd
      ? cardRow(cd, `<div class="ctl"><label>Кол-во <input type="number" min="1" data-p="repository.${i}.qty" value="${e.qty}"></label>${del('repository', i)}</div>`)
      : missing('repository', i, e.id);
    body = `<div class="inv-tools">${adder('repository', 'Найти карту…')}${sortBar('repository', defs)}</div>
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
        <span class="chip" title="Суммарное количество предметов и карт">Позиций: ${num(sum.count)}</span>
        <span class="chip total" title="Суммарная стоимость предметов по номиналу">Сумма: ${num(sum.cost)}</span>
        <span class="chip" title="Сколько получится при продаже всего по правилам (5% или ручная цена)">Продажа: ${num(sum.sell)}</span>
        ${sum.cards ? `<span class="chip" title="Стоимость карт в тали и Кроносе">Карты: ${num(sum.tali)} тали · ${num(sum.kronos)} Кронос</span>` : ''}
      </div>
    </div>
    <div class="subtabs" role="tablist">${available.map((t) => `<button type="button" role="tab" data-itab="${t.id}" class="${active === t.id ? 'on' : ''}" aria-selected="${active === t.id}">${esc(t.label)}${t.count ? ` <span class="tabcount">${t.count}</span>` : ''}${t.wip ? ' <span class="wip">WIP</span>' : ''}</button>`).join('')}</div>
    ${hidden.length ? `<p class="meta inv-note">Скрыты разделы: ${hidden.map((t) => `<span title="${esc(t.hint)}">${esc(t.label)}</span>`).join(', ')}. Доступность зависит от расы и класса.</p>` : ''}
    ${body}
  </section>`;
}

export function render(ctx) {
  const c = ctx.char, d = ctx.data, r = derive(c, d);
  const race = d.raceMap.get(c.race), trait = d.traitMap.get(c.trait);
  const own = c.pockets.map((e) => d.itemMap.get(e.id)).filter(Boolean).sort((a, b) => label(a).localeCompare(label(b), 'ru'));
  const stat = (s) => {
    const issue = r.statIssues[s.key];
    return `<label class="${issue ? 'stat-bad' : ''}"${issue ? ` title="Не хватает для навыков: ${esc(issue.skills.join(', '))}"` : ''}>${esc(s.name)}${issue ? ` <span class="bad">нужно ${issue.need}</span>` : ''}<input type="number" min="0" max="${s.max}" data-p="stats.${s.key}" value="${c.stats[s.key]}"${issue ? ' class="err"' : ''}></label>`;
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
        <label>Класс<select data-p="class">${opts(d.classes, c.class, (x) => x.name, (x) => x.name)}</select></label>
        <label>Черта<select data-p="trait"><option value="">—</option>${opts(d.traits, c.trait)}</select></label>
        <label>Сущность<select data-p="essence"><option value="">—</option>${opts(d.essences, c.essence)}</select></label></div>
        ${race && !race.has_kronos ? `<p class="meta">${esc(race.name)}: Кроноса нет (справочно, расчёт не блокируется).</p>` : ''}
        ${trait ? `<p class="desc meta">${esc(trait.description)}</p>` : ''}</section>
      <section class="panel"><div class="grid">${ov('Свободные очки', 'overrides.freePoints', r.freePoints)}${ov('Макс. ОЗ', 'overrides.hpMax', r.hpMax)}${ov('Макс. Кронос', 'overrides.kronosMax', r.kronosMax)}</div></section>
      <section class="panel"><h2>Характеристики</h2><div class="grid">${d.stats.map(stat).join('')}</div></section>
      <section class="panel"><h2>Навыки</h2>
        <div class="chips"><span class="chip ${r.skillsOverLimit ? 'bad' : ''}">Навыки: ${r.skillCount} / ${r.skillLimit}</span><span class="chip">Щепки: ${num(r.shardsTotal)}</span><span class="chip">Лимит: 4 × ранг ${r.rankLevel}</span></div>
        ${issues.length ? `<p class="bad">Не хватает характеристик: ${issues.map(([k, v]) => `${esc(d.statMap.get(k)?.name || k)} (нужно ${v.need}, есть ${v.have})`).join('; ')}</p>` : ''}
        ${adder('skills', full ? `Лимит навыков: ${r.skillLimit}` : 'Найти навык…', full)}
        ${full ? `<p class="meta bad">Лимит навыков: ${r.skillLimit} (4 × ранг ${r.rankLevel}).</p>` : ''}
        ${r.skills.map((s) => skillRow(s, d)).join('') || '<p class="meta">Навыки не выбраны.</p>'}</section>
      <section class="panel"><h2>Способности и мутации</h2>${ab.map((id, i) => `<div class="line"><select class="grow" data-p="abilities.${i}"><option value="">Слот ${i + 1}: пусто</option>${opts(d.abilities, id, (a) => `${a.kind === 'mutation' ? 'Мутация' : 'Способность'}: ${a.name}${a.class_requirement ? ' (' + a.class_requirement + ')' : ''}`)}</select></div>
        ${id && d.abilityMap.get(id) ? `<p class="desc meta">${esc(d.abilityMap.get(id).description)}</p>` : ''}`).join('')}</section>
    </div>
    <div class="char-col">
      ${inventoryPanel(c, d, r, race)}
      <section class="panel"><h2>Заметки</h2><textarea data-p="notes" rows="4" style="width:100%">${esc(c.notes)}</textarea></section>
    </div>
  </div>
  ${datalist('items', d.items.map((it) => [optionLabel(it), it.id]))}${datalist('cards', d.cards.map((x) => [`${label(x)} · ${x.rarity} · ${x.id}`, x.id]))}
  ${datalist('skills', d.skills.map((s) => [`${s.name} · ${d.statMap.get(s.stat)?.name} ${s.tier}`, s.id]))}${datalist('own', own.map((it) => [optionLabel(it), it.id]))}`;
}

export function bind(root, ctx) {
  const c = ctx.char, done = () => { ctx.save(); ctx.rerender(); };
  root.onchange = (e) => {
    if (e.target.dataset.p) { set(c, e.target.dataset.p, fieldValue(e.target)); done(); return; }
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
    const itab = e.target.closest('[data-itab]');
    if (itab) { UI.tab = itab.dataset.itab; ctx.rerender(); return; }
    const dir = e.target.closest('[data-dir]');
    if (dir) {
      const kind = dir.dataset.dir, prev = UI.sort[kind] || ['name', 1];
      UI.sort[kind] = [prev[0], prev[1] === -1 ? 1 : -1];
      ctx.rerender(); return;
    }
    const add = e.target.closest('[data-add]'), rm = e.target.closest('[data-del]');
    if (rm) { const [kind, i] = rm.dataset.del.split('.'); c[kind].splice(Number(i), 1); done(); }
    if (!add) return;
    const kind = add.dataset.add, input = root.querySelector(`[data-in="${kind}"]`);
    const o = root.querySelector(`#dl-${LIST[kind]} option[value="${CSS.escape(input.value)}"]`);
    if (!o) { input.classList.add('err'); return; }
    const id = o.dataset.id;
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
}
