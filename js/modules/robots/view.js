import { esc, num, label, optLabel, money, set, RC } from '../../core/util.js';
import { comboList, closeCombos, openCombo, comboKeydown, installComboClose } from '../../core/combo.js';
import { R, MAX_ROBOT_NAME, addRobot, removeRobot, saveRobots, currentRobot, exportRobots, importRobots } from './store.js';
import { isRobotBase, isRobotWeapon, isRobotModule, isBmet, robotKind, robotKindLabel, robotBase, robotStats, availableCount, robotRequirement, robotMissing, moduleChecked, moduleIsActive, weaponIndex, hasImplant } from './parts.js';
import { bmetLimit, ROBOT_IMPLANTS } from '../../character/rules.js';
import { statChips } from '../autoshop/parts.js';
import { parsePart } from '../autoshop/parser.js';

const OPEN_PART = new Set(); // раскрытые карточки установленных деталей робота
let OPEN_SOURCE = null; // раскрытый параметр в «Итогах»

// Параметры робота, которые раскрываются по клику в «Итогах» (стоимость — отдельно, своей карточкой).
const ROBOT_TOTALS = [['hp', 'ОЗ'], ['defP', 'ДЕФ.П'], ['defA', 'ДЕФ.А'], ['evasion', 'УКЛ'], ['atk', 'АТК'], ['speed', 'Скороход'], ['flight', 'Полёт']];

const robotById = (id) => R.robots.find((r) => r.id === id);

// Предметы берутся только из инвентаря персонажа и остаются там же.
function stockOf(ctx) {
  const found = new Map();
  for (const e of ctx.char?.pockets || []) {
    const it = ctx.data.itemMap.get(e.id);
    if (it) found.set(it.id, it);
  }
  return [...found.values()];
}

function itemsFor(path, robot, ctx) {
  const { data } = ctx;
  const current = path === 'base' ? robot.base : robot[path.split('.')[0]]?.[Number(path.split('.')[1])];
  let items;
  if (path === 'base') {
    const taken = new Set(R.robots.filter((r) => r.id !== robot.id && isBmet(robotBase(r, data))).map((r) => r.base));
    items = data.items.filter((it) => isRobotBase(it) && (isBmet(it) ? !taken.has(it.id) : true));
  } else if (path.startsWith('weapons')) {
    items = data.items.filter(isRobotWeapon);
  } else {
    items = data.items.filter(isRobotModule);
  }
  // Уже выбранный предмет показываем даже если его больше нет в базе.
  if (current && !items.some((it) => it.id === current)) {
    const it = data.itemMap.get(current);
    if (it) items = [it, ...items];
  }
  return items;
}

const inStock = (ctx, id) => (ctx.char?.pockets || []).some((e) => e.id === id && (Number(e.qty) || 0) > 0);

const rowsFor = (path, robot, ctx) => itemsFor(path, robot, ctx).map((it) => {
  const free = availableCount(ctx.char, R.robots, it.id, { robotId: robot.id, path });
  const stock = inStock(ctx, it.id) ? `свободно ${num(free)}` : 'нет в инвентаре';
  return { id: it.id, text: `${optLabel(it)} · ${stock}` };
});

function picker(path, robot, ctx, slot, extra = '') {
  const value = path === 'base' ? robot.base : robot[path.split('.')[0]]?.[Number(path.split('.')[1])];
  const chosen = value ? ctx.data.itemMap.get(value) : null;
  const rows = rowsFor(path, robot, ctx);
  return `<div class="garage-pick">
    <span class="garage-pick-name">${esc(slot)}</span>
    <div class="add garage-add" data-rbox="${esc(path)}" data-hint="${esc(slot)}">
      <input type="search" data-rsearch="${esc(path)}" placeholder="Фильтр…" autocomplete="off" aria-label="Поиск: ${esc(slot)}">
      <select data-rb="${esc(path)}" aria-label="${esc(slot)}"><option value="">—</option>${rows.map((r) => `<option value="${esc(r.id)}"${r.id === value ? ' selected' : ''}>${esc(r.text)}</option>`).join('')}</select>
      <div class="combo" data-combo="${esc(path)}">
        <button type="button" class="combo-btn" data-combo-btn="${esc(path)}" aria-haspopup="listbox" aria-expanded="false"><span data-combo-label="${esc(path)}">${esc(chosen ? optLabel(chosen) : slot)}</span><span class="combo-caret" aria-hidden="true">▾</span></button>
        <div class="combo-pop" data-combo-pop="${esc(path)}" hidden>
          <input type="search" class="combo-search" data-combo-search="${esc(path)}" placeholder="Поиск…" autocomplete="off" aria-label="Поиск: ${esc(slot)}">
          <div class="combo-list" role="listbox" aria-label="${esc(slot)}" data-combo-list="${esc(path)}"></div>
        </div>
      </div>
    </div>
    ${extra}
  </div>`;
}

const chip = (t, v) => (v ? `<span class="chip">${t} ${num(v)}</span>` : '');
const reqText = (needs) => (needs.length ? `Нужен имплант: ${needs.join(', ')}` : '');

// Подсказка при наведении на робота: те же параметры, что и в чипах сверху (как у транспорта в Автомастерской).
const robotStatsTip = (r, ctx) => {
  const b = robotBase(r, ctx.data), k = robotKind(b);
  const st = robotStats(r, ctx.data).total;
  const hpTxt = r.currentHp != null ? `${num(r.currentHp)} / ${num(st.hp)}` : num(st.hp);
  return [
    k ? robotKindLabel[k] : 'Основа не выбрана',
    `ОЗ: ${hpTxt}`,
    `Деф.п: ${num(st.defP)}`,
    `Деф.а: ${num(st.defA)}`,
    `УКЛ: ${num(st.evasion)}`,
    `АТК: ${num(st.atk)}`,
    st.speed ? `Скороход: ${num(st.speed)}` : '',
    st.flight ? `Полёт: ${num(st.flight)}` : '',
    `Стоимость: ${num(st.cost)}`,
  ].filter(Boolean).join('\n');
};

export function render(ctx) {
  const c = ctx.char || {};
  const robot = currentRobot();
  if (!robot) {
    return `<section class="panel garage">
      <div class="garage-head"><div><h2>Мастерская техники</h2><p class="meta">Соберите робота из предметов инвентаря. Сборка не требует Робософта — он понадобится только для надевания.</p></div>
        <div class="garage-actions"><button type="button" data-add-robot>+ Робот</button></div></div>
      <div class="part-empty">Роботов пока нет. Добавьте первого.</div>
    </section>`;
  }
  const base = robotBase(robot, ctx.data), kind = robotKind(base);
  const stats = robotStats(robot, ctx.data);
  const total = stats.total;
  const showBmet = hasImplant(c, ctx.data, ROBOT_IMPLANTS.bmet);
  const bmets = R.robots.filter((r) => isBmet(robotBase(r, ctx.data))).length;
  const limit = bmetLimit(c.ro);
  const missing = robotMissing(robot, ctx.data, c);
  const missingNote = missing.length
    ? `<div class="miss-note"><b>Нет в инвентаре:</b> ${missing.map((x) => `${esc(x.item ? label(x.item) : x.id)}${x.need > 1 ? ` ×${x.need}` : ''}${x.have ? ` (есть ${x.have})` : ''}`).join(', ')}. Робота можно собрать, но надеть — только когда всё появится.</div>`
    : '';
  const tabs = R.robots.map((r) => `<button type="button" role="tab" data-robot="${esc(r.id)}" class="${r.id === R.active ? 'on' : ''}" aria-selected="${r.id === R.active}" title="${esc(robotStatsTip(r, ctx))}"><span class="garage-tab-name">${esc(r.name)}</span><span class="garage-count" title="Выбрано деталей">${r.base ? '1' : '0'}</span></button>`).join('');
  const options = R.robots.map((r) => `<option value="${esc(r.id)}"${r.id === R.active ? ' selected' : ''}>${esc(r.name)}</option>`).join('');
  const hp = robot.currentHp != null ? `${num(robot.currentHp)} / ${num(total.hp)}` : num(total.hp);
  const baseMissing = robot.base && !ctx.data.itemMap.get(robot.base);
  const useReq = robotRequirement(robot, ctx.data, c);
  const canWear = !!base && useReq.ok;
  const wi = weaponIndex(robot, ctx.data);
  const weaponOptions = robot.weapons.map((id, i) => {
    const it = id ? ctx.data.itemMap.get(id) : null;
    return it ? `<option value="${i}"${wi === i ? ' selected' : ''}>${esc(label(it))}</option>` : '';
  }).join('');
  const weaponSelect = kind && kind !== 'bmet'
    ? `<label class="garage-name" title="АТК робота считается по текущему оружию">Текущее оружие<select data-robot-weapon><option value="">— нет —</option>${weaponOptions}</select></label>`
    : '';

  const srcLabel = [...ROBOT_TOTALS, ['cost', 'Стоимость']].find(([k]) => k === OPEN_SOURCE)?.[1] || '';
  const srcRows = OPEN_SOURCE ? (stats.sources[OPEN_SOURCE] || []).map((x) => ({ name: label(x.item), value: x.value })) : [];

  const composition = [
    ['Основа', robot.base, null],
    ...(kind === 'bmet' ? [] : [
      ...robot.weapons.map((id, i) => [`Оружие ${i + 1}`, id, null]),
      ...robot.modules.map((id, i) => [`Модуль ${i + 1}`, id, i]),
    ]),
  ].map(([slot, id, modIndex]) => {
    const it = id ? ctx.data.itemMap.get(id) : null;
    if (!it) return '';
    const off = modIndex !== null && moduleIsActive(it) && !moduleChecked(robot, modIndex);
    const key = `${robot.id}:${slot}:${id}`;
    return `<details class="part-card ${RC[it.rarity] || 'c'}" data-part-row="${esc(key)}"${OPEN_PART.has(key) ? ' open' : ''}>
      <summary>
        <div class="part-main">
          <div class="part-slot">${esc(slot)}</div>
          <b>${esc(label(it))}</b>
          <div class="chips">${statChips(parsePart(it.description))}</div>
          ${off ? '<span class="meta">Активный модуль выключен — параметры не учитываются.</span>' : ''}
        </div>
        <span class="price">${money(it.cost)}</span>
      </summary>
      <div class="part-desc"><p class="desc">${esc(it.description || 'Описание не заполнено.')}</p></div>
    </details>`;
  }).join('');

  return `<section class="panel garage">
    <div class="garage-head">
      <div><h2>Мастерская техники</h2><p class="meta">Сборка не требует Робософта. Детали можно выбирать из всей базы: чего не хватает в инвентаре, покажет небольшая плашка. Предметы остаются в инвентаре; занятые экземпляры нельзя использовать дважды.</p></div>
      <div class="garage-actions">
        <button type="button" data-import-robots title="Загрузить роботов из JSON">Загрузить</button>
        <input type="file" accept="application/json,.json" data-robots-file hidden>
        <button type="button" data-export-robots title="Скачать всех роботов в JSON">Выгрузить</button>
        <button type="button" data-add-robot>+ Робот</button>
      </div>
    </div>
    <div class="subtabs garage-tabs" role="tablist" aria-label="Роботы">${tabs}</div>
    <select class="subtabs-select" data-robot-select aria-label="Выбор робота">${options}</select>
    <div class="garage-topline">
      <div class="chips garage-summary">
        ${kind ? `<span class="chip">${robotKindLabel[kind]}</span>` : '<span class="chip warn">Основа не выбрана</span>'}
        <span class="chip">ОЗ: ${hp}</span>${chip('ДЕФ.П', total.defP)}${chip('ДЕФ.А', total.defA)}${chip('УКЛ', total.evasion)}${chip('АТК', total.atk)}${total.speed ? chip('Скороход', total.speed) : ''}${total.flight ? chip('Полёт', total.flight) : ''}
        <span class="chip">Стоимость: ${money(total.cost)}</span>
        ${showBmet ? `<span class="chip${bmets > limit ? ' bad' : ''}">БМЕТ: ${num(bmets)} / ${num(limit)}</span>` : ''}
      </div>
      <label class="hp-field garage-hp" title="Текущее ОЗ можно задать вручную; максимум считается из деталей">Текущее ОЗ
        <span class="hp-input"><input type="number" min="0" data-robot-hp value="${robot.currentHp ?? ''}" placeholder="${num(total.hp)}"><span class="meta">/ ${num(total.hp)}</span></span>
      </label>
    </div>
    ${missingNote}
    <div class="garage-edit">
      <label class="garage-name" title="${esc(robotStatsTip(robot, ctx))}">Название робота<input type="text" data-robot-name value="${esc(robot.name)}" maxlength="${MAX_ROBOT_NAME}" placeholder="Робот"></label>
      ${weaponSelect}
      <button type="button" class="danger" data-del-robot${R.robots.length <= 1 ? ' disabled' : ''}>Удалить робота</button>
    </div>
    <label class="garage-notes">Заметки<textarea rows="3" data-robot-notes placeholder="Эффекты, повреждения, любой другой текст...">${esc(robot.notes || '')}</textarea></label>
    ${useReq.needs.length ? `<p class="meta">Для надевания: ${esc(reqText(useReq.needs))}${canWear ? '' : ' — пока недоступно'}.</p>` : useReq.reason ? `<p class="meta">${esc(useReq.reason)}.</p>` : ''}
    ${baseMissing ? `<p class="bad">Основы ${esc(robot.base)} больше нет в базе.</p>` : ''}
  </section>
  <section class="panel">
    <h2>Детали</h2>
    <div class="shop-group">
      <h3>Основа</h3>
      <div class="garage-picks">${picker('base', robot, ctx, 'Призма / Ядро / БМЕТ')}</div>
    </div>
    ${kind === 'bmet' ? '<p class="meta">У БМЕТ нет слотов оружия и модулей — только его собственные характеристики и уникальный эффект.</p>' : kind ? `
    <div class="shop-group"><h3>Оружие</h3><div class="garage-picks">${robot.weapons.map((_, i) => picker(`weapons.${i}`, robot, ctx, `Оружие ${i + 1}`)).join('')}</div></div>
    <div class="shop-group"><h3>Модули</h3><div class="garage-picks">${robot.modules.map((id, i) => {
      const it = id ? ctx.data.itemMap.get(id) : null;
      const extra = it && moduleIsActive(it)
        ? `<label class="module-active" title="Параметры активного модуля учитываются только при активации"><input type="checkbox" data-robot-module="${i}"${moduleChecked(robot, i) ? ' checked' : ''}> Активация</label>`
        : it ? '<span class="meta">Пассивный модуль</span>' : '';
      return picker(`modules.${i}`, robot, ctx, `Модуль ${i + 1}`, extra);
    }).join('')}</div></div>` : ''}
  </section>
  <section class="panel">
    <h2>Итоги</h2>
    <div class="stat-grid">${ROBOT_TOTALS.map(([k, t]) => `<button type="button" class="stat-card${OPEN_SOURCE === k ? ' on' : ''}" data-source="${k}" aria-expanded="${OPEN_SOURCE === k}"><span>${t}</span><b>${num(total[k])}</b></button>`).join('')}
      <button type="button" class="stat-card cost${OPEN_SOURCE === 'cost' ? ' on' : ''}" data-source="cost" aria-expanded="${OPEN_SOURCE === 'cost'}"><span>Стоимость</span><b>${money(total.cost)}</b></button></div>
    ${OPEN_SOURCE ? `<div class="sources">
      <div class="sources-head"><h3>Источники: ${esc(srcLabel)}</h3><button type="button" class="x" data-source-close title="Закрыть">✕</button></div>
      ${srcRows.length ? `<ul>${srcRows.map((x) => `<li><span>${esc(x.name)}</span><b>${OPEN_SOURCE === 'cost' ? money(x.value) : num(x.value)}</b></li>`).join('')}</ul>` : '<p class="meta">Нет источников: параметр равен нулю.</p>'}
      <p class="sources-total">Итого: <b>${OPEN_SOURCE === 'cost' ? money(total.cost) : num(total[OPEN_SOURCE])}</b></p>
    </div>` : ''}
    ${total.unique ? `<p class="meta">${esc(total.unique)}</p>` : ''}
  </section>
  <section class="panel">
    <div class="inv-head">
      <div><h2>Состав</h2><p class="meta">${esc(robot.name)}</p></div>
      <button type="button" class="danger" data-r-clear>Очистить сборку</button>
    </div>
    ${composition ? `<div class="part-list">${composition}</div>` : '<div class="part-empty">Пока ничего не выбрано.</div>'}
  </section>`;
}

const commit = (ctx) => { saveRobots(R); ctx.rerender(); };

async function loadRobotsFile(file, ctx) {
  if (!file) return;
  try {
    const n = importRobots(await file.text());
    ctx.rerender();
    if (typeof alert === 'function') alert(`Загружено роботов: ${n}`);
  } catch (err) {
    if (typeof alert === 'function') alert(`Не удалось загрузить файл: ${err.message}`);
  }
}

export function bind(root, ctx) {
  root.oninput = (e) => {
    const comboPath = e.target.dataset.comboSearch;
    if (comboPath) {
      const robot = currentRobot(), box = e.target.closest('[data-combo]');
      if (!robot || !box) return;
      const q = e.target.value.trim().toLowerCase();
      box.querySelector('[data-combo-list]').innerHTML = comboList(rowsFor(comboPath, robot, ctx).filter((r) => !q || r.text.toLowerCase().includes(q)));
      return;
    }
    const path = e.target.dataset.rsearch;
    if (!path) return;
    const robot = currentRobot(), box = e.target.closest('[data-rbox]');
    const select = box?.querySelector(`select[data-rb="${path}"]`);
    if (!robot || !select) return;
    const q = e.target.value.trim().toLowerCase();
    const rows = rowsFor(path, robot, ctx).filter((r) => !q || r.text.toLowerCase().includes(q));
    select.innerHTML = `<option value="">—</option>${rows.map((r) => `<option value="${esc(r.id)}">${esc(r.text)}</option>`).join('')}`;
  };
  root.onchange = (e) => {
    const t = e.target, robot = currentRobot();
    if (t.dataset.robotsFile !== undefined) {
      loadRobotsFile(t.files?.[0], ctx);
      t.value = '';
      return;
    }
    if (t.dataset.robotSelect !== undefined) {
      if (robotById(t.value)) { R.active = t.value; commit(ctx); }
      return;
    }
    if (!robot) return;
    if (t.dataset.robotName !== undefined) { robot.name = String(t.value || '').trim().slice(0, MAX_ROBOT_NAME) || robot.name; commit(ctx); return; }
    if (t.dataset.robotNotes !== undefined) { robot.notes = String(t.value || ''); commit(ctx); return; }
    if (t.dataset.robotHp !== undefined) { robot.currentHp = t.value === '' ? null : Math.max(0, Math.round(Number(t.value) || 0)); commit(ctx); return; }
    if (t.dataset.robotWeapon !== undefined) {
      robot.weapon = t.value === '' ? null : Number(t.value);
      commit(ctx);
      return;
    }
    if (t.dataset.robotModule !== undefined) {
      const i = Number(t.dataset.robotModule) || 0;
      if (!Array.isArray(robot.modulesActive)) robot.modulesActive = [false, false, false, false, false];
      robot.modulesActive[i] = !!t.checked;
      commit(ctx);
      return;
    }
    if (!t.dataset.rb) return;
    const path = t.dataset.rb, val = t.value || null;
    if (path === 'base') robot.base = val;
    else set(robot, path, val);
    // БМЕТ не принимает оружие и модули — освобождаем предметы при переключении.
    if (path === 'base' && isBmet(ctx.data.itemMap.get(val))) {
      robot.weapons = [null, null]; robot.weapon = null;
      robot.modules = [null, null, null, null, null];
      robot.modulesActive = [false, false, false, false, false];
    }
    commit(ctx);
  };
  root.onclick = (e) => {
    const comboBtn = e.target.closest('[data-combo-btn]');
    if (comboBtn) {
      const combo = comboBtn.closest('[data-combo]'), robot = currentRobot();
      if (combo && robot && combo.querySelector('[data-combo-pop]')?.hidden) openCombo(comboBtn, rowsFor(combo.dataset.combo, robot, ctx), root);
      else closeCombos(root);
      return;
    }
    const comboOpt = e.target.closest('[data-combo-opt]');
    if (comboOpt) {
      const combo = comboOpt.closest('[data-combo]'), path = combo?.dataset.combo, robot = currentRobot();
      if (path && robot) {
        const val = comboOpt.dataset.comboOpt || null;
        if (path === 'base') robot.base = val;
        else set(robot, path, val);
        if (path === 'base' && isBmet(ctx.data.itemMap.get(val))) {
          robot.weapons = [null, null]; robot.weapon = null;
          robot.modules = [null, null, null, null, null];
          robot.modulesActive = [false, false, false, false, false];
        }
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
    if (e.target.closest('[data-import-robots]')) {
      root.querySelector?.('[data-robots-file]')?.click();
      return;
    }
    if (e.target.closest('[data-export-robots]')) { exportRobots(); return; }
    if (e.target.closest('[data-add-robot]')) { addRobot(); ctx.rerender(); return; }
    if (e.target.closest('[data-del-robot]')) {
      const robot = currentRobot();
      if (robot && removeRobot(robot.id)) ctx.rerender();
      return;
    }
    if (e.target.closest('[data-r-clear]')) {
      const robot = currentRobot();
      if (robot) {
        Object.assign(robot, {
          base: null, weapons: [null, null], weapon: null,
          modules: [null, null, null, null, null], modulesActive: [false, false, false, false, false], currentHp: null,
        });
        commit(ctx);
      }
    }
  };
  if (!root._robotComboKeys) {
    root._robotComboKeys = comboKeydown;
    root.addEventListener('keydown', root._robotComboKeys);
  }
  if (!root._robotPartToggle) {
    root._robotPartToggle = (e) => {
      const det = e.target.closest?.('details.part-card[data-part-row]');
      if (!det) return;
      if (det.open) OPEN_PART.add(det.dataset.partRow); else OPEN_PART.delete(det.dataset.partRow);
    };
    root.addEventListener('toggle', root._robotPartToggle, true);
  }
  installComboClose();
}