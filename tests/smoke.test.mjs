// node tests/smoke.test.mjs — рисует все вкладки на данных data.json и проверяет расчёты персонажа.
import { readFileSync } from 'node:fs';
import { indexData, optLabel, num, esc } from '../js/core/util.js';
import { fuzzyScore } from '../js/core/fuzzy.js';
import { probability, targetFromVer, verFromTarget } from '../js/core/probability.js';
import { blankChar, normChar, charToCode, codeToChar } from '../js/core/storage.js';
import { loadData, getSourcePreference, setSourcePreference, SOURCE_LIVE, SOURCE_SNAPSHOT } from '../js/core/data-source.js';
import { derive } from '../js/character/derive.js';
import { evalStatFormula, parseStatEffects, isWeaponItem, collectCharacterStats, CHAR_STAT_ORDER } from '../js/character/stats.js';
import { classAllowed, RULES, RO_FACTIONS, RO_VALUES, RO_MIN, RO_MAX, RO_STATUS, blankRO, blankROStatus, roRank, normalizeROStatus, bmetLimit, BEAST_SLOTS, ROBOT_IMPLANTS } from '../js/character/rules.js';
import { helpBlock } from '../js/core/help.js';
import { permalinkPath, hashRoute, permalinkUrl } from '../js/core/links.js';
import { collectEntries, describe, renderPage } from '../tools/build-pages.mjs';
import * as databases from '../js/views/databases.js';
import * as character from '../js/views/character.js';
import * as utilities from '../js/views/utilities.js';
import * as settings from '../js/views/settings.js';
import * as shop from '../js/modules/autoshop/view.js';
import { partsOf } from '../js/modules/autoshop/parts.js';
import { parsePart } from '../js/modules/autoshop/parser.js';
import { summarize } from '../js/modules/autoshop/aggregate.js';
import { G, importGarage, normGarage, currentVehicle, blankBuild } from '../js/modules/autoshop/store.js';
import * as robotsView from '../js/modules/robots/view.js';
import { R as robotStore, normRobot, importRobots } from '../js/modules/robots/store.js';
import { robotRequirement, availableCount, robotStats, robotMissing, moduleChecked, moduleIsActive, moduleEnabled } from '../js/modules/robots/parts.js';

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
const invHtml = character.render(ctx);
check('инвентарь: подвкладки и сводка', ['Хранилище', 'Экипировка', 'Импланты', 'Репозиторий', 'Сумма:', 'Продажа:'].every((x) => invHtml.includes(x)));
check('инвентарь: сортировка по параметрам', invHtml.includes('data-sort="pockets"') && invHtml.includes('Количество') && invHtml.includes('Цена продажи'));
check('инвентарь: сортировка по ID по умолчанию', invHtml.includes('<option value="id" selected>ID</option>'));
check('инвентарь: добавление через dropdown', invHtml.includes('data-search="pockets"') && invHtml.includes('data-in="pockets"') && invHtml.includes('<optgroup') && !invHtml.includes('<datalist'));
check('инвентарь: комбобокс с поиском внутри', invHtml.includes('data-combo="pockets"') && invHtml.includes('data-combo-search="pockets"') && invHtml.includes('class="combo-pop"') && invHtml.includes('data-combo-list="pockets"'));
const comboTexts = [...invHtml.matchAll(/data-combo-opt="[^"]*">([^<]*)<\/button>/g)].map((m) => m[1]);
check('комбобокс: список не дублируется в HTML', comboTexts.length === 0);
check('способности: комбобокс с поиском', invHtml.includes('data-combo="abilities.0"') && invHtml.includes('class="grow ability-native" data-p="abilities.0"') && invHtml.includes(`Способность: ${d.abilities[0].name}`));
const abilitySelect = invHtml.match(/<select class="grow ability-native"[\s\S]*?<\/select>/)?.[0] || '';
const abilityGroups = [...abilitySelect.matchAll(/<optgroup label="([^"]+)"/g)].map((m) => m[1]);
check('способности: группы «Общие → класс → Мутации → другие классы»', abilityGroups.join(' → ') === 'Общие → Соло → Мутации → Другие классы', abilityGroups.join(' → '));
check('инвентарь: мобильные подвкладки', invHtml.includes('data-itab-select'));
check('хранилище: слот [K], база 20 и счётчик позиций', blankChar().storage === null && RULES.pocketLimit === 20 && invHtml.includes('data-p="storage"') && invHtml.includes('Позиций: 12 / 20'));
const storageItem = d.items.find((i) => i.tag === 'K' && /вер\. 1$/.test(i.name));
const pocketsWithK = [...c.pockets, { id: storageItem.id, qty: 1 }];
const invHasK = character.render({ ...ctx, char: { ...c, pockets: pocketsWithK } });
const invStorage = character.render({ ...ctx, char: { ...c, pockets: pocketsWithK, storage: storageItem.id } });
check('хранилище: [K] вер. 1 даёт +30 мест', invStorage.includes('Позиций: 13 / 50') && invStorage.includes('Бонус: +30 мест'));
check('хранилище: [K] без установки не даёт бонус', invHasK.includes('Позиций: 13 / 20'));
check('хранилище: слот [K] берёт предметы из хранилища', invHtml.includes('Сначала добавьте [K] в хранилище') && invStorage.includes('[K] Хранилище вер. 1'));
const pocketSelect = invHtml.match(/<select data-in="pockets"[\s\S]*?<\/select>/)?.[0] || '';
check('хранилище: [K] добавляется через обычный список', pocketSelect.includes('[Acs]') && pocketSelect.includes('[K]') && pocketSelect.includes('Хранилище вер. 1'));
const equipSelect = invStorage.match(/<select data-in="equipment"[\s\S]*?<\/select>/)?.[0] || '';
check('хранилище: [K] не предлагается для экипировки', !equipSelect.includes('[K]'));
const itemCost = (id) => d.itemMap.get(id)?.cost || 0;
const expectedSum = c.pockets.reduce((a, e) => a + itemCost(e.id) * (e.qty || 0), 0)
  + c.implants.reduce((a, id) => a + itemCost(id), 0)
  + c.repository.reduce((a, e) => a + (d.cardMap.get(e.id)?.price_tali || 0) * (e.qty || 0) * RULES.taliToCredits, 0);
check('сумма: хранилище + импланты + репозиторий', invHtml.includes(`Сумма: ${num(expectedSum)}`) && expectedSum === 10900, expectedSum);
check('сумма: 1 Тали = 10 кредитов', RULES.taliToCredits === 10 && invHtml.includes('1 Тали = 10 кредитов'));
const summaryHtml = invHtml.match(/<div class="chips inv-summary">([\s\S]*?)<\/div>/)?.[1] || '';
check('сводка карт: только суммарные тали', summaryHtml.includes('Карты: 70 тали') && !summaryHtml.includes('Кронос'), summaryHtml);
const invGear = character.render({ ...ctx, char: { ...c, equipment: ['0x0e7'] } });
check('сумма: экипировка не входит', invGear.includes(`Сумма: ${num(expectedSum)}`) && !invGear.includes(`Сумма: ${num(expectedSum + 1300)}`));
const implantItem = d.items.find((i) => i.category === 'Имплант');
const implantStored = character.render({ ...ctx, char: { ...blankChar(), pockets: [{ id: implantItem.id, qty: 1 }], implants: [implantItem.id] } });
check('импланты: установленный не занимает место и не дублируется', implantStored.includes('Позиций: 0 / 20') && implantStored.includes(`Сумма: ${num(implantItem.cost || 0)}`));
check('хранилище: без ручной цены продажи и глобальной клиники', !invHtml.includes('overrides.sellPrice') && blankChar().overrides.sellPrice === undefined && blankChar().clinic === undefined && Array.isArray(blankChar().clinicImplants));
const clinicItem = d.items.find((i) => i.category === 'Имплант' && RULES.clinicCost[i.rarity]);
const clinicBase = { ...blankChar(), race: '0x002', class: 'Соло', implants: [clinicItem.id] };
const clinicOff = character.render({ ...ctx, char: clinicBase });
const clinicOn = character.render({ ...ctx, char: { ...clinicBase, clinicImplants: [clinicItem.id] } });
const clinicInstall = RULES.clinicCost[clinicItem.rarity];
const clinicSell = clinicItem.sell_price ?? Math.round((clinicItem.cost || 0) * RULES.sellPriceRate);
check('клиника: установка входит в цену импланта и сумму, но не в продажу', clinicOff.includes(`Сумма: ${num(clinicItem.cost || 0)}`) && clinicOn.includes(`Сумма: ${num((clinicItem.cost || 0) + clinicInstall)}`) && clinicOn.includes(`Продажа: ${num(clinicSell)}`) && !clinicOn.includes('Клиника: +'));
const clinicItems = d.items.filter((i) => i.category === 'Имплант' && RULES.clinicCost[i.rarity]).slice(0, 2);
const mixedSum = clinicItems.reduce((a, i) => a + (i.cost || 0), 0) + RULES.clinicCost[clinicItems[0].rarity];
const bothSum = mixedSum + RULES.clinicCost[clinicItems[1].rarity];
const mixedClinic = character.render({ ...ctx, char: { ...blankChar(), race: '0x002', class: 'Соло', implants: clinicItems.map((i) => i.id), clinicImplants: [clinicItems[0].id] } });
check('клиника: установка только у отмеченного импланта', mixedClinic.includes(`Сумма: ${num(mixedSum)}`) && !mixedClinic.includes(`Сумма: ${num(bothSum)}`));
check('карточка предмета: количество и состояние раскрытия', (() => {
  const html = databases.itemRow(d.items[0], '', { qty: 4, openKey: 'pockets.0x001', open: true });
  return html.includes('<small>Кол-во: 4</small>') && html.includes('data-row="pockets.0x001"') && html.includes(' open>');
})());
check('карточка карты: количество и состояние раскрытия', (() => {
  const html = databases.cardRow(d.cards[0], '', { qty: 3, openKey: 'repository.0x001', open: true });
  return html.includes('<small>Кол-во: 3</small>') && html.includes('data-row="repository.0x001"') && html.includes(' open>');
})());
const STAT_ORDER = ['strength', 'dexterity', 'intelligence', 'will', 'charisma', 'perception', 'technique', 'luck', 'constitution'];
const statPos = STAT_ORDER.map((k) => invHtml.indexOf(`data-p="stats.${k}"`));
check('характеристики: нужный порядок', statPos.every((p, i) => p >= 0 && (i === 0 || p > statPos[i - 1])));
check('характеристики: значения 1–10', STAT_ORDER.every((k) => invHtml.includes(`min="1" max="10" step="1" data-p="stats.${k}"`)));
const dbHtml = databases.render(ctx);
check('база: раздел «Детали Кочевника»', dbHtml.includes('Детали Кочевника') && !dbHtml.includes('Детали техники'));
check('база: раздел «Справочник»', dbHtml.includes('Справочник') && !dbHtml.includes('Сводки правил'));
check('база: сортировка по параметрам', dbHtml.includes('data-sort="items"') && dbHtml.includes('Сортировка'));
check('база: сортировка по ID по умолчанию', dbHtml.includes('<option value="id" selected>ID</option>'));
check('база: мобильные вкладки и лист фильтров', dbHtml.includes('data-tab-select') && dbHtml.includes('data-filters-panel') && dbHtml.includes('data-filters-open'));
check('база: фильтры по категории и организации, без тега', dbHtml.includes('data-k="category"') && dbHtml.includes('data-k="organization"') && !dbHtml.includes('data-k="tag"'));
check('база: нет сортировки по проблеме оформления', !dbHtml.includes('Проблема оформления') && !dbHtml.includes('value="issue"'));
check('база: цена с иконкой кредитов', dbHtml.includes('assets/icons/croncred.webp'));
check('база: цена продажи — мелким текстом без «продажа» и «+»', (() => {
  const it = d.items.find((i) => i.sell_price != null) || d.items.find((i) => i.cost > 0);
  const value = it.sell_price ?? Math.round(it.cost * RULES.sellPriceRate);
  const html = databases.itemRow(it);
  return html.includes(`<small class="sell"><span class="money">`) && html.includes(`>${num(value)}</span>`) && !html.includes('продажа') && !html.includes('>+');
})());
check('база: цена карт без «+»', !databases.cardRow(d.cards.find((x) => x.price_tali) || d.cards[0]).includes('>+'));
const dbList = { html: '', insertAdjacentHTML(_pos, html) { this.html += html; } };
const dbSentinel = { innerHTML: '' };
const dbRes = { innerHTML: '', querySelector: (s) => (s === '.list' ? dbList : null) };
const dbRoot = { addEventListener() {}, querySelector: (s) => (s === '#res' ? dbRes : s === '[data-more-sentinel]' ? dbSentinel : null) };
databases.bind(dbRoot, ctx);
const clickDbTab = (tab) => dbRoot.onclick({ target: { closest: (s) => (s === '[data-tab]' ? { dataset: { tab } } : null) } });
clickDbTab('cards');
const cardsDb = databases.render(ctx);
check('база: у карт фильтры по классу, школе и сущности', ['classes', 'school', 'essence', 'creation', 'consumable', 'iconic'].every((k) => cardsDb.includes(`data-k="${k}"`)));
check('база: цена карт с иконкой тали', cardsDb.includes('assets/icons/tali.webp'));
check('база: галочка «Показывать ID» в фильтрах', cardsDb.includes('data-show-ids') && cardsDb.includes('Показывать ID') && !dbRes.innerHTML.includes('row-id'));
dbRoot.onchange({ target: { dataset: { showIds: '' }, checked: true } });
check('база карт: ID из БД показываются по галочке', dbRes.innerHTML.includes('row-id')
  && d.cards.some((c) => dbRes.innerHTML.includes(`ID ${c.id}`)));
dbRoot.onchange({ target: { dataset: { showIds: '' }, checked: false } });
check('база: ID снова скрываются', !dbRes.innerHTML.includes('row-id'));
clickDbTab('parts');
const partsDb = databases.render(ctx);
check('база: у деталей фильтры по типу и организации', partsDb.includes('data-k="kind"') && partsDb.includes('data-k="organization"'));
clickDbTab('rules');
const rulesDb = databases.render(ctx);
check('справочник: разделы «Константы», «Способности», «Зверь», «Черта», «Навыки»', ['Константы', 'Способности', 'Зверь', 'Черта', 'Навыки'].every((x) => rulesDb.includes(`>${x}<`)));
check('справочник: подразделы «Ранги» и «Сущности»', rulesDb.includes('>Ранги<') && rulesDb.includes('>Сущности<'));
check('справочник: фильтры, сортировка и бесконечная лента', rulesDb.includes('data-k="group"') && rulesDb.includes('data-k="sub"') && rulesDb.includes('data-sort="rules"') && rulesDb.includes('data-more="rules"') && rulesDb.includes('data-more-sentinel') && !rulesDb.includes('data-pager'));
dbRoot.onchange({ target: { dataset: { showIds: '' }, checked: true } });
check('справочник: ID из БД показываются по галочке', dbRes.innerHTML.includes('row-id')
  && d.essences.some((e) => dbRes.innerHTML.includes(`ID ${e.id}`)));
dbRoot.onchange({ target: { dataset: { showIds: '' }, checked: false } });
dbRoot.onchange({ target: { dataset: { k: 'group' }, value: '' } });
const initialRules = (dbRes.innerHTML.match(/<details/g) || []).length;
dbRoot.onclick({ target: { closest: (s) => (s === '[data-more]' ? { dataset: { more: 'rules' } } : null) } });
const appendedRules = (dbList.html.match(/<details/g) || []).length;
check('справочник: «Показать ещё» догружает порцию', initialRules === 30 && appendedRules === 30, `${initialRules} + ${appendedRules}`);
check('справочник: счётчик показывает прогресс ленты', dbSentinel.innerHTML.includes('Показано 60 из 267'), dbSentinel.innerHTML);
clickDbTab('items');
dbRes.innerHTML = '';
dbRoot.onchange({ target: { dataset: { k: 'organization' }, value: 'Хиллз' } });
const hillz = d.items.filter((i) => i.organization === 'Хиллз').length;
check('база: фильтр по организации работает', dbRes.innerHTML.includes(`Найдено: ${hillz}`), hillz);
check('база: в описании нет порядкового номера строки', !/<div class="body">\s*\d/.test(dbRes.innerHTML), dbRes.innerHTML.match(/<div class="body">\s*\d/)?.[0]);
dbRoot.onchange({ target: { dataset: { showIds: '' }, checked: true } });
check('база предметов: ID из БД показываются по галочке', dbRes.innerHTML.includes('row-id')
  && d.items.some((i) => dbRes.innerHTML.includes(`ID ${i.id}`)));
dbRoot.onchange({ target: { dataset: { showIds: '' }, checked: false } });

// Нечёткий поиск: часть слова, опечатка и порядок по точности.
check('fuzzy: часть слова, опечатка и отсутствие совпадений', fuzzyScore('рем', 'D.P.L Рем-перчатка') > 0 && fuzzyScore('перчатко', 'D.P.L Рем-перчатка') > 0 && fuzzyScore('xyz', 'D.P.L Рем-перчатка') === 0);
check('fuzzy: дефис и точки в запросе', fuzzyScore('рем-перчатка', 'D.P.L Рем-перчатка') > 0 && fuzzyScore('D.P.L', 'D.P.L Рем-перчатка') === 1 && fuzzyScore('-', 'D.P.L Рем-перчатка') === 0);
clickDbTab('items');
dbRoot.oninput({ target: { dataset: { k: 'q' }, value: 'рем' } });
check('база: нечёткий поиск находит «Рем-перчатку»', dbRes.innerHTML.includes('Рем-перчатка'));
const firstHit = (dbRes.innerHTML.match(/<b>([^<]+)<\/b>/g) || [])[0] || '';
check('база: лучшие совпадения идут первыми', /Рем-перчатка/.test(firstHit), firstHit);
dbRoot.oninput({ target: { dataset: { k: 'q' }, value: 'перчатко' } });
check('база: нечёткий поиск прощает опечатку', dbRes.innerHTML.includes('Рем-перчатка'));
dbRoot.oninput({ target: { dataset: { k: 'q' }, value: '' } });

// Калькулятор вероятностей: строка 2 из xlsx.
const calcBase = probability({ stat: 7, bonus: 0, target: 81, mode: 'none' });
const calcAdv = probability({ stat: 7, bonus: 0, target: 81, mode: 'adv' });
const calcDis = probability({ stat: 7, bonus: 0, target: 81, mode: 'dis' });
check('калькулятор: пример из таблицы — 68 и 33%', calcBase.result === 68 && Math.abs(calcBase.chance - 0.33) < 1e-9, `${calcBase.result}/${calcBase.chance}`);
check('калькулятор: преимущество и помеха', Math.abs(calcAdv.chance - (1 - 0.67 ** 2)) < 1e-9 && Math.abs(calcDis.chance - 0.33 ** 2) < 1e-9, `${calcAdv.chance}/${calcDis.chance}`);
check('калькулятор: вер 15 = цель 86', targetFromVer(15) === 86 && verFromTarget(86) === 15);
utilities.setRoute('calc');
const calcHtml = utilities.render(ctx);
check('утилиты: калькулятор с полем «Вер» и без «Атаки»', ['data-calc="stat"', 'data-calc="bonus"', 'data-calc="target"', 'data-calc="ver"', 'data-calc="mode"', 'data-calc-out', 'Результат D100'].every((x) => calcHtml.includes(x)) && !calcHtml.includes('data-calc="attack"') && !calcHtml.includes('Формула'));
check('утилиты: обычный режим подсказывает про 5 × уровень', !calcHtml.includes('data-calc="skillPick"') && calcHtml.includes('5 × уровень'));

// Режим персонажа: стат из карточки, бонус навыка 5 × уровень и карточка навыка снизу.
const calcRoot = {};
utilities.bind(calcRoot, ctx);
calcRoot.oninput({ target: { dataset: { calc: 'charMode' }, type: 'checkbox', checked: true } });
calcRoot.oninput({ target: { dataset: { calc: 'source' }, type: 'select-one', value: 'skill' } });
const charCalcHtml = utilities.render(ctx);
const firstSkill = d.skills[0];
check('утилиты: режим персонажа с выбором навыка', charCalcHtml.includes('data-calc="charMode"') && charCalcHtml.includes('Режим Персонажа')
  && charCalcHtml.includes('data-calc="skillPick"') && charCalcHtml.includes(`value="${c.stats.strength}"`) && charCalcHtml.includes('value="25"'));
check('утилиты: карточка выбранного навыка внизу', charCalcHtml.includes('data-skill-card')
  && charCalcHtml.includes(firstSkill.name) && charCalcHtml.includes(firstSkill.description.slice(0, 20))
  && charCalcHtml.indexOf('data-calc-out') < charCalcHtml.indexOf('data-skill-card'));
calcRoot.oninput({ target: { dataset: { calc: 'charMode' }, type: 'checkbox', checked: false } });
const plainCalcHtml = utilities.render(ctx);
check('утилиты: без режима персонажа карточки навыка нет', !plainCalcHtml.includes('data-skill-card') && !plainCalcHtml.includes('data-calc="skillPick"'));
check('подссылки: #util/calc', utilities.currentRoute() === 'calc');
utilities.setRoute('robots');
utilities.setRoute('');
check('утилиты: пустой подраздел сохраняет последнюю вкладку', utilities.currentRoute() === 'robots');
utilities.setRoute('nomad');
databases.setRoute('cards');
check('подссылки: #db/cards', databases.currentRoute() === 'cards');
databases.setRoute('');
check('база: пустой подраздел сохраняет последнюю вкладку', databases.currentRoute() === 'cards');
databases.setRoute('items');
character.setRoute('repository');
check('подссылки: #char/repository', character.currentRoute() === 'repository');
character.setRoute('');
check('персонаж: пустой подраздел сохраняет последнюю вкладку', character.currentRoute() === 'repository');
character.setRoute('pockets');

// Прямые ссылки на записи и состояние фильтров в адресе.
databases.setRoute('items');
const deepItem = d.items[d.items.length - 1];
databases.setRoute(`items/${deepItem.id}`);
const deepDb = databases.render(ctx);
check('база: глубокая ссылка раскрывает запись', deepDb.includes(`data-row="items:${deepItem.id}" data-deep-open="1"`));
check('база: у записи есть кнопка «Поделиться»', deepDb.includes(`data-share="p/db/items/${deepItem.id}/"`));
check('база: запись по ссылке подсвечена', /class="row [a-z]+ is-permalink"/.test(deepDb));
check('база: маршрут содержит ID записи', databases.currentRoute() === `items/${deepItem.id}`);
const partItem = d.items.find((i) => i.tag === 'Tr Mod');
databases.setRoute(`parts/${partItem.id}`);
const deepPart = databases.render(ctx);
check('база: деталь делится ссылкой на предмет', deepPart.includes(`data-share="p/db/items/${partItem.id}/"`) && deepPart.includes('is-permalink'));
databases.setRoute('items');
const deepCat = d.items[0].category;
dbRoot.oninput({ target: { dataset: { k: 'q' }, value: 'тест' } });
dbRoot.onchange({ target: { dataset: { k: 'category' }, value: deepCat } });
dbRoot.onchange({ target: { dataset: { sort: 'items' }, value: 'cost' } });
const filteredRoute = databases.currentRoute();
check('база: фильтры и сортировка попадают в адрес', filteredRoute.includes('q=') && filteredRoute.includes('category=') && filteredRoute.includes('sort=cost'), filteredRoute);
databases.setRoute('cards');
databases.setRoute(filteredRoute);
const restoredDb = databases.render(ctx);
check('база: ссылка восстанавливает фильтры', restoredDb.includes('value="тест"')
  && restoredDb.includes(`value="${esc(deepCat)}" selected`) && restoredDb.includes('<option value="cost" selected>'));
databases.setRoute('items');

// Красивые пермалинки и OG-страницы.
check('пермалинки: путь и hash', permalinkPath('items', '0x001') === 'p/db/items/0x001/' && hashRoute('items', '0x001') === '#db/items/0x001');
check('пермалинки: абсолютный URL от базы', permalinkUrl('cards', '0x001', 'https://example.test/Infusion/') === 'https://example.test/Infusion/p/db/cards/0x001/');
const ogEntries = collectEntries(d);
const ogPaths = ogEntries.map((e) => e.path);
check('OG: страницы для предметов, карт и справочника', ogEntries.length === d.items.length + d.cards.length + 267, ogEntries.length);
check('OG: пермалинки уникальны', new Set(ogPaths).size === ogPaths.length);
const ogItem = ogEntries.find((e) => e.kind === 'items' && e.id === d.items[0].id);
const ogHtml = renderPage(ogItem, { url: 'https://example.test/Infusion', basePath: '/Infusion/' });
check('OG: meta, canonical и редирект', ogHtml.includes('property="og:title"') && ogHtml.includes('https://example.test/Infusion/p/db/items/')
  && ogHtml.includes('http-equiv="refresh"') && ogHtml.includes('/Infusion/#db/items/'));

// Заголовок — как в списках, описание — только текст записи.
const ogNano = ogEntries.find((e) => e.kind === 'items' && e.id === '0x1dc');
const ogNanoHtml = renderPage(ogNano, { url: 'https://example.test/Infusion', basePath: '/Infusion/' });
check('OG: заголовок [тег] Название [Р]', ogNanoHtml.includes('content="[Mod] Очищение нанитами [Р]"'), ogNano.title);
check('OG: описание без префикса и заглушки', describe(ogNano) === 'Цена: 15 000 кр · Техник\n\nПараметры: 1 АКТ\n\nЭффекты: Активный;\n\nУникальный Эффект: Модуль меха; При использовании мех снимает с себя 2 эффекта', describe(ogNano));
const ogNanoPage = renderPage(ogNano, { url: 'https://example.test/Infusion', basePath: '/Infusion/' });
check('OG: провайдер по разделу', ogNanoPage.includes('property="og:site_name" content="Инфузия · Предметы"'));
const ogIconic = ogEntries.find((e) => e.kind === 'items' && e.id === '0x0c1');
check('OG: у закрытого предмета цена, категория, организация и «культовый»',
  describe(ogIconic).startsWith('Цена: 10 000 кр · Контейнер · Чёрный Рынок · культовый\n\n'), describe(ogIconic));
const ogEmpty = { kind: 'items', id: '0x000', path: 'p/db/items/0x000/', title: 'Пусто', type: 'Предмет', description: '' };
check('OG: пустое описание не выводится',
  !renderPage(ogEmpty, { url: 'https://example.test/Infusion', basePath: '/Infusion/' }).includes('og:description'));
const ogCard = ogEntries.find((e) => e.kind === 'cards' && e.id === '0x001');
const ogCardText = describe(ogCard);
check('OG: у карты сначала параметры, потом описание', ogCardText.startsWith('Параметры: КШ 10\n')
  && ogCardText.includes('\nТип урона: ') && ogCardText.includes('\nЦена: 40 тали\nКлассы: Трансгрессор\n\nВы модулируете снаряд'), ogCardText);
const ogCardParams = ogEntries.find((e) => e.kind === 'cards' && e.id === '0x002');
check('OG: у карты без описания остаются только параметры', describe(ogCardParams).startsWith('Параметры: 5 АТК')
  && !describe(ogCardParams).includes('\n\n'), describe(ogCardParams));

// Код сборки: base64url от JSON карточки.
const charCode = charToCode(c);
check('код сборки: префикс INF1 и base64url', charCode.startsWith('INF1.') && !/[+/=]/.test(charCode.slice(5)));
const decodedChar = codeToChar(charCode);
check('код сборки: обратное преобразование', decodedChar.rank === c.rank
  && JSON.stringify(decodedChar.stats) === JSON.stringify(c.stats)
  && JSON.stringify(decodedChar.abilities) === JSON.stringify(c.abilities));
check('код сборки: повреждённый код отклоняется', (() => {
  try { codeToChar('INF1.###'); return false; } catch { return true; }
})());

// Печать: отдельный лист персонажа без инвентаря.
const printHtml = character.render(ctx).match(/<section class="print-sheet"[\s\S]*?<\/section>/)?.[0] || '';
check('печать: в листе характеристики, навыки и способности', ['Характеристики', 'Навыки', 'Способности и мутации'].every((x) => printHtml.includes(x)));
check('печать: лист без инвентаря и кнопок удаления', printHtml.length > 0 && !printHtml.includes('Инвентарь') && !printHtml.includes('data-del') && !printHtml.includes('data-a='));

check('утилиты: мобильные вкладки', utilities.render(ctx).includes('data-tab-select'));

// Автомастерская: несколько Кочевников в гараже.
if (!G.vehicles.length) {
  const first = { id: 'v-test-first', name: 'Транспорт 1', notes: '', build: blankBuild() };
  G.vehicles.push(first);
  G.active = first.id;
}
const shopRoot = { addEventListener() {} };
shop.bind(shopRoot, { ...ctx, rerender() {} });
const shopHtml = utilities.render(ctx);
check('автомастерская: гараж и переключение машин', ['garage-tabs', 'data-vehicle-select', 'data-add-vehicle', 'data-vehicle-name', 'data-del-vehicle', 'data-import-garage', 'data-garage-file', 'data-vehicle-notes'].every((x) => shopHtml.includes(x)));
check('автомастерская: у последней машины удаление доступно', shopHtml.includes('data-del-vehicle') && !/data-del-vehicle disabled/.test(shopHtml));
check('автомастерская: группы деталей и карточки итогов', ['Корпус и ходовая', 'Оружие', 'Модули', 'Скидка'].every((x) => shopHtml.includes(x)) && shopHtml.includes('class="stat-grid"') && shopHtml.includes('stat-card cost'));
check('автомастерская: выбор детали с поиском, как в «Персонаже»', ['data-combo="body"', 'data-combo-search="body"', 'class="combo-pop"', 'data-combo-list="body"', 'garage-picks'].every((x) => shopHtml.includes(x)));
const bodyParts = partsOf(d).filter((p) => p.stats.kind === 'body');
const bodySelect = shopHtml.match(/<select data-b="body"[\s\S]*?<\/select>/)?.[0] || '';
const bodyIds = [...bodySelect.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);
check('автомастерская: детали по ID, без групп редкости', bodyIds.length === bodyParts.length && bodyIds.every((id, i) => id === bodyParts[i].item.id) && !bodySelect.includes('<optgroup'), bodyIds.join(','));
check('автомастерская: выгрузка гаража и поле текущего ОЗ', shopHtml.includes('data-export-garage') && shopHtml.includes('data-b="currentHp"') && shopHtml.includes('Текущее ОЗ'));
shopRoot.onchange({ target: { dataset: { b: 'currentHp' }, value: '42', type: 'number', tagName: 'INPUT' } });
const hpHtml = utilities.render(ctx);
check('автомастерская: текущее ОЗ сохраняется и выводится', hpHtml.includes('value="42"') && hpHtml.includes('ОЗ: 42 /'));

const clickShop = (sel, dataset = {}) => shopRoot.onclick({ target: { closest: (s) => (s === sel ? { dataset } : null) } });
clickShop('[data-add-vehicle]');
let garageHtml = utilities.render(ctx);
const vehicleIds = [...garageHtml.matchAll(/data-vehicle="([^"]+)"/g)].map((m) => m[1]);
check('автомастерская: добавление второй машины', vehicleIds.length === 2 && garageHtml.includes('Транспорт 2'), vehicleIds.length);

const bodyPart = partsOf(d).find((p) => p.stats.kind === 'body');
shopRoot.onchange({ target: { dataset: { b: 'body' }, value: bodyPart.item.id, type: 'select-one', tagName: 'SELECT' } });
garageHtml = utilities.render(ctx);
check('автомастерская: деталь попала в состав второй машины', garageHtml.includes('part-slot">Кузов') && garageHtml.includes(esc(bodyPart.item.name)));
check('автомастерская: карточка детали раскрывается и принимает текущее ОЗ', garageHtml.includes(`data-part-hp="${bodyPart.item.id}"`) && garageHtml.includes('class="part-hp"'));
shopRoot.onchange({ target: { dataset: { partHp: bodyPart.item.id }, value: '17', type: 'number', tagName: 'INPUT' } });
const partHpHtml = utilities.render(ctx);
check('автомастерская: текущее ОЗ детали сохраняется', partHpHtml.includes(`data-part-hp="${bodyPart.item.id}" value="17"`) && partHpHtml.includes('Текущее ОЗ: 17 /'));
const chipOrder = ['Деталей:', 'ОЗ:', 'Деф.п:', 'УКЛ:', 'Скороход:', 'Полёт:', 'Экранирование:', 'Стоимость:'];
const chipPos = chipOrder.map((x) => garageHtml.indexOf(`>${x}`));
check('автомастерская: статы сверху в нужном порядке', chipPos.every((p, i) => p >= 0 && (i === 0 || p > chipPos[i - 1])), chipPos.join(','));
check('автомастерская: статы в подсказке названия машины', garageHtml.includes('title="Деталей:') && garageHtml.includes('Деф.п:') && garageHtml.includes('Экранирование:'));
clickShop('[data-source]', { source: 'defP' });
const srcHtml = utilities.render(ctx);
check('автомастерская: клик по параметру показывает источники', srcHtml.includes('Источники: ДЕФ.П') && srcHtml.includes(esc(bodyPart.item.name)));
clickShop('[data-source]', { source: 'defP' });

clickShop('[data-vehicle]', { vehicle: vehicleIds[0] });
const firstHtml = utilities.render(ctx);
check('автомастерская: сборки машин независимы', firstHtml.includes('part-empty') && !firstHtml.includes('part-slot">Кузов'));

clickShop('[data-vehicle]', { vehicle: vehicleIds[1] });
const backHtml = utilities.render(ctx);
check('автомастерская: сборка второй машины сохранилась', backHtml.includes('part-slot">Кузов'));

shopRoot.onchange({ target: { dataset: { vehicleName: '' }, value: 'Ржавый', type: 'text', tagName: 'INPUT' } });
const renamedHtml = utilities.render(ctx);
check('автомастерская: переименование машины', renamedHtml.includes('value="Ржавый"') && renamedHtml.includes('>Ржавый</span><span class="garage-count"'));

shopRoot.onchange({ target: { dataset: { vehicleNotes: '' }, value: 'Эффект: +2 к защите', type: 'textarea', tagName: 'TEXTAREA' } });
const notesHtml = utilities.render(ctx);
check('автомастерская: заметки транспорта сохраняются', notesHtml.includes('Эффект: +2 к защите') && notesHtml.includes('data-vehicle-notes'));

clickShop('[data-del-vehicle]');
garageHtml = utilities.render(ctx);
const leftIds = [...garageHtml.matchAll(/data-vehicle="([^"]+)"/g)].map((m) => m[1]);
check('автомастерская: удаление машины', leftIds.length === 1 && leftIds[0] === vehicleIds[0]);

// Дрон: свои ОЗ, защита и ОП из описания, но в итоги машины они не входят.
const dronePart = partsOf(d).find((p) => /Бронированный холодильник/i.test(p.item.name));
check('дрон: характеристики из описания', !!dronePart && dronePart.drone.hp === 300 && dronePart.drone.defP === 80 && dronePart.drone.op === 1, JSON.stringify(dronePart?.drone));
const pickOf = (id) => { const p = partsOf(d).find((x) => x.item.id === id); return p ? { cost: p.item.cost, stats: p.stats, name: p.item.name, drone: p.drone } : null; };
const withDrone = summarize({ body: pickOf(bodyPart.item.id), wheels: null, engine: null, weapons: [], modules: [pickOf(dronePart.item.id)] });
const withoutDrone = summarize({ body: pickOf(bodyPart.item.id), wheels: null, engine: null, weapons: [], modules: [] });
check('дрон: статы не входят в итоги, стоимость входит', withDrone.defP === withoutDrone.defP && withDrone.maxHp === withoutDrone.maxHp && withDrone.cost === withoutDrone.cost + dronePart.item.cost, `${withDrone.defP}/${withoutDrone.defP} ${withDrone.cost}/${withoutDrone.cost}`);
shopRoot.onchange({ target: { dataset: { b: 'modules.0' }, value: dronePart.item.id, type: 'select-one', tagName: 'SELECT' } });
const droneHtml = utilities.render(ctx);
check('дрон: карточка показывает свои статы', droneHtml.includes('Дрон') && droneHtml.includes('ОЗ 300') && droneHtml.includes('ДЕФ(П) 80') && droneHtml.includes('ОП 1') && droneHtml.includes('не входят в итоги'));

// Уникальные механические эффекты двигателей.
const motor5 = partsOf(d).find((p) => p.item.id === '0x03f');
const motor1 = partsOf(d).find((p) => p.item.id === '0x03b');
const torus5 = partsOf(d).find((p) => p.item.id === '0x044');
const athena = partsOf(d).find((p) => p.item.id === '0x00e');
const tracks = partsOf(d).find((p) => p.item.id === '0x04f');
const gida = partsOf(d).find((p) => p.item.id === '0x07f');
const elada = partsOf(d).find((p) => p.item.id === '0x05d');
const offroad = partsOf(d).find((p) => p.item.id === '0x045');
check('двигатели: пол Скорохода из уникального эффекта', motor5.stats.speedFloor === 2 && motor1.stats.speedFloor === 0, `${motor5.stats.speedFloor}/${motor1.stats.speedFloor}`);
check('двигатели: Торус требует «Элиада»', torus5.stats.wheelReq === 'Элиада', torus5.stats.wheelReq);
const floorBuild = summarize({ body: pickOf(athena.item.id), wheels: pickOf(tracks.item.id), engine: pickOf(motor5.item.id), weapons: [], modules: [pickOf(gida.item.id)] });
check('двигатели: пол Скорохода поднимает итог', floorBuild.speed === 2 && floorBuild.speedFloor === 2 && floorBuild.sources.speed.some((x) => x.name.includes('Минимум Скорохода')), `${floorBuild.speed}/${floorBuild.speedFloor}`);
const torusBad = summarize({ body: pickOf(athena.item.id), wheels: pickOf(offroad.item.id), engine: pickOf(torus5.item.id), weapons: [], modules: [] });
const torusOk = summarize({ body: pickOf(athena.item.id), wheels: pickOf(elada.item.id), engine: pickOf(torus5.item.id), weapons: [], modules: [] });
check('Торус: без «Элиады» предупреждение', torusBad.warnings.some((w) => w.includes('Элиада')) && !torusOk.warnings.some((w) => w.includes('Элиада')));
const torusNoWheels = summarize({ body: pickOf(athena.item.id), wheels: null, engine: pickOf(torus5.item.id), weapons: [], modules: [] });
check('Торус: чужие колёса не идут в итоги', torusBad.maxHp === torusNoWheels.maxHp && torusBad.defP === torusNoWheels.defP && torusBad.speed === torusNoWheels.speed, `${torusBad.maxHp}/${torusNoWheels.maxHp}`);
shopRoot.onchange({ target: { dataset: { b: 'wheels' }, value: offroad.item.id, type: 'select-one', tagName: 'SELECT' } });
const wheelsBeforeTorus = currentVehicle().build.wheels;
shopRoot.onchange({ target: { dataset: { b: 'engine' }, value: torus5.item.id, type: 'select-one', tagName: 'SELECT' } });
check('Торус: чужие колёса снимаются автоматически', wheelsBeforeTorus === offroad.item.id && currentVehicle().build.wheels === null, `${wheelsBeforeTorus} → ${currentVehicle().build.wheels}`);
shopRoot.onchange({ target: { dataset: { b: 'wheels' }, value: offroad.item.id, type: 'select-one', tagName: 'SELECT' } });
check('Торус: поставить другие колёса нельзя', currentVehicle().build.wheels === null);
const torusHtml = utilities.render(ctx);
const wheelSelect = torusHtml.match(/<select data-b="wheels"[^>]*>([\s\S]*?)<\/select>/)?.[1] || '';
check('Торус: в списке колёс только «Элиада»', wheelSelect.includes(`value="${elada.item.id}"`) && !wheelSelect.includes(`value="${offroad.item.id}"`) && wheelSelect.includes('Элиада'));
check('Торус: предупреждение видно в гараже', torusHtml.includes('нужны колёса «Элиада»'));
shopRoot.onchange({ target: { dataset: { b: 'wheels' }, value: elada.item.id, type: 'select-one', tagName: 'SELECT' } });
const torusOkHtml = utilities.render(ctx);
check('Торус: с «Элиадой» предупреждение исчезает', currentVehicle().build.wheels === elada.item.id && !torusOkHtml.includes('нужны колёса «Элиада»'));

check('по умолчанию Поляриец-Соло', blankChar().race === '0x002' && blankChar().class === 'Соло');
check('метка выбора: [Тег] Название [Р]*', optLabel({ tag: 'Acs', name: 'Тест', rarity: 'Редкий', iconic: true }) === '[Acs] Тест [Р]*');
check('метка выбора: «Культовый» без звёздочки', optLabel({ tag: 'Acs', name: 'Тест', rarity: 'Культовый', iconic: true }) === '[Acs] Тест [К]');
const optTexts = (html) => [...html.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map((m) => m[1]);
check('в выборе нет ID предмета', !optTexts(invHtml).some((t) => /0x[0-9a-f]/i.test(t)) && !optTexts(utilities.render(ctx)).some((t) => /0x[0-9a-f]/i.test(t)));
const classSelect = (html) => html.match(/<select data-p="class">([\s\S]*?)<\/select>/)?.[1] || '';
const polar = classSelect(character.render({ ...ctx, char: { ...c, race: '0x002', class: 'Соло' } }));
const novus = classSelect(character.render({ ...ctx, char: { ...c, race: '0x001', class: 'Свой' } }));
const human = classSelect(character.render({ ...ctx, char: { ...c, race: '0x003', class: 'Рокер' } }));
check('классы Полярийца: без Трансгрессора и Зверя', polar.includes('>Соло<') && !polar.includes('>Трансгрессор<') && !polar.includes('>Зверь<'));
check('классы Новуссита: только 4 и Свой', novus.includes('>Трансгрессор<') && novus.includes('>Свой<') && !novus.includes('>Соло<'));
check('классы Хуманийца: только Кочевник, Зверь, Рокер', human.includes('>Рокер<') && !human.includes('>Соло<') && !human.includes('>Трансгрессор<'));
check('правило классов работает по ID расы', classAllowed('0x002', 'Соло') && !classAllowed('0x002', 'Медикус') && !classAllowed('0x002', 'Зверь') && classAllowed('0x001', 'Медикус') && !classAllowed('0x001', 'Соло') && classAllowed('0x003', 'Зверь') && !classAllowed('0x003', 'Техник'));
const polarHtml = character.render({ ...ctx, char: { ...c, race: '0x002', class: 'Соло' } });
const novusHtml = character.render({ ...ctx, char: { ...c, race: '0x001', class: 'Свой' } });
check('сущность доступна только Новусситу', !polarHtml.includes('data-p="essence"') && novusHtml.includes('data-p="essence"'));
check('подсказки: списки вместо сплошного текста', helpBlock('char').includes('<ul>') && helpBlock('char').includes('Хранилище') && helpBlock('db').includes('<li>'));
check('подсказки: гараж, текущее ОЗ и клиника', helpBlock('util').includes('вкладками') && helpBlock('util').includes('Текущее ОЗ') && helpBlock('util').includes('Выгрузка') && helpBlock('char').includes('Клиника:'));
const swSource = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
check('комбобокс: строки не сжимаются в плоском списке', /\.combo-opt\{[^}]*flex:0 0 auto/.test(cssSource));
check('обновление интерфейса: service worker и свежие файлы', swSource.includes("cache: 'no-store'") && indexSource.includes("register('sw.js'"));
check('иконка сайта: paw.webp', indexSource.includes('rel="icon"') && indexSource.includes('assets/icons/paw.webp'));
check('обновление интерфейса: данные персонажа не затрагиваются', !swSource.includes('localStorage') && !swSource.includes('indexedDB'));
const mainSource = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const settingsSource = readFileSync(new URL('../js/views/settings.js', import.meta.url), 'utf8');
const realtimeSource = readFileSync(new URL('../js/core/realtime.js', import.meta.url), 'utf8');
check('источник: первый запуск предлагает снимок или Supabase', mainSource.includes('data-source-choice') && mainSource.includes('setSourcePreference'));
check('источник: настройки переключают режим и обновляют базу', settingsSource.includes('data-source-mode') && settingsSource.includes('loadData({ source: mode'));
check('источник: онлайн-режим проверяет обновления по таймеру и при возврате на вкладку',
  mainSource.includes('LIVE_REFRESH_MS') && mainSource.includes('refreshLive') && mainSource.includes('visibilitychange'));
check('источник: Realtime подписывается на meta и отступает при ошибке',
  mainSource.includes('startRealtime') && realtimeSource.includes('realtime:public:meta')
  && realtimeSource.includes('postgres_changes') && realtimeSource.includes('scheduleReconnect'));
const fakeRoot = { addEventListener() {} };
character.bind(fakeRoot, ctx);
const clickTab = (itab) => fakeRoot.onclick({ target: { closest: (s) => s === '[data-itab]' ? { dataset: { itab } } : null } });
clickTab('implants');
const impHtml = character.render(ctx);
const firstImplant = d.items.find((i) => i.category === 'Имплант');
check('импланты: ставятся из справочника без хранилища', impHtml.includes('Выбрать имплант…') && impHtml.includes('<optgroup label="Импланты">') && impHtml.includes(optLabel(firstImplant)));
const rowImplant = d.itemMap.get(c.implants[0]);
const rowInstall = RULES.clinicCost[rowImplant.rarity] || 0;
check('импланты: галочка «Клиника» у конкретного импланта', impHtml.includes(`data-clinic="${rowImplant.id}"`) && impHtml.includes('> Клиника') && !impHtml.includes('data-p="clinic"'));
const impClinicHtml = character.render({ ...ctx, char: { ...c, clinicImplants: [rowImplant.id] } });
check('импланты: цена строки включает установку', impClinicHtml.includes(`>${num((rowImplant.cost || 0) + rowInstall)}</span>`));
clickTab('equipment');
const eqHtml = character.render(ctx);
check('экипировка: по-прежнему из хранилища', eqHtml.includes('Выбрать из хранилища…') && !eqHtml.includes('Выбрать имплант…'));
clickTab('repository');
const repHtml = character.render({ ...ctx, char: { ...blankChar(), race: '0x001', class: 'Трансгрессор' } });
const repSelect = repHtml.match(/<select data-in="repository"[\s\S]*?<\/select>/)?.[0] || '';
const repGroups = [...repSelect.matchAll(/<optgroup label="([^"]+)"/g)].map((m) => m[1]);
check('репозиторий: выбранный класс → общие → остальные', repGroups[0] === 'Трансгрессор' && repGroups[1] === 'Общие' && repGroups[2] === 'Другие классы', repGroups.join(' → '));
clickTab('beasts');
const beastGeneral = d.beasts.find((b) => b.group_name === 'Общие');
const beastOther = d.beasts.find((b) => b.group_name === 'Сокрытие' && !/^Путь/.test(b.name));
const beastChar = { ...blankChar(), race: '0x003', class: 'Зверь', beasts: [d.beasts[0].id] };
const beastHtml = character.render({ ...ctx, char: beastChar });
check('звери: путь определяется по взятой способности', beastHtml.includes('data-beast-path="Хищник"') && beastHtml.includes('class="beast-path on"'));
check('звери: способность пути в списке, общие — в меню', beastHtml.includes(`data-beast-row="${d.beasts[0].id}"`) && beastHtml.includes(beastGeneral.name));
const beastSelect = beastHtml.match(/<select data-in="beasts"[\s\S]*?<\/select>/)?.[0] || '';
check('звери: способности чужого пути скрыты', beastSelect.includes('value=""') && !beastSelect.includes(`value="${beastOther.id}"`));
check('звери: выбор через adder с поиском и группами', beastHtml.includes('data-combo="beasts"') && beastHtml.includes('data-in="beasts"') && beastHtml.includes('data-search="beasts"') && beastHtml.includes('<optgroup label="Общие">'));
check('звери: корень пути не удаляется, требования видны', !beastHtml.includes('data-del="beasts.0"') && beastHtml.includes('путь') && beastHtml.includes('нужно: Кровавая ярость'));

const bc = { ...blankChar(), race: '0x003', class: 'Зверь', beasts: [d.beasts[0].id, beastGeneral.id], beastPath: 'Хищник' };
const bRoot = { addEventListener() {}, querySelector: () => null };
character.bind(bRoot, { ...ctx, char: bc });
bRoot.onclick({ target: { closest: (s) => s === '[data-beast-path]' ? { dataset: { beastPath: 'Сокрытие' } } : null } });
const hideRoot = d.beasts.find((b) => b.group_name === 'Сокрытие' && /^Путь/.test(b.name));
check('звери: смена пути оставляет общие и берёт корень пути', bc.beastPath === 'Сокрытие' && bc.beasts.includes(hideRoot.id) && bc.beasts.includes(beastGeneral.id) && !bc.beasts.includes(d.beasts[0].id));

const bcAdd = { ...blankChar(), race: '0x003', class: 'Зверь', beasts: [d.beasts[0].id], beastPath: 'Хищник' };
const addRoot = { addEventListener() {}, querySelector: (s) => (s === '[data-in="beasts"]' ? { value: beastGeneral.id } : null) };
character.bind(addRoot, { ...ctx, char: bcAdd });
addRoot.onclick({ target: { closest: (s) => s === '[data-add]' ? { dataset: { add: 'beasts' } } : null } });
check('звери: добавление способности из меню', bcAdd.beasts.includes(beastGeneral.id), bcAdd.beasts.join(','));

const bcDel = { ...blankChar(), race: '0x003', class: 'Зверь', beasts: [d.beasts[0].id, beastGeneral.id], beastPath: 'Хищник' };
const delRoot = { addEventListener() {}, querySelector: () => null };
character.bind(delRoot, { ...ctx, char: bcDel });
delRoot.onclick({ target: { closest: (s) => s === '[data-del]' ? { dataset: { del: 'beasts.1' } } : null } });
check('звери: удаление строки', !bcDel.beasts.includes(beastGeneral.id) && bcDel.beasts.includes(d.beasts[0].id), bcDel.beasts.join(','));

// Транспорт в экипировке Кочевника.
const legacyGarage = normGarage(null, { body: bodyPart.item.id, wheels: null, engine: null, weapons: [], modules: [], discount: 0 });
check('гараж: пустой гараж допустим, старая сборка сама не создаётся', legacyGarage.vehicles.length === 0);
const importBefore = G.vehicles.length;
const importCount = importGarage(JSON.stringify({ vehicles: [{ id: 'v-import-test', name: 'Импорт', notes: 'Из файла', build: { body: bodyPart.item.id } }] }));
const imported = G.vehicles[G.vehicles.length - 1];
check('импорт: транспорт добавляется с новым ID', importCount === 1 && G.vehicles.length === importBefore + 1 && imported.id !== 'v-import-test' && imported.name === 'Импорт');
const legacyImportBefore = G.vehicles.length;
check('импорт: старая одиночная сборка тоже подходит', importGarage(JSON.stringify({ body: bodyPart.item.id })) === 1 && G.vehicles.length === legacyImportBefore + 1);

clickTab('equipment');
const trSum = summarize({ body: pickOf(bodyPart.item.id), wheels: null, engine: null, weapons: [], modules: [] });
const trHtml = character.render({ ...ctx, char: { ...blankChar(), class: 'Кочевник', transport: imported.id } });
check('экипировка: транспорт Кочевника занимает [Tr] и виден', trHtml.includes('data-transport') && trHtml.includes('[Tr] 1/1') && trHtml.includes(imported.name));
check('экипировка: транспорт входит в сумму, но не в продажу', trHtml.includes(`Сумма: ${num(trSum.cost)}`) && trHtml.includes('Продажа: 0'));
const soloTrHtml = character.render({ ...ctx, char: { ...blankChar(), class: 'Соло', transport: imported.id } });
check('экипировка: транспорт недоступен не-Кочевнику', !soloTrHtml.includes('data-transport') && !soloTrHtml.includes('[Tr] 1/1'));
fakeRoot.onchange({ target: { dataset: { transport: imported.id }, value: imported.id } });
c.transport = imported.id;
fakeRoot.onchange({ target: { dataset: { p: 'class' }, value: 'Соло', type: 'select-one', tagName: 'SELECT' } });
check('экипировка: при смене класса транспорт сбрасывается', c.transport === null);
check('подсказки: транспорт, импорт и заметки', helpBlock('util').includes('Загрузить') && helpBlock('util').includes('Заметки') && helpBlock('util').includes('Текущее ОЗ') && helpBlock('util').includes('Элиада') && helpBlock('char').includes('Транспорт'));
check('подсказки: нечёткий поиск, звери и калькулятор', helpBlock('db').includes('нечёткий') && helpBlock('char').includes('выберите путь') && helpBlock('util').includes('Калькулятор вероятностей') && helpBlock('settings').includes('Сбросить кэш'));

const settingsHtml = settings.render(ctx);
const systemAt = settingsHtml.indexOf('Системные');
check('настройки: полная выгрузка всех данных и сброс кэша',
  settingsHtml.includes('data-a="export-all"') && !settingsHtml.includes('data-a="reset-char"') && !settingsHtml.includes('data-a="export"')
  && systemAt > 0 && settingsHtml.indexOf('data-a="reset-cache"') > systemAt);
check('настройки: выбор источника базы и обновление',
  settingsHtml.includes(`data-source-mode="${SOURCE_SNAPSHOT}"`) && settingsHtml.includes(`data-source-mode="${SOURCE_LIVE}"`)
  && settingsHtml.includes('data-a="reload-db"') && settingsHtml.includes('Источник базы'));
const charDataHtml = character.render(ctx);
check('персонаж: выгрузка, загрузка и сброс на своей вкладке',
  charDataHtml.includes('data-a="reset-char"') && charDataHtml.includes('data-a="export-char"') && charDataHtml.includes('data-a="import-char"'));
let charSaved = 0, charRendered = 0;
const charCtx = { ...ctx, char: { ...c }, save() { charSaved++; }, rerender() { charRendered++; } };
const charRoot = { addEventListener() {}, querySelector: () => null };
character.bind(charRoot, charCtx);
charRoot.onclick({ target: { closest: (s) => s === '[data-a]' ? { dataset: { a: 'reset-char' } } : null } });
check('персонаж: «Сбросить персонажа» чистит только карточку', charSaved === 1 && charRendered === 1 && charCtx.char.name === '' && charCtx.char.beasts.length === 0);

// --- РО, слоты Зверя, нумерация БД и роботы Техника ---
check('РО: шесть фракций и семь значений', RO_FACTIONS.length === 6 && RO_VALUES.join(',') === '-60,-35,-15,0,15,35,60', RO_VALUES.join(','));
check('РО: лимит БМЕТ по РО Ацуши', [-60, -35, -15, 0, 15, 35, 60].map((v) => bmetLimit({ 'Ацуши': v })).join(',') === '1,1,1,1,1,2,3');
check('РО: диапазон −100…100 и ранги на порогах', RO_MIN === -100 && RO_MAX === 100
  && [-60, -35, -15, -14, 0, 14, 15, 35, 60, 100].map(roRank).join(',') === '-3,-2,-1,0,0,0,1,2,3,3');
check('РО: ассоциация и членство по правилам', normalizeROStatus('ГРА', RO_STATUS.association, 100) === ''
  && normalizeROStatus('Чёрный Рынок', RO_STATUS.membership, 100) === ''
  && normalizeROStatus('Ацуши', RO_STATUS.membership, 35) === ''
  && normalizeROStatus('Ацуши', RO_STATUS.membership, 60) === RO_STATUS.membership
  && normalizeROStatus('Хиллз', RO_STATUS.association, 0) === RO_STATUS.association);
const roHtml = character.render({ ...ctx, char: { ...blankChar(), ro: { ...blankRO(), 'Ацуши': 35 }, roStatus: { ...blankROStatus(), 'Ацуши': RO_STATUS.association } } });
check('РО: карточка показывает фракции, ранг и статус', roHtml.includes('data-p="ro.Ацуши"') && roHtml.includes('data-p="ro.ГРА"') && roHtml.includes('data-p="roStatus.Ацуши"') && roHtml.includes('Ранг 2'));
const roMemberHtml = character.render({ ...ctx, char: { ...blankChar(), ro: { ...blankRO(), 'Ацуши': 60 } } });
check('РО: членство появляется только при 60+', roMemberHtml.includes(`value="${RO_STATUS.membership}"`) && !roHtml.includes(`value="${RO_STATUS.membership}"`));

check('звери: слоты по рангам', BEAST_SLOTS[1]['Обычный'] === 2 && BEAST_SLOTS[3]['Редкий'] === 1
  && BEAST_SLOTS[5]['Обычный'] === 4 && BEAST_SLOTS[6]['Легендарный'] === 1
  && BEAST_SLOTS[9]['Легендарный'] === 4 && BEAST_SLOTS[10]['Легендарный'] === 4);
const normalBeasts = d.beasts.filter((b) => b.rarity === 'Обычный').slice(0, 3);
clickTab('beasts');
const overChar = { ...blankChar(), race: '0x003', class: 'Зверь', beasts: normalBeasts.map((b) => b.id), beastPath: normalBeasts[0].group_name };
const overHtml = character.render({ ...ctx, char: overChar });
check('звери: превышение слотов разрешено и подсвечено', overHtml.includes('Превышен лимит слотов') && overHtml.includes('Слоты: О 2') && overHtml.includes('Взято: О 3'));
check('звери: редкость помечена цветом', overHtml.includes('chip rar-c'));
const legendBeast = d.beasts.find((b) => b.rarity === 'Легендарный');
const legendHtml = character.render({ ...ctx, char: { ...blankChar(), race: '0x003', class: 'Зверь', beasts: [legendBeast.id], beastPath: legendBeast.group_name } });
check('звери: легендарная редкость оранжево-жёлтая', legendHtml.includes('chip rar-l'));
const extraLHtml = character.render({ ...ctx, char: { ...blankChar(), race: '0x003', class: 'Зверь', rank: 1, abilities: ['0x002'], beasts: [d.beasts[0].id], beastPath: d.beasts[0].group_name } });
check('звери: «Я Особенный» добавляет слот Л', extraLHtml.includes('+1 Л') && extraLHtml.includes('Л 1'));

check('БД: порядковый номер предмета из data.json', databases.itemRow(d.items[0], '', { ord: 1 }).includes('row-no') && databases.itemRow(d.items[0], '', { ord: 1 }).includes('>#1<'));
check('БД: номер последнего предмета совпадает с размером базы', databases.itemRow(d.items[d.items.length - 1], '', { ord: d.items.length }).includes(`>#${d.items.length}<`));
check('БД: порядковый номер карты', databases.cardRow(d.cards[0], '', { ord: 1 }).includes('>#1<'));
check('БД: номер не зависит от сортировки', databases.itemRow(d.items[10], '', { ord: 11 }).includes('>#11<'));

const prism = d.items.find((i) => i.name === 'Призма-I');
const bmetOrion = d.items.find((i) => i.name === 'БМЕТ Орион');
const bmetKladis = d.items.find((i) => i.name === 'БМЕТ Кладис');
const robotWeapon = d.items.find((i) => i.category === 'Оружие');
const robotModule = d.items.find((i) => i.tag === 'Mod');
const skeletonItem = d.items.find((i) => i.name.includes('Модульный скелет Эперс'));
const noImp = { ...blankChar(), class: 'Техник', pockets: [{ id: bmetOrion.id, qty: 1 }] };
robotStore.robots = [normRobot({ id: 'r-test-bmet', name: 'Орион', base: bmetOrion.id, notes: 'разведка' })];
robotStore.active = 'r-test-bmet';
check('роботы: БМЕТ требует «Атсуши продвинутый робософт»', !robotRequirement(robotStore.robots[0], d, noImp).ok
  && robotRequirement(robotStore.robots[0], d, { ...noImp, implants: ['0x1ac'] }).ok);
const bmetHtml = robotsView.render({ ...ctx, char: { ...noImp, implants: ['0x1ac'] } });
check('роботы: мастерская показывает БМЕТ, ОЗ и уникальный эффект', bmetHtml.includes('БМЕТ') && bmetHtml.includes('250')
  && bmetHtml.includes('разведка') && bmetHtml.includes(esc(bmetOrion.description)) && !/undefined|NaN/.test(bmetHtml));

const prismChar = {
  ...blankChar(), class: 'Техник', implants: ['0x189'],
  pockets: [{ id: prism.id, qty: 1 }, { id: robotWeapon.id, qty: 1 }, { id: robotModule.id, qty: 1 }],
};
robotStore.robots = [normRobot({ id: 'r-test-prism', name: 'Призма', base: prism.id, weapons: [robotWeapon.id, null], modules: [robotModule.id, null, null, null, null] })];
robotStore.active = 'r-test-prism';
const prismHtml = robotsView.render({ ...ctx, char: prismChar });
check('роботы: Призма принимает 2 оружия и 5 модулей', prismHtml.includes(esc(robotWeapon.name)) && prismHtml.includes(esc(robotModule.name)) && !/undefined|NaN/.test(prismHtml));
check('роботы: «Активация» только у установленных модулей', (prismHtml.match(/data-robot-module="/g) || []).length === 1);
check('роботы: занятый экземпляр не используется дважды', availableCount(prismChar, robotStore.robots, robotWeapon.id) === 0
  && availableCount({ ...prismChar, pockets: [{ id: robotWeapon.id, qty: 2 }] }, robotStore.robots, robotWeapon.id) === 1);
check('роботы: Призма требует один из робософтов', robotRequirement(robotStore.robots[0], d, prismChar).ok
  && !robotRequirement(robotStore.robots[0], d, { ...prismChar, implants: [] }).ok);
const techHtml = character.render({ ...ctx, char: { ...prismChar, robots: ['r-test-prism'] } });
check('Техник: карточка показывает робота, ОЗ и снаряжение', techHtml.includes('Роботы Техника') && techHtml.includes('data-robot-use="r-test-prism"')
  && techHtml.includes('Надето роботов: 1') && techHtml.includes(robotModule.name) && !/undefined|NaN/.test(techHtml));

// АТК — по текущему оружию; пассивные модули учитываются всегда, активные — по галочке.
const weapon2 = d.items.find((i) => i.category === 'Оружие' && i.id !== robotWeapon.id);
const atkModule = d.items.find((i) => i.id === '0x1d5');
const activeModule = d.items.find((i) => i.id === '0x16c');
robotStore.robots = [normRobot({
  id: 'r-atk', name: 'АТК', base: prism.id,
  weapons: [robotWeapon.id, weapon2.id], weapon: 0,
  modules: [atkModule.id, null, null, null, null],
})];
robotStore.active = 'r-atk';
const passiveAtk = parsePart(atkModule.description).atk;
const atkOff = robotStats(robotStore.robots[0], d).total.atk;
const atkOn = robotStats({ ...robotStore.robots[0], weapon: 1, modulesActive: [true, false, false, false, false] }, d).total.atk;
check('роботы: АТК считается по выбранному оружию, а не суммой', atkOff === parsePart(robotWeapon.description).atk + passiveAtk, atkOff);
check('роботы: смена текущего оружия меняет АТК', atkOn === parsePart(weapon2.description).atk + passiveAtk, `${atkOn}`);
const weaponStats = parsePart(robotWeapon.description);
const atkTotals = robotStats(robotStore.robots[0], d).total;
check('роботы: КШ, ТЧН, АВХ и КЦ берутся из текущего оружия',
  atkTotals.ksh === (weaponStats.ksh || 0) && atkTotals.avx === (weaponStats.avx || 0)
  && atkTotals.kc === (weaponStats.kc ?? 1) && atkTotals.tchn === (weaponStats.accuracy || 0),
  `${atkTotals.ksh}/${atkTotals.tchn}/${atkTotals.avx}/${atkTotals.kc}`);
const atkPage = robotsView.render({ ...ctx, char: prismChar });
check('роботы: КШ, ТЧН, АВХ и КЦ есть в «Итогах»', ['ksh', 'tchn', 'avx', 'kc'].every((k) => atkPage.includes(`data-source="${k}"`)));
check('роботы: у оружия выводятся все четыре боевых параметра',
  atkPage.includes(`КШ ${weaponStats.ksh || 0}`) && atkPage.includes(`ТЧН ${weaponStats.accuracy || 0}`)
  && atkPage.includes(`АВХ ${weaponStats.avx || 0}`) && atkPage.includes(`КЦ ${weaponStats.kc ?? 1}`));
check('роботы: пассивный модуль учитывается без активации', moduleEnabled(robotStore.robots[0], 0, atkModule)
  && !moduleChecked(robotStore.robots[0], 0), `${atkOn}`);
check('роботы: активный модуль без активации не учитывается', moduleIsActive(activeModule)
  && !moduleEnabled(robotStore.robots[0], 0, activeModule)
  && moduleEnabled({ ...robotStore.robots[0], modulesActive: [true, false, false, false, false] }, 0, activeModule));
robotStore.robots = [normRobot({ id: 'r-active', name: 'Активный', base: prism.id, modules: [activeModule.id, null, null, null, null] })];
const atkHtml = character.render({ ...ctx, char: { ...prismChar, robots: ['r-active'] } });
check('роботы: в карточке есть выбор оружия и активация активных модулей', atkHtml.includes('data-robot-weapon="r-active"')
  && atkHtml.includes('data-robot-module="r-active.0"') && atkHtml.includes('выкл'));

// «Перераспределитель энерго-ядра»: управляет Ядром и Призмой, отдаёт параметры SAT.
const core = d.items.find((i) => i.name === 'Ядро-III');
const coreChar = { ...blankChar(), class: 'Техник', implants: ['0x271'], pockets: [{ id: core.id, qty: 1 }, { id: prism.id, qty: 1 }, { id: robotWeapon.id, qty: 1 }] };
robotStore.robots = [normRobot({ id: 'r-core', name: 'Ядро', base: core.id, weapons: [robotWeapon.id, null], weapon: 0 })];
robotStore.active = 'r-core';
const coreStats = robotStats(robotStore.robots[0], d, coreChar).total;
check('роботы: Ядро управляется Перераспределителем и получает +20 АТК/+10 ТЧН', robotRequirement(robotStore.robots[0], d, coreChar).ok
  && coreStats.atk === parsePart(robotWeapon.description).atk + 20
  && coreStats.tchn === parsePart(robotWeapon.description).accuracy + 10);
check('роботы: Перераспределитель подходит и Призме', robotRequirement({ ...robotStore.robots[0], base: prism.id }, d, coreChar).ok);

// Сборка из любых деталей и плашка о недостающем.
const emptyTech = { ...blankChar(), class: 'Техник', implants: ['0x189'] };
robotStore.robots = [normRobot({ id: 'r-missing', name: 'Недобор', base: prism.id, weapons: [robotWeapon.id, null] })];
robotStore.active = 'r-missing';
const missingParts = robotMissing(robotStore.robots[0], d, emptyTech);
const missingHtml = robotsView.render({ ...ctx, char: emptyTech });
check('роботы: показывает, чего нет в инвентаре', missingParts.length === 2 && missingParts.every((x) => x.have === 0)
  && missingHtml.includes('miss-note') && missingHtml.includes('Нет в инвентаре'));
check('роботы: собирать можно из любых деталей базы', missingHtml.includes(esc(prism.name)) && missingHtml.includes(esc(weapon2.name)) && missingHtml.includes('нет в инвентаре'));
check('роботы: без деталей надеть нельзя', !robotRequirement(robotStore.robots[0], d, emptyTech).ok
  && /data-robot-use="r-missing"[^>]*disabled/.test(character.render({ ...ctx, char: { ...emptyTech, robots: [] } })));

// Счётчик БМЕТ виден только с «Атсуши продвинутый робософт».
robotStore.robots = [normRobot({ id: 'r-b-count', name: 'Орион', base: bmetOrion.id })];
robotStore.active = 'r-b-count';
const noBmetImplantHtml = character.render({ ...ctx, char: { ...blankChar(), class: 'Техник', robots: ['r-b-count'] } });
const withBmetImplantHtml = character.render({ ...ctx, char: { ...blankChar(), class: 'Техник', implants: ['0x1ac'], robots: ['r-b-count'] } });
check('Техник: счётчик БМЕТ только при Робософте', !noBmetImplantHtml.includes('БМЕТ: 1 / 1') && withBmetImplantHtml.includes('БМЕТ: 1 / 1'));

robotStore.robots = [
  normRobot({ id: 'r-b1', name: 'Орион', base: bmetOrion.id }),
  normRobot({ id: 'r-b2', name: 'Кладис', base: bmetKladis.id }),
];
robotStore.active = 'r-b1';
const limitChar = { ...blankChar(), class: 'Техник', implants: ['0x1ac'], ro: { ...blankRO(), 'Ацуши': -60 }, robots: ['r-b1'] };
const limitHtml = character.render({ ...ctx, char: limitChar });
check('Техник: РО «Ацуши» ограничивает число БМЕТов', limitHtml.includes('БМЕТ: 1 / 1') && /data-robot-use="r-b2"[^>]*disabled/.test(limitHtml));
let robotRenders = 0;
const rbRoot = { addEventListener() {}, querySelector: () => null };
robotsView.bind(rbRoot, { ...ctx, char: limitChar, rerender() { robotRenders++; } });
rbRoot.onchange({ target: { dataset: { robotName: '' }, value: 'Разведчик' } });
check('роботы: переименование сохраняется', robotStore.robots[0].name === 'Разведчик' && robotRenders === 1);

const skelChar = { ...blankChar(), class: 'Техник', implants: ['0x1ad'], pockets: [{ id: skeletonItem.id, qty: 1 }, { id: robotModule.id, qty: 1 }], equipment: [skeletonItem.id] };
const skelHtml = character.render({ ...ctx, char: skelChar });
check('скелет: 3 модуля [Acs] и карточки модулей', skelHtml.includes('Модульный скелет') && skelHtml.includes('data-skel-mod="2"')
  && skelHtml.includes('Посмотреть карточки модулей') && skelHtml.includes('skel-catalog') && !/undefined|NaN/.test(skelHtml));
const skelHiddenHtml = character.render({ ...ctx, char: { ...skelChar, implants: [] } });
check('скелет: подвкладка скрыта без Догмата Единства', !skelHiddenHtml.includes('<h2>Модульный скелет</h2>'));
const skelSlots = derive({ ...skelChar, equipment: [skeletonItem.id, robotModule.id] }, d).gearSlots;
check('скелет: [Exo] занимает броню, модуль — [Acs]',
  skelSlots.find((s) => s.tag === '[Exo]').used === 1 && skelSlots.find((s) => s.tag === '[Acs]').used === 1);

const robotsBefore = robotStore.robots.length;
const importedRobots = importRobots(JSON.stringify({ robots: [{ id: 'r-import-test', name: 'Импорт', base: prism.id }] }));
check('роботы: импорт добавляет с новым ID', importedRobots === 1 && robotStore.robots.length === robotsBefore + 1
  && robotStore.robots[robotStore.robots.length - 1].id !== 'r-import-test'
  && robotStore.robots[robotStore.robots.length - 1].name === 'Импорт');

// --- Сводка статов персонажа: формулы, источники, условия и активные эффекты ---
check('статы: формулы 5n, n/2 и 1 + n/4', evalStatFormula('5n', 3) === 15 && evalStatFormula('n/2', 3) === 1 && evalStatFormula('1 + n/4', 4) === 2);
check('статы: ОП — это Скороход, расстояние и стоимость ОД не считаются', (() => {
  const speed = parseStatEffects('Скороход +2', { n: 0 });
  const op = parseStatEffects('+2 ОП', { n: 0 });
  const far = parseStatEffects('Вы можете переместиться на 3 ОП', { n: 0 });
  const cost = parseStatEffects('Потратив 1 ОД, вы получаете +5 КШ', { n: 0 });
  return speed.some((e) => e.stat === 'speed' && e.value === 2)
    && op.some((e) => e.stat === 'speed' && e.value === 2)
    && !far.some((e) => e.stat === 'speed')
    && cost.some((e) => e.stat === 'ksh' && e.value === 5)
    && !cost.some((e) => e.stat === 'od');
})());
check('статы: Деф.а и обратный порядок «2 Скороход»', (() => {
  const def = parseStatEffects('Деф.а 5, Деф.п 2', { n: 0 });
  const rev = parseStatEffects('2 Скороход', { n: 0 });
  return def.some((e) => e.stat === 'defA' && e.value === 5)
    && def.some((e) => e.stat === 'defP' && e.value === 2)
    && rev.some((e) => e.stat === 'speed' && e.value === 2);
})());
const statFormula = parseStatEffects('**+4n АТК ближним оружием -4n АТК дальним оружием. Где n ранг персонажа**', { n: 5 });
check('статы: формула с n и условные ближний/дальний бой', statFormula.length === 2
  && statFormula.every((e) => e.stat === 'atk' && e.conditional)
  && statFormula.some((e) => e.value === 20) && statFormula.some((e) => e.value === -20));
check('статы: способности, мутации и способности зверя не учитываются', (() => {
  const s = collectCharacterStats({
    ...blankChar(), rank: 5,
    abilities: ['0x014', '0x04f', '0x055', '0x056', '0x026'],
    beasts: ['0x00d', '0x019', '0x020', '0x01a'],
  }, d);
  return s.sources.length === 0 && s.conditional.length === 0
    && CHAR_STAT_ORDER.every((k) => !s.totals[k]);
})());

const statWeaponA = d.itemMap.get('0x0c9');
const statWeaponB = d.itemMap.get('0x0cb');
const statCondItem = d.itemMap.get('0x0d7');
const statCondItem2 = d.itemMap.get('0x0e5');
const statActiveImplant = d.itemMap.get('0x10c');
const statChar = {
  ...blankChar(), rank: 5,
  equipment: [statWeaponA.id, statWeaponB.id],
  implants: [statCondItem.id, statCondItem2.id, statActiveImplant.id],
  statsWeapon: statWeaponA.id,
};
const charStats = collectCharacterStats(statChar, d);
check('статы: профиль строится по выбранному оружию', charStats.weapon?.id === statWeaponA.id
  && charStats.weaponStats.atk === 53 && charStats.weaponStats.tchn === 15 && charStats.weaponStats.kc === 1,
  JSON.stringify(charStats.weaponStats));
check('статы: второе оружие не суммируется', charStats.ignoredWeapons.length === 1
  && charStats.totals.atk === 53 && charStats.totals.tchn === 15);
check('статы: условные бонусы по умолчанию выключены', charStats.totals.atk === 53
  && charStats.conditional.some((x) => x.sourceName.includes('Суставный') && x.value === 15 && !x.enabled));
const condEffectKey = charStats.conditional.find((x) => x.sourceName.includes('Суставный'))?.effectKey;
const condSourceKey = charStats.conditional.find((x) => x.sourceName.includes('Суставный'))?.sourceKey;
const activeSourceKey = charStats.sources.find((x) => String(x.label).includes('Адреналиновые ячейки'))?.key;
check('статы: условный пассивный бонус включается одной галочкой', collectCharacterStats({
  ...statChar, statsToggles: { sources: {}, effects: { [condEffectKey]: true } },
}, d).totals.atk === 68);
check('статы: активный бонус импланта включается источником', (() => {
  const off = collectCharacterStats(statChar, d);
  const on = collectCharacterStats({ ...statChar, statsToggles: { sources: { [activeSourceKey]: true }, effects: {} } }, d);
  return off.totals.od === 0 && on.totals.od === 1;
})());
check('статы: активный источник по умолчанию выключен', charStats.sources.some((x) => x.key === activeSourceKey && x.hasActive && !x.sourceOn));
check('статы: перераспределитель энерго-ядра — не оружие', !isWeaponItem(d.itemMap.get('0x271')));
const coreImplantStats = collectCharacterStats({ ...blankChar(), implants: ['0x271'] }, d);
check('статы: параметры перераспределителя уходят SAT, а не персонажу', coreImplantStats.totals.atk === 0
  && coreImplantStats.totals.tchn === 0 && coreImplantStats.sources.length === 0);
const statNorm = normChar({ name: 'Норм', statsToggles: { effects: { e: true } } });
check('карточка: переключатели статов нормализуются', statNorm.statsWeapon === null
  && statNorm.statsToggles.sources !== undefined && statNorm.statsToggles.effects.e === true);
character.setRoute('stats');
check('подссылки: #char/stats', character.currentRoute() === 'stats');
const statsHtmlRender = character.render({ ...ctx, char: statChar });
check('статы: карточки всех параметров и выбор оружия', !/undefined|NaN|\[object/.test(statsHtmlRender)
  && CHAR_STAT_ORDER.every((k) => statsHtmlRender.includes(`data-stat-source="${k}"`))
  && statsHtmlRender.includes('data-stats-weapon'));
check('статы: условия включаются у источника, отдельного списка нет', !statsHtmlRender.includes('<h2>Условные бонусы</h2>')
  && statsHtmlRender.includes(`data-stats-cond-group="${condSourceKey}"`)
  && statsHtmlRender.includes('Условие источника')
  && statsHtmlRender.includes(`data-stats-effect="${condEffectKey}"`)
  && statsHtmlRender.includes(`data-stats-source="${activeSourceKey}"`));
check('статы: общая галочка условий и галочки по источникам', statsHtmlRender.includes('data-stats-cond-all')
  && statsHtmlRender.includes('Условия: 0 / ')
  && statsHtmlRender.includes('data-stats-cond-group="'));

const condAllChar = { ...statChar, statsToggles: { sources: {}, effects: {} } };
const condAllRoot = { addEventListener() {}, querySelector: () => null };
character.bind(condAllRoot, { ...ctx, char: condAllChar, save() {}, rerender() {} });
const condAllKeys = collectCharacterStats(statChar, d).conditional.map((x) => x.effectKey);
condAllRoot.onchange({ target: { dataset: { statsCondAll: '' }, checked: true, type: 'checkbox' } });
check('статы: одна галочка включает все условия', condAllKeys.length > 1
  && condAllKeys.every((k) => condAllChar.statsToggles.effects[k] === true));
condAllRoot.onchange({ target: { dataset: { statsCondAll: '' }, checked: false, type: 'checkbox' } });
check('статы: одна галочка снимает все условия', condAllKeys.every((k) => condAllChar.statsToggles.effects[k] === false));

const groupChar = { ...blankChar(), rank: 5, implants: ['0x120'] };
const groupStats = collectCharacterStats(groupChar, d);
const groupKey = groupStats.conditional.find((x) => x.sourceKey === 'imp:0x120:0')?.sourceKey;
const groupRoot = { addEventListener() {}, querySelector: () => null };
character.bind(groupRoot, { ...ctx, char: groupChar, save() {}, rerender() {} });
groupRoot.onchange({ target: { dataset: { statsCondGroup: groupKey }, checked: true, type: 'checkbox' } });
check('статы: галочка источника включает только его условия', groupStats.conditional
  .every((x) => !!groupChar.statsToggles.effects[x.effectKey] === (x.sourceKey === groupKey)));
character.setRoute('pockets');
check('статы: возврат на карточку', character.currentRoute() === 'pockets');
let pageRoute = '';
const pageRoot = { addEventListener() {}, querySelector: () => null };
character.bind(pageRoot, { ...ctx, char: statChar, save() {}, rerender() {}, route(sub) { pageRoute = sub; } });
pageRoot.onclick({ target: { closest: (s) => (s === '[data-page-tab]' ? { dataset: { pageTab: 'stats' } } : null) } });
check('статы: переключатель «Карточка / Статы» меняет маршрут', character.currentRoute() === 'stats' && pageRoute === 'stats');
pageRoot.onclick({ target: { closest: (s) => (s === '[data-page-tab]' ? { dataset: { pageTab: 'sheet' } } : null) } });
check('статы: возврат по переключателю на карточку', character.currentRoute() === 'pockets' && pageRoute === 'pockets');

const statToggleChar = { ...statChar, statsToggles: { sources: {}, effects: {} } };
const statToggleCtx = { ...ctx, char: statToggleChar, save() {}, rerender() {} };
const statToggleRoot = { addEventListener() {}, querySelector: () => null };
character.bind(statToggleRoot, statToggleCtx);
statToggleRoot.onchange({ target: { dataset: { statsEffect: condEffectKey }, checked: true, type: 'checkbox' } });
statToggleRoot.onchange({ target: { dataset: { statsSource: activeSourceKey }, checked: true, type: 'checkbox' } });
statToggleRoot.onchange({ target: { dataset: { statsWeapon: statWeaponB.id }, value: statWeaponB.id, type: 'select-one' } });
check('статы: галочки и оружие сохраняются в карточке',
  statToggleChar.statsToggles.effects[condEffectKey] === true
  && statToggleChar.statsToggles.sources[activeSourceKey] === true
  && statToggleChar.statsWeapon === statWeaponB.id);

// --- Источник базы: сохранённый выбор, Supabase, версия и запасной кэш ---
const originalLocalStorage = globalThis.localStorage;
const originalFetch = globalThis.fetch;
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => { store.set(key, String(value)); },
  removeItem: (key) => { store.delete(key); },
  clear: () => store.clear(),
};
const liveRows = {
  items: [{ id: '0x001', name: 'Онлайн', category: 'Тест', rarity: 'Обычный', cost: 1, description: '' }],
  cards: [], ranks: [], races: [], classes: [], stats: [], skills: [], abilities: [],
  beasts: [], traits: [], essences: [], slots: [], implant_combos: [],
};
let liveVersion = 'v1';
let tableCalls = 0;
globalThis.fetch = async (url) => {
  const value = String(url);
  if (value.startsWith('data/data.json')) {
    return { ok: true, status: 200, json: async () => ({ ...liveRows, version: 'snapshot-v1' }) };
  }
  if (value.includes('/rest/v1/meta?')) {
    return { ok: true, status: 200, json: async () => [{ value: liveVersion }] };
  }
  const table = value.split('/rest/v1/')[1].split('?')[0];
  tableCalls += 1;
  return { ok: true, status: 200, json: async () => liveRows[table] || [] };
};
try {
  check('источник: по умолчанию выбора нет', getSourcePreference() === null);
  setSourcePreference(SOURCE_LIVE);
  check('источник: выбор сохраняется', getSourcePreference() === SOURCE_LIVE && store.get('infusion.dbSource') === SOURCE_LIVE);
  const live = await loadData();
  check('источник: онлайн-база загружается из Supabase', live.sourceMode === SOURCE_LIVE
    && live.items[0].name === 'Онлайн' && !live.sourceFallback && tableCalls > 0, `${tableCalls}`);
  const callsAfterFirst = tableCalls;
  const cachedLive = await loadData();
  check('источник: при той же версии таблицы не перезагружаются', cachedLive.items[0].name === 'Онлайн'
    && tableCalls === callsAfterFirst && cachedLive.source.includes('без изменений'));
  liveVersion = 'v2';
  const freshLive = await loadData();
  check('источник: новая версия перезагружает таблицы', tableCalls > callsAfterFirst && freshLive.items[0].name === 'Онлайн');
  setSourcePreference(SOURCE_SNAPSHOT);
  const snapshot = await loadData({ force: true });
  check('источник: снимок читает data/data.json', snapshot.sourceMode === SOURCE_SNAPSHOT
    && snapshot.version === 'snapshot-v1' && snapshot.source.includes('снимок'));
  setSourcePreference(SOURCE_LIVE);
  globalThis.fetch = async () => { throw new Error('сеть недоступна'); };
  const fallback = await loadData();
  check('источник: при сбое Supabase показывается сохранённый кэш', fallback.sourceFallback === true
    && fallback.items[0].name === 'Онлайн' && fallback.source.includes('кэш браузера'), fallback.source);
} finally {
  globalThis.fetch = originalFetch;
  if (originalLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalLocalStorage;
}

console.log(fail ? `Ошибок: ${fail}` : 'Всё в порядке');
process.exit(fail ? 1 : 0);
