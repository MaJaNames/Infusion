// Источник данных: Supabase → кэш браузера → data/data.json.
import config from '../../config.js';
const CACHE = 'infusion.db';
const TABLES = ['items', 'cards', 'ranks', 'races', 'classes', 'stats', 'skills', 'abilities', 'beasts', 'traits', 'essences', 'slots', 'implant_combos', 'formulas'];
const ORDER = { ranks: 'level', classes: 'name', stats: 'key', slots: 'tag', implant_combos: 'name', formulas: 'key' };
const headers = { apikey: config.SUPABASE_ANON_KEY, Authorization: `Bearer ${config.SUPABASE_ANON_KEY}` };

async function rest(path, pages = false) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${config.SUPABASE_URL}/rest/v1/${path}`, { headers: pages ? { ...headers, 'Range-Unit': 'items', Range: `${from}-${from + 999}` } : headers });
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    const part = await r.json();
    if (!pages) return part;
    rows.push(...part);
    if (part.length < 1000) return rows;
  }
}
const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE)); } catch { return null; } };
const writeCache = (d) => { try { localStorage.setItem(CACHE, JSON.stringify(d)); } catch { /* кэш не обязателен */ } };

export async function loadData({ force = false } = {}) {
  const cached = readCache();
  if (config.SUPABASE_URL) {
    try {
      const version = (await rest('meta?key=eq.data_version&select=value'))[0].value;
      if (!force && cached?.version === version) return { ...cached, source: 'кэш браузера (актуален)' };
      const data = { version };
      await Promise.all(TABLES.map(async (t) => { data[t] = await rest(`${t}?select=*&order=${ORDER[t] || 'id'}`, true); }));
      writeCache(data);
      return { ...data, source: 'Supabase' };
    } catch (e) { console.warn('Supabase недоступен:', e); }
  }
  if (cached) return { ...cached, source: 'кэш браузера (без сети)' };
  return { ...(await (await fetch('data/data.json')).json()), source: 'data/data.json' };
}
