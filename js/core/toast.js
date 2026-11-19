// Всплывающие уведомления. Живут вне #app, поэтому переживают перерисовку.
const TOASTS_ID = 'toasts';

function host() {
  if (typeof document === 'undefined') return null;
  return document.getElementById(TOASTS_ID);
}

export function showToast(message, opts = {}) {
  const box = host();
  if (!box) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  const text = document.createElement('span');
  text.className = 'toast-text';
  text.textContent = String(message ?? '');
  toast.appendChild(text);

  let timer = 0;
  const close = () => {
    if (timer) clearTimeout(timer);
    toast.classList.add('out');
    setTimeout(() => toast.remove(), 180);
  };

  if (opts.label && typeof opts.onAction === 'function') {
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'toast-action';
    action.textContent = opts.label;
    action.addEventListener('click', () => {
      try { opts.onAction(); } finally { close(); }
    });
    toast.appendChild(action);
  }

  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'toast-close';
  dismiss.title = 'Закрыть';
  dismiss.setAttribute('aria-label', 'Закрыть');
  dismiss.textContent = '✕';
  dismiss.addEventListener('click', close);
  toast.appendChild(dismiss);

  box.appendChild(toast);
  if (opts.duration !== 0) timer = setTimeout(close, opts.duration ?? 7000);
}
