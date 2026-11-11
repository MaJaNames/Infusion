// Источник данных: снимок data/data.json, обновляемый GitHub Actions.
// Если сети нет, берём последнюю удачную копию из localStorage.
// Выбранные персонажем навыки лежат в localStorage (infusion.char → skills: [{ id, level }]).
const CACHE = 'infusion.db';
const SNAPSHOT = 'data/data.json';

const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE)); } catch { return null; } };
const writeCache = (d) => { try { localStorage.setItem(CACHE, JSON.stringify(d)); } catch { /* кэш не обязателен */ } };

export async function loadData({ force = false } = {}) {
  const cached = readCache();
  try {
    const r = await fetch(force ? `${SNAPSHOT}?t=${Date.now()}` : SNAPSHOT, { cache: force ? 'no-store' : 'default' });
    if (!r.ok) throw new Error(`${SNAPSHOT}: ${r.status}`);
    const data = await r.json();
    writeCache(data);
    return { ...data, source: 'снимок data/data.json' };
  } catch (e) {
    if (cached) return { ...cached, source: 'кэш браузера (без сети)' };
    throw e;
  }
}
