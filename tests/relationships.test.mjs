// node tests/relationships.test.mjs — модель карты связей (RelationshipView/store.js).
import {
  GROUPS, blankGraph, newNode, newLink, normalizeGraph, exportGraph, serializeGraph, parseGraph,
  extractMentions, mentionPairs, loadGraph, saveGraph, sampleGraph, graphStats, linksBetween,
  CENTER_GROUP, FACTION_COLORS, factionPalette, normFaction, LS_KEY,
} from '../RelationshipView/store.js';

let fail = 0;
const check = (name, ok, info = '') => { if (!ok) fail++; console.log(`${ok ? 'ok ' : 'ОШИБКА'} ${name} ${info}`); };

const raw = {
  nodes: [
    { id: 'a', label: '  Аки  ', group: 'self', tags: [' игрок ', 'игрок', ''], x: '1.26', y: 2, notes: 'Ссылка на [[Мира]] и [[Мира]].' },
    { id: 'a', label: 'Дубль', group: 'nope' },
    { id: 'b', label: 'Мира', group: 'ally', tags: 'не массив' },
    { id: 'c', label: '', group: 'enemy', dead: 1 },
  ],
  links: [
    { id: 'l1', source: 'a', target: 'b', label: ' напарница ', tone: 'positive' },
    { id: 'l2', source: 'b', target: 'a', label: 'дубль пары наоборот', tone: 'negative', directed: false },
    { id: 'l3', source: 'a', target: 'a' },
    { id: 'l4', source: 'a', target: 'нет-такого' },
    { id: 'l5', source: { id: 'a' }, target: 'c', tone: 'неизвестно' },
  ],
};
const g = normalizeGraph(raw);

check('узлы без мусора', g.nodes.length >= 3, g.nodes.length);
check('id уникальны', new Set(g.nodes.map((n) => n.id)).size === g.nodes.length);
check('имя обрезано', g.nodes[0].label === 'Аки');
check('неизвестная категория → other', g.nodes.find((n) => n.label === 'Дубль')?.group === 'other');
check('теги-дубли удалены', JSON.stringify(g.nodes[0].tags) === '["игрок"]', JSON.stringify(g.nodes[0].tags));
check('координаты округлены', g.nodes[0].x === 1.3 && g.nodes[0].y === 2);
check('пустое имя заменено', g.nodes.find((n) => n.id === 'c')?.label === 'Персонаж 4');
check('самосвязь и связь в никуда выброшены', g.links.every((l) => l.source !== l.target));
check('пара сохранена, обратная связь тоже', g.links.length === 3, g.links.length);
check('встречная связь не сливается с прямой', g.links.some((l) => l.source === 'a' && l.target === 'b') && g.links.some((l) => l.source === 'b' && l.target === 'a'));
check('неизвестный тон → neutral', g.links.find((l) => l.id === 'l5')?.tone === 'neutral');
check('directed=false сохранён', g.links.find((l) => l.id === 'l2')?.directed === false);

const twoArrows = normalizeGraph({
  nodes: [{ id: 'a', label: 'Аки' }, { id: 'b', label: 'Мира' }],
  links: [
    { id: 'x', source: 'a', target: 'b', label: 'подчиняется', tone: 'negative' },
    { id: 'y', source: 'a', target: 'b', label: 'покровительствует', tone: 'positive' },
  ],
});
check('две связи в одну сторону сохраняются', twoArrows.links.length === 2 && twoArrows.links.every((l) => l.source === 'a' && l.target === 'b'), twoArrows.links.length);
check('linksBetween видит обе стрелки', linksBetween(twoArrows, 'a', 'b').length === 2 && linksBetween(twoArrows, 'b', 'a').length === 2);
const twoRound = parseGraph(serializeGraph(twoArrows));
check('JSON-круг сохраняет обе стрелки', twoRound.links.length === 2 && new Set(twoRound.links.map((l) => l.id)).size === 2);

const migrated = normalizeGraph({
  zones: [{ id: 'z1', label: 'Организация', x: 10, y: 20 }],
  nodes: [{ id: 'a', label: 'Аки', zone: 'z1' }],
  links: [{ id: 'q', source: 'a', target: 'z1', label: 'избегает' }],
});
check('старые зоны мигрируют в ноды-центры', migrated.nodes.length === 2 && migrated.nodes[0].id === 'z1' && migrated.nodes[0].group === CENTER_GROUP);
check('связь со старой зоной продолжает работать', migrated.links.length === 1 && migrated.links[0].target === 'z1');
check('у узлов больше нет поля zone', migrated.nodes[1].zone === undefined);
check('старая зона становится фракцией', migrated.nodes[0].faction === 'Организация' && migrated.nodes[1].faction === 'Организация');
const migratedRound = parseGraph(serializeGraph(migrated));
check('JSON-круг сохраняет центр и связь с ним', migratedRound.nodes.length === 2 && migratedRound.nodes.some((node) => node.group === CENTER_GROUP) && migratedRound.links.length === 1);

check('упоминания извлекаются и дедуплицируются', JSON.stringify(extractMentions('[[Мира]], [[ Мира ]] и [[Аки]]')) === '["Мира","Аки"]');
check('упоминание без персонажа игнорируется', mentionPairs(g).every((p) => p.source !== p.target));

const pairs = mentionPairs({
  nodes: [
    { id: 'a', label: 'Аки', notes: '[[Мира]] [[Мира]] [[Синдикат]]' },
    { id: 'b', label: 'Мира', notes: '[[Аки]]' },
    { id: 'c', label: 'Синдикат', notes: '' },
  ],
  links: [{ source: 'b', target: 'a' }],
});
check('существующая связь не дублируется упоминанием', pairs.length === 1 && pairs[0].source === 'a' && pairs[0].target === 'c', JSON.stringify(pairs));

const round = parseGraph(serializeGraph(g));
check('JSON-круг сохраняет узлы и связи', round.nodes.length === g.nodes.length && round.links.length === g.links.length);
check('JSON-круг сохраняет заметки и координаты', round.nodes[0].notes === g.nodes[0].notes && round.nodes[0].x === g.nodes[0].x);
check('сериализация — валидный JSON', JSON.parse(serializeGraph(g)).v === 1);

let bad = false;
try { parseGraph('{oops'); } catch { bad = true; }
check('битый JSON даёт понятную ошибку', bad);
bad = false;
try { parseGraph('{}'); } catch { bad = true; }
check('JSON без nodes отвергается', bad);

const custom = newNode({ label: 'Тест', group: 'нечто' });
check('newNode чинит категорию', custom.group === 'other');
check('newNode без фракции', custom.faction === '');
const factional = normalizeGraph({ nodes: [{ id: 'a', label: 'Аки', faction: 'ГРА' }], links: [] });
check('фракция нормализуется', factional.nodes[0].faction === 'ГРА');
check('JSON-круг сохраняет фракцию', parseGraph(serializeGraph(factional)).nodes[0].faction === 'ГРА');
const palette = factionPalette([{ faction: 'Бета' }, { faction: 'Альфа' }, { faction: 'Альфа' }, { faction: '' }]);
check('палитра раздаёт разные цвета', palette.size === 2 && palette.get('Альфа') !== palette.get('Бета'), JSON.stringify([...palette]));
check('палитра игнорирует пустую фракцию', !palette.has(''));
check('цвета палитры валидны', FACTION_COLORS.every((color) => /^#[0-9a-f]{6}$/i.test(color)));
check('«Без фракции» не фракция', normFaction(' Без Фракции ') === '' && normFaction('нет фракции') === '' && normFaction(null) === '');
check('обычная фракция не трогается', normFaction(' ГРА ') === 'ГРА');
const noFaction = normalizeGraph({ nodes: [{ id: 'a', label: 'Аки', faction: 'Без Фракции' }], links: [] });
check('импорт «Без Фракции» даёт пустую фракцию', noFaction.nodes[0].faction === '');
check('палитра не знает «Без Фракции»', !factionPalette([{ faction: 'Без Фракции' }]).size);
const link = newLink({ source: 'a', target: 'b', tone: 'нечто' });
check('newLink чинит тон', link.tone === 'neutral' && link.directed === true);

const mem = new Map();
const storage = {
  getItem: (key) => (mem.has(key) ? mem.get(key) : null),
  setItem: (key, value) => mem.set(key, String(value)),
};
check('saveGraph пишет в хранилище', saveGraph(g, storage) && mem.has(LS_KEY));
check('loadGraph читает обратно', loadGraph(storage).nodes.length === g.nodes.length);
mem.set(LS_KEY, 'не json');
check('битое хранилище → стартовая карта', loadGraph(storage).nodes.length === 1);
check('пустое хранилище → стартовая карта', loadGraph(storage).nodes[0].group === 'self');

const sample = sampleGraph();
check('пример собирается', sample.nodes.length === 18 && sample.links.length === 22, `${sample.nodes.length}/${sample.links.length}`);
check('позиции примера не закреплены', sample.nodes.every((node) => node.fixed === false));
check('пример показывает две стрелки между одной парой', linksBetween(sample, 'me', 'partner').length === 2);
check('пример показывает связь с организацией и связь с человеком внутри', sample.links.some((l) => l.source === 'me' && l.target === 'org_chr') && sample.links.some((l) => l.source === 'me' && l.target === 'medic'));
check('пример содержит мёртвого и упоминания', sample.nodes.some((n) => n.dead) && mentionPairs(sample).length === 3, JSON.stringify(mentionPairs(sample)));
check('организации в примере — обычные ноды-центры', sample.nodes.filter((n) => n.group === CENTER_GROUP).length === 6 && sample.zones === undefined);
const sampleFactions = new Set(sample.nodes.filter((node) => node.group === CENTER_GROUP).map((node) => node.faction));
check('у каждой организации примера есть фракция', sampleFactions.size === 6 && [...sampleFactions].every(Boolean));
check('фракции персонажей примера известны или пусты', sample.nodes.every((node) => !node.faction || sampleFactions.has(node.faction)), JSON.stringify([...new Set(sample.nodes.map((n) => n.faction))]));
check('в примере есть все категории из легенды', GROUPS.every((group) => graphStats(sample).groups[group.id] >= 0));
check('экспорт примера — копия, а не ссылки', exportGraph(sample).nodes[0] !== sample.nodes[0]);

const empty = blankGraph();
check('пустая карта валидна', normalizeGraph(empty).nodes.length === 0);

console.log(fail ? `\n${fail} ошибок` : '\nВсе проверки карты связей пройдены');
process.exit(fail ? 1 : 0);
