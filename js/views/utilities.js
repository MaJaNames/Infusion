import * as shop from '../modules/autoshop/view.js';
import * as robots from '../modules/robots/view.js';
import { esc } from '../core/util.js';
import { probability, percent, MODES, targetFromVer, verFromTarget } from '../core/probability.js';

const TABS = [['nomad', 'Автомастерская'], ['robots', 'Мастерская техники'], ['calc', 'Калькулятор вероятностей']];
const TAB_IDS = new Set(TABS.map(([id]) => id));
const S = {
  tab: 'nomad',
  // Значения по умолчанию — как в строке 2 листа «Калькулятор».
  calc: { stat: 7, bonus: 0, target: 81, mode: 'none' },
};


function calcCards() {
  const r = probability(S.calc);
  const other = (mode) => percent(probability({ ...S.calc, mode }).chance);
  return `<div class="stat-card"><span>Результат D100</span><b>${r.result}</b></div>
    <div class="stat-card cost"><span>Шанс успеха</span><b>${percent(r.chance)}</b></div>
    <div class="stat-card"><span>Бросок без модификатора</span><b>${percent(r.base)}</b></div>
    <div class="chips calc-modes"><span class="chip${S.calc.mode === 'none' ? ' total' : ''}">Нет: ${other('none')}</span><span class="chip${S.calc.mode === 'adv' ? ' total' : ''}">Преимущество: ${other('adv')}</span><span class="chip${S.calc.mode === 'dis' ? ' total' : ''}">Помеха: ${other('dis')}</span></div>`;
}

function calcPanel() {
  const c = S.calc;
  return `<section class="panel calc">
    <h2>Калькулятор вероятностей</h2>
    <p class="meta">Расчёт по таблице «Калькулятор Инфузии»: характеристика, бонус и цель дают результат D100 и шанс успеха. «Вер» и «Цель» — одно и то же с разных концов: вер 15 = цель 86, потому что кубы начинаются с 1.</p>
    <div class="calc-grid">
      <label>Хар-ка<input type="number" min="0" step="1" data-calc="stat" value="${esc(c.stat)}"></label>
      <label>Бонус<input type="number" step="1" data-calc="bonus" value="${esc(c.bonus)}"></label>
      <label>Цель<input type="number" step="1" data-calc="target" value="${esc(c.target)}"></label>
      <label>Вер<input type="number" step="1" data-calc="ver" value="${esc(verFromTarget(c.target))}"></label>
      <label>Преимущество/Помеха<select data-calc="mode">${MODES.map(([v, t]) => `<option value="${v}"${c.mode === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
    </div>
    <div class="stat-grid calc-out" data-calc-out>${calcCards()}</div>
  </section>`;
}

export function render(ctx) {
  return `<div class="tabs util-tabs">${TABS.map(([id, t]) => `<button data-tab="${id}" class="${S.tab === id ? 'on' : ''}">${t}</button>`).join('')}</div>
    <select class="tabs-select" data-tab-select="1" aria-label="Раздел утилит">${TABS.map(([id, t]) => `<option value="${id}"${S.tab === id ? ' selected' : ''}>${t}</option>`).join('')}</select>
    ${S.tab === 'nomad' ? shop.render(ctx) : S.tab === 'robots' ? robots.render(ctx) : calcPanel()}`;
}

export function bind(root, ctx) {
  if (S.tab === 'nomad') shop.bind(root, ctx);
  else if (S.tab === 'robots') robots.bind(root, ctx);
  const innerInput = root.oninput;
  root.oninput = (e) => {
    if (e.target.dataset.calc !== undefined) {
      const key = e.target.dataset.calc;
      const value = e.target.type === 'number' ? (e.target.value === '' ? 0 : Number(e.target.value)) : e.target.value;
      if (key === 'ver') {
        S.calc.target = targetFromVer(value);
        const target = root.querySelector?.('[data-calc="target"]');
        if (target) target.value = S.calc.target;
      } else if (key === 'target') {
        S.calc.target = value;
        const ver = root.querySelector?.('[data-calc="ver"]');
        if (ver) ver.value = verFromTarget(value);
      } else S.calc[key] = value;
      const out = root.querySelector?.('[data-calc-out]');
      if (out) out.innerHTML = calcCards();
      return;
    }
    innerInput?.(e);
  };
  const innerChange = root.onchange;
  root.onchange = (e) => {
    if (e.target.dataset.calc !== undefined) {
      root.oninput?.(e);
      return;
    }
    if (e.target.dataset.tabSelect !== undefined) {
      S.tab = e.target.value;
      ctx.route?.(S.tab);
      ctx.rerender();
      return;
    }
    innerChange?.(e);
  };
  const inner = root.onclick;
  root.onclick = (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) {
      S.tab = t.dataset.tab;
      ctx.route?.(S.tab);
      ctx.rerender();
      return;
    }
    inner?.(e);
  };
}

// Подссылки вида #util/calc открывают нужную вкладку утилит.
export function setRoute(sub) {
  if (TAB_IDS.has(sub)) S.tab = sub;
  else if (!sub) S.tab = TABS[0][0];
}
export function currentRoute() {
  return S.tab;
}
