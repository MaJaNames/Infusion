// Модель данных карты связей: персонажи (узлы), связи (рёбра), заметки.
// Файл намеренно не зависит от DOM, чтобы его можно было проверять в Node.

export const LS_KEY = 'infusion.relationships';
export const UI_KEY = 'infusion.relationships.ui';
export const VIEW_KEY = 'infusion.relationships.view';

export const GROUPS = [
  { id: 'self', name: 'Мой персонаж' },
  { id: 'ally', name: 'Союзник' },
  { id: 'friend', name: 'Друг' },
  { id: 'family', name: 'Семья' },
  { id: 'love', name: 'Любовь' },
  { id: 'colleague', name: 'Коллега' },
  { id: 'client', name: 'Клиент' },
  { id: 'acquaintance', name: 'Знакомый' },
  { id: 'enemy', name: 'Враг' },
  { id: 'org', name: 'Организация' },
  { id: 'other', name: 'Другое' },
];
export const GROUP_MAP = new Map(GROUPS.map((g) => [g.id, g]));

export const TONES = [
  { id: 'positive', name: 'Хорошие' },
  { id: 'neutral', name: 'Нейтральные' },
  { id: 'negative', name: 'Плохие' },
  { id: 'work', name: 'Рабочие' },
  { id: 'family', name: 'Семейные' },
  { id: 'other', name: 'Прочие' },
];
export const TONE_MAP = new Map(TONES.map((t) => [t.id, t]));

// Организация — обычная нода категории org («первичный центр»).
// Визуальные блибы строятся по полю faction и по взаимному положению нод.
export const CENTER_GROUP = 'org';

// Палитра фракций. Цвета раздаются по алфавиту, поэтому у разных фракций
// они не совпадают, пока палитра не кончится; перерисовка цвет не меняет.
export const FACTION_COLORS = [
  '#e0a458', '#5aa2ee', '#5cc9a7', '#c98be0', '#e2729b', '#6fd0e0',
  '#b7d36b', '#e88f5a', '#8ea8f0', '#d4c15a', '#7fcf9a', '#e39ad0',
  '#a9b8f2', '#f0b27a', '#63c7b2', '#c7a4ef',
];

export function factionPalette(nodes) {
  const names = [...new Set((nodes || [])
    .map((node) => normFaction(node.faction))
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ru'));
  const palette = new Map();
  names.forEach((name, index) => palette.set(name, FACTION_COLORS[index % FACTION_COLORS.length]));
  return palette;
}

let counter = 0;
export function uid(prefix = 'id') {
  counter = (counter + 1) % 1e6;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const text = (value) => (typeof value === 'string' ? value : value == null ? '' : String(value));
const limit = (value, max) => text(value).trim().slice(0, max);

// «Без фракции» — не фракция: такие строки не получают цвет, блиб и не
// стягивают ноды. Пустое поле — единственный способ быть вне фракции.
const NO_FACTION = new Set(['без фракции', 'безфракции', 'нет фракции', 'none', 'null', '-', '—']);
export function normFaction(value) {
  const name = limit(value, 80);
  return NO_FACTION.has(name.toLowerCase()) ? '' : name;
}

const coord = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
};
export function blankGraph() {
  return { v: 1, nodes: [], links: [], updatedAt: Date.now() };
}

export function starterGraph() {
  return {
    v: 1,
    nodes: [
      {
        id: 'me',
        label: 'Мой персонаж',
        group: 'self',
        tags: [],
        dead: false,
        x: 0,
        y: 0,
        fixed: true,
        notes: 'Измените имя и добавьте знакомых. В заметках можно ссылаться на других через [[Имя]] — такие упоминания рисуются пунктиром.',
      },
    ],
    links: [],
    updatedAt: Date.now(),
  };
}

export function newNode({ label = 'Новый персонаж', group = 'acquaintance', faction = '', x = 0, y = 0 } = {}) {
  return {
    id: uid('n'),
    label: limit(label, 120) || 'Новый персонаж',
    group: GROUP_MAP.has(group) ? group : 'other',
    faction: normFaction(faction),
    tags: [],
    dead: false,
    x: coord(x) ?? 0,
    y: coord(y) ?? 0,
    fixed: false,
    notes: '',
  };
}

export function newLink({ source, target, label = '', tone = 'neutral', directed = true } = {}) {
  return {
    id: uid('l'),
    source,
    target,
    label: limit(label, 120),
    tone: TONE_MAP.has(tone) ? tone : 'neutral',
    directed: Boolean(directed),
    notes: '',
  };
}

// Приводим любой внешний JSON к актуальной схеме: не падаем на мусоре,
// чиним дубли id, выкидываем связи в никуда.
export function normalizeGraph(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Это не похоже на карту связей');
  }
  if (!Array.isArray(raw.nodes)) throw new Error('В файле нет списка персонажей (nodes)');

  // Старые карты с массивом zones мигрируют в ноды-центры: ID сохраняются,
  // поэтому связи, которые раньше вели в зону, продолжают работать. Заодно
  // зона становится фракцией, а её участники получают эту фракцию.
  const rawZones = Array.isArray(raw.zones) ? raw.zones : [];
  const zoneFaction = new Map();
  for (const zone of rawZones) {
    if (!zone || typeof zone !== 'object') continue;
    const id = limit(zone.id, 80);
    if (id) zoneFaction.set(id, limit(zone.label ?? zone.name, 120));
  }
  const rawNodes = [
    ...rawZones.map((zone) => ({ ...zone, group: CENTER_GROUP, faction: normFaction(zone.label ?? zone.name) })),
    ...raw.nodes,
  ];

  const used = new Set();
  const nodes = [];
  rawNodes.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    let id = limit(item.id, 80);
    if (!id) id = `n${index + 1}`;
    if (used.has(id)) id = `${id}-${index + 1}`;
    while (used.has(id)) id = `${id}x`;
    used.add(id);

    const group = GROUP_MAP.has(item.group) ? item.group : 'other';
    const tags = Array.isArray(item.tags) ? item.tags : [];
    nodes.push({
      id,
      label: limit(item.label ?? item.name, 120) || `Персонаж ${index + 1}`,
      group,
      faction: normFaction(item.faction) || normFaction(zoneFaction.get(item.zone)),
      tags: [...new Set(tags.map((tag) => limit(tag, 50)).filter(Boolean))],
      dead: Boolean(item.dead),
      x: coord(item.x),
      y: coord(item.y),
      fixed: Boolean(item.fixed),
      notes: text(item.notes ?? item.note).slice(0, 50000),
    });
  });

  const ids = new Set(nodes.map((node) => node.id));
  const linkIds = new Set();
  const links = [];
  const rawLinks = Array.isArray(raw.links) ? raw.links : [];
  rawLinks.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const source = limit(item.source?.id ?? item.source, 80);
    const target = limit(item.target?.id ?? item.target, 80);
    if (!ids.has(source) || !ids.has(target) || source === target) return;
    // Между одной парой может быть несколько связей (в том числе встречных):
    // это разные отношения, поэтому пара больше не является ключом дедупликации.

    let id = limit(item.id, 80);
    if (!id) id = `l${index + 1}`;
    if (linkIds.has(id)) id = `l-${index + 1}-${id}`;
    while (linkIds.has(id)) id = `${id}x`;
    linkIds.add(id);

    links.push({
      id,
      source,
      target,
      label: limit(item.label, 120),
      tone: TONE_MAP.has(item.tone) ? item.tone : 'neutral',
      directed: item.directed !== false,
      notes: text(item.notes ?? item.note).slice(0, 10000),
    });
  });

  return {
    v: 1,
    nodes,
    links,
    updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : Date.now(),
  };
}

export function exportGraph(graph) {
  return {
    v: 1,
    updatedAt: graph.updatedAt || Date.now(),
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      label: node.label,
      group: node.group,
      faction: normFaction(node.faction),
      tags: node.tags,
      dead: Boolean(node.dead),
      x: coord(node.x),
      y: coord(node.y),
      fixed: Boolean(node.fixed),
      notes: node.notes || '',
    })),
    links: graph.links.map((link) => ({
      id: link.id,
      source: link.source,
      target: link.target,
      label: link.label || '',
      tone: link.tone,
      directed: link.directed !== false,
      notes: link.notes || '',
    })),
  };
}

export function serializeGraph(graph) {
  return JSON.stringify(exportGraph(graph), null, 2);
}

export function parseGraph(source) {
  let raw;
  try {
    raw = JSON.parse(source);
  } catch {
    throw new Error('Файл не является корректным JSON');
  }
  return normalizeGraph(raw);
}

export function loadGraph(storage = globalThis.localStorage) {
  try {
    const saved = storage?.getItem?.(LS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      const graph = normalizeGraph(parsed);
      // Псевдо-фракции и старые зоны сохраняем уже в нормализованном виде.
      const dirty = (Array.isArray(parsed.nodes) && parsed.nodes.some(
        (node) => node && normFaction(node.faction) !== (node.faction || ''),
      )) || (Array.isArray(parsed.zones) && parsed.zones.length > 0);
      if (dirty) saveGraph(graph, storage);
      return graph;
    }
  } catch {
    /* повреждённое хранилище — начинаем с чистого листа */
  }
  return starterGraph();
}

export function saveGraph(graph, storage = globalThis.localStorage) {
  try {
    storage?.setItem?.(LS_KEY, serializeGraph(graph));
    return true;
  } catch {
    return false;
  }
}

const MENTION_RE = /\[\[([^[\]\n]{1,120})\]\]/g;

export function extractMentions(notes) {
  const found = [];
  const source = text(notes);
  MENTION_RE.lastIndex = 0;
  let match;
  while ((match = MENTION_RE.exec(source))) {
    const name = match[1].trim();
    if (name) found.push(name);
  }
  return [...new Set(found)];
}

// Пары «заметка → персонаж» для пунктирных связей. Уже существующие
// обычные связи пропускаем, чтобы граф не дублировал линии.
export function mentionPairs(graph) {
  const byLabel = new Map();
  for (const item of graph.nodes || []) {
    const key = item.label.trim().toLowerCase();
    if (key && !byLabel.has(key)) byLabel.set(key, item);
  }
  const linked = new Set();
  for (const link of graph.links) {
    linked.add(`${link.source}\u0000${link.target}`);
    linked.add(`${link.target}\u0000${link.source}`);
  }

  const seen = new Set();
  const pairs = [];
  for (const node of graph.nodes) {
    for (const name of extractMentions(node.notes)) {
      const target = byLabel.get(name.toLowerCase());
      if (!target || target.id === node.id) continue;
      const pair = `${node.id}\u0000${target.id}`;
      if (seen.has(pair) || linked.has(pair)) continue;
      seen.add(pair);
      pairs.push({ source: node.id, target: target.id });
    }
  }
  return pairs;
}

// Все связи между двумя персонажами, независимо от направления.
// Используется и графом (чтобы развести параллельные рёбра по дугам), и UI.
export function linksBetween(graph, a, b) {
  return (graph.links || []).filter((link) => (
    (link.source === a && link.target === b) || (link.source === b && link.target === a)
  ));
}

export function graphStats(graph) {
  const groups = Object.fromEntries(GROUPS.map((group) => [group.id, 0]));
  for (const node of graph.nodes) groups[node.group] = (groups[node.group] || 0) + 1;
  return {
    nodes: graph.nodes.length,
    centers: graph.nodes.filter((node) => node.group === CENTER_GROUP).length,
    links: graph.links.length,
    dead: graph.nodes.filter((node) => node.dead).length,
    groups,
  };
}

// Демонстрационная карта без личных имён: роли, явные фракции с нодами-центрами,
// направленные и встречные связи, отношение к организации и к человеку в ней.
export function sampleGraph() {
  const center = (id, label, x, y, notes) => ({
    id, label, group: CENTER_GROUP, faction: label, tags: ['организация'], dead: false,
    x, y, fixed: false, notes,
  });
  const graph = {
    v: 1,
    nodes: [
      center('org_chr', 'ЧР', -360, 60, 'Подпольная организация, которая есть везде, главное знать, где искать.'),
      center('org_gra', 'ГРА', 250, 120, 'ФБР.'),
      center('org_atsu', 'Ацуши', -140, 310, 'Корпорация что славится своими гейтбрейкерами.'),
      center('org_ix', 'Икс-Экшен', 330, -140, 'Военная корпорация.'),
      center('org_hounds', 'Гончие', 110, -350, 'Байкеры и Отморозки.'),
      center('org_hills', 'Хиллз', 320, -300, 'Шлюхи.'),
      {
        id: 'me', label: 'Мой персонаж', group: 'self', faction: '', tags: [], dead: false, x: 0, y: 0, fixed: false,
        notes: 'Работает на [[Заказчик]] и старается не злить [[ЧР]].',
      },
      {
        id: 'partner', label: 'Напарник', group: 'ally', faction: 'ГРА', tags: [], dead: false, x: 170, y: 160,
        notes: 'Надёжный напарник. Ищет след [[Потерянный]].',
      },
      {
        id: 'client', label: 'Заказчик', group: 'client', faction: 'Икс-Экшен', tags: [], dead: false, x: 400, y: -80,
        notes: 'Платит за работу. Связан с [[ГРА]].',
      },
      {
        id: 'medic', label: 'Медик', group: 'acquaintance', faction: 'ЧР', tags: [], dead: false, x: -270, y: 130,
        notes: 'Лечит без лишних вопросов. Должен [[Наставник]].',
      },
      {
        id: 'contact', label: 'Связной', group: 'colleague', faction: 'ЧР', tags: [], dead: false, x: -410, y: -30,
        notes: 'Передаёт сообщения внутри фракции.',
      },
      {
        id: 'dealer', label: 'Сбытчик', group: 'other', faction: 'ЧР', tags: [], dead: false, x: -440, y: 130,
        notes: 'Работает на организацию, а не на конкретного человека.',
      },
      {
        id: 'mentor', label: 'Наставник', group: 'friend', faction: 'Ацуши', tags: [], dead: false, x: -50, y: 350,
        notes: 'Учит обращаться с техникой.',
      },
      {
        id: 'guard', label: 'Охрана', group: 'acquaintance', faction: 'Хиллз', tags: [], dead: false, x: 240, y: -230,
        notes: 'Следит за порядком на своей территории.',
      },
      {
        id: 'informant', label: 'Информатор', group: 'colleague', faction: 'Хиллз', tags: [], dead: false, x: 380, y: -320,
        notes: 'Продаёт слухи, в том числе конкурентам.',
      },
      {
        id: 'rival', label: 'Конкурент', group: 'enemy', faction: 'Гончие', tags: [], dead: false, x: 40, y: -300,
        notes: 'Мешает работе, но не враг по принципу.',
      },
      {
        id: 'fixer', label: 'Посредник', group: 'colleague', faction: 'ГРА', tags: [], dead: false, x: 320, y: 70,
        notes: 'Сводит людей разных фракций.',
      },
      {
        id: 'lost', label: 'Потерянный', group: 'other', faction: '', tags: [], dead: true, x: -200, y: -300,
        notes: 'Пропал после задания. Официально — несчастный случай.',
      },
    ],
    links: [],
    updatedAt: Date.now(),
  };
  const add = (source, target, label, tone, directed = true) => {
    graph.links.push(newLink({ source, target, label, tone, directed }));
  };
  add('me', 'partner', 'напарники', 'positive', false);
  // Две стрелки между одной парой: разные отношения не сливаются в одну линию.
  add('partner', 'me', 'прикрывает', 'positive');
  add('me', 'client', 'берёт заказы', 'work');
  add('me', 'medic', 'лечится', 'neutral');
  add('me', 'org_chr', 'избегает', 'negative');
  add('me', 'contact', 'связной', 'work');
  add('me', 'mentor', 'учит', 'positive');
  // Связи с центром показывают принадлежность к фракции.
  add('medic', 'org_chr', 'работает на', 'work');
  add('contact', 'org_chr', 'передаёт', 'work');
  add('dealer', 'org_chr', 'подчинён', 'work');
  add('partner', 'org_gra', 'нанимает', 'work');
  add('fixer', 'org_gra', 'связан с', 'work');
  add('client', 'org_ix', 'работает на', 'work');
  add('guard', 'org_hills', 'подчинён', 'work');
  add('informant', 'org_hills', 'подчинён', 'work');
  add('rival', 'org_hounds', 'нанят', 'work');
  add('mentor', 'org_atsu', 'сотрудничает', 'work');
  add('org_gra', 'org_hills', 'соперничество', 'negative');
  add('org_atsu', 'org_ix', 'контракт', 'work');
  add('partner', 'rival', 'конфликт', 'negative');
  add('rival', 'lost', 'нанял', 'negative');
  add('fixer', 'guard', 'переговоры', 'neutral');
  return normalizeGraph(graph);
}
