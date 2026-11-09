// node tests/smoke.test.mjs — рисует все вкладки на данных data.json и проверяет расчёты персонажа.
import { readFileSync } from 'node:fs';
import { indexData } from '../js/core/util.js';
import { blankChar } from '../js/core/storage.js';
import { derive } from '../js/character/derive.js';
import * as databases from '../js/views/databases.js';
import * as character from '../js/views/character.js';
import * as utilities from '../js/views/utilities.js';
import { partsOf } from '../js/modules/autoshop/parts.js';

const d = indexData(JSON.parse(readFileSync(new URL('../data/data.json', import.meta.url), 'utf8')));
let fail = 0;
const check = (name, ok, info = '') => { if (!ok) fail++; console.log(`${ok ? 'ok ' : 'ОШИБКА'} ${name} ${info}`); };

const c = blankChar();
Object.assign(c.stats, { strength: 5, dexterity: 9, intelligence: 7, will: 7, charisma: 3, perception: 9, technique: 6, luck: 7, constitution: 5 });
c.rank = 9;
c.skills = d.skills.slice(0, 3).map((s) => ({ id: s.id, level: 5 }));
c.abilities = [d.abilities[0].id, null, d.abilities[80].id];
c.pockets = d.items.slice(0, 6).map((i) => ({ id: i.id, qty: 2 }));
c.equipment = [d.items.find((i) => i.tag === 'Acs').id];
c.implants = [d.items.find((i) => i.tag === 'H').id];
c.repository = d.cards.slice(0, 2).map((x) => ({ id: x.id, qty: 1 }));
c.overrides.hpMax = 999;

const r = derive(c, d);
check('очки = -2', r.freePoints.value === -2, r.freePoints.value);
check('Кронос ранга 9 = 2000', r.kronosMax.value === 2000);
check('ручное ОЗ перекрывает расчёт (авто 305)', r.hpMax.value === 999 && r.hpMax.auto === 305 && r.hpMax.overridden);
check('щепки считаются', r.shardsTotal > 0, r.shardsTotal);
check('лимит навыков = 4 × ранг', r.skillLimit === 36 && r.skillCount === 3, `${r.skillCount}/${r.skillLimit}`);

const c2 = blankChar();
c2.rank = 2;
c2.stats.strength = 5;
const hard = d.skills.find((s) => s.stat === 'strength' && s.tier > 5);
c2.skills = [{ id: hard.id, level: 1 }];
const r2 = derive(c2, d);
check('нехватка характеристики отмечена', !!r2.statIssues.strength && !r2.skills[0].available, JSON.stringify(r2.statIssues));
check('лимит навыков для ранга 2 = 8', r2.skillLimit === 8, r2.skillLimit);

const ctx = { data: d, char: c, save() {}, rerender() {}, setData() {} };
for (const [name, html] of [['база: предметы', databases.render(ctx)], ['персонаж', character.render(ctx)], ['утилиты', utilities.render(ctx)]]) {
  check(`${name}: нет undefined/NaN`, !/undefined|NaN|\[object/.test(html), `${Math.round(html.length / 1024)} КБ`);
}
const html2 = character.render({ ...ctx, char: c2 });
check('навык и характеристика подсвечены', html2.includes('badline') && html2.includes('stat-bad'));
check('описание навыка раскрывается кликом', html2.includes('data-skill=') && html2.includes('<details'));
check('общая сумма щепок выведена', html2.includes('Щепки:'));
check('деталей техники', partsOf(d).length === 164, partsOf(d).length);
console.log(fail ? `Ошибок: ${fail}` : 'Всё в порядке');
process.exit(fail ? 1 : 0);
