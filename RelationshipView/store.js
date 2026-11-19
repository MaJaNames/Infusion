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

let counter = 0;
export function uid(prefix = 'id') {
  counter = (counter + 1) % 1e6;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const text = (value) => (typeof value === 'string' ? value : value == null ? '' : String(value));
const limit = (value, max) => text(value).trim().slice(0, max);
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

export function newNode({ label = 'Новый персонаж', group = 'acquaintance', x = 0, y = 0 } = {}) {
  return {
    id: uid('n'),
    label: limit(label, 120) || 'Новый персонаж',
    group: GROUP_MAP.has(group) ? group : 'other',
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

  const used = new Set();
  const nodes = [];
  raw.nodes.forEach((item, index) => {
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
  const pairs = new Set();
  const links = [];
  const rawLinks = Array.isArray(raw.links) ? raw.links : [];
  rawLinks.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const source = limit(item.source?.id ?? item.source, 80);
    const target = limit(item.target?.id ?? item.target, 80);
    if (!ids.has(source) || !ids.has(target) || source === target) return;
    const pair = `${source}\u0000${target}`;
    if (pairs.has(pair)) return;
    pairs.add(pair);

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
    if (saved) return normalizeGraph(JSON.parse(saved));
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
  for (const node of graph.nodes) {
    const key = node.label.trim().toLowerCase();
    if (key && !byLabel.has(key)) byLabel.set(key, node);
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

export function graphStats(graph) {
  const groups = Object.fromEntries(GROUPS.map((group) => [group.id, 0]));
  for (const node of graph.nodes) groups[node.group] = (groups[node.group] || 0) + 1;
  return {
    nodes: graph.nodes.length,
    links: graph.links.length,
    dead: graph.nodes.filter((node) => node.dead).length,
    groups,
  };
}

// Небольшая демонстрационная карта: показывает категории, направленные
// связи, «мёртвого» персонажа и упоминание [[…]] в заметке.
export function sampleGraph() {
  const graph = {
    v: 1,
    nodes: [
      {
        id: 'me', label: 'Аки', group: 'self', tags: ['игрок'], dead: false, x: 0, y: 0, fixed: true,
        notes: 'Мой персонаж. Работает на [[Клиенты]] и старается не злить [[Синдикат «Омега»]].',
      },
      {
        id: 'clients', label: 'Клиенты', group: 'client', tags: ['категория'], dead: false, x: 300, y: -150, fixed: false,
        notes: 'Люди, которые платят за работу. Среди них есть и корпорации.',
      },
      {
        id: 'enemies', label: 'Противники', group: 'enemy', tags: ['категория'], dead: false, x: -300, y: -130, fixed: false,
        notes: 'Те, кто хочет проблем. Список пополняется.',
      },
      {
        id: 'mira', label: 'Мира', group: 'ally', tags: ['напарница'], dead: false, x: 160, y: 180, fixed: false,
        notes: 'Надёжная напарница. Сестра [[Рэй]]. Ищет след [[Кай]].',
      },
      {
        id: 'ray', label: 'Рэй', group: 'friend', tags: ['детство'], dead: false, x: -100, y: 260, fixed: false,
        notes: 'Друг детства, теперь работает в доках.',
      },
      {
        id: 'vail', label: 'Доктор Вейл', group: 'acquaintance', tags: ['медик'], dead: false, x: -320, y: 190, fixed: false,
        notes: 'Врач, который не задаёт лишних вопросов. Должен [[Синдикат «Омега»]].',
      },
      {
        id: 'omega', label: 'Синдикат «Омега»', group: 'org', tags: ['корпорация'], dead: false, x: -430, y: 80, fixed: false,
        notes: 'Крупная организация с длинными руками.',
      },
      {
        id: 'kai', label: 'Кай', group: 'enemy', tags: [], dead: true, x: -170, y: -300, fixed: false,
        notes: 'Погиб на задании. Официально — несчастный случай.',
      },
      {
        id: 'info', label: 'Информатор', group: 'colleague', tags: ['связной'], dead: false, x: 170, y: -330, fixed: false,
        notes: 'Продаёт слухи. Иногда полезные.',
      },
      {
        id: 'hanna', label: 'Ханна', group: 'love', tags: [], dead: false, x: 60, y: 360, fixed: false,
        notes: 'Встречаются уже полгода. Не знает о работе Аки.',
      },
    ],
    links: [],
    updatedAt: Date.now(),
  };
  const add = (source, target, label, tone, directed = true) => {
    graph.links.push(newLink({ source, target, label, tone, directed }));
  };
  add('me', 'clients', 'берёт заказы', 'work');
  add('me', 'enemies', 'конфликт', 'negative');
  add('me', 'mira', 'напарники', 'positive', false);
  add('me', 'ray', 'друзья', 'positive', false);
  add('me', 'vail', 'лечится', 'neutral');
  add('me', 'info', 'связной', 'work');
  add('me', 'hanna', 'встречаются', 'positive', false);
  add('clients', 'mira', 'клиент', 'work');
  add('enemies', 'omega', 'финансирует', 'negative');
  add('omega', 'vail', 'долг', 'negative');
  add('enemies', 'kai', 'нанял', 'negative');
  add('mira', 'ray', 'сёстры', 'family', false);
  return normalizeGraph(graph);
}
