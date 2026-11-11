import { esc } from '../core/util.js';
import { exportChar, importChar, blankChar } from '../core/storage.js';
import { getTheme, setTheme } from '../core/theme.js';

const THEMES = [['auto', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']];

export function render(ctx) {
  const d = ctx.data;
  return `<section class="panel"><h2>Персонаж</h2>
      <div class="btns"><button class="danger" data-a="reset-char">Сбросить персонажа</button>
        <button data-a="export">Экспорт в .json</button>
        <label class="btn">Импорт из .json<input type="file" accept=".json" data-a="import" hidden></label></div>
      <p class="meta">Сброс очищает только карточку персонажа. Гараж, тема и кэш базы остаются.</p>
      <p id="msg" class="meta"></p></section>
    <section class="panel"><h2>Оформление</h2><div class="btns">${THEMES.map(([v, t]) => `<button data-theme="${v}" class="${getTheme() === v ? 'on' : ''}">${t}</button>`).join('')}</div></section>
    <section class="panel"><h2>База данных</h2><p class="meta">Источник: ${esc(d.source)} · версия: ${esc(String(d.version).slice(0, 19))} · предметов ${d.items.length}, карт ${d.cards.length}</p>
      <p class="meta">Справочники обновляются автоматически: GitHub Actions пересобирает снимок базы, а сайт читает data/data.json. Если сети нет, используется кэш браузера.</p></section>
    <section class="panel system"><h2>Системные</h2>
      <p class="meta">Полная очистка локальных данных сайта: персонаж, гараж, тема, кэш базы и service worker. После этого страница перезагрузится.</p>
      <div class="btns"><button class="danger" data-a="reset-cache">Сбросить кэш сайта</button></div></section>`;
}

export function bind(root, ctx) {
  const msg = (t) => { const el = root.querySelector?.('#msg'); if (el) el.textContent = t; };
  root.onchange = async (e) => {
    if (e.target.dataset.a !== 'import' || !e.target.files[0]) return;
    try { ctx.char = await importChar(e.target.files[0]); ctx.save(); msg('Персонаж загружен: ' + (ctx.char.name || 'без имени')); } catch (err) { msg(err.message); }
  };
  root.onclick = async (e) => {
    // Тема хранится в data-theme на <html>, поэтому ищем именно кнопку выбора темы.
    const th = e.target.closest('button[data-theme]'), a = e.target.closest('[data-a]')?.dataset.a;
    if (th) { setTheme(th.dataset.theme); ctx.rerender(); return; }
    if (a === 'export') exportChar(ctx.char);
    if (a === 'reset-char' && (typeof confirm !== 'function' || confirm('Сбросить персонажа? Гараж и настройки останутся.'))) {
      ctx.char = blankChar();
      ctx.save();
      ctx.rerender();
      // Сообщение ставим после перерисовки: иначе оно исчезнет вместе со старым DOM.
      msg('Персонаж сброшен.');
    }
    if (a === 'reset-cache' && (typeof confirm !== 'function' || confirm('Очистить весь кэш сайта: персонаж, гараж, тему и базу? Страница перезагрузится.'))) {
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
