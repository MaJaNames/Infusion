import { loadData } from './core/data-source.js';
import { indexData } from './core/util.js';
import { loadChar, saveChar } from './core/storage.js';
import { applyTheme } from './core/theme.js';
import { helpBlock } from './core/help.js';
import * as databases from './views/databases.js';
import * as character from './views/character.js';
import * as utilities from './views/utilities.js';
import * as settings from './views/settings.js';

const TABS = [['db', 'Базы данных', databases], ['char', 'Персонаж', character], ['util', 'Утилиты', utilities], ['settings', 'Настройки', settings]];
const $ = (id) => document.getElementById(id);
let CURRENT = TABS[0];

// Адрес вида #util/calc: первый сегмент — раздел, второй — подраздел.
function parseRoute() {
  const raw = location.hash.replace(/^#/, '');
  const [id, ...rest] = raw.split('/');
  return { id: id || TABS[0][0], sub: rest.join('/') };
}

// Подраздел меняется без перезагрузки: replaceState не вызывает hashchange и не сбрасывает прокрутку.
function setHash(tab, sub) {
  if (!sub || typeof history === 'undefined') return;
  const want = `#${tab[0]}/${sub}`;
  if (location.hash !== want) history.replaceState(null, '', want);
}

const ctx = {
  data: null, char: loadChar(),
  save: () => saveChar(ctx.char),
  rerender: () => draw(false),
  setData: (d) => { ctx.data = indexData(d); draw(true); },
  route: (sub) => setHash(CURRENT, sub),
};

function draw(full) {
  const { id, sub } = parseRoute();
  const tab = TABS.find((t) => t[0] === id) || TABS[0], y = scrollY;
  CURRENT = tab;
  document.body.classList.remove('drawer-open');
  $('nav').innerHTML = TABS.map(([k, t]) => `<a href="#${k}" class="${k === tab[0] ? 'on' : ''}">${t}</a>`).join('');
  if (full) $('help').innerHTML = helpBlock(tab[0]);
  tab[2].setRoute?.(sub);
  $('app').innerHTML = tab[2].render(ctx);
  const app = $('app');
  app.oninput = app.onchange = app.onclick = null;
  tab[2].bind(app, ctx);
  // Всегда оставляем в адресе явный подраздел: им можно поделиться.
  setHash(tab, tab[2].currentRoute?.());
  scrollTo(0, full ? 0 : y);
}

async function boot() {
  applyTheme();
  try { ctx.data = indexData(await loadData()); } catch (e) { $('app').innerHTML = `<div class="empty">Не удалось загрузить базу: ${e.message}</div>`; return; }
  draw(true);
  addEventListener('hashchange', () => draw(true));
}
boot();
