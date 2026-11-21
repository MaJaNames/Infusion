// Посредник: ассортимент из инвентаря, две независимые скидки, витрина и заказ из базы.
// Списки работают как вкладка «База данных»: поиск, фильтры, сортировка,
// описания и постраничный вывод вместо бесконечной ленты.
import { esc, num, money, label, copyText, RC } from '../../core/util.js';
import { canonId } from '../../core/ids.js';
import { permalinkPath } from '../../core/links.js';
import { isFavorite, toggleFavorite, favoriteKey } from '../../core/favorites.js';
import { showToast } from '../../core/toast.js';
import {
  B, blankOffer, blankPicks, blankPricing, saveBroker, sellerNameOf,
  readSellers, upsertSeller, isCultItem, categoryLabel, categoryRank,
  clampPct, clampQty, clampPrice, MAX_QTY, MAX_PRICE, discountFor, autoPrice, showcaseRows,
  catalogRows, totals, encodeOffer, decodeOffer, encodeOrder, decodeOrder,
  readIncomingOrder, saveIncomingOrder,
} from './store.js';
import { blankListState, collectRows, pageRows, pager, toolbarMarkup, normFilter } from './list.js';

// Входящая ссылка и книжка продавцов хранятся отдельно от черновика продавца.
let incoming = null;
let incomingPicks = blankPicks();
let incomingNote = '';
let incomingTab = 'showcase';
let sellers = readSellers();
const L = {
  seller: blankListState(), assort: blankListState(),
  showcase: blankListState(), order: blankListState(),
};

const activeOffer = () => (incoming ? incoming.offer : B.offer);
const activePicks = () => (incoming ? incomingPicks : B.picks);
const activeNote = () => (incoming ? incomingNote : B.note);
const activeTab = () => (incoming ? incomingTab : B.tab);
const isClient = () => !!incoming || B.client;
const nonCult = (ctx) => (ctx?.data?.items || []).filter((it) => !isCultItem(it));
const categoriesOf = (rows) => [...new Set(rows.map((row) => row.category).filter(Boolean))]
  .sort((a, b) => categoryRank(a) - categoryRank(b) || a.localeCompare(b, 'ru'));

function stockMap(ctx) {
  const map = new Map();
  for (const entry of ctx?.char?.pockets || []) {
    const id = canonId(entry.id);
    if (id) map.set(id, (map.get(id) || 0) + (Number(entry.qty) || 0));
  }
  return map;
}

export function setRoute(sub) {
  const raw = String(sub || '');
  const match = raw.match(/^offer(?:[/=])(.+)$/);
  if (!match) { incoming = null; return; }
  let rest = match[1];
  const cut = rest.indexOf('?');
  if (cut >= 0) rest = rest.slice(0, cut);
  let code;
  try { code = decodeURIComponent(rest); } catch { code = rest; }
  if (incoming?.code === code) return;
  try {
    const offer = decodeOffer(code);
    const name = sellerNameOf(offer);
    const prev = sellers[name];
    const saved = readIncomingOrder(code);
    incomingPicks = saved ? saved.picks : (prev && prev.code === code ? prev.picks : blankPicks());
    incomingNote = saved ? saved.note : (prev && prev.code === code ? prev.note : '');
    incoming = { code, offer };
    incomingTab = 'showcase';
    // Новая ссылка от того же продавца перезаписывает его запись в книжке клиента.
    sellers = upsertSeller({ name, code, offer, picks: incomingPicks, note: incomingNote, tab: incomingTab, at: Date.now() });
    L.showcase.page = 1;
    L.order.page = 1;
  } catch (err) {
    incoming = null;
    showToast(`Не удалось открыть ссылку: ${err.message}`);
  }
}

export function currentRoute() {
  return incoming ? `broker/offer/${encodeURIComponent(incoming.code)}` : 'broker';
}

const savedLabel = () => (B.savedAt
  ? `Сохранено автоматически · ${new Date(B.savedAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`
  : 'Сохранено автоматически');

function autosave(ctx, root = null) {
  saveBroker();
  ctx.markSaved?.();
  const el = root?.querySelector?.('[data-broker-save]');
  if (el) el.textContent = savedLabel();
}

function commit(ctx, rerender = true) {
  if (incoming) {
    saveIncomingOrder(incoming.code, incomingPicks, incomingNote);
    sellers = upsertSeller({
      name: sellerNameOf(incoming.offer), code: incoming.code, offer: incoming.offer,
      picks: incomingPicks, note: incomingNote, tab: incomingTab, at: Date.now(),
    });
  } else autosave(ctx);
  ctx.markSaved?.();
  if (rerender) ctx.rerender();
}

// ── Ссылки и тексты ────────────────────────────────────────────────────────

function shareUrl(ctx) {
  const code = encodeOffer(activeOffer());
  const path = `#util/broker/offer/${encodeURIComponent(code)}`;
  if (typeof document === 'undefined') return path;
  try { return new URL(path, document.baseURI).href; } catch { return path; }
}

function offerText(ctx) {
  const offer = activeOffer();
  const rows = showcaseRows(offer, ctx.data.itemMap);
  const sum = totals(rows, (row) => row.limit);
  const lines = [`АССОРТИМЕНТ · ${offer.seller || SELLER_FALLBACK}${offer.title ? ` · ${offer.title}` : ''}`, offer.note || ''];
  lines.push(`Скидка для всех: витрина ${num(discountFor(offer, '', 'showcase'))}% · заказ ${num(discountFor(offer, '', 'order'))}%`);
  const cats = categoriesOf(rows);
  if (cats.length) lines.push(`Скидки по видам: ${cats.map((c) => `${categoryLabel(c)} — витрина ${num(discountFor(offer, c, 'showcase'))}%, заказ ${num(discountFor(offer, c, 'order'))}%`).join(', ')}`);
  lines.push('', 'В наличии:');
  for (const row of rows) {
    lines.push(`- [${row.item.tag || '—'}] ${row.item.name} ×${num(row.limit)} — ${num(row.price)} кр.${row.custom ? ' (своя цена)' : ''}`);
  }
  lines.push('', `Стоимость ассортимента: ${num(sum.total)} кр.`);
  lines.push('Заказ из базы: любой не-культовый предмет по скидкам режима «Заказ».', '', shareUrl(ctx));
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const selectedRows = (ctx) => [
  ...showcaseRows(activeOffer(), ctx.data.itemMap, activePicks().showcase).filter((row) => row.qty > 0),
  ...catalogRows(activeOffer(), nonCult(ctx), activePicks().order).filter((row) => row.qty > 0),
];

const orderCode = () => encodeOrder(activePicks(), activeNote());

function orderText(ctx) {
  const offer = activeOffer();
  const shop = showcaseRows(offer, ctx.data.itemMap, activePicks().showcase).filter((row) => row.qty > 0);
  const base = catalogRows(offer, nonCult(ctx), activePicks().order).filter((row) => row.qty > 0);
  const sum = totals([...shop, ...base]);
  const lines = [`ЗАКАЗ · ${offer.seller || SELLER_FALLBACK}${offer.title ? ` · ${offer.title}` : ''}`, activeNote() || ''];
  if (shop.length) {
    lines.push('', 'Из ассортимента:');
    for (const row of shop) lines.push(`- [${row.item.tag || '—'}] ${row.item.name} ×${num(row.qty)} — ${num(row.total)} кр.`);
  }
  if (base.length) {
    lines.push('', 'Из базы:');
    for (const row of base) lines.push(`- [${row.item.tag || '—'}] ${row.item.name} ×${num(row.qty)} — ${num(row.total)} кр. (скидка ${num(row.discount)}%)`);
  }
  lines.push('', `Итого: ${num(sum.total)} кр.${sum.saved ? ` · скидка ${num(sum.saved)} кр.` : ''}`, '', orderCode());
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const SELLER_FALLBACK = 'Продавец';

// ── Общая разметка ─────────────────────────────────────────────────────────

function summaryChips(sum, count, first = 'Позиций') {
  const avg = sum.base ? Math.round((1 - sum.total / sum.base) * 100) : 0;
  return `<span class="chip">${esc(first)}: ${num(count)}</span>
    <span class="chip">Штук: ${num(sum.qty)}</span>
    <span class="chip">Без скидки: ${money(sum.base)}</span>
    <span class="chip total">К оплате: ${money(sum.total)}</span>
    ${sum.saved ? `<span class="chip">Скидка: ${money(sum.saved)} · ${num(avg)}%</span>` : ''}`;
}

const unitHtml = (row) => `${row.custom || row.discount ? `<small><s>${money(row.base)}</s></small>` : ''}${money(row.price)}`;

function discountChips(offer, rows) {
  const general = `<span class="chip">Для всех: витрина ${num(discountFor(offer, '', 'showcase'))}% · заказ ${num(discountFor(offer, '', 'order'))}%</span>`;
  const cats = categoriesOf(rows);
  if (!cats.length) return general;
  return general + cats.map((c) => {
    const shop = discountFor(offer, c, 'showcase');
    const ord = discountFor(offer, c, 'order');
    return `<span class="chip${shop || ord ? ' total' : ''}">${esc(categoryLabel(c))}: витрина ${num(shop)}% · заказ ${num(ord)}%</span>`;
  }).join('');
}

// ── Списки ─────────────────────────────────────────────────────────────────

function listSource(ctx, id) {
  if (id === 'seller') {
    const stock = stockMap(ctx);
    const out = [];
    for (const [itemId, have] of stock) {
      const item = ctx.data.itemMap.get(itemId);
      if (!item || isCultItem(item)) continue;
      out.push({
        id: itemId, item, category: item.category, base: Number(item.cost) || 0, have,
        price: autoPrice(item, B.offer, 'showcase'), discount: discountFor(B.offer, item.category, 'showcase'),
      });
    }
    return out;
  }
  if (id === 'assort') return showcaseRows(B.offer, ctx.data.itemMap);
  if (id === 'showcase') return showcaseRows(activeOffer(), ctx.data.itemMap, activePicks().showcase);
  return catalogRows(activeOffer(), nonCult(ctx), activePicks().order);
}

const favButton = (row) => `<button type="button" class="row-fav${isFavorite('items', row.id) ? ' on' : ''}" data-fav="${esc(favoriteKey('items', row.id))}" title="В избранное" aria-label="В избранное">★</button>`;
const shareButton = (row) => `<button type="button" class="row-share" data-share="${esc(permalinkPath('items', row.id))}" title="Ссылка на запись" aria-label="Ссылка на запись">🔗</button>`;

function nameBlock(row, st, extra = '') {
  const it = row.item;
  return `<span class="tag">${esc(it.tag || '—')}</span><b>${esc(it.name)}</b>
    <div class="meta">${esc(it.rarity)} · ${esc(categoryLabel(row.category))}${it.iconic && it.rarity !== 'Культовый' ? ' · культовый' : ''}${it.organization && it.organization !== 'Общедоступно' ? ` · ${esc(it.organization)}` : ''}${extra}${st.showIds ? ` <span class="row-id" title="ID в БД">ID ${esc(row.id)}</span>` : ''}</div>`;
}

const priceBlock = (row) => `${unitHtml(row)}${row.qty > 1 ? `<small>${num(row.qty)} × ${money(row.price)} = ${money(row.total)}</small>` : ''}`;

function drawSellerPick(ctx, row) {
  const st = L.seller;
  const entry = B.offer.showcase.find((e) => e.id === row.id);
  return `<details class="row ${RC[row.item.rarity] || 'c'}" data-row="seller:${esc(row.id)}">
    <summary><div>${nameBlock(row, st)}</div><span class="row-side">
      ${favButton(row)}${shareButton(row)}
      <span class="price">${money(row.price)}<small class="sell">в наличии ${num(row.have)}</small></span>
      <button type="button" class="broker-add${entry ? ' on' : ''}" data-broker-add="${esc(row.id)}">${entry ? `✓ ×${num(entry.qty)}` : '+'}</button>
    </span></summary>
    <div class="body"><p class="desc">${esc(row.item.description || 'Описание не заполнено.')}</p></div>
  </details>`;
}

function drawAssort(ctx, row) {
  const st = L.assort;
  const have = stockMap(ctx).get(row.id) || 0;
  const max = Math.max(row.limit, have, 1);
  return `<details class="row ${RC[row.item.rarity] || 'c'}" data-row="assort:${esc(row.id)}">
    <summary><div>${nameBlock(row, st, row.custom ? ' · своя цена' : ` · скидка ${num(row.discount)}%`)}</div><span class="row-side">
      ${favButton(row)}${shareButton(row)}
      <span class="broker-qty row-inv">
        <button type="button" class="inv-btn" data-broker-show-delta="-1" data-id="${esc(row.id)}"${row.limit <= 1 ? ' disabled' : ''} aria-label="Уменьшить количество">−</button>
        <input class="inv-qty" type="number" min="1" max="${max}" step="1" inputmode="numeric" data-broker-show-qty="${esc(row.id)}" value="${row.limit}" aria-label="Количество на витрине">
        <button type="button" class="inv-btn" data-broker-show-delta="1" data-id="${esc(row.id)}"${row.limit >= max ? ' disabled' : ''} aria-label="Увеличить количество">+</button>
      </span>
      <span class="price" data-broker-price-view="${esc(row.id)}">${unitHtml(row)}</span>
      <button type="button" class="x" data-broker-remove="${esc(row.id)}" title="Убрать из ассортимента" aria-label="Убрать из ассортимента">✕</button>
    </span></summary>
    <div class="body">
      <span class="broker-price-edit">Своя цена, кр. <input type="number" min="0" max="${MAX_PRICE}" step="1" inputmode="numeric" data-broker-price="${esc(row.id)}" value="${row.custom ? row.price : ''}" placeholder="авто" aria-label="Своя цена"></span>
      <p class="desc">${esc(row.item.description || 'Описание не заполнено.')}</p>
    </div>
  </details>`;
}

function drawClient(ctx, row, from) {
  const st = L[from];
  const max = from === 'showcase' ? row.limit : MAX_QTY;
  const extra = from === 'showcase' ? ` · доступно ${num(row.limit)}` : ` · скидка ${num(row.discount)}%`;
  return `<details class="row ${RC[row.item.rarity] || 'c'}" data-row="${from}:${esc(row.id)}">
    <summary><div>${nameBlock(row, st, extra)}</div><span class="row-side">
      <input type="checkbox" class="broker-check" data-broker-check="${esc(row.id)}" data-broker-from="${from}"${row.qty > 0 ? ' checked' : ''} aria-label="Выбрать ${esc(row.item.name)}">
      <span class="broker-qty row-inv">
        <button type="button" class="inv-btn" data-broker-order-delta="-1" data-id="${esc(row.id)}" data-broker-from="${from}"${row.qty <= 0 ? ' disabled' : ''} aria-label="Убрать 1 шт.">−</button>
        <input class="inv-qty" type="number" min="0" max="${max}" step="1" inputmode="numeric" data-broker-order-qty="${esc(row.id)}" data-broker-from="${from}" value="${row.qty}" aria-label="Количество">
        <button type="button" class="inv-btn" data-broker-order-delta="1" data-id="${esc(row.id)}" data-broker-from="${from}" aria-label="Добавить 1 шт.">+</button>
      </span>
      <span class="price" data-price-row="${esc(row.id)}">${priceBlock(row)}</span>
    </span></summary>
    <div class="body"><p class="desc">${esc(row.item.description || 'Описание не заполнено.')}</p></div>
  </details>`;
}

function listDraw(ctx, id) {
  if (id === 'seller') return (row) => drawSellerPick(ctx, row);
  if (id === 'assort') return (row) => drawAssort(ctx, row);
  return (row) => drawClient(ctx, row, id);
}

function listContent(ctx, id) {
  const st = L[id];
  const { rows, total } = collectRows(st, listSource(ctx, id));
  const pg = pageRows(rows, st);
  const draw = listDraw(ctx, id);
  const list = pg.slice.length
    ? `<div class="list">${pg.slice.map(draw).join('')}</div>`
    : '<div class="empty">Ничего не найдено. Сбросьте часть фильтров.</div>';
  return `<p class="meta">Найдено: ${num(total)}</p>${list}${pager(st, total, pg.pages, pg.from, pg.to, id)}`;
}

function listPanel(ctx, id, title, hint, extra = '') {
  return `<section class="panel broker-list">
    <h2>${esc(title)}</h2><p class="meta">${esc(hint)}</p>
    ${toolbarMarkup(id, L[id], listSource(ctx, id).map((r) => r.item))}
    ${extra}
    <div data-list-body="${id}">${listContent(ctx, id)}</div>
  </section>`;
}

function refreshList(root, ctx, id) {
  const body = root.querySelector?.(`[data-list-body="${id}"]`);
  if (body) body.innerHTML = listContent(ctx, id);
}

// ── Панели продавца ────────────────────────────────────────────────────────

function sellerHead(ctx) {
  const offer = activeOffer();
  return `<section class="panel broker">
    <div class="broker-head">
      <div>
        <h2>Посредник</h2>
        <p class="meta">Соберите ассортимент из своего инвентаря, назначьте разные скидки для витрины и заказа и поделитесь ссылкой. Всё сохраняется автоматически.</p>
      </div>
      <div class="broker-actions">
        <span class="broker-save" data-broker-save>${esc(savedLabel())}</span>
        <button type="button" data-broker-buyer>Глазами покупателя</button>
        <button type="button" data-broker-reset>Очистить</button>
      </div>
    </div>
    <label class="broker-field">Продавец (из карточки персонажа)<input type="text" maxlength="80" data-broker-seller value="${esc(offer.seller)}" placeholder="Имя персонажа"></label>
    <label class="broker-field">Название предложения<input type="text" maxlength="80" data-broker-title value="${esc(offer.title)}" placeholder="Например, «Лавка Линча»"></label>
    <label class="broker-field">Описание<textarea rows="2" maxlength="1000" data-broker-note placeholder="Условия, место, способ связи…">${esc(offer.note)}</textarea></label>
  </section>`;
}

function discountGrid(ctx) {
  const offer = activeOffer();
  const categories = categoriesOf(nonCult(ctx).map((it) => ({ category: it.category })));
  const fields = (category) => [['showcase', 'Витрина'], ['order', 'Заказ']].map(([mode, title]) => {
    const group = offer.pricing[mode];
    const value = category === null ? group.general
      : (Object.prototype.hasOwnProperty.call(group.byCategory, category) ? group.byCategory[category] : group.general);
    const attr = category === null ? 'data-broker-general' : `data-broker-cat="${esc(category)}"`;
    const aria = category === null ? `${title} — для всех` : `${title} — ${categoryLabel(category)}`;
    return `<input type="number" min="0" max="100" step="1" inputmode="numeric" data-broker-mode="${mode}" ${attr} value="${value}" aria-label="${esc(aria)}">`;
  }).join('');
  return `<div class="broker-discount-grid">
    <div class="broker-discount-row head"><span>Вид предметов</span><span>Витрина, %</span><span>Заказ, %</span></div>
    <div class="broker-discount-row"><span>Для всех</span>${fields(null)}</div>
    ${categories.map((c) => `<div class="broker-discount-row"><span>${esc(categoryLabel(c))}</span>${fields(c)}</div>`).join('')}
  </div>
  <div class="chips broker-discount-chips" data-broker-discount-chips>${discountChips(offer, showcaseRows(offer, ctx.data.itemMap))}</div>
  <div class="btns broker-discount-actions">
    <button type="button" data-broker-fill-general>Заполнить свои «Для всех»</button>
    <button type="button" data-broker-discount-reset>Сбросить скидки</button>
  </div>`;
}

function discountPanel(ctx) {
  return `<section class="panel broker-discount">
    <h2>Цены и скидки</h2>
    <p class="meta">У витрины и заказа свои проценты: «Для всех» и по видам предметов. Своя цена на товаре ассортимента заменяет скидку витрины. Культовые предметы не участвуют.</p>
    <div data-broker-discount-grid>${discountGrid(ctx)}</div>
  </section>`;
}

function showcasePanel(ctx) {
  const rows = showcaseRows(activeOffer(), ctx.data.itemMap);
  return listPanel(ctx, 'assort', 'Ассортимент',
    'Количество — сколько выставляете на витрину. Пустая «Своя цена» означает цену со скидкой витрины.',
    `<div class="chips broker-summary" data-broker-show-summary>${summaryChips(totals(rows, (row) => row.limit), rows.length)}</div>`);
}

function sharePanel(ctx) {
  return `<section class="panel broker-share">
    <h2>Поделиться</h2>
    <p class="meta">Одна ссылка открывает клиенту витрину с вашими ценами и заказ из базы по скидкам заказа. По имени продавца ссылки от одного персонажа перезаписывают друг друга в книжке клиента.</p>
    <div class="broker-share-row">
      <input type="text" readonly value="${esc(shareUrl(ctx))}" data-broker-share-url aria-label="Ссылка на предложение">
      <button type="button" data-broker-share>Скопировать ссылку</button>
    </div>
    <div class="btns"><button type="button" data-broker-text>Скопировать текст</button></div>
    <details class="broker-order">
      <summary>Заказ покупателя</summary>
      <p class="meta">Вставьте код <code>ORD2.…</code>, который прислал клиент. Заказ откроется в «Глазах покупателя».</p>
      <textarea rows="2" data-broker-order-input placeholder="ORD2.…"></textarea>
      <button type="button" data-broker-load-order>Загрузить заказ</button>
    </details>
  </section>`;
}

// ── Клиент ─────────────────────────────────────────────────────────────────

function sellerTabBar() {
  const names = Object.keys(sellers).sort((a, b) => a.localeCompare(b, 'ru'));
  if (names.length < 2) return '';
  const active = incoming ? sellerNameOf(incoming.offer) : '';
  return `<div class="broker-sellers" role="tablist" aria-label="Продавцы">${names.map((name) =>
    `<button type="button" role="tab" data-seller-tab="${esc(name)}" class="${name === active ? 'on' : ''}" aria-selected="${name === active}">${esc(name)}</button>`).join('')}</div>`;
}

function clientSummaryChips(ctx) {
  const rows = selectedRows(ctx);
  return summaryChips(totals(rows), rows.length, 'Выбрано');
}

function clientPanel(ctx, shared) {
  const offer = activeOffer();
  const tab = activeTab();
  const hasAny = selectedRows(ctx).length > 0;
  const hint = tab === 'showcase'
    ? 'Только ассортимент продавца; количество ограничено выставленным.'
    : 'Любой не-культовый предмет из базы по скидкам режима «Заказ».';
  return `${sellerTabBar()}<section class="panel broker-buyer">
    <div class="broker-head">
      <div>
        <h2>${esc(offer.seller || SELLER_FALLBACK)}${offer.title ? ` · ${esc(offer.title)}` : ''}</h2>
        <p class="meta">${shared ? 'Вам поделились ассортиментом. Возьмите вещи из витрины или закажите любой не-культовый предмет из базы.' : 'Так предложение видит клиент: выберите товары из витрины или закажите из базы, затем скопируйте заказ.'}</p>
      </div>
      <div class="broker-actions">${shared ? '<button type="button" data-broker-exit-share>Вернуться к своему</button>' : '<button type="button" data-broker-buyer>Вернуться к витрине продавца</button>'}</div>
    </div>
    ${offer.note ? `<p class="broker-note-text">${esc(offer.note)}</p>` : ''}
    <div class="broker-modes" role="tablist" aria-label="Режим клиента">
      <button type="button" role="tab" data-broker-tab="showcase" class="${tab === 'showcase' ? 'on' : ''}" aria-selected="${tab === 'showcase'}">Витрина · ${num(showcaseRows(offer, ctx.data.itemMap).length)}</button>
      <button type="button" role="tab" data-broker-tab="order" class="${tab === 'order' ? 'on' : ''}" aria-selected="${tab === 'order'}">Заказ из базы</button>
    </div>
    ${listPanel(ctx, tab, tab === 'showcase' ? 'Ассортимент продавца' : 'Заказ из базы', hint)}
    <div class="chips broker-summary" data-broker-buy-summary>${clientSummaryChips(ctx)}</div>
    <label class="broker-field">Комментарий к заказу<textarea rows="2" data-broker-order-note placeholder="Имя, способ связи, пожелания…">${esc(activeNote())}</textarea></label>
    <div class="btns broker-order-actions">
      <button type="button" data-broker-order-text${hasAny ? '' : ' disabled'}>Скопировать заказ</button>
      <button type="button" data-broker-order-code${hasAny ? '' : ' disabled'}>Код заказа</button>
      <button type="button" data-broker-clear-order${hasAny ? '' : ' disabled'}>Сбросить выбор</button>
    </div>
  </section>`;
}

export function render(ctx) {
  if (!ctx?.data) return '';
  if (!incoming && !B.offer.seller && ctx.char?.name) {
    B.offer.seller = String(ctx.char.name).slice(0, 80);
    saveBroker();
  }
  return isClient() ? clientPanel(ctx, !!incoming)
    : `${sellerHead(ctx)}${discountPanel(ctx)}${listPanel(ctx, 'seller', 'Из инвентаря', 'Только предметы из хранилища персонажа. Фильтры, поиск, сортировка и описания — как в базе данных.')}${showcasePanel(ctx)}${sharePanel(ctx)}`;
}

// ── Обновление частей без полной перерисовки ───────────────────────────────

function updateCommon(root, ctx) {
  const rows = showcaseRows(activeOffer(), ctx.data.itemMap);
  const sum = root.querySelector?.('[data-broker-show-summary]');
  if (sum) sum.innerHTML = summaryChips(totals(rows, (row) => row.limit), rows.length);
  const chips = root.querySelector?.('[data-broker-discount-chips]');
  if (chips) chips.innerHTML = discountChips(activeOffer(), rows);
  const url = root.querySelector?.('[data-broker-share-url]');
  if (url) url.value = shareUrl(ctx);
  const save = root.querySelector?.('[data-broker-save]');
  if (save) save.textContent = savedLabel();
}

function refreshSeller(root, ctx, keepDiscounts = false) {
  refreshList(root, ctx, 'seller');
  refreshList(root, ctx, 'assort');
  updateCommon(root, ctx);
  if (!keepDiscounts) {
    const grid = root.querySelector?.('[data-broker-discount-grid]');
    if (grid) grid.innerHTML = discountGrid(ctx);
  }
}

// Печать в поле цены: не трогаем сам input, иначе теряется фокус.
function updatePriceViews(root, ctx) {
  const rows = showcaseRows(activeOffer(), ctx.data.itemMap);
  const map = new Map(rows.map((row) => [row.id, row]));
  root.querySelectorAll?.('[data-broker-price-view]').forEach?.((el) => {
    const row = map.get(el.dataset.brokerPriceView);
    if (row) el.innerHTML = unitHtml(row);
  });
  updateCommon(root, ctx);
}

function updateClient(root, ctx) {
  refreshList(root, ctx, activeTab());
  const sum = root.querySelector?.('[data-broker-buy-summary]');
  if (sum) sum.innerHTML = clientSummaryChips(ctx);
  const hasAny = selectedRows(ctx).length > 0;
  root.querySelectorAll?.('[data-broker-order-text], [data-broker-order-code], [data-broker-clear-order]')
    .forEach?.((btn) => { btn.disabled = !hasAny; });
}

// ── Изменения ──────────────────────────────────────────────────────────────

function addShowcase(id, ctx) {
  if (incoming) return;
  const have = stockMap(ctx).get(id) || 0;
  const item = ctx.data.itemMap.get(id);
  if (!item || isCultItem(item) || !have) { showToast('Предмета нет в инвентаре или он культовый'); return; }
  const entry = B.offer.showcase.find((row) => row.id === id);
  if (entry) entry.qty = Math.min(have, entry.qty + 1);
  else B.offer.showcase.push({ id, qty: Math.min(have, MAX_QTY), price: null });
  saveBroker();
  ctx.markSaved?.();
}

function removeShowcase(id, ctx) {
  if (incoming) return;
  B.offer.showcase = B.offer.showcase.filter((row) => row.id !== id);
  delete B.picks.showcase[id];
  saveBroker();
  ctx.markSaved?.();
}

function setShowQty(id, value, ctx) {
  if (incoming) return;
  const entry = B.offer.showcase.find((row) => row.id === id);
  if (!entry) return;
  const max = Math.max(entry.qty, stockMap(ctx).get(id) || 0, 1);
  entry.qty = Math.min(max, Math.max(1, clampQty(value)));
  saveBroker();
  ctx.markSaved?.();
}

function setPrice(id, value, ctx) {
  if (incoming) return;
  const entry = B.offer.showcase.find((row) => row.id === id);
  if (!entry) return;
  const text = String(value ?? '').trim();
  entry.price = text === '' ? null : clampPrice(text);
  saveBroker();
  ctx.markSaved?.();
}

function setPick(from, id, value, ctx, limit = MAX_QTY) {
  const qty = Math.min(limit, clampQty(value));
  const picks = activePicks();
  if (qty) picks[from][id] = qty;
  else delete picks[from][id];
  commit(ctx, false);
}

function loadOrder(root, ctx) {
  const input = root.querySelector?.('[data-broker-order-input]');
  try {
    const parsed = decodeOrder(input?.value || '');
    const showIds = new Set(activeOffer().showcase.map((entry) => entry.id));
    const itemIds = new Set(nonCult(ctx).map((it) => it.id));
    const limits = new Map(showcaseRows(activeOffer(), ctx.data.itemMap).map((row) => [row.id, row.limit]));
    const picks = blankPicks();
    let skipped = 0;
    for (const [id, qty] of Object.entries(parsed.picks.showcase)) {
      if (showIds.has(id)) picks.showcase[id] = Math.min(qty, limits.get(id) || qty);
      else skipped++;
    }
    for (const [id, qty] of Object.entries(parsed.picks.order)) {
      if (itemIds.has(id)) picks.order[id] = qty;
      else skipped++;
    }
    if (!Object.keys(picks.showcase).length && !Object.keys(picks.order).length) {
      throw new Error('в заказе нет предметов из этого предложения');
    }
    const tab = Object.keys(picks.showcase).length ? 'showcase' : 'order';
    if (incoming) { incomingPicks = picks; incomingNote = parsed.note; incomingTab = tab; }
    else { B.picks = picks; B.note = parsed.note; B.client = true; B.tab = tab; }
    commit(ctx);
    showToast(`Заказ загружен${skipped ? `, пропущено позиций: ${skipped}` : ''}`);
  } catch (err) {
    showToast(`Не удалось загрузить заказ: ${err.message}`);
  }
}

// ── События ────────────────────────────────────────────────────────────────

export function bind(root, ctx) {
  root.oninput = (e) => {
    const t = e.target;
    if (t.dataset.listQ !== undefined) {
      const st = L[t.dataset.listQ];
      if (!st) return;
      st.q = t.value; st.page = 1;
      refreshList(root, ctx, t.dataset.listQ);
      return;
    }
    if (t.dataset.brokerSeller !== undefined) {
      if (!incoming) B.offer.seller = String(t.value).slice(0, 80);
      autosave(ctx, root);
      return;
    }
    if (t.dataset.brokerTitle !== undefined) {
      if (!incoming) B.offer.title = String(t.value).slice(0, 80);
      const url = root.querySelector?.('[data-broker-share-url]');
      if (url) url.value = shareUrl(ctx);
      autosave(ctx, root);
      return;
    }
    if (t.dataset.brokerNote !== undefined) {
      if (!incoming) B.offer.note = String(t.value).slice(0, 1000);
      autosave(ctx, root);
      return;
    }
    if (t.dataset.brokerOrderNote !== undefined) {
      if (incoming) incomingNote = String(t.value).slice(0, 1000);
      else B.note = String(t.value).slice(0, 1000);
      commit(ctx, false);
      return;
    }
    if (t.dataset.brokerPrice !== undefined) {
      setPrice(t.dataset.brokerPrice, t.value, ctx);
      updatePriceViews(root, ctx);
      return;
    }
    if (t.dataset.brokerGeneral !== undefined) {
      const mode = t.dataset.brokerMode === 'order' ? 'order' : 'showcase';
      B.offer.pricing[mode].general = clampPct(t.value);
      autosave(ctx, root);
      refreshSeller(root, ctx, true);
      return;
    }
    if (t.dataset.brokerCat !== undefined) {
      const mode = t.dataset.brokerMode === 'order' ? 'order' : 'showcase';
      B.offer.pricing[mode].byCategory[t.dataset.brokerCat] = clampPct(t.value);
      autosave(ctx, root);
      refreshSeller(root, ctx, true);
    }
  };

  root.onchange = (e) => {
    const t = e.target;
    if (t.dataset.listAddK !== undefined) {
      const id = t.dataset.listAddK, st = L[id];
      if (!st || !t.value) return;
      const key = t.dataset.k;
      const values = normFilter(st.filters[key]);
      if (!values.includes(t.value)) values.push(t.value);
      st.filters[key] = values;
      st.page = 1;
      ctx.rerender();
      return;
    }
    if (t.dataset.listSort !== undefined) {
      const st = L[t.dataset.listSort];
      if (!st) return;
      st.sort = [t.value, st.sort?.[1] === -1 ? -1 : 1];
      st.page = 1;
      ctx.rerender();
      return;
    }
    if (t.dataset.listIds !== undefined) {
      L[t.dataset.listIds].showIds = !!t.checked;
      ctx.rerender();
      return;
    }
    if (t.dataset.listFav !== undefined) {
      const st = L[t.dataset.listFav];
      st.favOnly = !!t.checked; st.page = 1;
      ctx.rerender();
      return;
    }
    if (t.dataset.brokerShowQty !== undefined) {
      setShowQty(t.dataset.brokerShowQty, t.value, ctx);
      refreshSeller(root, ctx);
      return;
    }
    if (t.dataset.brokerOrderQty !== undefined) {
      const from = t.dataset.brokerFrom || 'order';
      const rows = from === 'showcase'
        ? showcaseRows(activeOffer(), ctx.data.itemMap, activePicks().showcase)
        : catalogRows(activeOffer(), nonCult(ctx), activePicks().order);
      const row = rows.find((item) => item.id === t.dataset.brokerOrderQty);
      setPick(from, t.dataset.brokerOrderQty, t.value, ctx, row?.limit);
      updateClient(root, ctx);
      return;
    }
    if (t.dataset.brokerCheck !== undefined) {
      const from = t.dataset.brokerFrom || 'order';
      const rows = from === 'showcase'
        ? showcaseRows(activeOffer(), ctx.data.itemMap, activePicks().showcase)
        : catalogRows(activeOffer(), nonCult(ctx), activePicks().order);
      const row = rows.find((item) => item.id === t.dataset.brokerCheck);
      setPick(from, t.dataset.brokerCheck, t.checked ? (row?.qty || 1) : 0, ctx, row?.limit);
      updateClient(root, ctx);
      return;
    }
    if (t.dataset.brokerPrice !== undefined) {
      setPrice(t.dataset.brokerPrice, t.value, ctx);
      refreshSeller(root, ctx);
      return;
    }
    if (t.dataset.brokerSeller !== undefined || t.dataset.brokerTitle !== undefined || t.dataset.brokerNote !== undefined) {
      ctx.rerender();
      return;
    }
    // После ухода из поля показываем округлённое значение (150 → 100).
    if (t.dataset.brokerGeneral !== undefined || t.dataset.brokerCat !== undefined) {
      const clamped = clampPct(t.value);
      if (String(t.value) !== String(clamped)) t.value = clamped;
      root.oninput?.(e);
    }
  };

  root.onclick = (e) => {
    const closest = (selector) => e.target.closest?.(selector);

    const listDel = closest('[data-list-filter-del]');
    if (listDel) {
      const st = L[listDel.dataset.listFilterDel];
      const key = listDel.dataset.k;
      if (st) {
        st.filters[key] = normFilter(st.filters[key]).filter((v) => v !== listDel.dataset.value);
        st.page = 1;
      }
      ctx.rerender();
      return;
    }
    const listDir = closest('[data-list-dir]');
    if (listDir) {
      const st = L[listDir.dataset.listDir];
      if (st) {
        st.sort = [st.sort?.[0] || 'id', st.sort?.[1] === -1 ? 1 : -1];
        st.page = 1;
      }
      ctx.rerender();
      return;
    }
    const listPage = closest('[data-list-page]');
    if (listPage) {
      const st = L[listPage.dataset.listPage];
      if (st && !listPage.disabled) { st.page = Number(listPage.dataset.page) || 1; ctx.rerender(); }
      return;
    }
    const filtersOpen = closest('[data-list-filters-open]');
    if (filtersOpen) {
      const id = filtersOpen.dataset.listFiltersOpen;
      for (const key of Object.keys(L)) L[key].filtersOpen = false;
      L[id].filtersOpen = true;
      root.querySelector?.(`[data-list-filters-panel="${id}"]`)?.classList.add('open');
      const back = root.querySelector?.(`.filters-backdrop[data-list-filters-close="${id}"]`);
      if (back) back.hidden = false;
      if (typeof document !== 'undefined') document.body.classList.add('drawer-open');
      return;
    }
    if (closest('[data-list-filters-close]')) {
      for (const key of Object.keys(L)) L[key].filtersOpen = false;
      root.querySelectorAll?.('[data-list-filters-panel]').forEach?.((el) => el.classList.remove('open'));
      root.querySelectorAll?.('.filters-backdrop').forEach?.((el) => { el.hidden = true; });
      if (typeof document !== 'undefined') document.body.classList.remove('drawer-open');
      return;
    }
    const fav = closest('[data-fav]');
    if (fav) {
      e.preventDefault?.(); e.stopPropagation?.();
      const i = fav.dataset.fav.indexOf(':');
      toggleFavorite(fav.dataset.fav.slice(0, i), fav.dataset.fav.slice(i + 1));
      ctx.rerender();
      return;
    }
    const share = closest('[data-share]');
    if (share) {
      e.preventDefault?.(); e.stopPropagation?.();
      let url = share.dataset.share;
      if (typeof document !== 'undefined') { try { url = new URL(url, document.baseURI).href; } catch { /* оставляем как есть */ } }
      copyText(url).then((ok) => showToast(ok ? 'Ссылка скопирована' : 'Не удалось скопировать ссылку'));
      return;
    }
    const sellerTab = closest('[data-seller-tab]');
    if (sellerTab) {
      const entry = sellers[sellerTab.dataset.sellerTab];
      if (!entry) return;
      incoming = { code: entry.code, offer: entry.offer };
      incomingPicks = entry.picks; incomingNote = entry.note; incomingTab = entry.tab;
      ctx.route?.(`broker/offer/${encodeURIComponent(entry.code)}`);
      ctx.rerender();
      return;
    }

    const add = closest('[data-broker-add]');
    if (add) { addShowcase(add.dataset.brokerAdd, ctx); refreshSeller(root, ctx); return; }
    const showDelta = closest('[data-broker-show-delta]');
    if (showDelta) {
      const row = showcaseRows(B.offer, ctx.data.itemMap).find((item) => item.id === showDelta.dataset.id);
      if (row) setShowQty(row.id, row.limit + Number(showDelta.dataset.brokerShowDelta), ctx);
      refreshSeller(root, ctx);
      return;
    }
    const remove = closest('[data-broker-remove]');
    if (remove) { removeShowcase(remove.dataset.brokerRemove, ctx); refreshSeller(root, ctx); return; }
    const orderDelta = closest('[data-broker-order-delta]');
    if (orderDelta) {
      const from = orderDelta.dataset.brokerFrom || 'order';
      const rows = from === 'showcase'
        ? showcaseRows(activeOffer(), ctx.data.itemMap, activePicks().showcase)
        : catalogRows(activeOffer(), nonCult(ctx), activePicks().order);
      const row = rows.find((item) => item.id === orderDelta.dataset.id);
      setPick(from, orderDelta.dataset.id, (row?.qty || 0) + Number(orderDelta.dataset.brokerOrderDelta), ctx, row?.limit);
      updateClient(root, ctx);
      return;
    }
    const tab = closest('[data-broker-tab]');
    if (tab) {
      const value = tab.dataset.brokerTab === 'order' ? 'order' : 'showcase';
      if (incoming) incomingTab = value; else B.tab = value;
      saveBroker();
      ctx.rerender();
      return;
    }
    if (closest('[data-broker-fill-general]')) {
      const rows = showcaseRows(activeOffer(), ctx.data.itemMap);
      for (const mode of ['showcase', 'order']) {
        const group = B.offer.pricing[mode];
        for (const row of rows) group.byCategory[row.category] = group.general;
      }
      autosave(ctx, root);
      ctx.rerender();
      return;
    }
    if (closest('[data-broker-discount-reset]')) {
      B.offer.pricing = { showcase: blankPricing(), order: blankPricing() };
      autosave(ctx, root);
      ctx.rerender();
      return;
    }
    if (closest('[data-broker-buyer]')) { B.client = !B.client; autosave(ctx, root); ctx.rerender(); return; }
    if (closest('[data-broker-exit-share]')) {
      incoming = null; incomingPicks = blankPicks(); incomingNote = ''; incomingTab = 'showcase';
      ctx.route?.('broker');
      ctx.rerender();
      return;
    }
    if (closest('[data-broker-reset]')) {
      if (typeof confirm === 'function' && !confirm('Очистить ассортимент, скидки и заказ?')) return;
      B.offer = blankOffer();
      B.picks = blankPicks();
      B.note = '';
      B.client = false;
      B.tab = 'showcase';
      for (const key of Object.keys(L)) L[key] = blankListState();
      autosave(ctx, root);
      ctx.rerender();
      return;
    }
    if (closest('[data-broker-share]')) {
      copyText(shareUrl(ctx)).then((ok) => showToast(ok ? 'Ссылка скопирована' : 'Не удалось скопировать ссылку'));
      return;
    }
    if (closest('[data-broker-text]')) {
      copyText(offerText(ctx)).then((ok) => showToast(ok ? 'Текст скопирован' : 'Не удалось скопировать текст'));
      return;
    }
    if (closest('[data-broker-order-text]')) {
      if (!selectedRows(ctx).length) { showToast('Сначала выберите предметы'); return; }
      copyText(orderText(ctx)).then((ok) => showToast(ok ? 'Заказ скопирован' : 'Не удалось скопировать заказ'));
      return;
    }
    if (closest('[data-broker-order-code]')) {
      if (!selectedRows(ctx).length) { showToast('Сначала выберите предметы'); return; }
      copyText(orderCode()).then((ok) => showToast(ok ? 'Код заказа скопирован' : 'Не удалось скопировать код'));
      return;
    }
    if (closest('[data-broker-clear-order]')) {
      if (incoming) { incomingPicks = blankPicks(); incomingNote = ''; }
      else { B.picks = blankPicks(); B.note = ''; }
      commit(ctx);
      return;
    }
    if (closest('[data-broker-load-order]')) { loadOrder(root, ctx); return; }
    const url = closest('[data-broker-share-url]');
    if (url) url.select?.();
  };
}
