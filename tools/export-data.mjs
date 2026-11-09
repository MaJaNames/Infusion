// Скачивает таблицы из Supabase и пишет data/data.json — снимок для работы без сети.
// Запускается GitHub Action'ом раз в сутки; ключи берутся из секретов репозитория.
import { writeFileSync } from 'node:fs';
const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
const BASE = String(SUPABASE_URL || '').replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
const H = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Range-Unit': 'items' };
const ORDER = { items: 'id', cards: 'id', ranks: 'level', races: 'id', classes: 'name', stats: 'key', skills: 'id', abilities: 'id', beasts: 'id', traits: 'id', essences: 'id', slots: 'tag', implant_combos: 'name' };
async function table(t) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${BASE}/rest/v1/${t}?select=*&order=${ORDER[t]}`, { headers: { ...H, Range: `${from}-${from + 999}` } });
    if (!r.ok) throw new Error(`${t}: ${r.status} ${await r.text()}`);
    const part = await r.json(); rows.push(...part); if (part.length < 1000) return rows;
  }
}
const meta = await (await fetch(`${BASE}/rest/v1/meta?key=eq.data_version&select=value`, { headers: H })).json();
const data = { version: meta[0].value };
for (const t of Object.keys(ORDER)) data[t] = await table(t);
writeFileSync(new URL('../data/data.json', import.meta.url), JSON.stringify(data));
console.log('Снимок обновлён, версия', data.version);
