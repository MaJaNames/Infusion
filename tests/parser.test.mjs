// node tests/parser.test.mjs — сверка парсера со значениями, которые посчитал лист «Бэкенд-Кочевник».
import { readFileSync } from 'node:fs';
import { parsePart } from '../js/modules/autoshop/parser.js';
const rows = JSON.parse(readFileSync(new URL('./fixtures/backend-kochevnik.json', import.meta.url), 'utf8'));
const MAP = { hp: 'ОЗ', defP: 'Деф(П)', evasion: 'УКЛ', speed: 'Скороход', screen: 'Экран', seats: 'Места', weaponSlots: 'Оружие', heavySlots: 'Оружие(СТ)',
  flight: 'Полет', cd: 'КД', act: 'АКТ', atk: 'АТК', accuracy: 'ТЧН', ksh: 'КШ', avx: 'АВХ', kc: 'КЦ', extraHp: 'Доп.ХП' };
let bad = 0, checks = 0;
for (const r of rows) {
  const p = parsePart(r['Параметры']);
  for (const [k, col] of Object.entries(MAP)) { checks++; if (p[k] !== Number(r[col] ?? 0)) { bad++; if (bad <= 15) console.log(`≠ ${r['Название']} | ${k}: парсер ${p[k]}, лист ${r[col]}`); } }
  checks++; if (String(p.range) !== String(r['Дист'] ?? 0)) { bad++; if (bad <= 15) console.log(`≠ ${r['Название']} | range: ${p.range} vs ${r['Дист']}`); }
}
console.log(`${rows.length} деталей, ${checks} проверок, расхождений: ${bad}`);
process.exit(bad ? 1 : 0);
