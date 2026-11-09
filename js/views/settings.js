import config from '../../config.js';
import { esc } from '../core/util.js';
import { exportChar, importChar } from '../core/storage.js';
import { getTheme, setTheme } from '../core/theme.js';
import { loadData } from '../core/data-source.js';
import { isAdmin, sendLink, signOut } from '../core/admin.js';

const THEMES = [['auto', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']];

export function render(ctx) {
  const d = ctx.data;
  return `<section class="panel"><h2>Персонаж</h2><div class="btns"><button data-a="export">Экспорт в .json</button>
      <label class="btn">Импорт из .json<input type="file" accept=".json" data-a="import" hidden></label><button class="danger" data-a="reset">Сбросить персонажа</button></div><p id="msg" class="meta"></p></section>
    <section class="panel"><h2>Оформление</h2><div class="btns">${THEMES.map(([v, t]) => `<button data-theme="${v}" class="${getTheme() === v ? 'on' : ''}">${t}</button>`).join('')}</div></section>
    <section class="panel"><h2>База данных</h2><p class="meta">Источник: ${esc(d.source)} · версия: ${esc(String(d.version).slice(0, 19))} · предметов ${d.items.length}, карт ${d.cards.length}</p><div id="adm"></div></section>`;
}

async function adminBlock(root, ctx) {
  const box = root.querySelector('#adm');
  if (!config.SUPABASE_URL) { box.innerHTML = '<p class="meta">Supabase не подключён: заполните config.js.</p>'; return; }
  if (await isAdmin()) {
    box.innerHTML = '<div class="btns"><button data-a="refresh">Обновить базу из Supabase</button><button data-a="logout">Выйти</button></div>';
  } else {
    box.innerHTML = `<details><summary class="meta">Вход для администратора</summary><div class="add"><input type="email" id="email" placeholder="e-mail"><button data-a="login">Прислать ссылку</button></div></details>`;
  }
}

export function bind(root, ctx) {
  const msg = (t) => { root.querySelector('#msg').textContent = t; };
  adminBlock(root, ctx);
  root.onchange = async (e) => {
    if (e.target.dataset.a !== 'import' || !e.target.files[0]) return;
    try { ctx.char = await importChar(e.target.files[0]); ctx.save(); msg('Персонаж загружен: ' + (ctx.char.name || 'без имени')); } catch (err) { msg(err.message); }
  };
  root.onclick = async (e) => {
    const th = e.target.closest('[data-theme]'), a = e.target.closest('[data-a]')?.dataset.a;
    if (th) { setTheme(th.dataset.theme); ctx.rerender(); }
    if (a === 'export') exportChar(ctx.char);
    if (a === 'reset' && confirm('Удалить персонажа, сборку и все локальные данные этого сайта?')) { localStorage.clear(); location.reload(); }
    if (a === 'refresh') { ctx.setData(await loadData({ force: true })); }
    if (a === 'logout') { signOut(); ctx.rerender(); }
    if (a === 'login') {
      const email = root.querySelector('#email').value.trim();
      try { await sendLink(email); root.querySelector('#adm').insertAdjacentHTML('beforeend', '<p class="meta">Ссылка отправлена на почту.</p>'); } catch (err) { root.querySelector('#adm').insertAdjacentHTML('beforeend', `<p class="bad">${esc(err.message)}</p>`); }
    }
  };
}
