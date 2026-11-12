import { esc } from '../core/util.js';
import { downloadJson } from '../core/storage.js';
import { getTheme, setTheme } from '../core/theme.js';
import { G } from '../modules/autoshop/store.js';
import { R } from '../modules/robots/store.js';

const THEMES = [['auto', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']];

export function render(ctx) {
  const d = ctx.data;
  return `<section class="panel"><h2>Все данные</h2>
      <div class="btns"><button data-a="export-all">Выгрузить все данные в .json</button></div>
      <p class="meta">Полная выгрузка пользовательских данных: персонаж, транспорт Кочевника, роботы Техника и тема оформления. Загрузка и сброс персонажа — на вкладке «Персонаж».</p>
      <p id="msg" class="meta"></p></section>
    <section class="panel"><h2>Оформление</h2><div class="btns">${THEMES.map(([v, t]) => `<button data-theme="${v}" class="${getTheme() === v ? 'on' : ''}">${t}</button>`).join('')}</div></section>
    <section class="panel"><h2>База данных</h2><p class="meta">Источник: ${esc(d.source)} · версия: ${esc(String(d.version).slice(0, 19))} · предметов ${d.items.length}, карт ${d.cards.length}</p>
      <p class="meta">Справочники обновляются автоматически: GitHub Actions пересобирает снимок базы, а сайт читает data/data.json. Если сети нет, используется кэш браузера.</p></section>
    <section class="panel system"><h2>Системные</h2>
      <p class="meta">Полная очистка локальных данных сайта: персонаж, гараж, роботы, тема, кэш базы и service worker. После этого страница перезагрузится.</p>
      <div class="btns"><button class="danger" data-a="reset-cache">Сбросить кэш сайта</button></div></section>`;
}

export function bind(root, ctx) {
  const msg = (t) => { const el = root.querySelector?.('#msg'); if (el) el.textContent = t; };
  root.onclick = async (e) => {
    // Тема хранится в data-theme на <html>, поэтому ищем именно кнопку выбора темы.
    const th = e.target.closest('button[data-theme]'), a = e.target.closest('[data-a]')?.dataset.a;
    if (th) { setTheme(th.dataset.theme); ctx.rerender(); return; }
    if (a === 'export-all') {
      downloadJson({
        v: 1, kind: 'infusion-backup', exportedAt: new Date().toISOString(),
        char: ctx.char, garage: G, robots: R, theme: getTheme(),
      }, 'infusion-backup.json');
      msg('Все данные выгружены.');
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
}
