// Когда запись удаляют из базы, ссылки на неё остаются в сохранённой карточке,
// гараже и роботах. Рендер их молча игнорирует, поэтому мусор копится незаметно.
// Здесь ссылки вычищаются по свежим справочникам; операцию можно откатить.
import { saveChar } from './storage.js';
import { canonId } from './ids.js';
import { G, saveGarage } from '../modules/autoshop/store.js';
import { R, saveRobots } from '../modules/robots/store.js';

const setOf = (rows) => new Set((Array.isArray(rows) ? rows : []).map((x) => x.id));
const valid = (set, id) => !id || set.has(canonId(id));
const restore = (target, source) => {
  for (const k of Object.keys(target)) delete target[k];
  Object.assign(target, JSON.parse(JSON.stringify(source)));
};

// Возвращает {total, text, undo} или null, если чистить было нечего.
export function pruneMissing(ctx) {
  const d = ctx?.data, c = ctx?.char;
  if (!d || !c || !Array.isArray(d.items)) return null;

  const items = setOf(d.items), cards = setOf(d.cards), skills = setOf(d.skills);
  const abilities = setOf(d.abilities), traits = setOf(d.traits), essences = setOf(d.essences);
  const races = setOf(d.races), beasts = setOf(d.beasts);
  const beforeChar = JSON.parse(JSON.stringify(c));
  const beforeGarage = JSON.parse(JSON.stringify(G));
  const beforeRobots = JSON.parse(JSON.stringify(R));
  const counts = {};
  const bump = (group, n) => { if (n) counts[group] = (counts[group] || 0) + n; };
  const countDiff = (group, was, now) => bump(group, was - now);

  // Карточка персонажа.
  let was;
  for (const [key, set, group] of [['race', races, 'раса'], ['trait', traits, 'черта'], ['essence', essences, 'сущность']]) {
    if (c[key] && !valid(set, c[key])) { c[key] = null; bump(group, 1); }
  }
  was = (c.skills || []).length;
  if (Array.isArray(c.skills)) c.skills = c.skills.filter((s) => s && valid(skills, s.id));
  countDiff('навыки', was, (c.skills || []).length);

  if (Array.isArray(c.abilities)) {
    was = c.abilities.filter(Boolean).length;
    c.abilities = c.abilities.map((id) => (id && !valid(abilities, id) ? null : id));
    countDiff('способности', was, c.abilities.filter(Boolean).length);
  }
  for (const [key, group] of [['pockets', 'хранилище'], ['repository', 'репозиторий']]) {
    if (!Array.isArray(c[key])) continue;
    const set = key === 'pockets' ? items : cards;
    was = c[key].length;
    c[key] = c[key].filter((e) => e && valid(set, e.id));
    countDiff(group, was, c[key].length);
  }
  for (const [key, group] of [['equipment', 'экипировка'], ['implants', 'импланты'], ['clinicImplants', 'клиника']]) {
    if (!Array.isArray(c[key])) continue;
    was = c[key].length;
    c[key] = c[key].filter((id) => valid(items, id));
    countDiff(group, was, c[key].length);
  }
  if (Array.isArray(c.beasts)) {
    was = c.beasts.length;
    c.beasts = c.beasts.filter((id) => valid(beasts, id));
    countDiff('звери', was, c.beasts.length);
  }
  for (const key of ['storage', 'statsWeapon']) {
    if (c[key] && !valid(items, c[key])) { c[key] = null; bump('предметы', 1); }
  }
  const toggles = c.statsToggles;
  for (const group of ['sources', 'effects']) {
    if (!toggles?.[group] || typeof toggles[group] !== 'object') continue;
    for (const key of Object.keys(toggles[group])) {
      const m = /0x[0-9a-f]+/i.exec(key);
      if (m && !items.has(canonId(m[0]))) { delete toggles[group][key]; bump('статы', 1); }
    }
  }

  // Гараж: детали сборок и текущее ОЗ деталей хранятся по ID предмета.
  for (const v of G.vehicles || []) {
    const b = v.build || {};
    for (const key of ['body', 'wheels', 'engine']) {
      if (b[key] && !valid(items, b[key])) { b[key] = null; bump('транспорт', 1); }
    }
    for (const key of ['weapons', 'modules']) {
      if (!Array.isArray(b[key])) continue;
      was = b[key].filter(Boolean).length;
      b[key] = b[key].map((id) => (id && !valid(items, id) ? null : id));
      countDiff('транспорт', was, b[key].filter(Boolean).length);
    }
    for (const key of Object.keys(b.partHp || {})) {
      if (!items.has(canonId(key))) { delete b.partHp[key]; bump('транспорт', 1); }
    }
  }

  // Роботы: основа, оружие и модули — тоже ID предметов.
  for (const r of R.robots || []) {
    if (r.base && !valid(items, r.base)) { r.base = null; bump('роботы', 1); }
    for (const key of ['weapons', 'modules']) {
      if (!Array.isArray(r[key])) continue;
      was = r[key].filter(Boolean).length;
      r[key] = r[key].map((id) => (id && !valid(items, id) ? null : id));
      countDiff('роботы', was, r[key].filter(Boolean).length);
    }
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!total) return null;
  saveChar(c); saveGarage(G); saveRobots(R);
  const undo = () => {
    restore(c, beforeChar);
    Object.assign(G, JSON.parse(JSON.stringify(beforeGarage)));
    Object.assign(R, JSON.parse(JSON.stringify(beforeRobots)));
    saveChar(c); saveGarage(G); saveRobots(R);
  };
  return { total, text: Object.entries(counts).map(([k, n]) => `${k}: ${n}`).join(', '), undo };
}
