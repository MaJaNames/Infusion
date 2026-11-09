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
const ctx = { data: null, char: loadChar(), save: () => saveChar(ctx.char), rerender: () => draw(false), setData: (d) => { ctx.data = indexData(d); draw(true); } };

function draw(full) {
  const id = location.hash.slice(1) || 'db', tab = TABS.find((t) => t[0] === id) || TABS[0], y = scrollY;
  document.body.classList.remove('drawer-open');
  $('nav').innerHTML = TABS.map(([k, t]) => `<a href="#${k}" class="${k === tab[0] ? 'on' : ''}">${t}</a>`).join('');
  if (full) $('help').innerHTML = helpBlock(tab[0]);
  $('app').innerHTML = tab[2].render(ctx);
  const app = $('app');
  app.oninput = app.onchange = app.onclick = null;
  tab[2].bind(app, ctx);
  scrollTo(0, full ? 0 : y);
}

async function boot() {
  applyTheme();
  try { ctx.data = indexData(await loadData()); } catch (e) { $('app').innerHTML = `<div class="empty">Не удалось загрузить базу: ${e.message}</div>`; return; }
  draw(true);
  addEventListener('hashchange', () => draw(true));
}
boot();
