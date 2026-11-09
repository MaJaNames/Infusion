// Проверка базы: node tools/validate.mjs [путь/к/персонажу.json ...]
import { readFileSync, readdirSync } from 'node:fs';
import { indexDb, derive } from '../character/calc.js';
const J = (p) => JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const rules = Object.fromEntries(readdirSync(new URL('../rules/', import.meta.url)).map((f) => [f.replace('.json', ''), J('rules/' + f)]));
const items = J('items/items.json'), cards = J('cards/cards.json');
let errors = 0; const err = (m) => { errors++; console.error('ОШИБКА:', m); };
for (const [name, list] of [['items', items], ['cards', cards], ['skills', rules.skills], ['abilities', rules.abilities], ['traits', rules.traits]]) {
  const seen = new Set();
  for (const x of list) { if (!x.id) err(`${name}: запись без id (${x.name})`); else if (seen.has(x.id)) err(`${name}: повторяется id ${x.id}`); seen.add(x.id); }
}
const db = indexDb({ items, cards, rules });
const files = process.argv.slice(2).length ? process.argv.slice(2) : ['character/example-takane-aki.json'];
for (const f of files) {
  const c = JSON.parse(readFileSync(f.startsWith('/') ? f : new URL('../' + f, import.meta.url), 'utf8'));
  const need = (map, id, what) => { if (!map.has(id)) err(`${f}: ${what} «${id}» нет в базе`); };
  need(db.ranks, c.rank, 'ранг'); if (c.trait) need(db.traits, c.trait, 'черта');
  if (!rules.classes.includes(c.class)) err(`${f}: класс «${c.class}» не из списка`);
  c.skills.forEach((s) => need(db.skills, s.skill, 'навык')); c.abilities.forEach((a) => need(db.abilities, a.ref, 'способность'));
  for (const k of ['equipment', 'implants', 'pockets']) c[k].forEach((e) => need(db.items, e.item, 'предмет'));
  (c.repository || []).forEach((e) => need(db.cards, e.card, 'карта'));
  if (!errors) { const d = derive(c, db); console.log(`${c.identity.name}: очки ${d.freePoints.value}, ОЗ ${d.hpMax.value}, Кронос ${d.kronosMax.value}, щепки ${d.shardsTotal}`);
    console.log('  слоты снаряжения:', d.gearSlots.filter((s) => s.used).map((s) => `${s.tag} ${s.used}/${s.limit} ${s.status}`).join('; '));
    console.log('  слоты имплантов:', d.implantSlots.filter((s) => s.used).map((s) => `${s.tag} ${s.used}/${s.limit} ${s.status}`).join('; ')); }
}
console.log(errors ? `Найдено ошибок: ${errors}` : `Порядок: ${items.length} предметов, ${cards.length} карт.`);
process.exit(errors ? 1 : 0);
