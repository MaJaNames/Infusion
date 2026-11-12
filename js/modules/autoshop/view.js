import { esc, num, label, opts, set, fieldValue, optLabel, money, RC } from '../../core/util.js';
import { partsOf, KIND_LABEL, statChips, droneChips } from './parts.js';
import { summarize } from './aggregate.js';
import { G, MAX_NAME, blankBuild as blank, newId, currentVehicle as current, partCount, saveGarage, exportGarage, importGarage } from './store.js';
import { comboList, closeCombos, openCombo, comboKeydown, installComboClose } from '../../core/combo.js';

let OPEN_SOURCE = null; // раскрытый параметр в «Итогах»
const OPEN_PART = new Set(); // раскрытые карточки деталей (ключ: транспорт + предмет)

// Тип детали по пути в сборке: weapons.0 → weapon, modules.2 → module.
const kindOfPath = (path) => (path.startsWith('weapons') ? 'weapon' : path.startsWith('modules') ? 'module' : path);
// «Торус» ставится только с направляющими «Элиада»; остальные колёса при нём недоступны.
const wheelReqOf = (parts, build) => parts.find((p) => p.item.id === build.engine)?.stats.wheelReq || '';
const wheelFits = (parts, build, part) => {
  const req = wheelReqOf(parts, build);
  return !req || (!!part && String(part.item.name).toLowerCase().includes(req.toLowerCase()));
};
const itemsForPath = (path, data, build) => {
  const parts = partsOf(data), kind = kindOfPath(path);
  const items = parts.filter((p) => p.stats.kind === kind);
  return kind === 'wheels' ? items.filter((p) => wheelFits(parts, build, p)) : items;
};
// Детали в меню идут в порядке базы (по ID), без группировки по редкости.
const rowsForPath = (path, data, build) => itemsForPath(path, data, build).map((p) => ({
  id: p.item.id, text: optLabel(p.item),
}));
const fixWheels = (build, data) => {
  const parts = partsOf(data);
  if (!wheelFits(parts, build, parts.find((p) => p.item.id === build.wheels))) build.wheels = null;
  return build;
};


const TOTALS = [['maxHp', 'Макс. ОЗ'], ['defP', 'ДЕФ.П'], ['evasion', 'Уклонение'], ['speed', 'Скороход'], ['flight', 'Полёт'], ['screen', 'Экранирование'],
  ['weaponSlots', 'Слоты оружий'], ['heavySlots', 'Макс. сверхтяж'], ['seats', 'Кол-во мест']];

export function render(ctx) {
  if (!G.vehicles || G.vehicles.length === 0) {
    return `<section class="panel garage">
      <div class="garage-head">
        <div>
          <h2>Транспорт кочевника</h2>
          <p class="meta">Несколько транспортных средств хранятся в браузере. Переключайтесь между ними вкладками или списком.</p>
        </div>
        <div class="garage-actions">
          <button type="button" data-import-garage title="Загрузить транспорт из JSON">Загрузить</button>
          <input type="file" accept="application/json,.json" data-garage-file hidden>
          <button type="button" data-export-garage title="Скачать весь транспорт в JSON" disabled>Выгрузить</button>
          <button type="button" data-add-vehicle>+ Транспорт</button>
        </div>
      </div>
      <div class="part-empty">Транспорта пока нет. Добавьте первый.</div>
    </section>`;
  }

  const parts = partsOf(ctx.data);
  const v = current();
  if (!v) {
    G.active = G.vehicles[0]?.id || null;
    return render(ctx);
  }
  const B = v.build;
  // Старые сборки с «Торусом» и чужими колёсами приводим в порядок сразу при отрисовке.
  fixWheels(B, ctx.data);
  const find = (id) => parts.find((p) => p.item.id === id);
  const pick = (id) => {
    const p = id && find(id);
    return p ? { cost: p.item.cost, stats: p.stats, name: label(p.item), drone: p.drone } : null;
  };
  const picker = (path, cur, slot) => {
    const items = itemsForPath(path, ctx.data, B);
    const shown = items.some((p) => p.item.id === cur) ? cur : null;
    const chosen = shown ? find(shown) : null;
    return `<div class="garage-pick">
      <span class="garage-pick-name">${esc(slot)}</span>
      <div class="add garage-add" data-addbox="${esc(path)}" data-hint="${esc(slot)}">
        <input type="search" data-search="${esc(path)}" placeholder="Фильтр…" autocomplete="off" aria-label="Поиск: ${esc(slot)}">
        <select data-b="${esc(path)}" aria-label="${esc(slot)}"><option value="">—</option>${opts(items, shown, (p) => optLabel(p.item), (p) => p.item.id)}</select>
        <div class="combo" data-combo="${esc(path)}">
          <button type="button" class="combo-btn" data-combo-btn="${esc(path)}" aria-haspopup="listbox" aria-expanded="false"><span data-combo-label="${esc(path)}">${esc(chosen ? optLabel(chosen.item) : slot)}</span><span class="combo-caret" aria-hidden="true">▾</span></button>
          <div class="combo-pop" data-combo-pop="${esc(path)}" hidden>
            <input type="search" class="combo-search" data-combo-search="${esc(path)}" placeholder="Поиск…" autocomplete="off" aria-label="Поиск: ${esc(slot)}">
            <div class="combo-list" role="listbox" aria-label="${esc(slot)}" data-combo-list="${esc(path)}"></div>
          </div>
        </div>
      </div>
    </div>`;
  };
  const sumOf = (b) => summarize({ body: pick(b.body), wheels: pick(b.wheels), engine: pick(b.engine), weapons: b.weapons.map(pick), modules: b.modules.map(pick), discount: b.discount });
  const sum = sumOf(B);
  // Собственное ОЗ детали: у дрона оно из описания, у остальных — из характеристик.
  const partMaxHp = (p) => Math.max(0, p.drone ? p.drone.hp : (p.stats.hp + p.stats.extraHp));
  // Подсказка при наведении на название машины: те же параметры, что и в чипах сверху.
  const statsTip = (b) => {
    const s = sumOf(b);
    const hp = b.currentHp != null ? `${num(b.currentHp)} / ${num(s.maxHp)}` : num(s.maxHp);
    return [
      `Деталей: ${partCount(b)}`,
      `ОЗ: ${hp}`,
      `Деф.п: ${num(s.defP)}`,
      `УКЛ: ${num(s.evasion)}`,
      `Скороход: ${num(s.speed)}`,
      `Полёт: ${num(s.flight)}`,
      `Экранирование: ${num(s.screen)}`,
      `Стоимость: ${num(s.cost)}`,
    ].join('\n');
  };

  const wheelsOk = wheelFits(parts, B, B.wheels ? find(B.wheels) : null);
  const slots = [
    ['Кузов', B.body], ['Колёса', wheelsOk ? B.wheels : null], ['Двигатель', B.engine],
    ...B.weapons.map((id, i) => [`Оружие ${i + 1}`, id]),
    ...B.modules.map((id, i) => [`Модуль ${i + 1}`, id]),
  ];
  const picked = slots.map(([slot, id]) => { const p = id && find(id); return p ? { ...p, slot } : null; }).filter(Boolean);

  const tabs = G.vehicles.map((x) => `<button type="button" role="tab" data-vehicle="${esc(x.id)}" class="${x.id === G.active ? 'on' : ''}" aria-selected="${x.id === G.active}" title="${esc(statsTip(x.build))}"><span class="garage-tab-name">${esc(x.name)}</span><span class="garage-count" title="Выбрано деталей">${partCount(x.build)}</span></button>`).join('');
  const vehicleOptions = G.vehicles.map((x) => `<option value="${esc(x.id)}"${x.id === G.active ? ' selected' : ''}>${esc(x.name)} · ${partCount(x.build)}</option>`).join('');
  const srcLabel = [...TOTALS, ['cost', 'Стоимость']].find(([k]) => k === OPEN_SOURCE)?.[1] || '';
  const srcRows = OPEN_SOURCE ? sum.sources[OPEN_SOURCE] || [] : [];

  return `<section class="panel garage">
    <div class="garage-head">
      <div>
        <h2>Транспорт кочевника</h2>
        <p class="meta">Несколько транспортных средств хранятся в браузере. Переключайтесь между ними вкладками или списком.</p>
      </div>
      <div class="garage-actions">
        <button type="button" data-import-garage title="Загрузить транспорт из JSON">Загрузить</button>
        <input type="file" accept="application/json,.json" data-garage-file hidden>
        <button type="button" data-export-garage title="Скачать весь транспорт в JSON">Выгрузить</button>
        <button type="button" data-add-vehicle>+ Транспорт</button>
      </div>
    </div>
    <div class="subtabs garage-tabs" role="tablist" aria-label="Транспорт">${tabs}</div>
    <select class="subtabs-select" data-vehicle-select aria-label="Выбор транспорта">${vehicleOptions}</select>
    <div class="garage-topline">
      <div class="chips garage-summary">
        <span class="chip">Деталей: ${picked.length}</span>
        <span class="chip">ОЗ: ${B.currentHp != null ? `${num(B.currentHp)} / ${num(sum.maxHp)}` : num(sum.maxHp)}</span>
        <span class="chip">Деф.п: ${num(sum.defP)}</span>
        <span class="chip">УКЛ: ${num(sum.evasion)}</span>
        <span class="chip">Скороход: ${num(sum.speed)}</span>
        <span class="chip">Полёт: ${num(sum.flight)}</span>
        <span class="chip">Экранирование: ${num(sum.screen)}</span>
        <span class="chip">Стоимость: ${money(sum.cost)}</span>
        ${B.discount ? `<span class="chip">Скидка ${num(B.discount)}%</span>` : ''}
      </div>
      <label class="hp-field garage-hp" title="Текущее ОЗ можно задать вручную; максимум считается из деталей">Текущее ОЗ
        <span class="hp-input"><input type="number" min="0" data-b="currentHp" value="${B.currentHp ?? ''}" placeholder="${num(sum.maxHp)}"><span class="meta">/ ${num(sum.maxHp)}</span></span>
      </label>
    </div>
    <div class="garage-edit">
      <label class="garage-name" title="${esc(statsTip(B))}">Название транспорта<input type="text" data-vehicle-name value="${esc(v.name)}" maxlength="${MAX_NAME}" placeholder="Транспорт"></label>
      <button type="button" class="danger" data-del-vehicle>Удалить транспорт</button>
    </div>
    <label class="garage-notes">Заметки
      <textarea rows="3" data-vehicle-notes placeholder="Эффекты, повреждения, любой другой текст...">${esc(v.notes || '')}</textarea>
    </label>
  </section>
  <section class="panel">
    <h2>Детали</h2>
    <div class="shop-group">
      <h3>Корпус и ходовая</h3>
      <div class="garage-picks">${picker('body', B.body, KIND_LABEL.body)}${picker('wheels', wheelsOk ? B.wheels : null, KIND_LABEL.wheels)}${picker('engine', B.engine, KIND_LABEL.engine)}</div>
    </div>
    <div class="shop-group">
      <h3>Оружие</h3>
      <div class="garage-picks">${B.weapons.map((w, i) => picker(`weapons.${i}`, w, `Оружие ${i + 1}`)).join('')}</div>
    </div>
    <div class="shop-group">
      <h3>Модули</h3>
      <div class="garage-picks">${B.modules.map((m, i) => picker(`modules.${i}`, m, `Модуль ${i + 1}`)).join('')}</div>
    </div>
    <div class="shop-group">
      <h3>Скидка</h3>
      <div class="grid"><label>Скидка, %<input type="number" min="0" max="100" data-b="discount" value="${B.discount}"></label></div>
    </div>
  </section>
  <section class="panel">
    <h2>Итоги</h2>
    <div class="stat-grid">${TOTALS.map(([k, t]) => `<button type="button" class="stat-card${OPEN_SOURCE === k ? ' on' : ''}" data-source="${k}" aria-expanded="${OPEN_SOURCE === k}"><span>${t}</span><b>${num(sum[k])}</b></button>`).join('')}
      <button type="button" class="stat-card cost${OPEN_SOURCE === 'cost' ? ' on' : ''}" data-source="cost" aria-expanded="${OPEN_SOURCE === 'cost'}"><span>Стоимость</span><b>${money(sum.cost)}</b></button></div>
    ${OPEN_SOURCE ? `<div class="sources">
      <div class="sources-head"><h3>Источники: ${esc(srcLabel)}</h3><button type="button" class="x" data-source-close title="Закрыть">✕</button></div>
      ${srcRows.length ? `<ul>${srcRows.map((x) => `<li><span>${esc(x.name)}</span><b>${OPEN_SOURCE === 'cost' ? money(x.value) : num(x.value)}</b></li>`).join('')}</ul>` : '<p class="meta">Нет источников: параметр равен нулю.</p>'}
      <p class="sources-total">Итого: <b>${OPEN_SOURCE === 'cost' ? money(sum.cost) : num(sum[OPEN_SOURCE])}</b></p>
    </div>` : ''}
    ${sum.warnings.map((w) => `<p class="bad">${esc(w)}</p>`).join('')}
    ${sum.speedFloor ? `<p class="meta">Минимум Скорохода: ${num(sum.speedFloor)} (уникальный эффект двигателя).</p>` : ''}
  </section>
  <section class="panel">
    <div class="inv-head">
      <div><h2>Состав</h2><p class="meta">${esc(v.name)}</p></div>
      <button type="button" class="danger" data-b-clear>Очистить сборку</button>
    </div>
    ${picked.length ? `<div class="part-list">${picked.map((p) => {
      const maxHp = partMaxHp(p);
      const now = B.partHp?.[p.item.id] ?? null;
      const key = `${v.id}:${p.item.id}`;
      const hpChip = now != null && maxHp ? `<span class="chip">Текущее ОЗ: ${num(now)} / ${num(maxHp)}</span>` : '';
      return `<details class="part-card ${RC[p.item.rarity] || 'c'}" data-part-row="${esc(key)}"${OPEN_PART.has(key) ? ' open' : ''}>
      <summary>
        <div class="part-main">
          <div class="part-slot">${esc(p.slot)}</div>
          <b>${esc(label(p.item))}</b>
          ${p.drone
            ? `<div class="chips">${droneChips(p.drone, now)}<span class="chip drone">Дрон</span></div><span class="meta">Характеристики дрона считаются отдельно и не входят в итоги.</span>`
            : `<div class="chips">${statChips(p.stats)}</div>`}
          ${p.drone ? '' : hpChip}
          ${p.stats.unique ? `<span class="meta">${esc(p.stats.unique)}</span>` : ''}
        </div>
        <span class="price">${money(p.item.cost)}</span>
      </summary>
      <div class="part-hp">
        ${maxHp
          ? `<label>Текущее ОЗ <input type="number" min="0" max="${maxHp}" data-part-hp="${esc(p.item.id)}" value="${now ?? ''}" placeholder="${num(maxHp)}"><span class="meta">/ ${num(maxHp)}</span></label>`
          : '<span class="meta">У этой детали нет собственного ОЗ.</span>'}
      </div>
    </details>`;
    }).join('')}</div>` : '<div class="part-empty">Пока ничего не выбрано. Добавьте детали в сборку выше.</div>'}
  </section>`;
}

const vehicleById = (id) => G.vehicles.find((v) => v.id === id);
const nextName = () => {
  const used = new Set(G.vehicles.map((v) => v.name));
  let n = G.vehicles.length + 1;
  while (used.has(`Транспорт ${n}`)) n++;
  return `Транспорт ${n}`;
};
const commit = (ctx) => { saveGarage(G); ctx.rerender(); };

async function loadGarageFile(file, ctx) {
  if (!file) return;
  try {
    const n = importGarage(await file.text());
    // Импортированные машины тоже подчиняются правилу «Торус → Элиада».
    for (const v of G.vehicles) fixWheels(v.build, ctx.data);
    saveGarage(G);
    ctx.rerender();
    if (typeof alert === 'function') alert(`Загружено транспортных средств: ${n}`);
  } catch (err) {
    if (typeof alert === 'function') alert(`Не удалось загрузить файл: ${err.message}`);
  }
}

export function bind(root, ctx) {
  // Поиск внутри меню и фильтр нативного списка (мобильная версия).
  root.oninput = (e) => {
    const comboPath = e.target.dataset.comboSearch;
    if (comboPath) {
      const box = e.target.closest('[data-combo]');
      if (!box) return;
      const curr = current();
      if (!curr) return;
      const q = e.target.value.trim().toLowerCase();
      const rows = rowsForPath(comboPath, ctx.data, curr.build).filter((r) => !q || r.text.toLowerCase().includes(q));
      box.querySelector('[data-combo-list]').innerHTML = comboList(rows);
      return;
    }
    const path = e.target.dataset.search;
    if (!path) return;
    const box = e.target.closest('[data-addbox]');
    const select = box?.querySelector(`select[data-b="${path}"]`);
    if (!select) return;
    const curr = current();
    if (!curr) return;
    const q = e.target.value.trim().toLowerCase();
    const items = itemsForPath(path, ctx.data, curr.build).filter((p) => !q || optLabel(p.item).toLowerCase().includes(q));
    const hint = box.dataset.hint || '—';
    select.innerHTML = `<option value="">${esc(hint)}</option>${items.length ? opts(items, select.value, (p) => optLabel(p.item), (p) => p.item.id) : '<option value="" disabled>Ничего не найдено</option>'}`;
  };
  root.onchange = (e) => {
    const t = e.target;
    if (t.dataset.garageFile !== undefined) {
      loadGarageFile(t.files?.[0], ctx);
      t.value = '';
      return;
    }
    if (t.dataset.vehicleSelect !== undefined) {
      if (vehicleById(t.value)) { G.active = t.value; commit(ctx); }
      return;
    }
    if (t.dataset.vehicleName !== undefined) {
      const v = current();
      if (!v) return;
      v.name = String(t.value || '').trim().slice(0, MAX_NAME) || v.name;
      commit(ctx);
      return;
    }
    if (t.dataset.vehicleNotes !== undefined) {
      const v = current();
      if (!v) return;
      v.notes = String(t.value || '');
      commit(ctx);
      return;
    }
    if (t.dataset.partHp !== undefined) {
      const v = current();
      if (!v) return;
      const B = v.build;
      if (!B.partHp || typeof B.partHp !== 'object') B.partHp = {};
      const id = t.dataset.partHp;
      if (t.value === '') delete B.partHp[id];
      else B.partHp[id] = Math.max(0, Math.round(Number(t.value) || 0));
      commit(ctx);
      return;
    }
    if (!t.dataset.b) return;
    const v = current();
    if (!v) return;
    const B = v.build;
    const n = t.type === 'number' ? (t.value === '' ? null : Number(t.value)) : null;
    const raw = t.type === 'number' ? (Number.isFinite(n) ? n : null) : fieldValue(t);
    set(B, t.dataset.b, raw);
    if (t.dataset.b === 'discount') B.discount = Math.min(100, Math.max(0, Number(raw) || 0));
    if (t.dataset.b === 'currentHp') B.currentHp = raw == null ? null : Math.max(0, Math.round(Number(raw) || 0));
    // «Торус» и колёса: несовместимые колёса снимаются, другие варианты не предлагаются.
    if (t.dataset.b === 'engine' || t.dataset.b === 'wheels') fixWheels(B, ctx.data);
    commit(ctx);
  };
  root.onclick = (e) => {
    const comboBtn = e.target.closest('[data-combo-btn]');
    if (comboBtn) {
      const combo = comboBtn.closest('[data-combo]');
      const curr = current();
      if (!curr) return;
      if (combo?.querySelector('[data-combo-pop]')?.hidden) openCombo(comboBtn, rowsForPath(combo.dataset.combo, ctx.data, curr.build), root);
      else closeCombos(root);
      return;
    }
    const comboOpt = e.target.closest('[data-combo-opt]');
    if (comboOpt) {
      const combo = comboOpt.closest('[data-combo]');
      const path = combo?.dataset.combo;
      if (path) {
        const v = current();
        if (!v) return;
        const B = v.build;
        set(B, path, comboOpt.dataset.comboOpt || null);
        if (path === 'engine' || path === 'wheels') fixWheels(B, ctx.data);
        commit(ctx);
      }
      closeCombos(root);
      return;
    }
    if (!e.target.closest('[data-combo]')) closeCombos(root);
    if (e.target.closest('[data-source-close]')) { OPEN_SOURCE = null; ctx.rerender(); return; }
    const srcBtn = e.target.closest('[data-source]');
    if (srcBtn) {
      OPEN_SOURCE = OPEN_SOURCE === srcBtn.dataset.source ? null : srcBtn.dataset.source;
      ctx.rerender();
      return;
    }
    if (e.target.closest('[data-import-garage]')) {
      root.querySelector?.('[data-garage-file]')?.click();
      return;
    }
    if (e.target.closest('[data-export-garage]')) { exportGarage(); return; }
    const tab = e.target.closest('[data-vehicle]');
    if (tab) {
      const v = vehicleById(tab.dataset.vehicle);
      if (v && v.id !== G.active) { G.active = v.id; commit(ctx); }
      return;
    }
    if (e.target.closest('[data-add-vehicle]')) {
      const v = { id: newId(), name: nextName(), notes: '', build: blank() };
      G.vehicles.push(v);
      G.active = v.id;
      commit(ctx);
      return;
    }
    if (e.target.closest('[data-del-vehicle]')) {
      const v = current();
      if (!v) return;
      const ok = typeof confirm === 'function' ? confirm(`Удалить «${v.name}»?`) : true;
      if (!ok) return;
      const i = G.vehicles.indexOf(v);
      G.vehicles.splice(i, 1);
      
      G.active = G.vehicles.length > 0 
        ? (G.vehicles[i] || G.vehicles[i - 1] || G.vehicles[0]).id 
        : null;
        
      commit(ctx);
      return;
    }
  };
  if (!root._partToggle) {
    root._partToggle = (e) => {
      const det = e.target.closest?.('details.part-card[data-part-row]');
      if (!det) return;
      if (det.open) OPEN_PART.add(det.dataset.partRow); else OPEN_PART.delete(det.dataset.partRow);
    };
    root.addEventListener('toggle', root._partToggle, true);
  }
  if (!root._comboKeys) {
    root._comboKeys = comboKeydown;
    root.addEventListener('keydown', root._comboKeys);
  }
  installComboClose();
}