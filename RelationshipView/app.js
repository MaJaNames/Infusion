// Интерфейс карты связей: сайдбар, формы, файлы, темы, горячие клавиши.

import {
  GROUPS, GROUP_MAP, TONES, TONE_MAP, UI_KEY,
  blankGraph, graphStats, loadGraph, saveGraph, serializeGraph, parseGraph,
  newNode, newLink, CENTER_GROUP, sampleGraph, linksBetween, factionPalette, normFaction,
} from './store.js';
import { GraphView } from './graph.js';
import {
  supportsFileSystem, getStoredHandle, storeHandle, pickSaveFile,
  writeFile, queryPermission, downloadJson, todayName,
} from './file.js';

const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

const THEME_KEY = 'infusion.theme';
const SUN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7"/></svg>';
const MOON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.2 8.2 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/></svg>';

/* ---------- тема ---------- */

function applyTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch { /* приватный режим */ }
  const explicit = saved === 'dark' || saved === 'light';
  const dark = saved === 'dark' || (!explicit && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const button = $('#theme-btn');
  if (button) {
    button.innerHTML = dark ? SUN : MOON;
    button.title = dark ? 'Светлая тема' : 'Тёмная тема';
    button.setAttribute('aria-label', dark ? 'Включить светлую тему' : 'Включить тёмную тему');
  }
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

function toggleTheme() {
  const dark = document.documentElement.dataset.theme === 'dark';
  try { localStorage.setItem(THEME_KEY, dark ? 'light' : 'dark'); } catch { /* ничего */ }
  applyTheme();
}

/* ---------- состояние ---------- */

const defaultUi = () => ({ hidden: [], query: '', mentions: true, edgeLabels: false });
function loadUi() {
  try {
    const raw = JSON.parse(localStorage.getItem(UI_KEY));
    if (!raw || typeof raw !== 'object') return defaultUi();
    return {
      hidden: Array.isArray(raw.hidden) ? raw.hidden.filter((id) => GROUP_MAP.has(id)) : [],
      query: typeof raw.query === 'string' ? raw.query.slice(0, 200) : '',
      mentions: raw.mentions !== false,
      edgeLabels: Boolean(raw.edgeLabels),
    };
  } catch {
    return defaultUi();
  }
}
function saveUi() {
  try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch { /* ничего */ }
}

let graphData = loadGraph();
let ui = loadUi();
let selected = { kind: null, id: null };
let linkMode = null;
let fileHandle = null;
let fileDirty = false;
let filePermission = null;
let fileWriteTimer = null;
let fileWriting = false;
let fileWriteBlocked = false;
let fileBindingBroken = !supportsFileSystem();
let pendingFit = false;
let saveTimer = null;
let refreshTimer = null;
let layoutTimer = null;

const graphHost = $('#graph');
const sidebarBody = $('#sidebar-body');
const searchInput = $('#search');
const fileMenu = $('#file-menu');
const importInput = $('#import-file');
const dialog = $('#dialog');

const graph = new GraphView(graphHost, {
  onNodeClick: handleNodeClick,
  onLinkClick: (id) => { if (!linkMode) selectLink(id); },
  onBackgroundClick: () => { if (!linkMode) clearSelection(); },
  onPinChange: handlePinChange,
  onLayout: scheduleLayoutSave,
  onSettled: () => {
    if (pendingFit) {
      pendingFit = false;
      graph.fit();
    }
    if (fileHandle) queueFileWrite();
  },
});

/* ---------- сохранение ---------- */

function setSaveState(state) {
  const element = $('#save-state');
  if (!element) return;
  element.classList.remove('saving', 'saved', 'error');
  if (state === 'saving') {
    element.classList.add('saving');
    element.textContent = 'Сохранение…';
    element.title = 'Записываем изменения в память браузера';
  } else if (state === 'error') {
    element.classList.add('error');
    element.textContent = 'Не сохранено';
    element.title = 'Браузер не дал сохранить данные (приватный режим или переполнение)';
  } else {
    element.classList.add('saved');
    element.textContent = 'Сохранено';
    element.title = 'Данные сохранены в этом браузере';
  }
}

function persistNow() {
  graphData.updatedAt = Date.now();
  const ok = saveGraph(graphData);
  setSaveState(ok ? 'saved' : 'error');
  if (fileHandle) queueFileWrite();
}

function markDirty() {
  setSaveState('saving');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistNow, 350);
  if (fileHandle) queueFileWrite();
}

function scheduleLayoutSave() {
  clearTimeout(layoutTimer);
  layoutTimer = setTimeout(() => {
    graphData.updatedAt = Date.now();
    saveGraph(graphData);
  }, 450);
}

function scheduleGraphRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => graph.refresh(), 120);
}

/* ---------- тема и файлы ---------- */

function updateFileUi() {
  const label = $('#file-status');
  const unlink = $('#file-unlink');
  const save = $('#file-save');
  const note = $('#file-support-note');
  const supported = !fileBindingBroken;
  const ready = filePermission === 'granted';

  if (save) {
    save.hidden = !supported;
    save.textContent = fileHandle ? 'Сохранить в файл' : 'Привязать файл…';
  }
  if (unlink) unlink.hidden = !supported || !fileHandle;
  if (note) {
    note.hidden = supported;
    note.textContent = supported
      ? ''
      : 'Привязка файла недоступна: браузер не даёт выбрать файл на диске. Скачивайте JSON-копию и загружайте её через «Загрузить JSON…».';
  }

  if (label) {
    let text = 'Файл не привязан';
    if (!supported) text = 'Привязка файла недоступна';
    else if (fileHandle) {
      if (!ready) text = `${fileHandle.name} · нужно разрешение (Ctrl+S)`;
      else if (fileWriteBlocked) text = `${fileHandle.name} · ошибка записи (Ctrl+S)`;
      else text = `${fileHandle.name}${fileDirty ? ' · есть несохранённые изменения' : ' · сохранено'}`;
    }
    label.textContent = text;
    label.classList.toggle('warn', supported && Boolean(fileHandle) && (fileDirty || !ready || fileWriteBlocked));
  }

  const inline = $('#file-status-inline');
  if (inline) {
    inline.textContent = !supported
      ? 'привязка недоступна'
      : fileHandle
        ? `${fileHandle.name}${!ready ? ' · нужно разрешение' : fileWriteBlocked ? ' · ошибка записи' : fileDirty ? ' · изменения не записаны' : ' · сохранено'}`
        : 'не привязан';
  }
  fileMenu?.classList.toggle('dirty', supported && Boolean(fileHandle) && (fileDirty || fileWriteBlocked));
}

function queueFileWrite() {
  if (!fileHandle || fileBindingBroken) return;
  fileDirty = true;
  updateFileUi();
  clearTimeout(fileWriteTimer);
  fileWriteTimer = setTimeout(flushFile, 900);
}

async function flushFile() {
  if (!fileHandle || !fileDirty || fileWriting || fileBindingBroken || fileWriteBlocked) return;
  if (filePermission !== 'granted') {
    filePermission = await queryPermission(fileHandle, 'readwrite');
    if (filePermission !== 'granted') {
      updateFileUi();
      return;
    }
  }
  fileWriting = true;
  let ok = false;
  try {
    await writeFile(fileHandle, serializeGraph(graphData));
    fileDirty = false;
    ok = true;
  } catch (error) {
    fileWriteBlocked = true;
    if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') filePermission = 'denied';
    toast(`Не удалось записать файл: ${error?.message || 'ошибка доступа'}`, 'bad');
  } finally {
    fileWriting = false;
    updateFileUi();
    if (ok && fileDirty) queueFileWrite();
  }
}

async function saveToFile(forcePicker = false) {
  if (fileBindingBroken) {
    downloadJson(serializeGraph(graphData), todayName());
    toast('Браузер не умеет писать в файл — скачали копию JSON');
    return;
  }
  try {
    if (!fileHandle || forcePicker) {
      const hadHandle = Boolean(fileHandle);
      const started = performance.now();
      try {
        fileHandle = await pickSaveFile(todayName());
        filePermission = 'granted';
        fileWriteBlocked = false;
      } catch (error) {
        const blocked = error?.name === 'SecurityError' || error?.name === 'NotAllowedError';
        if (error?.name === 'AbortError' || blocked) {
          // Настоящий отказ пользователя занимает заметно больше времени.
          // Мгновенный AbortError значит, что браузер вообще не показал окно.
          const failedFast = performance.now() - started < 400;
          if (error?.name === 'AbortError' && !failedFast) return;
          if (hadHandle) {
            toast('Окно выбора файла не открылось. Текущая привязка сохранена.', 'bad');
          } else {
            fileBindingBroken = true;
            updateFileUi();
            downloadJson(serializeGraph(graphData), todayName());
            toast('Окно выбора файла не открылось. Скачали JSON-копию — привязка в этом браузере недоступна.', 'bad');
          }
          return;
        }
        throw error;
      }
    }
    clearTimeout(fileWriteTimer);
    await writeFile(fileHandle, serializeGraph(graphData));
    filePermission = 'granted';
    fileWriteBlocked = false;
    fileDirty = false;
    updateFileUi();
    toast(`Сохранено в «${fileHandle.name}»`);
  } catch (error) {
    if (error?.name === 'AbortError') return;
    toast(error?.message || 'Не удалось сохранить файл', 'bad');
  }
}

async function unlinkFile() {
  clearTimeout(fileWriteTimer);
  fileHandle = null;
  fileDirty = false;
  filePermission = null;
  fileWriteBlocked = false;
  await storeHandle(null);
  updateFileUi();
  toast('Файл отвязан');
}

async function importFromFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const next = parseGraph(text);
    const ok = await ask({
      title: 'Заменить карту?',
      text: `В файле ${next.nodes.length} персонажей и ${next.links.length} связей. Текущие данные будут заменены.`,
      ok: 'Заменить',
      danger: true,
    });
    if (!ok) return;
    applyGraph(next, { fit: true });
    toast('Карта загружена из файла');
  } catch (error) {
    toast(error?.message || 'Не удалось прочитать файл', 'bad');
  }
}

/* ---------- диалог ---------- */

let activeAsk = null;

function ask({ title, text, ok = 'Удалить', danger = true }) {
  return new Promise((resolve) => {
    if (!dialog) return resolve(confirm(text || title));
    // В некоторых сборках Chromium событие close у <dialog> не приходит,
    // поэтому завершаем диалог по клику на кнопки, Esc и клику по фону.
    if (activeAsk) activeAsk(false);
    $('#dialog-title').textContent = title;
    $('#dialog-text').textContent = text || '';
    const okButton = $('#dialog-ok');
    const cancelButton = $('#dialog-cancel');
    okButton.textContent = ok;
    okButton.className = `btn ${danger ? 'danger' : 'primary'}`;

    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      okButton.removeEventListener('click', onOk);
      cancelButton.removeEventListener('click', onCancel);
      dialog.removeEventListener('click', onBackdrop);
      dialog.removeEventListener('keydown', onKey);
      dialog.removeEventListener('cancel', onNativeCancel);
      if (dialog.open) dialog.close(value ? 'ok' : 'cancel');
      if (activeAsk === finish) activeAsk = null;
      resolve(Boolean(value));
    };
    const onOk = (event) => { event.preventDefault(); finish(true); };
    const onCancel = (event) => { event.preventDefault(); finish(false); };
    const onBackdrop = (event) => { if (event.target === dialog) finish(false); };
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      finish(false);
    };
    const onNativeCancel = (event) => { event.preventDefault(); finish(false); };

    okButton.addEventListener('click', onOk);
    cancelButton.addEventListener('click', onCancel);
    dialog.addEventListener('click', onBackdrop);
    dialog.addEventListener('keydown', onKey);
    dialog.addEventListener('cancel', onNativeCancel);
    activeAsk = finish;
    dialog.returnValue = 'cancel';
    dialog.showModal();
    okButton.focus();
  });
}

function toast(message, type = '') {
  const host = $('#toasts');
  if (!host) return;
  const item = document.createElement('div');
  item.className = `toast ${type}`.trim();
  item.textContent = message;
  host.appendChild(item);
  setTimeout(() => item.classList.add('leaving'), 2400);
  setTimeout(() => item.remove(), 2800);
}

/* ---------- отрисовка ---------- */

function byId(id) {
  return graphData.nodes.find((node) => node.id === id);
}

function endpointDot(id) {
  const item = byId(id);
  return item ? `<span class="group-dot g-${item.group}"></span>` : '<span class="group-dot"></span>';
}

// Подзаголовок карточки: категория, фракция и служебные пометки.
function nodeSubtitle(node) {
  const groupName = (GROUP_MAP.get(node.group) || GROUP_MAP.get('other')).name;
  const faction = normFaction(node.faction);
  return `${groupName}${faction ? ` · ${faction}` : ''}${node.dead ? ' · недоступен' : ''}${node.fixed ? ' · закреплён' : ''}`;
}

function groupOptions(active) {
  return GROUPS.map((group) => `<option value="${group.id}"${group.id === active ? ' selected' : ''}>${group.name}</option>`).join('');
}

function factionNames(current = '') {
  const names = [...new Set(graphData.nodes.map((node) => normFaction(node.faction)).filter(Boolean))];
  const own = normFaction(current);
  if (own && !names.includes(own)) names.push(own);
  return names.sort((a, b) => a.localeCompare(b, 'ru'));
}

function toneOptions(active) {
  return TONES.map((tone) => `<option value="${tone.id}"${tone.id === active ? ' selected' : ''}>${tone.name}</option>`).join('');
}

// Простой предпросмотр заметки: сохраняем переносы строк и превращаем
// [[Имя]] в кнопки-переходы к уже существующим персонажам.
function renderNotePreview(container, notes) {
  if (!container) return;
  container.replaceChildren();
  const value = String(notes || '');
  if (!value.trim()) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  const byLabel = new Map();
  for (const node of graphData.nodes) {
    const key = node.label.trim().toLowerCase();
    if (key && !byLabel.has(key)) byLabel.set(key, node);
  }

  for (const line of value.split(/\n/)) {
    const paragraph = document.createElement('p');
    if (!line.trim()) {
      paragraph.className = 'gap';
      container.appendChild(paragraph);
      continue;
    }
    const pattern = /\[\[([^[\]\n]{1,120})\]\]/g;
    let last = 0;
    let match;
    while ((match = pattern.exec(line))) {
      if (match.index > last) paragraph.appendChild(document.createTextNode(line.slice(last, match.index)));
      const name = match[1].trim();
      const target = byLabel.get(name.toLowerCase());
      if (target) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'mention-link';
        button.textContent = name;
        button.title = `Перейти к «${target.label}»`;
        button.addEventListener('click', () => selectNode(target.id, { focus: true }));
        paragraph.appendChild(button);
      } else {
        const span = document.createElement('span');
        span.className = 'mention-missing';
        span.textContent = `[[${name}]]`;
        span.title = 'Такого персонажа пока нет на карте';
        paragraph.appendChild(span);
      }
      last = match.index + match[0].length;
    }
    if (last < line.length) paragraph.appendChild(document.createTextNode(line.slice(last)));
    container.appendChild(paragraph);
  }
}

function renderSidebar() {
  if (selected.kind === 'node') {
    const node = byId(selected.id);
    if (!node) return clearSelection();
    return renderNode(node);
  }
  if (selected.kind === 'link') {
    const link = graphData.links.find((item) => item.id === selected.id);
    if (!link) return clearSelection();
    return renderLink(link);
  }
  return renderOverview();
}

function renderOverview() {
  const stats = graphStats(graphData);
  const palette = factionPalette(graphData.nodes);
  const legend = GROUPS.map((group) => `
    <label class="legend-row${ui.hidden.includes(group.id) ? ' off' : ''}">
      <input type="checkbox" data-group="${group.id}" ${ui.hidden.includes(group.id) ? '' : 'checked'}>
      <span class="group-dot g-${group.id}"></span>
      <span class="legend-name">${group.name}</span>
      <span class="legend-count">${stats.groups[group.id] || 0}</span>
    </label>`).join('');

  const factionRows = factionNames().map((name) => {
    const count = graphData.nodes.filter((node) => normFaction(node.faction) === name).length;
    return `<button class="result-row" type="button" data-faction="${esc(name)}" title="Показать фракцию на карте">
      <span class="faction-dot" style="--zc:${esc(palette.get(name) || 'var(--mute)')}"></span>
      <span class="result-name">${esc(name)}</span>
      <span class="legend-count">${count}</span>
    </button>`;
  }).join('');

  const query = ui.query.trim().toLowerCase();
  const results = query
    ? graphData.nodes
      .filter((node) => [node.label, ...(node.tags || []), node.notes || ''].join(' ').toLowerCase().includes(query))
      .slice(0, 40)
    : [];

  const resultList = query
    ? `<div class="search-results">
        <p class="muted small">${results.length ? `Найдено: ${results.length}` : 'Ничего не найдено'}</p>
        ${results.map((item) => `
          <button class="result-row" type="button" data-node="${esc(item.id)}">
            ${endpointDot(item.id)}
            <span class="result-name">${esc(item.label)}</span>
            ${item.dead ? '<span class="badge-dead">недоступен</span>' : ''}
          </button>`).join('')}
      </div>`
    : '';

  sidebarBody.innerHTML = `
    <div class="side-head">
      <div class="side-head-text">
        <h2>Обзор</h2>
        <span class="muted">${stats.nodes} нод · ${stats.centers} организаций · ${stats.links} связей</span>
      </div>
    </div>
    <div class="stats-row">
      <div class="stat"><b>${stats.nodes}</b><span>нод</span></div>
      <div class="stat"><b>${stats.centers}</b><span>организаций</span></div>
      <div class="stat"><b>${stats.links}</b><span>связей</span></div>
    </div>
    ${resultList}
    ${factionRows ? `<h3 class="side-sub">Фракции <span class="muted small">клик — показать на карте</span></h3>
    <div class="search-results">${factionRows}</div>` : ''}
    <h3 class="side-sub">Категории <span class="muted small">клик — показать/скрыть</span></h3>
    <div class="legend">${legend}</div>
    <h3 class="side-sub">Отображение</h3>
    <label class="switch-row">
      <input type="checkbox" id="toggle-mentions" ${ui.mentions ? 'checked' : ''}>
      <span>Связи из заметок <code>[[Имя]]</code></span>
    </label>
    <label class="switch-row">
      <input type="checkbox" id="toggle-edge-labels" ${ui.edgeLabels ? 'checked' : ''}>
      <span>Подписи всех связей</span>
    </label>
    <p class="hint hint-tight">Раскладка работает как в Obsidian: пружины по связям и короткое отталкивание. Блибы фракций — только оформление, на позиции они не влияют. Перетаскивание замораживает раскладку: двигается только взятая нода.</p>
    <details class="help-box">
      <summary>Как пользоваться</summary>
      <ul>
        <li>Колесо — масштаб, перетаскивание фона — сдвиг. Двойной клик по ноде центрирует её.</li>
        <li>Перетаскивание ноды двигает только её и на время замораживает раскладку: остальные ноды не сдвигаются. Закрепить или открепить можно в карточке, «Раскладка» пересчитает только свободные ноды.</li>
        <li>Клик по связи открывает её подпись, тип и заметку.</li>
        <li>Организация — нода категории «Организация» (первичный центр). Её фракция совпадает с названием; у остальных нод фракция выбирается в карточке. Блибы — только визуальная группировка, они не хранятся в данных и ни на что не влияют.</li>
        <li><code>[[Имя]]</code> в заметке рисует пунктирную связь с персонажем или организацией.</li>
        <li>Всё автоматически сохраняется в браузере. JSON-файл — резервная копия или общий файл для нескольких устройств.</li>
      </ul>
    </details>
    <div class="side-actions">
      <button class="btn primary wide" type="button" data-act="add">+ Добавить персонажа</button>
      <button class="btn wide" type="button" data-act="add-center">+ Добавить организацию</button>
    </div>
    <div class="side-section data-section">
      <h3 class="side-sub">Данные</h3>
      <div class="data-buttons">
        <button class="btn ghost" type="button" data-act="sample">Загрузить пример</button>
        <button class="btn ghost danger" type="button" data-act="clear">Очистить карту</button>
      </div>
      <p class="muted small">Файл: <span id="file-status-inline">${fileHandle ? esc(fileHandle.name) : 'не привязан'}</span></p>
    </div>`;

  bindOverview();
}

function bindOverview() {
  sidebarBody.querySelectorAll('[data-group]').forEach((input) => {
    input.addEventListener('change', () => {
      const id = input.dataset.group;
      if (input.checked) ui.hidden = ui.hidden.filter((item) => item !== id);
      else if (!ui.hidden.includes(id)) ui.hidden.push(id);
      ui.hidden.sort();
      input.closest('.legend-row')?.classList.toggle('off', !input.checked);
      graph.setHidden(ui.hidden);
      saveUi();
    });
  });

  $('#toggle-mentions')?.addEventListener('change', (event) => {
    ui.mentions = event.target.checked;
    graph.setMentions(ui.mentions);
    saveUi();
  });
  $('#toggle-edge-labels')?.addEventListener('change', (event) => {
    ui.edgeLabels = event.target.checked;
    graph.setEdgeLabels(ui.edgeLabels);
    saveUi();
  });
  sidebarBody.querySelectorAll('[data-node]').forEach((button) => {
    button.addEventListener('click', () => selectNode(button.dataset.node, { focus: true }));
  });
  sidebarBody.querySelectorAll('[data-faction]').forEach((button) => {
    button.addEventListener('click', () => {
      const name = button.dataset.faction;
      const ids = graphData.nodes
        .filter((node) => normFaction(node.faction) === name)
        .map((node) => node.id);
      graph.focusNodes(ids);
    });
  });
  sidebarBody.querySelector('[data-act="add"]')?.addEventListener('click', addNode);
  sidebarBody.querySelector('[data-act="add-center"]')?.addEventListener('click', addCenter);
  sidebarBody.querySelector('[data-act="sample"]')?.addEventListener('click', loadSample);
  sidebarBody.querySelector('[data-act="clear"]')?.addEventListener('click', clearGraph);
}

function renderNode(node) {
  const group = GROUP_MAP.get(node.group) || GROUP_MAP.get('other');
  const isCenter = node.group === CENTER_GROUP;
  const factionOptions = factionNames(node.faction)
    .map((name) => `<option value="${esc(name)}"${name === normFaction(node.faction) ? ' selected' : ''}>${esc(name)}</option>`)
    .join('');
  const links = graphData.links.filter((link) => link.source === node.id || link.target === node.id);
  const edgeItems = links.map((link) => {
    const otherId = link.source === node.id ? link.target : link.source;
    const other = byId(otherId);
    const direction = link.directed ? (link.source === node.id ? '→' : '←') : '↔';
    return `
      <li class="edge-item" data-link="${esc(link.id)}" tabindex="0">
        <span class="tone-dot t-${link.tone}"></span>
        <span class="edge-main">
          <b>${esc(other?.label || '?')}</b>
          ${link.label ? `<small>${esc(link.label)}</small>` : '<small class="muted">без подписи</small>'}
        </span>
        <span class="edge-dir" title="${link.directed ? 'Направленная связь' : 'Ненаправленная связь'}">${direction}</span>
        <button class="icon-btn edge-del" type="button" data-del-link="${esc(link.id)}" title="Удалить связь" aria-label="Удалить связь">×</button>
      </li>`;
  }).join('');

  sidebarBody.innerHTML = `
    <div class="side-head">
      <span class="group-dot lg g-${group.id}"></span>
      <div class="side-head-text">
        <h2>${esc(node.label || 'Без имени')}</h2>
        <span class="muted">${esc(nodeSubtitle(node))}</span>
      </div>
      <button class="icon-btn" type="button" data-act="close" title="Закрыть">×</button>
    </div>
    <div class="form">
      <label class="field">Имя
        <input id="n-label" value="${esc(node.label)}" maxlength="120" autocomplete="off" placeholder="Имя персонажа">
      </label>
      <label class="field">Категория
        <select id="n-group">${groupOptions(node.group)}</select>
      </label>
      ${isCenter ? '<p class="hint hint-tight">Фракция организации совпадает с её названием — переименование обновит и фракцию.</p>' : `
      <label class="field">Фракция
        <select id="n-faction">
          <option value="">— без фракции —</option>
          ${factionOptions}
          <option value="__new">＋ Новая фракция…</option>
        </select>
      </label>
      <div id="n-faction-new" class="faction-new" hidden>
        <input id="n-faction-input" maxlength="80" placeholder="Название фракции" autocomplete="off">
        <button class="btn small" type="button" data-act="faction-add">Добавить</button>
      </div>`}
      <label class="check-row">
        <input type="checkbox" id="n-dead" ${node.dead ? 'checked' : ''}>
        <span>Недоступен</span>
      </label>
      <p class="hint hint-tight">Точное состояние — мёртв, пропал, арестован, в коме — укажите в заметке.</p>
      <label class="field">Теги
        <input id="n-tags" value="${esc((node.tags || []).join(', '))}" placeholder="через запятую: напарник, должник">
      </label>
      <label class="field">Заметка
        <textarea id="n-notes" rows="8" placeholder="Свободный текст. Ссылка [[Имя]] добавит пунктирную связь.">${esc(node.notes)}</textarea>
      </label>
      <div id="n-preview" class="note-preview" hidden></div>
      <p class="hint">Ссылки вида <code>[[Имя]]</code> рисуются пунктиром, если такой персонаж или организация есть на карте.</p>
    </div>
    <h3 class="side-sub">Связи <span class="count">${links.length}</span></h3>
    ${links.length ? `<ul class="edge-list">${edgeItems}</ul>` : '<p class="empty-note">Связей пока нет.</p>'}
    <button class="btn wide" type="button" data-act="link">+ Связать с…</button>
    <div class="side-actions">
      <button class="btn ghost" type="button" data-act="pin" aria-pressed="${node.fixed ? 'true' : 'false'}">${node.fixed ? 'Открепить' : 'Закрепить на карте'}</button>
      <button class="btn ghost" type="button" data-act="focus">Показать на карте</button>
      <button class="btn ghost danger" type="button" data-act="delete">Удалить с карты</button>
    </div>`;

  const labelInput = $('#n-label');
  const notesInput = $('#n-notes');
  const syncSubtitle = () => {
    const sub = sidebarBody.querySelector('.side-head .muted');
    if (!sub) return;
    sub.textContent = nodeSubtitle(node);
  };
  labelInput?.addEventListener('input', () => {
    const previousFaction = normFaction(node.faction);
    node.label = labelInput.value.slice(0, 120);
    // У организации фракция — это её название, поэтому переименование
    // переносит участников в новую фракцию.
    if (isCenter) {
      const nextFaction = normFaction(node.label);
      if (nextFaction) {
        node.faction = nextFaction;
        if (previousFaction && previousFaction !== nextFaction) {
          for (const other of graphData.nodes) {
            if (other !== node && normFaction(other.faction) === previousFaction) other.faction = nextFaction;
          }
        }
      }
      syncSubtitle();
    }
    const heading = sidebarBody.querySelector('.side-head h2');
    if (heading) heading.textContent = node.label || 'Без имени';
    scheduleGraphRefresh();
    markDirty();
  });
  $('#n-group')?.addEventListener('change', (event) => {
    node.group = GROUP_MAP.has(event.target.value) ? event.target.value : 'other';
    if (node.group === CENTER_GROUP) {
      const nextFaction = normFaction(node.label);
      if (nextFaction) node.faction = nextFaction;
    }
    graph.refresh();
    renderSidebar();
    markDirty();
  });
  const applyFaction = () => {
    const input = $('#n-faction-input');
    const value = normFaction(input?.value);
    if (!value) {
      toast('«Без фракции» — это не фракция, оставьте поле пустым');
      input?.focus();
      return;
    }
    node.faction = value;
    graph.refresh();
    renderSidebar();
    markDirty();
  };
  $('#n-faction')?.addEventListener('change', (event) => {
    if (event.target.value === '__new') {
      const wrap = $('#n-faction-new');
      if (wrap) wrap.hidden = false;
      $('#n-faction-input')?.focus();
      event.target.value = normFaction(node.faction);
      return;
    }
    node.faction = normFaction(event.target.value);
    graph.refresh();
    renderSidebar();
    markDirty();
  });
  sidebarBody.querySelector('[data-act="faction-add"]')?.addEventListener('click', applyFaction);
  $('#n-faction-input')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyFaction();
    }
  });
  $('#n-dead')?.addEventListener('change', (event) => {
    node.dead = event.target.checked;
    syncSubtitle();
    graph.refresh();
    markDirty();
  });
  $('#n-tags')?.addEventListener('input', (event) => {
    node.tags = [...new Set(event.target.value.split(',').map((tag) => tag.trim().slice(0, 50)).filter(Boolean))];
    markDirty();
  });
  notesInput?.addEventListener('input', () => {
    node.notes = notesInput.value;
    renderNotePreview($('#n-preview'), node.notes);
    scheduleGraphRefresh();
    markDirty();
  });
  renderNotePreview($('#n-preview'), node.notes);

  sidebarBody.querySelector('[data-act="close"]')?.addEventListener('click', () => clearSelection());
  sidebarBody.querySelector('[data-act="link"]')?.addEventListener('click', () => startLinkMode(node.id));
  sidebarBody.querySelector('[data-act="pin"]')?.addEventListener('click', () => {
    graph.setPinned(node.id, !node.fixed);
    markDirty();
  });
  sidebarBody.querySelector('[data-act="focus"]')?.addEventListener('click', () => graph.focusNode(node.id));
  sidebarBody.querySelector('[data-act="delete"]')?.addEventListener('click', () => deleteNode(node.id));

  sidebarBody.querySelectorAll('.edge-item').forEach((item) => {
    const open = () => selectLink(item.dataset.link);
    item.addEventListener('click', open);
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') open();
    });
    item.querySelector('[data-del-link]')?.addEventListener('click', (event) => {
      event.stopPropagation();
      deleteLink(item.dataset.delLink);
    });
  });
}

function renderLink(link) {
  const source = byId(link.source);
  const target = byId(link.target);
  if (!source || !target) return clearSelection();
  const pairCount = linksBetween(graphData, link.source, link.target).length;

  sidebarBody.innerHTML = `
    <div class="side-head">
      <span class="tone-dot lg t-${link.tone}"></span>
      <div class="side-head-text">
        <h2>Связь</h2>
        <span class="muted">${esc(source.label)} ${link.directed ? '→' : '↔'} ${esc(target.label)}</span>
      </div>
      <button class="icon-btn" type="button" data-act="close" title="Закрыть">×</button>
    </div>
    <div class="relation-card">
      ${endpointDot(source.id)}
      <button type="button" class="relation-name" data-goto="${esc(source.id)}">${esc(source.label)}</button>
      <span class="relation-arrow">${link.directed ? '→' : '↔'}</span>
      ${endpointDot(target.id)}
      <button type="button" class="relation-name" data-goto="${esc(target.id)}">${esc(target.label)}</button>
    </div>
    <div class="form">
      <label class="field">Подпись
        <input id="l-label" value="${esc(link.label)}" maxlength="120" placeholder="например: напарник, должник, клиент">
      </label>
      <label class="field">Тип
        <select id="l-tone">${toneOptions(link.tone)}</select>
      </label>
      <label class="check-row">
        <input type="checkbox" id="l-directed" ${link.directed ? 'checked' : ''}>
        <span>Направленная (со стрелкой)</span>
      </label>
      <label class="field">Заметка
        <textarea id="l-notes" rows="5" placeholder="Обстоятельства знакомства, долг, история отношений…">${esc(link.notes)}</textarea>
      </label>
    </div>
    ${pairCount > 1 ? `<p class="hint">Между этими концами ${pairCount} связей. Повторное «Связать» добавляет ещё одну.</p>` : ''}
    <div class="side-actions">
      <button class="btn ghost" type="button" data-act="reverse" title="Поменять источник и цель местами">⇄ Поменять направление</button>
      <button class="btn ghost" type="button" data-act="focus">Показать на карте</button>
      <button class="btn ghost danger" type="button" data-act="delete">Удалить связь</button>
    </div>`;

  $('#l-label')?.addEventListener('input', (event) => {
    link.label = event.target.value.slice(0, 120);
    scheduleGraphRefresh();
    markDirty();
  });
  $('#l-tone')?.addEventListener('change', (event) => {
    link.tone = TONE_MAP.has(event.target.value) ? event.target.value : 'neutral';
    graph.refresh();
    renderSidebar();
    markDirty();
  });
  $('#l-directed')?.addEventListener('change', (event) => {
    link.directed = event.target.checked;
    graph.refresh();
    markDirty();
  });
  $('#l-notes')?.addEventListener('input', (event) => {
    link.notes = event.target.value;
    markDirty();
  });

  sidebarBody.querySelector('[data-act="close"]')?.addEventListener('click', () => clearSelection());
  sidebarBody.querySelector('[data-act="reverse"]')?.addEventListener('click', () => {
    [link.source, link.target] = [link.target, link.source];
    markDirty();
    graph.refresh();
    renderSidebar();
  });
  sidebarBody.querySelector('[data-act="focus"]')?.addEventListener('click', () => graph.focusNode(link.source));
  sidebarBody.querySelector('[data-act="delete"]')?.addEventListener('click', () => deleteLink(link.id));
  sidebarBody.querySelectorAll('[data-goto]').forEach((button) => {
    button.addEventListener('click', () => selectNode(button.dataset.goto, { focus: true }));
  });
}

/* ---------- выделение и режим связи ---------- */

function selectNode(id, { focus = false } = {}) {
  if (!byId(id)) return;
  selected = { kind: 'node', id };
  graph.setSelection('node', id);
  renderSidebar();
  openPanel();
  if (focus) graph.focusNode(id);
}

function selectLink(id) {
  if (!graphData.links.some((link) => link.id === id)) return;
  selected = { kind: 'link', id };
  graph.setSelection('link', id);
  renderSidebar();
  openPanel();
}

function clearSelection() {
  selected = { kind: null, id: null };
  graph.setSelection(null, null);
  renderSidebar();
  closePanel();
}

function addCenter() {
  const center = graph.screenCenter();
  const label = 'Новая организация';
  const node = newNode({ label, group: CENTER_GROUP, faction: label, x: center.x, y: center.y });
  graphData.nodes.push(node);
  markDirty();
  graph.refresh();
  selectNode(node.id);
  requestAnimationFrame(() => {
    const input = $('#n-label');
    input?.focus();
    input?.select();
  });
}

function startLinkMode(sourceId = null) {
  if (graphData.nodes.length < 2) {
    toast('Сначала добавьте ещё одну ноду');
    return;
  }
  const source = sourceId ? byId(sourceId) : null;
  if (sourceId && !source) return;
  linkMode = { source: sourceId || null };
  updateLinkModeUi();
  if (source) selectNode(sourceId);
}

function cancelLinkMode() {
  if (!linkMode) return;
  linkMode = null;
  updateLinkModeUi();
}

function updateLinkModeUi() {
  const active = Boolean(linkMode);
  $('#btn-link')?.classList.toggle('on', active);
  $('#btn-link')?.setAttribute('aria-pressed', String(active));
  graphHost.classList.toggle('linking', active);

  const banner = $('#mode-banner');
  if (!banner) return;
  if (!active) {
    banner.hidden = true;
    banner.innerHTML = '';
    return;
  }
  const source = linkMode.source ? byId(linkMode.source) : null;
  banner.hidden = false;
  banner.innerHTML = `
    <span class="banner-icon">${source ? '2' : '1'}</span>
    <span>${source ? `Соединяем с «${esc(source.label)}» — выберите вторую ноду` : 'Выберите первую ноду'}</span>
    <button type="button" class="btn small" data-cancel-link>Отмена</button>`;
  banner.querySelector('[data-cancel-link]')?.addEventListener('click', cancelLinkMode);
}

function handleNodeClick(id) {
  if (!linkMode) {
    selectNode(id);
    return;
  }
  if (!linkMode.source) {
    linkMode.source = id;
    selectNode(id);
    updateLinkModeUi();
    return;
  }
  if (linkMode.source === id) {
    toast('Выберите другую ноду');
    return;
  }
  createLink(linkMode.source, id);
}

function handlePinChange(id, pinned) {
  if (selected.kind !== 'node' || selected.id !== id) return;
  const node = byId(id);
  const button = sidebarBody.querySelector('[data-act="pin"]');
  if (button) {
    button.textContent = pinned ? 'Открепить' : 'Закрепить на карте';
    button.setAttribute('aria-pressed', String(pinned));
  }
  const sub = sidebarBody.querySelector('.side-head .muted');
  if (sub && node) sub.textContent = nodeSubtitle(node);
}

/* ---------- операции с данными ---------- */

function addNode() {
  cancelLinkMode();
  const center = graph.screenCenter();
  const node = newNode({
    x: center.x + (Math.random() - 0.5) * 90,
    y: center.y + (Math.random() - 0.5) * 90,
  });
  graphData.nodes.push(node);
  markDirty();
  graph.refresh();
  graph.reheat(0.5);
  selectNode(node.id);
  requestAnimationFrame(() => {
    const input = $('#n-label');
    input?.focus();
    input?.select();
  });
}

function createLink(sourceId, targetId) {
  // Одна пара может иметь несколько связей: например, «подчиняется» и
  // «покровительствует». Раньше вторая стрелка просто открывала первую.
  const already = linksBetween(graphData, sourceId, targetId).length;
  const link = newLink({ source: sourceId, target: targetId });
  graphData.links.push(link);
  cancelLinkMode();
  markDirty();
  graph.refresh();
  graph.reheat(0.4);
  selectLink(link.id);
  if (already) toast(`Между этой парой уже ${already + 1} связи — задайте каждой свою подпись`);
  requestAnimationFrame(() => $('#l-label')?.focus());
}

async function deleteNode(id) {
  const node = byId(id);
  if (!node) return;
  const count = graphData.links.filter((link) => link.source === id || link.target === id).length;
  const ok = await ask({
    title: `Удалить «${node.label || 'Без имени'}»?`,
    text: count ? `Вместе с нодой удалятся её связи: ${count}.` : 'Нода будет удалена с карты.',
    ok: 'Удалить',
  });
  if (!ok) return;
  graphData.nodes = graphData.nodes.filter((item) => item.id !== id);
  graphData.links = graphData.links.filter((link) => link.source !== id && link.target !== id);
  if (selected.kind === 'node' && selected.id === id) selected = { kind: null, id: null };
  if (selected.kind === 'link' && !graphData.links.some((link) => link.id === selected.id)) {
    selected = { kind: null, id: null };
  }
  persistNow();
  graph.refresh();
  graph.setSelection(selected.kind, selected.id);
  graph.reheat(0.25);
  renderSidebar();
  updateEmptyState();
  toast('Удалено с карты');
}

async function deleteLink(id) {
  const link = graphData.links.find((item) => item.id === id);
  if (!link) return;
  const source = byId(link.source);
  const target = byId(link.target);
  const ok = await ask({
    title: 'Удалить связь?',
    text: `«${source?.label || '?'}» ${link.directed ? '→' : '↔'} «${target?.label || '?'}»${link.label ? ` (${link.label})` : ''}`,
    ok: 'Удалить',
  });
  if (!ok) return;
  graphData.links = graphData.links.filter((item) => item.id !== id);
  if (selected.kind === 'link' && selected.id === id) selected = { kind: null, id: null };
  persistNow();
  graph.refresh();
  graph.setSelection(selected.kind, selected.id);
  renderSidebar();
  toast('Связь удалена');
}

function applyGraph(next, { fit = false } = {}) {
  graphData = next;
  selected = { kind: null, id: null };
  cancelLinkMode();
  ui.query = '';
  if (searchInput) searchInput.value = '';
  graph.setQuery('');

  const hasAllCoords = graphData.nodes.length > 0
    && graphData.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y));

  graph.setData(graphData, { layout: true });
  graph.setHidden(ui.hidden);
  graph.setQuery(ui.query);
  graph.setMentions(ui.mentions);
  graph.setEdgeLabels(ui.edgeLabels);
  graph.setSelection(null, null);
  persistNow();
  renderSidebar();
  updateEmptyState();

  if (fit) {
    graph.fit();
    pendingFit = !hasAllCoords;
  }
}

async function loadSample() {
  const ok = graphData.nodes.length > 1
    ? await ask({ title: 'Загрузить пример?', text: 'Текущая карта будет заменена демонстрационной.', ok: 'Загрузить', danger: false })
    : true;
  if (!ok) return;
  applyGraph(sampleGraph(), { fit: true });
  toast('Пример загружен');
}

async function clearGraph() {
  if (!graphData.nodes.length) return;
  const ok = await ask({
    title: 'Очистить карту?',
    text: 'Все персонажи, связи и заметки будут удалены. Сначала можно скачать JSON-копию.',
    ok: 'Очистить',
  });
  if (!ok) return;
  applyGraph(blankGraph(), { fit: false });
  toast('Карта очищена');
}

function autoLayout() {
  if (!graphData.nodes.length) return;
  // Закреплённые ноды остаются на местах: пересчитываем только свободные.
  graph.refresh();
  graph.startSim(1);
  pendingFit = true;
  markDirty();
  toast('Раскладка пересчитана');
}

function updateEmptyState() {
  const empty = graphData.nodes.length === 0;
  const element = $('#empty-state');
  if (element) element.hidden = !empty;
}

/* ---------- мобильная панель ---------- */

function openPanel() {
  if (matchMedia('(max-width: 1000px)').matches) document.body.classList.add('panel-open');
}
function closePanel() {
  document.body.classList.remove('panel-open');
}

/* ---------- инициализация ---------- */

function init() {
  applyTheme();
  $('#theme-btn')?.addEventListener('click', toggleTheme);

  const hasAllCoords = graphData.nodes.length > 0
    && graphData.nodes.every((node) => Number.isFinite(node.x) && Number.isFinite(node.y));

  graph.setData(graphData, { layout: true });
  graph.setHidden(ui.hidden);
  graph.setQuery(ui.query);
  graph.setMentions(ui.mentions);
  graph.setEdgeLabels(ui.edgeLabels);
  graph.setSelection(null, null);

  if (searchInput) {
    searchInput.value = ui.query;
    searchInput.addEventListener('input', () => {
      ui.query = searchInput.value;
      graph.setQuery(ui.query);
      saveUi();
      if (!selected.kind) renderSidebar();
    });
  }

  renderSidebar();
  updateEmptyState();
  setSaveState('saved');
  updateFileUi();

  if (!graph.restoredView || !hasAllCoords) {
    requestAnimationFrame(() => {
      graph.fit();
      pendingFit = !hasAllCoords;
    });
  }

  // Кнопки панели инструментов
  $('#btn-add')?.addEventListener('click', addNode);
  $('#btn-link')?.addEventListener('click', () => {
    if (linkMode) cancelLinkMode();
    else startLinkMode(selected.kind === 'node' ? selected.id : null);
  });
  $('#btn-layout')?.addEventListener('click', autoLayout);
  $('#btn-fit')?.addEventListener('click', () => graph.fit());
  $('#btn-zoom-in')?.addEventListener('click', () => graph.zoomBy(1.25));
  $('#btn-zoom-out')?.addEventListener('click', () => graph.zoomBy(0.8));
  $('#panel-toggle')?.addEventListener('click', () => {
    if (document.body.classList.contains('panel-open')) closePanel();
    else openPanel();
  });
  $('#panel-backdrop')?.addEventListener('click', closePanel);

  // Меню JSON
  fileMenu?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-file]');
    if (!button) return;
    fileMenu.removeAttribute('open');
    const action = button.dataset.file;
    if (action === 'download') {
      downloadJson(serializeGraph(graphData), todayName());
      toast('JSON-копия скачана');
    } else if (action === 'import') {
      importInput?.click();
    } else if (action === 'save') {
      saveToFile();
    } else if (action === 'save-as') {
      saveToFile(true);
    } else if (action === 'unlink') {
      unlinkFile();
    }
  });
  document.addEventListener('click', (event) => {
    if (fileMenu?.open && !fileMenu.contains(event.target)) fileMenu.removeAttribute('open');
  });

  importInput?.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    await importFromFile(file);
  });

  // Пустое состояние
  $('#empty-state')?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-empty]')?.dataset.empty;
    if (action === 'add') addNode();
    if (action === 'sample') loadSample();
  });

  // Перетаскивание JSON на граф
  let dragDepth = 0;
  graphHost.addEventListener('dragenter', (event) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    dragDepth += 1;
    graphHost.classList.add('dragover');
  });
  graphHost.addEventListener('dragover', (event) => {
    if (event.dataTransfer?.types?.includes('Files')) event.preventDefault();
  });
  graphHost.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) graphHost.classList.remove('dragover');
  });
  graphHost.addEventListener('drop', async (event) => {
    if (!event.dataTransfer?.files?.length) return;
    event.preventDefault();
    dragDepth = 0;
    graphHost.classList.remove('dragover');
    await importFromFile(event.dataTransfer.files[0]);
  });

  // Горячие клавиши
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyS') {
      event.preventDefault();
      saveToFile();
      return;
    }
    if (event.key === 'Escape') {
      if (dialog?.open) return;
      if (linkMode) cancelLinkMode();
      else if (selected.kind) clearSelection();
      else closePanel();
      return;
    }
    const tag = event.target?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target?.isContentEditable;
    if (typing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code === 'KeyN') {
      event.preventDefault();
      addNode();
    } else if (event.code === 'KeyZ') {
      event.preventDefault();
      addCenter();
    } else if (event.code === 'KeyF') {
      event.preventDefault();
      graph.fit();
    } else if (event.code === 'Slash') {
      event.preventDefault();
      searchInput?.focus();
    } else if (event.code === 'Delete' || event.code === 'Backspace') {
      if (!selected.kind) return;
      event.preventDefault();
      if (selected.kind === 'node') deleteNode(selected.id);
      else deleteLink(selected.id);
    }
  });

  // Системная тема, если пользователь не выбирал вручную
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch { /* ничего */ }
    if (saved !== 'dark' && saved !== 'light') applyTheme();
  });

  // Привязанный файл из прошлого раза
  getStoredHandle().then(async (handle) => {
    if (!handle) return;
    fileHandle = handle;
    filePermission = await queryPermission(handle, 'readwrite');
    updateFileUi();
  });

  // Дописываем файл, если вкладку скрывают
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushFile();
  });

  // Стартовая подсказка
  if (graphData.nodes.length === 1 && graphData.nodes[0].group === 'self' && graphData.nodes[0].label === 'Мой персонаж') {
    setTimeout(() => toast('Измените имя персонажа и добавьте знакомых'), 600);
  }
}

init();
