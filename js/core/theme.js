const KEY = 'infusion.theme';
export const getTheme = () => { try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; } };
export function applyTheme(t = getTheme()) {
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
export function setTheme(t) { try { localStorage.setItem(KEY, t); } catch { /* ничего */ } applyTheme(t); }

// В режиме «как в системе» тема должна меняться сразу, без перезагрузки страницы.
let watching = false;
export function watchSystemTheme() {
  if (watching || typeof matchMedia !== 'function') return;
  watching = true;
  try {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', () => { if (getTheme() === 'auto') applyTheme('auto'); });
  } catch { /* браузер не поддерживает медиа-запросы */ }
}
