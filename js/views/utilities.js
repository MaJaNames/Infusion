import * as shop from '../modules/autoshop/view.js';

const S = { tab: 'shop' };
const TABS = [['shop', 'Автомастерская'], ['robots', 'Мастерская техники'], ['calc', 'Калькулятор вероятностей']];
const SOON = {
  robots: '<p>Заготовка под будущий конструктор роботов. Он появится, когда будут готовы правила и таблицы деталей.</p>',
  calc: '<p>Раздел ждёт таблицу «Калькулятор Инфузии»: по ней я перенесу правила бросков и расчёт шансов.</p>',
};

export function render(ctx) {
  return `<div class="tabs">${TABS.map(([id, t]) => `<button data-tab="${id}" class="${S.tab === id ? 'on' : ''}">${t}</button>`).join('')}</div>
    ${S.tab === 'shop' ? shop.render(ctx) : `<section class="panel">${SOON[S.tab]}</section>`}`;
}

export function bind(root, ctx) {
  if (S.tab === 'shop') shop.bind(root, ctx);
  const inner = root.onclick;
  root.onclick = (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { S.tab = t.dataset.tab; ctx.rerender(); return; }
    inner?.(e);
  };
}
