// Посредник v2: продавец собирает ассортимент из инвентаря и назначает скидки,
// клиент по одной ссылке либо берёт вещи из витрины, либо заказывает из базы.
import { esc, num, money, label, copyText, RC } from '../../core/util.js';
import { canonId } from '../../core/ids.js';
import { fuzzyFilter } from '../../core/fuzzy.js';
import { showToast } from '../../core/toast.js';
import {
  B, blankOffer, blankPicks, blankPricing, saveBroker, isCultItem, categoryLabel, categoryRank,
  clampPct, clampQty, clampPrice, MAX_QTY, MAX_PRICE, discountFor, autoPrice, showcaseRows,
  catalogRows, totals, encodeOffer, decodeOffer, encodeOrder, decodeOrder,
  readIncomingOrder, saveIncomingOrder,
} from './store.js';

// Входящая ссылка живёт отдельно от черновика продавца.
let incoming = null;
let incomingPicks = blankPicks();
let incomingNote = '';
let incomingTab = 'showcase';
const UI = { sellerQ: '', sellerCat: '', sellerShown: 40, buyQ: '', buyCat: '', buyShown: 40 };

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
  let code;
  try { code = decodeURIComponent(match[1]); } catch { code = match[1]; }
  if (incoming?.code === code) return;
  try {
    const offer = decodeOffer(code);
    incoming = { code, offer };
    const saved = readIncomingOrder(code);
    incomingPicks = saved ? saved.picks : blankPicks();
    incomingNote = saved ? saved.note : '';
    incomingTab = 'showcase';
    UI.buyQ = ''; UI.buyCat = ''; UI.buyShown = 40;
  } catch (err) {
    incoming = null;
    showToast(`Не удалось открыть ссылку: ${err.message}`);
  }
}

export function currentRoute() {
  return incoming ? `broker/offer/${encodeURIComponent(incoming.code)}` : 'broker';
}

function commit(ctx, rerender = true) {
  if (incoming) saveIncomingOrder(incoming.code, incomingPicks, incomingNote);
  else saveBroker();
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
  const lines = [`АССОРТИМЕНТ · ${offer.title || 'Посредник'}`, offer.note || ''];
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

function orderCode(ctx) {
  return encodeOrder(activePicks(), activeNote());
}

function orderText(ctx) {
  const offer = activeOffer();
  const shop = showcaseRows(offer, ctx.data.itemMap, activePicks().showcase).filter((row) => row.qty > 0);
  const base = catalogRows(offer, nonCult(ctx), activePicks().order).filter((row) => row.qty > 0);
  const sum = totals([...shop, ...base]);
  const lines = [`ЗАКАЗ · ${offer.title || 'Посредник'}`, activeNote() || ''];
  if (shop.length) {
    lines.push('', 'Из ассортимента:');
    for (const row of shop) lines.push(`- [${row.item.tag || '—'}] ${row.item.name} ×${num(row.qty)} — ${num(row.total)} кр.`);
  }
  if (base.length) {
    lines.push('', 'Из базы:');
    for (const row of base) lines.push(`- [${row.item.tag || '—'}] ${row.item.name} ×${num(row.qty)} — ${num(row.total)} кр. (скидка ${num(row.discount)}%)`);
  }
  lines.push('', `Итого: ${num(sum.total)} кр.${sum.saved ? ` · скидка ${num(sum.saved)} кр.` : ''}`, '', orderCode(ctx));
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

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
    const order = discountFor(offer, c, 'order');
    return `<span class="chip${shop || order ? ' total' : ''}">${esc(categoryLabel(c))}: витрина ${num(shop)}% · заказ ${num(order)}%</span>`;
  }).join('');
}

// ── Продавец ───────────────────────────────────────────────────────────────

function sellerHead(ctx) {
  const offer = activeOffer();
  return `<section class="panel broker">
    <div class="broker-head">
      <div>
        <h2>Посредник</h2>
        <p class="meta">Соберите ассортимент из своего инвентаря, назначьте скидки по видам или свою цену на отдельный предмет. По одной ссылке клиент сможет взять товар из витрины или заказать любой не-культовый предмет из базы.</p>
      </div>
      <div class="broker-actions">
        <button type="button" data-broker-buyer>Глазами покупателя</button>
        <button type="button" data-broker-reset>Очистить</button>
      </div>
    </div>
    <label class="broker-field">Название предложения<input type="text" maxlength="80" data-broker-title value="${esc(offer.title)}" placeholder="Например, «Лавка Линча»"></label>
    <label class="broker-field">Описание<textarea rows="2" maxlength="1000" data-broker-note placeholder="Условия, место, способ связи…">${esc(offer.note)}</textarea></label>
  </section>`;
}

function discountGrid(ctx) {
  const offer = activeOffer();
  const categories = categoriesOf(nonCult(ctx).map((it) => ({ category: it.category })));
  // У каждого режима свой процент: витрина и заказ не влияют друг на друга.
  const fields = (category) => [['showcase', 'Витрина'], ['order', 'Заказ']].map(([mode, title]) => {
    const group = offer.pricing[mode];
    const value = category === null ? group.general
      : (Object.prototype.hasOwnProperty.call(group.byCategory, category) ? group.byCategory[category] : group.general);
    const attr = category === null ? 'data-broker-general' : `data-broker-cat="${esc(category)}"`;
    const label = category === null ? `${title} — для всех` : `${title} — ${categoryLabel(category)}`;
    return `<input type="number" min="0" max="100" step="1" inputmode="numeric" data-broker-mode="${mode}" ${attr} value="${value}" aria-label="${esc(label)}">`;
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
    <p class="meta">Процент задаётся по видам предметов; для вида без своего процента берётся «Для всех». Культовые предметы не участвуют ни в витрине, ни в заказе. Цена за штуку округляется.</p>
    <div data-broker-discount-grid>${discountGrid(ctx)}</div>
  </section>`;
}

function pickerRows(ctx) {
  const stock = stockMap(ctx);
  const rows = [...stock].map(([id, have]) => ({ item: ctx.data.itemMap.get(id), have }))
    .filter((row) => row.item && !isCultItem(row.item));
  const base = UI.sellerCat ? rows.filter((row) => row.item.category === UI.sellerCat) : rows;
  const found = fuzzyFilter(base, UI.sellerQ, (row) => [
    { text: label(row.item), weight: 1 },
    { text: row.item.description || '', weight: 0.7 },
    { text: row.item.category || '', weight: 0.5 },
    { text: row.item.organization || '', weight: 0.3 },
    { text: row.item.tag || '', weight: 0.3 },
  ]).rows;
  if (!UI.sellerQ) {
    found.sort((a, b) => categoryRank(a.item.category) - categoryRank(b.item.category)
      || label(a.item).localeCompare(label(b.item), 'ru'));
  }
  return found;
}

function pickerResults(ctx) {
  const rows = pickerRows(ctx);
  const shown = Math.min(UI.sellerShown, rows.length);
  const inShow = new Map(activeOffer().showcase.map((entry) => [entry.id, entry]));
  const list = rows.slice(0, shown).map(({ item, have }) => {
    const entry = inShow.get(item.id);
    const price = autoPrice(item, activeOffer());
    return `<div class="broker-pick ${RC[item.rarity] || 'c'}" data-broker-pick-row="${esc(item.id)}">
      <span class="grow"><span class="tag">${esc(item.tag || '—')}</span><b>${esc(item.name)}</b>
        <span class="meta">${esc(item.rarity)} · ${esc(categoryLabel(item.category))} · в наличии ${num(have)}</span></span>
      <span class="price">${money(price)}</span>
      <button type="button" class="broker-add${entry ? ' on' : ''}" data-broker-add="${esc(item.id)}" title="${entry ? 'Добавить ещё одну' : 'Выставить в ассортимент'}">${entry ? `✓ ×${num(entry.qty)}` : '+'}</button>
    </div>`;
  }).join('');
  return `<p class="meta">Предметов в инвентаре: ${num(rows.length)}${rows.length > shown ? ` · показано ${num(shown)}` : ''}</p>
    <div class="broker-pick-list">${list || '<div class="empty">В инвентаре нет подходящих предметов.</div>'}</div>
    ${rows.length > shown ? `<button type="button" class="more" data-broker-more>Показать ещё ${num(Math.min(40, rows.length - shown))}</button>` : ''}`;
}

function pickerPanel(ctx) {
  const stock = stockMap(ctx);
  const cats = categoriesOf([...stock].map(([id]) => ctx.data.itemMap.get(id)).filter(Boolean).map((it) => ({ category: it.category })));
  if (UI.sellerCat && !cats.includes(UI.sellerCat)) UI.sellerCat = '';
  return `<section class="panel broker-picker">
    <h2>Из инвентаря</h2>
    <p class="meta">Только предметы из хранилища персонажа. Количество на витрине можно уменьшить; кастомную цену задайте в списке ассортимента.</p>
    <div class="broker-picker-bar">
      <input type="search" data-broker-pick-q value="${esc(UI.sellerQ)}" placeholder="Найти в инвентаре…" autocomplete="off">
      <select data-broker-pick-cat aria-label="Вид предметов"><option value="">Все виды</option>${cats.map((c) => `<option value="${esc(c)}"${UI.sellerCat === c ? ' selected' : ''}>${esc(categoryLabel(c))}</option>`).join('')}</select>
    </div>
    <div data-broker-pick-results>${pickerResults(ctx)}</div>
  </section>`;
}

function showcaseList(ctx) {
  const rows = showcaseRows(activeOffer(), ctx.data.itemMap);
  const stock = stockMap(ctx);
  if (!rows.length) return '<div class="empty">Ассортимент пуст. Добавьте предметы из инвентаря выше.</div>';
  return rows.map((row) => {
    const have = stock.get(row.id) || 0;
    const max = Math.max(row.limit, have);
    return `<div class="line broker-line ${RC[row.item.rarity] || 'c'}">
      <span class="grow"><span class="tag">${esc(row.item.tag || '—')}</span><b>${esc(row.item.name)}</b>
        <span class="meta">${esc(row.item.rarity)} · ${esc(categoryLabel(row.category))}${row.custom ? ' · своя цена' : ` · скидка ${num(row.discount)}%`}${have ? '' : ' · нет в инвентаре'}</span>
        <span class="broker-price-edit">Своя цена, кр. <input type="number" min="0" max="${MAX_PRICE}" step="1" inputmode="numeric" data-broker-price="${esc(row.id)}" value="${row.custom ? row.price : ''}" placeholder="авто" aria-label="Своя цена для ${esc(row.item.name)}"></span>
      </span>
      <span class="price" data-broker-price-view="${esc(row.id)}">${unitHtml(row)}</span>
      <span class="broker-qty row-inv">
        <button type="button" class="inv-btn" data-broker-show-delta="-1" data-id="${esc(row.id)}"${row.limit <= 1 ? ' disabled' : ''} title="Уменьшить количество" aria-label="Уменьшить количество">−</button>
        <input class="inv-qty" type="number" min="1" max="${max}" step="1" inputmode="numeric" data-broker-show-qty="${esc(row.id)}" value="${row.limit}" aria-label="Количество на витрине">
        <button type="button" class="inv-btn" data-broker-show-delta="1" data-id="${esc(row.id)}"${row.limit >= max ? ' disabled' : ''} title="Увеличить количество" aria-label="Увеличить количество">+</button>
      </span>
      <button type="button" class="x" data-broker-remove="${esc(row.id)}" title="Убрать из ассортимента" aria-label="Убрать из ассортимента">✕</button>
    </div>`;
  }).join('');
}

function showcasePanel(ctx) {
  const rows = showcaseRows(activeOffer(), ctx.data.itemMap);
  return `<section class="panel broker-selected">
    <div class="inv-head">
      <div><h2>Ассортимент</h2><p class="meta">Количество — сколько выставляете на витрину. Пустая «Своя цена» означает цену со скидкой.</p></div>
      <div class="chips broker-summary" data-broker-show-summary>${summaryChips(totals(rows, (row) => row.limit), rows.length)}</div>
    </div>
    <div data-broker-showcase>${showcaseList(ctx)}</div>
  </section>`;
}

function sharePanel(ctx) {
  return `<section class="panel broker-share">
    <h2>Поделиться</h2>
    <p class="meta">Одна ссылка открывает клиенту витрину с вашими ценами и заказ из базы по вашим скидкам. Клиент сам отмечает количество и присылает заказ текстом или кодом.</p>
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

function buyerLine(row, from) {
  const max = from === 'showcase' ? row.limit : MAX_QTY;
  const checked = row.qty > 0;
  return `<div class="line broker-line broker-buy ${RC[row.item.rarity] || 'c'}">
    <input type="checkbox" class="broker-check" data-broker-check="${esc(row.id)}" data-broker-from="${from}"${checked ? ' checked' : ''} aria-label="Выбрать ${esc(row.item.name)}">
    <span class="grow"><span class="tag">${esc(row.item.tag || '—')}</span><b>${esc(row.item.name)}</b>
      <span class="meta">${esc(row.item.rarity)} · ${esc(categoryLabel(row.category))}${from === 'showcase' ? ` · доступно ${num(row.limit)}` : ` · скидка ${num(row.discount)}%`}${row.custom ? ' · своя цена' : ''}</span>
    </span>
    <span class="price">${unitHtml(row)}${row.qty > 1 ? `<small>${num(row.qty)} × ${money(row.price)} = ${money(row.total)}</small>` : ''}</span>
    <span class="broker-qty row-inv">
      <button type="button" class="inv-btn" data-broker-order-delta="-1" data-id="${esc(row.id)}" data-broker-from="${from}"${row.qty <= 0 ? ' disabled' : ''} title="Убрать 1 шт." aria-label="Убрать 1 шт.">−</button>
      <input class="inv-qty" type="number" min="0" max="${max}" step="1" inputmode="numeric" data-broker-order-qty="${esc(row.id)}" data-broker-from="${from}" value="${row.qty}" aria-label="Количество">
      <button type="button" class="inv-btn" data-broker-order-delta="1" data-id="${esc(row.id)}" data-broker-from="${from}" title="Добавить 1 шт." aria-label="Добавить 1 шт.">+</button>
    </span>
  </div>`;
}

function clientShowcase(ctx) {
  const rows = showcaseRows(activeOffer(), ctx.data.itemMap, activePicks().showcase);
  if (!rows.length) return '<div class="empty">В ассортименте пока нет предметов. Воспользуйтесь заказом из базы.</div>';
  return `<div class="broker-lines">${rows.map((row) => buyerLine(row, 'showcase')).join('')}</div>`;
}

function clientOrder(ctx) {
  const rows = catalogRows(activeOffer(), nonCult(ctx), activePicks().order);
  const base = UI.buyCat ? rows.filter((row) => row.category === UI.buyCat) : rows;
  const found = fuzzyFilter(base, UI.buyQ, (row) => [
    { text: label(row.item), weight: 1 },
    { text: row.item.description || '', weight: 0.7 },
    { text: row.category || '', weight: 0.5 },
    { text: row.item.tag || '', weight: 0.3 },
  ]).rows;
  if (!UI.buyQ) {
    found.sort((a, b) => categoryRank(a.category) - categoryRank(b.category)
      || label(a.item).localeCompare(label(b.item), 'ru'));
  }
  const shown = Math.min(UI.buyShown, found.length);
  return `<div class="broker-picker-bar">
      <input type="search" data-broker-buy-q value="${esc(UI.buyQ)}" placeholder="Поиск по базе…" autocomplete="off">
      <select data-broker-buy-cat aria-label="Вид предметов"><option value="">Все виды</option>${categoriesOf(rows).map((c) => `<option value="${esc(c)}"${UI.buyCat === c ? ' selected' : ''}>${esc(categoryLabel(c))}</option>`).join('')}</select>
    </div>
    <p class="meta">Доступно ${num(found.length)} предметов${found.length > shown ? ` · показано ${num(shown)}` : ''}</p>
    <div class="broker-lines">${found.slice(0, shown).map((row) => buyerLine(row, 'order')).join('') || '<div class="empty">Ничего не найдено.</div>'}</div>
    ${found.length > shown ? `<button type="button" class="more" data-broker-buy-more>Показать ещё ${num(Math.min(40, found.length - shown))}</button>` : ''}`;
}

function clientSummary(ctx) {
  const rows = selectedRows(ctx);
  return `<div class="chips broker-summary" data-broker-buy-summary>${summaryChips(totals(rows), rows.length, 'Выбрано')}</div>`;
}

function clientPanel(ctx, shared) {
  const offer = activeOffer();
  const tab = activeTab();
  const hasAny = selectedRows(ctx).length > 0;
  return `<section class="panel broker-buyer">
    <div class="broker-head">
      <div>
        <h2>${esc(offer.title || 'Предложение посредника')}</h2>
        <p class="meta">${shared ? 'Вам поделились ассортиментом. Возьмите вещи из витрины или закажите любой не-культовый предмет из базы по скидкам продавца.' : 'Так предложение видит клиент: выберите товары из витрины или закажите из базы, затем скопируйте заказ.'}</p>
      </div>
      <div class="broker-actions">${shared ? '<button type="button" data-broker-exit-share>Вернуться к своему</button>' : '<button type="button" data-broker-buyer>Вернуться к витрине продавца</button>'}</div>
    </div>
    ${offer.note ? `<p class="broker-note-text">${esc(offer.note)}</p>` : ''}
    <div class="broker-modes" role="tablist" aria-label="Режим клиента">
      <button type="button" role="tab" data-broker-tab="showcase" class="${tab === 'showcase' ? 'on' : ''}" aria-selected="${tab === 'showcase'}">Витрина · ${num(showcaseRows(offer, ctx.data.itemMap).length)}</button>
      <button type="button" role="tab" data-broker-tab="order" class="${tab === 'order' ? 'on' : ''}" aria-selected="${tab === 'order'}">Заказ из базы</button>
    </div>
    <div data-broker-client-body>${tab === 'showcase' ? clientShowcase(ctx) : clientOrder(ctx)}${clientSummary(ctx)}</div>
    <label class="broker-field">Комментарий к заказу<textarea rows="2" data-broker-order-note placeholder="Имя, способ связи, пожелания…">${esc(activeNote())}</textarea></label>
    <div class="btns broker-order-actions">
      <button type="button" data-broker-order-text${hasAny ? '' : ' disabled'}>Скопировать заказ</button>
      <button type="button" data-broker-order-code${hasAny ? '' : ' disabled'}>Код заказа</button>
      <button type="button" data-broker-clear-order${hasAny ? '' : ' disabled'}>Сбросить выбор</button>
    </div>
    <p class="meta">Заказ не отправляется автоматически: скопируйте текст или код и отправьте продавцу.</p>
  </section>`;
}

export function render(ctx) {
  if (!ctx?.data) return '';
  return isClient() ? clientPanel(ctx, !!incoming)
    : `${sellerHead(ctx)}${discountPanel(ctx)}${pickerPanel(ctx)}${showcasePanel(ctx)}${sharePanel(ctx)}`;
}

// ── Обновление частей без полной перерисовки ───────────────────────────────

function refreshSeller(root, ctx, keepDiscounts = false) {
  const pick = root.querySelector?.('[data-broker-pick-results]');
  if (pick) pick.innerHTML = pickerResults(ctx);
  const show = root.querySelector?.('[data-broker-showcase]');
  if (show) show.innerHTML = showcaseList(ctx);
  const sum = root.querySelector?.('[data-broker-show-summary]');
  if (sum) sum.innerHTML = summaryChips(totals(showcaseRows(activeOffer(), ctx.data.itemMap), (row) => row.limit),
    showcaseRows(activeOffer(), ctx.data.itemMap).length);
  const chips = root.querySelector?.('[data-broker-discount-chips]');
  if (chips) chips.innerHTML = discountChips(activeOffer(), showcaseRows(activeOffer(), ctx.data.itemMap));
  const url = root.querySelector?.('[data-broker-share-url]');
  if (url) url.value = shareUrl(ctx);
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
  const sum = root.querySelector?.('[data-broker-show-summary]');
  if (sum) sum.innerHTML = summaryChips(totals(rows, (row) => row.limit), rows.length);
  const chips = root.querySelector?.('[data-broker-discount-chips]');
  if (chips) chips.innerHTML = discountChips(activeOffer(), rows);
  const url = root.querySelector?.('[data-broker-share-url]');
  if (url) url.value = shareUrl(ctx);
}

function updateClient(root, ctx) {
  const body = root.querySelector?.('[data-broker-client-body]');
  if (body) body.innerHTML = (activeTab() === 'showcase' ? clientShowcase(ctx) : clientOrder(ctx)) + clientSummary(ctx);
  const hasAny = selectedRows(ctx).length > 0;
  root.querySelectorAll?.('[data-broker-order-text], [data-broker-order-code], [data-broker-clear-order]')
    .forEach?.((btn) => { btn.disabled = !hasAny; });
}

// ── Изменения ──────────────────────────────────────────────────────────────

function addShowcase(id, ctx) {
  if (incoming) return;
  const have = stockMap(ctx).get(id) || 0;
  const item = ctx.data.itemMap.get(id);
  if (!item || isCultItem(item) || !have) {
    showToast('Предмета нет в инвентаре или он культовый');
    return;
  }
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
    if (incoming) {
      incomingPicks = picks; incomingNote = parsed.note; incomingTab = tab;
    } else {
      B.picks = picks; B.note = parsed.note; B.client = true; B.tab = tab;
    }
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
    if (t.dataset.brokerPickQ !== undefined) {
      UI.sellerQ = t.value; UI.sellerShown = 40;
      const box = root.querySelector?.('[data-broker-pick-results]');
      if (box) box.innerHTML = pickerResults(ctx);
      return;
    }
    if (t.dataset.brokerBuyQ !== undefined) {
      UI.buyQ = t.value; UI.buyShown = 40;
      updateClient(root, ctx);
      return;
    }
    if (t.dataset.brokerOrderNote !== undefined) {
      if (incoming) incomingNote = String(t.value).slice(0, 1000);
      else B.note = String(t.value).slice(0, 1000);
      commit(ctx, false);
      return;
    }
    if (t.dataset.brokerTitle !== undefined) {
      if (!incoming) B.offer.title = String(t.value).slice(0, 80);
      const url = root.querySelector?.('[data-broker-share-url]');
      if (url) url.value = shareUrl(ctx);
      saveBroker();
      return;
    }
    if (t.dataset.brokerNote !== undefined) {
      if (!incoming) B.offer.note = String(t.value).slice(0, 1000);
      const url = root.querySelector?.('[data-broker-share-url]');
      if (url) url.value = shareUrl(ctx);
      saveBroker();
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
      saveBroker();
      refreshSeller(root, ctx, true);
      return;
    }
    if (t.dataset.brokerCat !== undefined) {
      const mode = t.dataset.brokerMode === 'order' ? 'order' : 'showcase';
      B.offer.pricing[mode].byCategory[t.dataset.brokerCat] = clampPct(t.value);
      saveBroker();
      refreshSeller(root, ctx, true);
    }
  };

  root.onchange = (e) => {
    const t = e.target;
    if (t.dataset.brokerPickCat !== undefined) {
      UI.sellerCat = t.value; UI.sellerShown = 40;
      ctx.rerender();
      return;
    }
    if (t.dataset.brokerBuyCat !== undefined) {
      UI.buyCat = t.value; UI.buyShown = 40;
      updateClient(root, ctx);
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
      const current = row?.qty || 0;
      setPick(from, t.dataset.brokerCheck, t.checked ? (current || 1) : 0, ctx, row?.limit);
      updateClient(root, ctx);
      return;
    }
    if (t.dataset.brokerPrice !== undefined) {
      setPrice(t.dataset.brokerPrice, t.value, ctx);
      refreshSeller(root, ctx);
      return;
    }
    if (t.dataset.brokerTitle !== undefined || t.dataset.brokerNote !== undefined) {
      root.oninput?.(e);
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
      saveBroker();
      ctx.rerender();
      return;
    }
    if (closest('[data-broker-discount-reset]')) {
      B.offer.pricing = { showcase: blankPricing(), order: blankPricing() };
      saveBroker();
      ctx.rerender();
      return;
    }
    if (closest('[data-broker-buyer]')) { B.client = !B.client; saveBroker(); ctx.rerender(); return; }
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
      saveBroker();
      UI.sellerQ = ''; UI.sellerCat = ''; UI.sellerShown = 40;
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
      copyText(orderCode(ctx)).then((ok) => showToast(ok ? 'Код заказа скопирован' : 'Не удалось скопировать код'));
      return;
    }
    if (closest('[data-broker-clear-order]')) {
      if (incoming) { incomingPicks = blankPicks(); incomingNote = ''; }
      else { B.picks = blankPicks(); B.note = ''; }
      commit(ctx);
      return;
    }
    if (closest('[data-broker-load-order]')) { loadOrder(root, ctx); return; }
    if (closest('[data-broker-more]')) {
      UI.sellerShown += 40;
      const box = root.querySelector?.('[data-broker-pick-results]');
      if (box) box.innerHTML = pickerResults(ctx);
      return;
    }
    if (closest('[data-broker-buy-more]')) { UI.buyShown += 40; updateClient(root, ctx); return; }
    const url = closest('[data-broker-share-url]');
    if (url) url.select?.();
  };
}
