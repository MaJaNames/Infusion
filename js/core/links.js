// Красивые пермалинки на записи базы: /p/db/<раздел>/<id>/.
// У каждой такой ссылки есть отдельная HTML-страница с OG-тегами,
// которая сразу перенаправляет в SPA на hash-маршрут.
export const OG_KINDS = Object.freeze(['items', 'cards', 'rules']);

export const permalinkPath = (kind, id) => `p/db/${kind}/${encodeURIComponent(String(id))}/`;

export const hashRoute = (kind, id) => `#db/${kind}/${encodeURIComponent(String(id))}`;

// Абсолютный адрес для кнопки «Поделиться». В браузере базой служит
// document.baseURI, поэтому ссылка работает и на project pages (/Infusion/).
export function permalinkUrl(kind, id, base) {
  const path = permalinkPath(kind, id);
  const root = base ?? (typeof document !== 'undefined' ? document.baseURI : '');
  if (!root) return path;
  try { return new URL(path, root).href; } catch { return path; }
}
