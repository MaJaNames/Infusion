import { loadData, getSourcePreference, setSourcePreference, SOURCE_LIVE, SOURCE_SNAPSHOT } from './core/data-source.js';
import { indexData } from './core/util.js';
import { loadChar, saveChar } from './core/storage.js';
import { applyTheme } from './core/theme.js';
import { helpBlock } from './core/help.js';
import { showToast } from './core/toast.js';
import { startRealtime, stopRealtime } from './core/realtime.js';
import * as databases from './views/databases.js';
import * as character from './views/character.js';
import * as utilities from './views/utilities.js';
import * as settings from './views/settings.js';

const TABS = [['db', 'Базы данных', databases], ['char', 'Персонаж', character], ['util', 'Утилиты', utilities], ['settings', 'Настройки', settings]];
const $ = (id) => document.getElementById(id);
let CURRENT = TABS[0];
const LIVE_REFRESH_MS = 10 * 60 * 1000;
let liveTimer = 0;
let liveBusy = false;
let liveAgain = false;
let liveCheckedAt = 0;
let pendingData = null;

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
  sourceChanged: () => syncLiveWatch(),
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

// Не перерисовываем интерфейс посреди ввода или открытого списка/фильтров:
// новые данные подождут, пока пользователь закончит.
function canApplyLive() {
  if (isEditable(document.activeElement)) return false;
  if (document.body.classList.contains('drawer-open')) return false;
  if (document.querySelector('#app .combo-pop:not([hidden])')) return false;
  return true;
}

function applyPendingData() {
  if (!pendingData) return;
  if (getSourcePreference() !== SOURCE_LIVE) { pendingData = null; return; }
  if (!canApplyLive()) return;
  const data = pendingData;
  pendingData = null;
  ctx.data = indexData(data);
  draw(false);
  showToast('База обновлена из Supabase.');
}

// Проверяем только версию базы; таблицы скачиваются, если она изменилась.
async function refreshLive({ force = false } = {}) {
  if (liveBusy) { liveAgain = true; return; }
  if (!ctx.data || getSourcePreference() !== SOURCE_LIVE) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  // Частые переключения вкладок не должны дёргать Supabase без нужды.
  if (!force && Date.now() - liveCheckedAt < 60 * 1000) return;
  liveCheckedAt = Date.now();
  liveBusy = true;
  try {
    const data = await loadData({ source: SOURCE_LIVE });
    if (getSourcePreference() !== SOURCE_LIVE || !ctx.data) return;
    if (String(data.version) === String(ctx.data.version)) return;
    pendingData = data;
    applyPendingData();
  } catch {
    // Следующая проверка попробует снова; текущая база остаётся на экране.
  } finally {
    liveBusy = false;
    if (liveAgain) { liveAgain = false; refreshLive({ force: true }); }
  }
}

// Realtime сообщает об изменении meta сразу; если подписка недоступна,
// тот же refreshLive продолжает работать по таймеру.
function syncLiveWatch() {
  if (getSourcePreference() === SOURCE_LIVE) {
    startRealtime(() => { liveCheckedAt = 0; refreshLive({ force: true }); });
  } else {
    stopRealtime();
  }
}

function startLiveRefresh() {
  if (liveTimer) return;
  liveTimer = setInterval(() => {
    if (document.visibilityState === 'visible') refreshLive();
  }, LIVE_REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { applyPendingData(); refreshLive(); }
  });
  addEventListener('focus', () => { applyPendingData(); refreshLive(); });
  addEventListener('online', () => { liveCheckedAt = 0; refreshLive(); });
  document.addEventListener('focusout', () => { setTimeout(applyPendingData, 0); }, true);
}

// Первый запуск: спрашиваем, откуда брать справочники. Выбор запоминается,
// позже его можно поменять на вкладке «Настройки».
function chooseSource() {
  const app = $('app');
  return new Promise((resolve) => {
    app.innerHTML = `<section class="panel">
        <h2>Откуда загружать базу?</h2>
        <p class="meta">Это влияет только на справочники. Персонаж, транспорт и роботы хранятся отдельно и не затрагиваются. Выбор сохранится в браузере, поменять его можно в «Настройках».</p>
        <div class="source-choice">
          <button data-source-choice="${SOURCE_SNAPSHOT}"><b>Снимок</b><span>data/data.json — стабильно и быстро. Обновляется GitHub Actions раз в сутки.</span></button>
          <button data-source-choice="${SOURCE_LIVE}"><b>Автообновление (Supabase)</b><span>Свежая база прямо из Supabase. Если сервис недоступен, сайт покажет сохранённую копию.</span></button>
        </div>
        <p class="meta">Если сомневаетесь, выберите снимок: он не зависит от доступности Supabase.</p>
      </section>`;
    app.onclick = (e) => {
      const btn = e.target.closest('[data-source-choice]');
      if (!btn) return;
      const choice = btn.dataset.sourceChoice === SOURCE_LIVE ? SOURCE_LIVE : SOURCE_SNAPSHOT;
      app.onclick = null;
      app.innerHTML = `<div class="empty">Загружаем базу: ${choice === SOURCE_LIVE ? 'Supabase' : 'снимок data.json'}…</div>`;
      resolve(choice);
    };
  });
}

async function boot() {
  applyTheme();
  // Ввод в поля карточки помечает состояние как изменённое; обработчик раздела сразу сохранит его.
  // Поиск, фильтры и прочие элементы интерфейса на индикатор не влияют.
  const marksDirty = (el) => el?.dataset?.p !== undefined;
  $('app').addEventListener('input', (e) => { if (marksDirty(e.target)) setSaved(false); }, true);
  $('app').addEventListener('change', (e) => { if (marksDirty(e.target)) setSaved(false); }, true);
  let source = getSourcePreference();
  if (!source) {
    source = await chooseSource();
    setSourcePreference(source);
  }
  try { ctx.data = indexData(await loadData({ source })); } catch (e) { $('app').innerHTML = `<div class="empty">Не удалось загрузить базу: ${e.message}</div>`; return; }
  draw(true);
  addEventListener('hashchange', () => draw(true));
  startLiveRefresh();
  syncLiveWatch();
}
boot();
