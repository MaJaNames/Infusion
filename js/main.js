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

// Индикатор сохранения: карточка и настройки пишутся в localStorage сразу.
function setSaved(saved) {
  const el = $('save-state');
  if (!el) return;
  el.textContent = saved ? 'Сохранено' : 'Есть изменения';
  el.classList.toggle('saved', saved);
  el.classList.toggle('dirty', !saved);
}

function isEditable(el) {
  const tag = el?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable;
}

// Ctrl+K и «/» фокусируют поиск текущего раздела; если поля нет — открывают первый комбобокс.
function focusSearch() {
  const app = $('app');
  if (!app) return;
  const visible = (el) => !el.disabled && !el.closest('[hidden]') && el.getClientRects().length > 0;
  const input = [...app.querySelectorAll('input[type="search"]')].find(visible);
  if (input) {
    input.focus();
    if (typeof input.select === 'function') input.select();
    return;
  }
  const combo = [...app.querySelectorAll('[data-combo-btn]:not([disabled])')].find(visible);
  if (!combo) return;
  combo.click();
  const search = combo.closest('[data-combo]')?.querySelector('.combo-search');
  if (search) search.focus();
}

addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && String(e.key).toLowerCase() === 'k') {
    e.preventDefault();
    focusSearch();
    return;
  }
  if (!mod && e.key === '/' && !isEditable(e.target)) {
    e.preventDefault();
    focusSearch();
  }
});

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
  save: () => { saveChar(ctx.char); setSaved(true); },
  markSaved: () => setSaved(true),
  markDirty: () => setSaved(false),
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
  // Ввод в поля карточки помечает состояние как изменённое; обработчик раздела сразу сохранит его.
  // Поиск, фильтры и прочие элементы интерфейса на индикатор не влияют.
  const marksDirty = (el) => el?.dataset?.p !== undefined;
  $('app').addEventListener('input', (e) => { if (marksDirty(e.target)) setSaved(false); }, true);
  $('app').addEventListener('change', (e) => { if (marksDirty(e.target)) setSaved(false); }, true);
  try { ctx.data = indexData(await loadData()); } catch (e) { $('app').innerHTML = `<div class="empty">Не удалось загрузить базу: ${e.message}</div>`; return; }
  draw(true);
  addEventListener('hashchange', () => draw(true));
}
boot();
