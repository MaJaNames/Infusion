import { esc, num, label, optLabel, money, set } from '../../core/util.js';
import { comboList, closeCombos, openCombo, comboKeydown, installComboClose } from '../../core/combo.js';
import { R, MAX_ROBOT_NAME, addRobot, removeRobot, saveRobots, currentRobot } from './store.js';
import { isRobotBase, isRobotWeapon, isRobotModule, isBmet, robotKind, robotKindLabel, robotBase, robotStats, availableCount, robotRequirement } from './parts.js';
import { bmetLimit } from '../../character/rules.js';

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
  const { data, char } = ctx;
  const all = stockOf(ctx);
  const current = path === 'base' ? robot.base : robot[path.split('.')[0]]?.[Number(path.split('.')[1])];
  const available = (it) => availableCount(char, R.robots, it.id, { robotId: robot.id, path }) > 0;
  let items;
  if (path === 'base') {
    const taken = new Set(R.robots.filter((r) => r.id !== robot.id && isBmet(robotBase(r, data))).map((r) => r.base));
    items = all.filter((it) => isRobotBase(it) && (isBmet(it) ? !taken.has(it.id) : available(it)));
  } else if (path.startsWith('weapons')) {
    items = all.filter((it) => isRobotWeapon(it) && available(it));
  } else {
    items = all.filter((it) => isRobotModule(it) && available(it));
  }
  // Уже выбранный предмет показываем даже если его больше нет в инвентаре.
  if (current && !items.some((it) => it.id === current)) {
    const it = data.itemMap.get(current);
    if (it) items = [it, ...items];
  }
  return items;
}

const rowsFor = (path, robot, ctx) => itemsFor(path, robot, ctx).map((it) => ({
  id: it.id,
  text: `${optLabel(it)}${path === 'base' ? '' : ` · свободно ${num(availableCount(ctx.char, R.robots, it.id, { robotId: robot.id, path }))}`}`,
}));

function picker(path, robot, ctx, slot) {
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
  </div>`;
}

const chip = (t, v) => (v ? `<span class="chip">${t} ${num(v)}</span>` : '');
const reqText = (needs) => (needs.length ? `Нужен имплант: ${needs.join(', ')}` : '');

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
  const bmets = R.robots.filter((r) => isBmet(robotBase(r, ctx.data))).length;
  const limit = bmetLimit(c.ro);
  const tabs = R.robots.map((r) => `<button type="button" role="tab" data-robot="${esc(r.id)}" class="${r.id === R.active ? 'on' : ''}" aria-selected="${r.id === R.active}"><span class="garage-tab-name">${esc(r.name)}</span><span class="garage-count">${r.base ? '1' : '0'}</span></button>`).join('');
  const options = R.robots.map((r) => `<option value="${esc(r.id)}"${r.id === R.active ? ' selected' : ''}>${esc(r.name)}</option>`).join('');
  const hp = robot.currentHp != null ? `${num(robot.currentHp)} / ${num(total.hp)}` : num(total.hp);
  const baseMissing = robot.base && !ctx.data.itemMap.get(robot.base);
  const useReq = robotRequirement(robot, ctx.data, c);
  const canWear = !!base && useReq.ok;

  const composition = [
    ['Основа', robot.base],
    ...(kind === 'bmet' ? [] : [...robot.weapons.map((id, i) => [`Оружие ${i + 1}`, id]), ...robot.modules.map((id, i) => [`Модуль ${i + 1}`, id])]),
  ].map(([slot, id]) => {
    const it = id ? ctx.data.itemMap.get(id) : null;
    return it ? `<div class="line"><span class="grow"><b>${esc(slot)}</b> · ${esc(label(it))}</span><span class="meta">${esc(it.rarity)}</span></div>` : '';
  }).join('');

  return `<section class="panel garage">
    <div class="garage-head">
      <div><h2>Мастерская техники</h2><p class="meta">Сборка не требует Робософта. Предметы берутся из инвентаря и остаются в нём; занятые экземпляры нельзя использовать дважды.</p></div>
      <div class="garage-actions"><button type="button" data-add-robot>+ Робот</button></div>
    </div>
    <div class="subtabs garage-tabs" role="tablist" aria-label="Роботы">${tabs}</div>
    <select class="subtabs-select" data-robot-select aria-label="Выбор робота">${options}</select>
    <div class="garage-topline">
      <div class="chips garage-summary">
        ${kind ? `<span class="chip">${robotKindLabel[kind]}</span>` : '<span class="chip warn">Основа не выбрана</span>'}
        <span class="chip">ОЗ: ${hp}</span>${chip('ДЕФ.П', total.defP)}${chip('ДЕФ.А', total.defA)}${chip('УКЛ', total.evasion)}${chip('АТК', total.atk)}${total.speed ? chip('Скороход', total.speed) : ''}${total.flight ? chip('Полёт', total.flight) : ''}
        <span class="chip">Стоимость: ${money(total.cost)}</span>
        <span class="chip${bmets > limit ? ' bad' : ''}">БМЕТ: ${num(bmets)} / ${num(limit)}</span>
      </div>
      <label class="hp-field garage-hp" title="Текущее ОЗ можно задать вручную; максимум считается из деталей">Текущее ОЗ
        <span class="hp-input"><input type="number" min="0" data-robot-hp value="${robot.currentHp ?? ''}" placeholder="${num(total.hp)}"><span class="meta">/ ${num(total.hp)}</span></span>
      </label>
    </div>
    <div class="garage-edit">
      <label class="garage-name">Название робота<input type="text" data-robot-name value="${esc(robot.name)}" maxlength="${MAX_ROBOT_NAME}" placeholder="Робот"></label>
      <button type="button" class="danger" data-del-robot${R.robots.length <= 1 ? ' disabled' : ''}>Удалить робота</button>
    </div>
    <label class="garage-notes">Заметки<textarea rows="3" data-robot-notes placeholder="Эффекты, повреждения, любой другой текст...">${esc(robot.notes || '')}</textarea></label>
    ${useReq.needs.length ? `<p class="meta">Для надевания: ${esc(reqText(useReq.needs))}${canWear ? '' : ' — пока недоступно'}.</p>` : useReq.reason ? `<p class="meta">${esc(useReq.reason)}.</p>` : ''}
    ${baseMissing ? `<p class="bad">Основы ${esc(robot.base)} больше нет в базе.</p>` : ''}
    <div class="shop-group">
      <h3>Основа</h3>
      <div class="garage-picks">${picker('base', robot, ctx, 'Призма / Ядро / БМЕТ')}</div>
    </div>
    ${kind === 'bmet' ? '<p class="meta">У БМЕТ нет слотов оружия и модулей — только его собственные характеристики и уникальный эффект.</p>' : kind ? `
    <div class="shop-group"><h3>Оружие</h3><div class="garage-picks">${robot.weapons.map((_, i) => picker(`weapons.${i}`, robot, ctx, `Оружие ${i + 1}`)).join('')}</div></div>
    <div class="shop-group"><h3>Модули</h3><div class="garage-picks">${robot.modules.map((_, i) => picker(`modules.${i}`, robot, ctx, `Модуль ${i + 1}`)).join('')}</div></div>` : ''}
    <div class="shop-group"><h3>Состав</h3>${composition || '<p class="meta">Пока ничего не выбрано.</p>'}</div>
    ${total.unique ? `<div class="shop-group"><h3>Уникальные эффекты</h3><p class="desc">${esc(total.unique)}</p></div>` : ''}
  </section>`;
}

const commit = (ctx) => { saveRobots(R); ctx.rerender(); };

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
    if (t.dataset.robotSelect !== undefined) {
      if (robotById(t.value)) { R.active = t.value; commit(ctx); }
      return;
    }
    if (!robot) return;
    if (t.dataset.robotName !== undefined) { robot.name = String(t.value || '').trim().slice(0, MAX_ROBOT_NAME) || robot.name; commit(ctx); return; }
    if (t.dataset.robotNotes !== undefined) { robot.notes = String(t.value || ''); commit(ctx); return; }
    if (t.dataset.robotHp !== undefined) { robot.currentHp = t.value === '' ? null : Math.max(0, Math.round(Number(t.value) || 0)); commit(ctx); return; }
    if (!t.dataset.rb) return;
    const path = t.dataset.rb, val = t.value || null;
    if (path === 'base') robot.base = val;
    else set(robot, path, val);
    // БМЕТ не принимает оружие и модули — освобождаем предметы при переключении.
    if (path === 'base' && isBmet(ctx.data.itemMap.get(val))) { robot.weapons = [null, null]; robot.modules = [null, null, null, null, null]; }
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
        if (path === 'base' && isBmet(ctx.data.itemMap.get(val))) { robot.weapons = [null, null]; robot.modules = [null, null, null, null, null]; }
        commit(ctx);
      }
      closeCombos(root);
      return;
    }
    if (!e.target.closest('[data-combo]')) closeCombos(root);
    if (e.target.closest('[data-add-robot]')) { addRobot(); ctx.rerender(); return; }
    if (e.target.closest('[data-del-robot]')) {
      const robot = currentRobot();
      if (robot && removeRobot(robot.id)) ctx.rerender();
      return;
    }
    if (e.target.closest('[data-r-clear]')) {
      const robot = currentRobot();
      if (robot) { Object.assign(robot, { base: null, weapons: [null, null], modules: [null, null, null, null, null], currentHp: null }); commit(ctx); }
    }
  };
  if (!root._robotComboKeys) {
    root._robotComboKeys = comboKeydown;
    root.addEventListener('keydown', root._robotComboKeys);
  }
  installComboClose();
}
