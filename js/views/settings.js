import { esc } from '../core/util.js';
import { exportChar, importChar } from '../core/storage.js';
import { getTheme, setTheme } from '../core/theme.js';

const THEMES = [['auto', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']];

export function render(ctx) {
  const d = ctx.data;
  return `<section class="panel"><h2>Персонаж</h2><div class="btns"><button data-a="export">Экспорт в .json</button>
      <label class="btn">Импорт из .json<input type="file" accept=".json" data-a="import" hidden></label><button class="danger" data-a="reset">Сбросить персонажа</button></div><p id="msg" class="meta"></p></section>
    <section class="panel"><h2>Оформление</h2><div class="btns">${THEMES.map(([v, t]) => `<button data-theme="${v}" class="${getTheme() === v ? 'on' : ''}">${t}</button>`).join('')}</div></section>
    <section class="panel"><h2>База данных</h2><p class="meta">Источник: ${esc(d.source)} · версия: ${esc(String(d.version).slice(0, 19))} · предметов ${d.items.length}, карт ${d.cards.length}</p>
      <p class="meta">Справочники обновляются автоматически: снимок базы пересобирается через GitHub Actions, запись в Supabase выполняется вне приложения.</p></section>`;
}

export function bind(root, ctx) {
  const msg = (t) => { root.querySelector('#msg').textContent = t; };
  root.onchange = async (e) => {
    if (e.target.dataset.a !== 'import' || !e.target.files[0]) return;
    try { ctx.char = await importChar(e.target.files[0]); ctx.save(); msg('Персонаж загружен: ' + (ctx.char.name || 'без имени')); } catch (err) { msg(err.message); }
  };
  root.onclick = (e) => {
    const th = e.target.closest('[data-theme]'), a = e.target.closest('[data-a]')?.dataset.a;
    if (th) { setTheme(th.dataset.theme); ctx.rerender(); }
    if (a === 'export') exportChar(ctx.char);
    if (a === 'reset' && confirm('Удалить персонажа, сборку и все локальные данные этого сайта?')) { localStorage.clear(); location.reload(); }
  };
}
