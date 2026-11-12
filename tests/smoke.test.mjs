// node tests/smoke.test.mjs — рисует все вкладки на данных data.json и проверяет расчёты персонажа.
import { readFileSync } from 'node:fs';
import { indexData, optLabel, num, esc } from '../js/core/util.js';
import { fuzzyScore } from '../js/core/fuzzy.js';
import { probability, targetFromVer, verFromTarget } from '../js/core/probability.js';
import { blankChar } from '../js/core/storage.js';
import { derive } from '../js/character/derive.js';
import { classAllowed, RULES, RO_FACTIONS, RO_VALUES, RO_MIN, RO_MAX, RO_STATUS, blankRO, blankROStatus, roRank, normalizeROStatus, bmetLimit, BEAST_SLOTS, ROBOT_IMPLANTS } from '../js/character/rules.js';
import { helpBlock } from '../js/core/help.js';
import * as databases from '../js/views/databases.js';
import * as character from '../js/views/character.js';
import * as utilities from '../js/views/utilities.js';
import * as settings from '../js/views/settings.js';
import * as shop from '../js/modules/autoshop/view.js';
import { partsOf } from '../js/modules/autoshop/parts.js';
import { parsePart } from '../js/modules/autoshop/parser.js';
import { summarize } from '../js/modules/autoshop/aggregate.js';
import { G, importGarage, normGarage, currentVehicle } from '../js/modules/autoshop/store.js';
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
clickDbTab('parts');
const partsDb = databases.render(ctx);
check('база: у деталей фильтры по типу и организации', partsDb.includes('data-k="kind"') && partsDb.includes('data-k="organization"'));
clickDbTab('rules');
const rulesDb = databases.render(ctx);
check('справочник: разделы «Константы», «Способности», «Зверь», «Черта», «Навыки»', ['Константы', 'Способности', 'Зверь', 'Черта', 'Навыки'].every((x) => rulesDb.includes(`>${x}<`)));
check('справочник: подразделы «Ранги» и «Сущности»', rulesDb.includes('>Ранги<') && rulesDb.includes('>Сущности<'));
check('справочник: фильтры, сортировка и бесконечная лента', rulesDb.includes('data-k="group"') && rulesDb.includes('data-k="sub"') && rulesDb.includes('data-sort="rules"') && rulesDb.includes('data-more="rules"') && rulesDb.includes('data-more-sentinel') && !rulesDb.includes('data-pager'));
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
check('подссылки: #util/calc', utilities.currentRoute() === 'calc');
utilities.setRoute('robots');
utilities.setRoute('');
check('утилиты: пустой подраздел сохраняет последнюю вкладку', utilities.currentRoute() === 'robots');
utilities.setRoute('shop');
databases.setRoute('cards');
check('подссылки: #db/cards', databases.currentRoute() === 'cards');
databases.setRoute('items');
character.setRoute('repository');
check('подссылки: #char/repository', character.currentRoute() === 'repository');
character.setRoute('');
check('персонаж: пустой подраздел сохраняет последнюю вкладку', character.currentRoute() === 'repository');
character.setRoute('pockets');

check('утилиты: мобильные вкладки', utilities.render(ctx).includes('data-tab-select'));

// Автомастерская: несколько Кочевников в гараже.
const shopRoot = { addEventListener() {} };
shop.bind(shopRoot, { ...ctx, rerender() {} });
const shopHtml = utilities.render(ctx);
check('автомастерская: гараж и переключение машин', ['garage-tabs', 'data-vehicle-select', 'data-add-vehicle', 'data-vehicle-name', 'data-del-vehicle', 'data-import-garage', 'data-garage-file', 'data-vehicle-notes'].every((x) => shopHtml.includes(x)));
check('автомастерская: у последней машины удаление недоступно', /data-del-vehicle disabled/.test(shopHtml));
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
check('автомастерская: удаление машины', leftIds.length === 1 && leftIds[0] === vehicleIds[0] && /data-del-vehicle disabled/.test(garageHtml));

// Дрон: свои ОЗ, защита и ОП из описания, но в итоги машины они не входят.
const dronePart = partsOf(d).find((p) => p.drone);
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
check('миграция: старая сборка становится транспортом', legacyGarage.vehicles.length === 1 && legacyGarage.vehicles[0].name === 'Транспорт 1' && legacyGarage.vehicles[0].build.body === bodyPart.item.id);
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
check('РО: карточка показывает фракции, ранг, статус и лимит БМЕТ', roHtml.includes('data-p="ro.Ацуши"') && roHtml.includes('data-p="ro.ГРА"') && roHtml.includes('data-p="roStatus.Ацуши"') && roHtml.includes('Ранг +2') && roHtml.includes('Лимит БМЕТ: 2'));
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
check('БД: последний предмет — №623', databases.itemRow(d.items[d.items.length - 1], '', { ord: d.items.length }).includes('>#623<'));
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
check('роботы: мастерская показывает БМЕТ, ОЗ и уникальный эффект', bmetHtml.includes('БМЕТ') && bmetHtml.includes('Уникальные эффекты')
  && bmetHtml.includes('250') && bmetHtml.includes('разведка') && !/undefined|NaN/.test(bmetHtml));

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

// АТК — по текущему оружию, модули учитываются только с активацией.
const weapon2 = d.items.find((i) => i.category === 'Оружие' && i.id !== robotWeapon.id);
const atkModule = d.items.find((i) => i.id === '0x1d5');
robotStore.robots = [normRobot({
  id: 'r-atk', name: 'АТК', base: prism.id,
  weapons: [robotWeapon.id, weapon2.id], weapon: 0,
  modules: [atkModule.id, null, null, null, null],
})];
robotStore.active = 'r-atk';
const atkOff = robotStats(robotStore.robots[0], d).total.atk;
const atkOn = robotStats({ ...robotStore.robots[0], weapon: 1, modulesActive: [true, false, false, false, false] }, d).total.atk;
check('роботы: АТК считается по выбранному оружию, а не суммой', atkOff === parsePart(robotWeapon.description).atk, atkOff);
check('роботы: активный модуль добавляет параметры', atkOn === parsePart(weapon2.description).atk + parsePart(atkModule.description).atk
  && !moduleActive(robotStore.robots[0], 0), `${atkOn}`);
const atkHtml = character.render({ ...ctx, char: { ...prismChar, robots: ['r-atk'] } });
check('роботы: в карточке есть выбор оружия и активация модулей', atkHtml.includes('data-robot-weapon="r-atk"')
  && atkHtml.includes('data-robot-module="r-atk.0"') && atkHtml.includes('выкл'));

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

console.log(fail ? `Ошибок: ${fail}` : 'Всё в порядке');
process.exit(fail ? 1 : 0);
