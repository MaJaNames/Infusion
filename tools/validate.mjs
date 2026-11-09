// Проверка базы и карточек персонажей: node tools/validate.mjs [путь/к/персонажу.json ...]
import { readFileSync } from 'node:fs';
import { indexData } from '../js/core/util.js';
import { derive } from '../js/character/derive.js';

const J = (p) => JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const data = indexData(J('data/data.json'));
let errors = 0;
const err = (m) => { errors++; console.error('ОШИБКА:', m); };

const catalogues = [
  ['items', data.items, (x) => x.id], ['cards', data.cards, (x) => x.id], ['skills', data.skills, (x) => x.id],
  ['abilities', data.abilities, (x) => x.id], ['beasts', data.beasts, (x) => x.id], ['traits', data.traits, (x) => x.id],
  ['essences', data.essences, (x) => x.id], ['ranks', data.ranks, (x) => x.level], ['races', data.races, (x) => x.id],
  ['classes', data.classes, (x) => x.name], ['stats', data.stats, (x) => x.key], ['slots', data.slots, (x) => x.tag],
  ['implant_combos', data.implant_combos, (x) => x.name],
];
for (const [name, list, idOf] of catalogues) {
  const seen = new Set();
  for (const x of list) {
    const id = idOf(x);
    if (id === undefined || id === null || id === '') err(`${name}: запись без id (${x.name || '?'})`);
    else if (seen.has(id)) err(`${name}: повторяется id ${id}`);
    seen.add(id);
  }
}
for (const s of data.skills) if (!data.statMap.has(s.stat)) err(`навык «${s.name}»: нет характеристики ${s.stat}`);
for (const s of data.slots) if (!['gear', 'implant'].includes(s.grp)) err(`слот ${s.tag}: неизвестная группа ${s.grp}`);

const files = process.argv.slice(2);
if (!files.length) {
  console.log(`Порядок: ${data.items.length} предметов, ${data.cards.length} карт, ${data.skills.length} навыков.`);
  process.exit(errors ? 1 : 0);
}
for (const f of files) {
  const c = JSON.parse(readFileSync(f, 'utf8'));
  const need = (map, id, what) => { if (!map.has(id)) err(`${f}: ${what} «${id}» нет в базе`); };
  if (!data.rankMap.has(Number(c.rank))) err(`${f}: ранг «${c.rank}» не из списка`);
  if (c.race) need(data.raceMap, c.race, 'раса');
  if (c.trait) need(data.traitMap, c.trait, 'черта');
  if (c.essence) need(data.essenceMap, c.essence, 'сущность');
  if (c.class && !data.classes.some((x) => x.name === c.class)) err(`${f}: класс «${c.class}» не из списка`);
  (c.skills || []).forEach((s) => need(data.skillMap, s.id, 'навык'));
  (c.abilities || []).forEach((a) => a && need(data.abilityMap, a, 'способность'));
  for (const k of ['equipment', 'implants']) (c[k] || []).forEach((id) => need(data.itemMap, id, 'предмет'));
  (c.pockets || []).forEach((e) => need(data.itemMap, e.id, 'предмет'));
  (c.repository || []).forEach((e) => need(data.cardMap, e.id, 'карта'));
  if (!errors) {
    const d = derive(c, data);
    console.log(`${c.name || 'без имени'}: очки ${d.freePoints.value}, ОЗ ${d.hpMax.value}, Кронос ${d.kronosMax.value}, щепки ${d.shardsTotal}, навыки ${d.skillCount}/${d.skillLimit}`);
  }
}
console.log(errors ? `Найдено ошибок: ${errors}` : 'Всё в порядке');
process.exit(errors ? 1 : 0);
