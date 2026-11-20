import { esc } from '../core/util.js';
import { downloadJson, normChar, saveChar } from '../core/storage.js';
import { loadData, getSourcePreference, setSourcePreference, SOURCE_LIVE, SOURCE_SNAPSHOT } from '../core/data-source.js';
import { getTheme, setTheme } from '../core/theme.js';
import { G, normGarage, saveGarage } from '../modules/autoshop/store.js';
import { R, normRobots, saveRobots } from '../modules/robots/store.js';

const THEMES = [['auto', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']];
let FLASH = ''; // сообщение после перерисовки (например, об успешной загрузке бэкапа)

export function render(ctx) {
  const d = ctx.data;
  const flash = FLASH;
  FLASH = '';
  const source = getSourcePreference() || d.sourceMode || SOURCE_SNAPSHOT;
  const live = source === SOURCE_LIVE;
  return `<section class="panel"><h2>Все данные</h2>
      <div class="btns"><button data-a="export-all">Выгрузить все данные в .json</button><button data-a="import-all">Загрузить все данные из .json</button>
        <input type="file" accept="application/json,.json" data-backup-file hidden></div>
      <p class="meta">Полная выгрузка пользовательских данных: персонаж, транспорт Кочевника, роботы Техника и тема оформления. Загрузка заменяет текущие данные содержимым файла. Загрузка и сброс персонажа — на вкладке «Персонаж».</p>
      <p id="msg" class="meta">${esc(flash)}</p></section>
    <section class="panel"><h2>Оформление</h2><div class="btns">${THEMES.map(([v, t]) => `<button data-theme="${v}" class="${getTheme() === v ? 'on' : ''}">${t}</button>`).join('')}</div></section>
    <section class="panel"><h2>Источник базы</h2>
      <p class="meta">Сейчас: ${esc(d.source)} · версия: ${esc(String(d.version).slice(0, 19))} · предметов ${d.items.length}, карт ${d.cards.length}</p>
      <div class="source-modes">
        <button data-source-mode="${SOURCE_SNAPSHOT}" class="${live ? '' : 'on'}">Снимок</button>
        <button data-source-mode="${SOURCE_LIVE}" class="${live ? 'on' : ''}">Автообновление (Supabase)</button>
        <button data-a="reload-db">Обновить базу</button>
      </div>
      <p class="meta">Снимок — data/data.json, который GitHub Actions обновляет раз в сутки: быстро и стабильно. Автообновление — свежие данные прямо из Supabase: версия проверяется каждые 10 минут и при возврате на вкладку, а с включённым Realtime обновление приходит сразу после изменения. Если источник недоступен, сайт покажет последнюю сохранённую копию.</p>
      ${d.sourceFallback ? `<p class="meta bad">Не удалось обновить базу: ${esc(d.sourceError || 'нет связи')}. Показаны сохранённые данные.</p>` : ''}</section>
    <section class="panel system"><h2>Системные</h2>
      <p class="meta">Полная очистка локальных данных сайта: персонаж, гараж, роботы, тема, кэш базы и service worker. После этого страница перезагрузится.</p>
      <div class="btns"><button class="danger" data-a="reset-cache">Сбросить кэш сайта</button></div></section>`;
}

// Загрузка полной резервной копии: заменяет персонажа, гараж, роботов и тему.
function restoreBackup(text, ctx) {
  const raw = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || raw.kind !== 'infusion-backup') throw new Error('это не резервная копия Инфузии');
  if (!raw.char || !raw.garage || !raw.robots) throw new Error('в резервной копии не хватает данных');
  const ok = typeof confirm !== 'function' || confirm('Заменить текущего персонажа, транспорт, роботов и тему данными из файла?');
  if (!ok) return false;

  const char = normChar(raw.char);
  ctx.char = char;
  saveChar(char);

  Object.assign(G, normGarage(raw.garage));
  saveGarage(G);

  Object.assign(R, normRobots(raw.robots));
  saveRobots(R);

  if (raw.theme) setTheme(raw.theme);
  FLASH = `Данные загружены: ${char.name || 'персонаж без имени'}.`;
  ctx.rerender();
  return true;
}

// Переключение источника и принудительное обновление базы.
async function switchSource(mode, root, ctx, msg) {
  setSourcePreference(mode);
  ctx.sourceChanged?.();
  const label = mode === SOURCE_LIVE ? 'Supabase' : 'снимок data.json';
  msg(`Загружаем базу: ${label}…`);
  root.querySelectorAll?.('[data-source-mode], [data-a="reload-db"]').forEach((btn) => { btn.disabled = true; });
  try {
    const data = await loadData({ source: mode, force: true });
    // При сбое подробности уже видны в панели источника, отдельное сообщение не нужно.
    FLASH = data.sourceFallback ? '' : `База загружена: ${data.source}.`;
    if (ctx.setData) ctx.setData(data);
    else { ctx.data = data; ctx.rerender(); }
  } catch (e) {
    FLASH = `Не удалось загрузить базу: ${e.message}`;
    ctx.rerender();
  }
}

export function bind(root, ctx) {
  const msg = (t) => { const el = root.querySelector?.('#msg'); if (el) el.textContent = t; };
  root.onclick = async (e) => {
    // Тема хранится в data-theme на <html>, поэтому ищем именно кнопку выбора темы.
    const th = e.target.closest('button[data-theme]'), a = e.target.closest('[data-a]')?.dataset.a;
    const mode = e.target.closest('[data-source-mode]')?.dataset.sourceMode;
    if (th) { setTheme(th.dataset.theme); ctx.rerender(); return; }
    if (mode) { await switchSource(mode === SOURCE_LIVE ? SOURCE_LIVE : SOURCE_SNAPSHOT, root, ctx, msg); return; }
    if (a === 'reload-db') { await switchSource(getSourcePreference() || SOURCE_SNAPSHOT, root, ctx, msg); return; }
    if (a === 'export-all') {
      downloadJson({
        v: 1, kind: 'infusion-backup', exportedAt: new Date().toISOString(),
        char: ctx.char, garage: G, robots: R, theme: getTheme(),
      }, 'infusion-backup.json');
      msg('Все данные выгружены.');
      return;
    }
    if (a === 'import-all') {
      root.querySelector?.('[data-backup-file]')?.click();
      return;
    }
    if (a === 'reset-cache' && (typeof confirm !== 'function' || confirm('Очистить весь кэш сайта: персонаж, гараж, роботов, тему и базу? Страница перезагрузится.'))) {
      try { localStorage.clear(); } catch { /* память браузера недоступна */ }
      try {
        if (typeof caches !== 'undefined') {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }
      } catch { /* Cache API недоступен */ }
      location.reload();
    }
  };
  root.onchange = async (e) => {
    if (e.target.dataset.backupFile === undefined) return;
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      restoreBackup(await file.text(), ctx);
    } catch (err) {
      msg(`Не удалось загрузить файл: ${err.message}`);
    }
  };
}
