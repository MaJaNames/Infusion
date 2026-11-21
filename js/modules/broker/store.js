// Посредник v2: ассортимент из инвентаря продавца, скидки по видам предметов,
// клиентская витрина и заказ любой не-культовой вещи из базы.
// Коды BRK2./ORD2. несовместимы с черновиками и ссылками первой версии.
import { canonId } from '../../core/ids.js';

export const BROKER_KEY = 'infusion.broker';
export const BROKER_ORDER_KEY = 'infusion.broker.order';
export const SHARE_PREFIX = 'BRK2.';
export const ORDER_PREFIX = 'ORD2.';
export const MAX_QTY = 9999;
export const MAX_PRICE = 1000000000;

export const clampPct = (v) => Math.min(100, Math.max(0, Math.round(Number(v) || 0)));
export const clampQty = (v) => Math.min(MAX_QTY, Math.max(0, Math.floor(Number(v) || 0)));
export const clampPrice = (v) => Math.min(MAX_PRICE, Math.max(0, Math.floor(Number(v) || 0)));

// Порядок видов в интерфейсе: сначала расходники и снаряжение, затем техника.
export const CATEGORY_ORDER = [
  'Расходник', 'Оружие', 'Одежда', 'Граната', 'Аксессуар', 'Обвес', 'Имплант',
  'Техник', 'Кочевник', 'Транспорт', 'Скрипт', 'Артефакт', 'Недвижимость', 'Особое', 'Контейнер',
];
const CATEGORY_RANK = new Map(CATEGORY_ORDER.map((c, i) => [c, i]));
export const categoryRank = (c) => CATEGORY_RANK.get(c) ?? 99;
export const categoryLabel = (c) => (c === 'Одежда' ? 'Броня и одежда' : (c || 'Без категории'));

// Культовыми считаем и редкость «Культовый», и отметку iconic.
export const isCultItem = (it) => !!it && (it.rarity === 'Культовый' || !!it.iconic);

export const blankPricing = () => ({ general: 0, byCategory: {} });
export const blankOffer = () => ({
  title: '', note: '',
  pricing: { showcase: blankPricing(), order: blankPricing() },
  showcase: [],
});
export const blankPicks = () => ({ showcase: {}, order: {} });
const blankBroker = () => ({ v: 2, offer: blankOffer(), client: false, tab: 'showcase', picks: blankPicks(), note: '' });

// Ассортимент: по ID одна позиция; цена null означает «считать по скидке».
const normShowcase = (rows) => {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = canonId(row?.id ?? row?.[0]);
    const qty = clampQty(row?.qty ?? row?.[1] ?? 1);
    if (!id || qty <= 0) continue;
    const raw = Array.isArray(row) ? row[2] : row?.price;
    const price = raw === null || raw === undefined || raw === '' ? null : clampPrice(raw);
    const prev = map.get(id);
    map.set(id, { id, qty: Math.min(MAX_QTY, (prev?.qty || 0) + qty), price: prev?.price ?? price });
  }
  return [...map.values()];
};

const normPricing = (raw) => {
  const src = raw && typeof raw === 'object' ? raw : {};
  const byCategory = {};
  for (const [key, value] of Object.entries(src.byCategory && typeof src.byCategory === 'object' ? src.byCategory : {})) {
    const category = String(key || '').trim();
    if (category) byCategory[category] = clampPct(value); // 0 — явный отказ от скидки для вида
  }
  return { general: clampPct(src.general), byCategory };
};

// У витрины и заказа свои скидки. Старые черновики/ссылки с одним набором
// переносят его в оба режима, чтобы ничего не пропало.
export const normOffer = (raw) => {
  const o = raw && typeof raw === 'object' ? raw : {};
  const legacy = { general: o.general, byCategory: o.byCategory };
  const p = o.pricing && typeof o.pricing === 'object' ? o.pricing : null;
  return {
    title: String(o.title ?? '').slice(0, 80),
    note: String(o.note ?? '').slice(0, 1000),
    pricing: {
      showcase: normPricing(p ? p.showcase : legacy),
      order: normPricing(p ? p.order : p?.showcase ?? legacy),
    },
    showcase: normShowcase(o.showcase),
  };
};

export const normPicks = (raw) => {
  const out = blankPicks();
  const src = raw && typeof raw === 'object' ? raw : {};
  for (const mode of ['showcase', 'order']) {
    const group = src[mode] && typeof src[mode] === 'object' ? src[mode] : {};
    for (const [key, value] of Object.entries(group)) {
      const id = canonId(key);
      const qty = clampQty(value);
      if (id && qty) out[mode][id] = qty;
    }
  }
  return out;
};

// Старый черновик v1 намеренно игнорируется: формат витрины полностью изменился.
export const normBroker = (raw) => {
  if (!raw || typeof raw !== 'object' || raw.v !== 2) return blankBroker();
  return {
    ...blankBroker(),
    offer: normOffer(raw.offer),
    client: !!raw.client,
    tab: raw.tab === 'order' ? 'order' : 'showcase',
    picks: normPicks(raw.picks),
    note: String(raw.note ?? '').slice(0, 1000),
  };
};

const read = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };

export const B = normBroker(read(BROKER_KEY));
export const saveBroker = (state = B) => {
  try { localStorage.setItem(BROKER_KEY, JSON.stringify(state)); } catch { /* память браузера недоступна */ }
};

// Скидка вида в нужном режиме: 'showcase' (ассортимент) или 'order' (заказ).
// Свой процент вида важнее общего «Для всех»; явный 0 — отказ от скидки.
export const discountFor = (offer, category, mode = 'showcase') => {
  const group = offer?.pricing?.[mode === 'order' ? 'order' : 'showcase'] || {};
  const map = group.byCategory;
  return clampPct(map && Object.prototype.hasOwnProperty.call(map, category) ? map[category] : group.general);
};

// Цена за штуку округляется: итог строки всегда равен «цена × количество».
export const unitPrice = (cost, discount) => Math.max(0, Math.round((Number(cost) || 0) * (100 - clampPct(discount)) / 100));
export const autoPrice = (item, offer, mode = 'showcase') => unitPrice(item?.cost, discountFor(offer, item?.category, mode));
export const priceFor = (entry, item, offer, mode = 'showcase') => (
  entry?.price === null || entry?.price === undefined ? autoPrice(item, offer, mode) : clampPrice(entry.price)
);

// Строки ассортимента: limit — выставленное количество, qty — выбор покупателя.
export function showcaseRows(offer, itemMap, picks = null) {
  const rows = [];
  for (const entry of offer?.showcase || []) {
    const item = itemMap?.get?.(entry.id);
    if (!item || isCultItem(item)) continue;
    const base = Number(item.cost) || 0;
    const price = priceFor(entry, item, offer, 'showcase');
    const limit = clampQty(entry.qty) || 1;
    const qty = clampQty(picks?.[entry.id]);
    rows.push({
      id: entry.id, item, category: item.category || 'Без категории', base,
      discount: discountFor(offer, item.category, 'showcase'), price,
      custom: entry.price !== null && entry.price !== undefined,
      limit, qty, baseTotal: base * qty, total: price * qty, saved: (base - price) * qty,
    });
  }
  return rows;
}

// Строки заказа из базы: доступен любой не-культовый предмет, цена — по скидке вида.
export function catalogRows(offer, items, picks = null) {
  const rows = [];
  for (const item of items || []) {
    if (isCultItem(item)) continue;
    const base = Number(item.cost) || 0;
    const price = autoPrice(item, offer, 'order');
    const qty = clampQty(picks?.[item.id]);
    rows.push({
      id: item.id, item, category: item.category || 'Без категории', base,
      discount: discountFor(offer, item.category, 'order'), price, custom: false,
      limit: MAX_QTY, qty, baseTotal: base * qty, total: price * qty, saved: (base - price) * qty,
    });
  }
  return rows;
}

// По умолчанию считаем по выбору покупателя; у продавца — по выставленному количеству.
export const totals = (rows, qtyOf = (row) => row.qty) => rows.reduce((acc, row) => {
  const n = clampQty(qtyOf(row));
  const base = Number(row.base) || 0;
  const price = Number(row.price) || 0;
  acc.base += base * n;
  acc.total += price * n;
  acc.saved += (base - price) * n;
  acc.qty += n;
  return acc;
}, { base: 0, total: 0, saved: 0, qty: 0 });

// base64url без зависимостей: одинаково работает в браузере и в Node-тестах.
const toBase64Url = (text) => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (code) => {
  let raw = String(code ?? '').replace(/-/g, '+').replace(/_/g, '/');
  while (raw.length % 4) raw += '=';
  const binary = atob(raw);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

// Код можно вставить вместе с текстом сообщения: берём первый токен после префикса.
const codeBody = (raw, prefix) => {
  const text = String(raw ?? '');
  const at = text.indexOf(prefix);
  if (at >= 0) {
    const match = text.slice(at + prefix.length).match(/[A-Za-z0-9_-]+/);
    if (match) return match[0];
  }
  return text.trim();
};

const packPricing = (group) => ({
  g: clampPct(group?.general),
  c: Object.entries(group?.byCategory || {}).map(([key, value]) => [key, clampPct(value)]),
});

export function encodeOffer(offer) {
  const payload = {
    v: 2,
    t: offer?.title || '',
    n: offer?.note || '',
    p: { s: packPricing(offer?.pricing?.showcase), o: packPricing(offer?.pricing?.order) },
    s: (offer?.showcase || []).map(({ id, qty, price }) => [
      canonId(id), clampQty(qty) || 1, price === null || price === undefined ? null : clampPrice(price),
    ]),
  };
  return SHARE_PREFIX + toBase64Url(JSON.stringify(payload));
}

export function decodeOffer(code) {
  const text = String(code ?? '').trim();
  if (text.includes('BRK1.')) throw new Error('старая ссылка — попросите продавца прислать новую');
  const raw = codeBody(text, SHARE_PREFIX);
  if (!raw) throw new Error('пустая ссылка');
  let data;
  try { data = JSON.parse(fromBase64Url(raw)); } catch { throw new Error('ссылка повреждена'); }
  if (!data || data.v !== 2 || !Array.isArray(data.s)) throw new Error('это не ссылка посредника');
  const decoded = {
    title: data.t, note: data.n,
    general: data.g,
    byCategory: Object.fromEntries(Array.isArray(data.c) ? data.c : []),
    showcase: (data.s || []).map(([id, qty, price]) => ({ id, qty, price })),
  };
  if (data.p) {
    const readPricing = (group) => ({
      general: group?.g,
      byCategory: Object.fromEntries(Array.isArray(group?.c) ? group.c : []),
    });
    decoded.pricing = {
      showcase: readPricing(data.p.s),
      order: readPricing(data.p.o),
    };
  }
  return normOffer(decoded);
}

export function encodeOrder(picks, note = '') {
  const pack = (group) => Object.entries(group || {})
    .map(([id, qty]) => [canonId(id), clampQty(qty)])
    .filter(([id, qty]) => id && qty);
  return ORDER_PREFIX + toBase64Url(JSON.stringify({
    v: 2, n: note || '', s: pack(picks?.showcase), o: pack(picks?.order),
  }));
}

export function decodeOrder(code) {
  const text = String(code ?? '').trim();
  if (text.includes('ORD1.')) throw new Error('старый код заказа — попросите продавца прислать новую ссылку');
  const raw = codeBody(text, ORDER_PREFIX);
  if (!raw) throw new Error('пустой код заказа');
  let data;
  try { data = JSON.parse(fromBase64Url(raw)); } catch { throw new Error('код заказа повреждён'); }
  if (!data || data.v !== 2 || !Array.isArray(data.s) || !Array.isArray(data.o)) throw new Error('это не код заказа');
  return {
    note: String(data.n || '').slice(0, 1000),
    picks: normPicks({ showcase: Object.fromEntries(data.s), order: Object.fromEntries(data.o) }),
  };
}

// Выбор покупателя хранится по конкретной ссылке, чтобы не затирать черновик продавца.
export function readIncomingOrder(code) {
  const saved = read(BROKER_ORDER_KEY);
  if (!saved || saved.code !== code) return null;
  return { picks: normPicks(saved.picks), note: String(saved.note ?? '') };
}
export function saveIncomingOrder(code, picks, note) {
  try {
    localStorage.setItem(BROKER_ORDER_KEY, JSON.stringify({
      code, picks: normPicks(picks), note: String(note ?? '').slice(0, 1000),
    }));
  } catch { /* память браузера недоступна */ }
}
