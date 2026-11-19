// Лёгкий SVG-граф без внешних библиотек: силовая раскладка, панорамирование,
// масштаб, перетаскивание узлов, поиск и пунктирные связи из [[упоминаний]].

import { TONES, VIEW_KEY, mentionPairs } from './store.js';

const NS = 'http://www.w3.org/2000/svg';
const TONE_IDS = TONES.map((tone) => tone.id);
const MIN_ZOOM = 0.12;
const MAX_ZOOM = 3.2;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value) => Math.round(value * 10) / 10;

function el(tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null) node.setAttribute(key, String(value));
  }
  return node;
}

function labelLines(label, max = 18) {
  const words = String(label || '').split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= max || !current) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  const cut = (value) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);
  if (lines.length > 2) {
    return [cut(lines[0]), cut(`${lines.slice(1).join(' ')}`)];
  }
  return lines.map(cut);
}

export class GraphView {
  constructor(host, callbacks = {}) {
    this.host = host;
    this.cbs = callbacks;
    this.data = { nodes: [], links: [] };
    this.sim = new Map();
    this.nodeEls = new Map();
    this.linkEls = new Map();
    this.view = { x: 0, y: 0, k: 1 };
    this.query = '';
    this.hidden = new Set();
    this.selected = { kind: null, id: null };
    this.showMentions = true;
    this.edgeLabels = false;
    this.alpha = 0;
    this.alphaTarget = 0;
    this.alphaMin = 0.001;
    this.alphaDecay = 0.03;
    this.raf = null;
    this.lastEmit = 0;
    this.pointers = new Map();
    this.drag = null;
    this.pan = null;
    this.pinch = null;
    this.width = host.clientWidth || 900;
    this.height = host.clientHeight || 600;

    this.restoredView = this.readView();
    this.buildSvg();
    this.bindEvents();

    this.resizeObserver = new ResizeObserver(() => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      this.width = width;
      this.height = height;
      this.applyView();
    });
    this.resizeObserver.observe(host);
  }

  /* ---------- построение ---------- */

  buildSvg() {
    this.svg = el('svg', { class: 'graph-svg', role: 'img', 'aria-label': 'Граф связей персонажа' });

    const defs = el('defs');
    const pattern = el('pattern', { id: 'dot-grid', width: 30, height: 30, patternUnits: 'userSpaceOnUse' });
    pattern.appendChild(el('circle', { cx: 1, cy: 1, r: 1.4, class: 'grid-dot' }));
    defs.appendChild(pattern);

    for (const tone of TONE_IDS) {
      const marker = el('marker', {
        id: `arrow-${tone}`,
        viewBox: '0 -5 10 10',
        refX: 9,
        refY: 0,
        markerWidth: 5.5,
        markerHeight: 5.5,
        orient: 'auto-start-reverse',
        markerUnits: 'userSpaceOnUse',
      });
      marker.appendChild(el('path', { d: 'M0,-4 L9,0 L0,4 Z', class: `marker marker-${tone}` }));
      defs.appendChild(marker);
    }

    this.svg.appendChild(defs);

    this.viewport = el('g', { class: 'viewport' });
    this.grid = el('rect', {
      x: -12000, y: -12000, width: 24000, height: 24000, fill: 'url(#dot-grid)', class: 'grid-rect',
    });
    this.mentionLayer = el('g', { class: 'mentions' });
    this.linkLayer = el('g', { class: 'links' });
    this.nodeLayer = el('g', { class: 'nodes' });
    this.viewport.append(this.grid, this.mentionLayer, this.linkLayer, this.nodeLayer);
    this.svg.appendChild(this.viewport);

    this.host.prepend(this.svg);
    this.applyView();
  }

  /* ---------- данные ---------- */

  setData(data, { layout = true } = {}) {
    this.data = data;
    const assigned = this.buildSim();
    this.refresh();
    if (layout && assigned) this.startSim(1);
    else this.renderPositions();
  }

  buildSim() {
    const alive = new Set();
    const missing = [];
    for (const node of this.data.nodes) {
      alive.add(node.id);
      let sim = this.sim.get(node.id);
      if (!sim) {
        sim = { x: null, y: null, vx: 0, vy: 0, fixed: false, r: 10, degree: 0 };
        this.sim.set(node.id, sim);
      }
      sim.fixed = Boolean(node.fixed);
      sim.degree = 0;
      if (node.x !== null && node.x !== undefined) sim.x = Number(node.x);
      if (node.y !== null && node.y !== undefined) sim.y = Number(node.y);
      if (!Number.isFinite(sim.x) || !Number.isFinite(sim.y)) missing.push(sim);
    }
    for (const id of [...this.sim.keys()]) {
      if (!alive.has(id)) this.sim.delete(id);
    }
    for (const link of this.data.links) {
      const source = this.sim.get(link.source);
      const target = this.sim.get(link.target);
      if (source) source.degree += 1;
      if (target) target.degree += 1;
    }

    const total = Math.max(1, missing.length);
    missing.forEach((sim, index) => {
      const angle = (index / total) * Math.PI * 2;
      const radius = 120 + Math.sqrt(this.data.nodes.length) * 22;
      sim.x = Math.cos(angle) * radius + (Math.random() - 0.5) * 30;
      sim.y = Math.sin(angle) * radius + (Math.random() - 0.5) * 30;
      sim.vx = 0;
      sim.vy = 0;
    });
    if (!this.data.nodes.length) return false;
    return missing.length > 0;
  }

  refresh() {
    if (!this.data) return;
    this.buildSim();
    for (const layer of [this.mentionLayer, this.linkLayer, this.nodeLayer]) layer.replaceChildren();
    this.nodeEls.clear();
    this.linkEls.clear();

    const byId = new Map(this.data.nodes.map((node) => [node.id, node]));

    if (this.showMentions) {
      for (const pair of mentionPairs(this.data)) {
        if (!byId.has(pair.source) || !byId.has(pair.target)) continue;
        this.mentionLayer.appendChild(el('line', {
          class: 'mention-line',
          'data-source': pair.source,
          'data-target': pair.target,
        }));
      }
    }

    for (const link of this.data.links) {
      const source = byId.get(link.source);
      const target = byId.get(link.target);
      if (!source || !target) continue;
      const entry = this.createLink(link);
      this.linkLayer.appendChild(entry.group);
      this.linkEls.set(link.id, entry);
    }

    for (const node of this.data.nodes) {
      const sim = this.sim.get(node.id);
      sim.r = this.radiusOf(node, sim.degree);
      const element = this.createNode(node, sim);
      this.nodeLayer.appendChild(element);
      this.nodeEls.set(node.id, element);
    }

    this.applyFilter();
    this.applySelection();
    this.renderPositions();
  }

  radiusOf(node, degree) {
    if (node.group === 'self') return 15;
    return 9 + Math.min(8, Math.log2(degree + 1) * 2.6);
  }

  createNode(node, sim) {
    const group = el('g', {
      class: `node g-${node.group}${node.dead ? ' dead' : ''}${node.fixed ? ' pinned' : ''}`,
      'data-id': node.id,
    });

    group.appendChild(el('circle', { class: 'node-halo', r: sim.r + 7 }));
    group.appendChild(el('circle', { class: 'node-dot', r: sim.r }));

    const pin = el('g', { class: 'node-pin', 'aria-hidden': 'true' });
    pin.appendChild(el('circle', { cx: round(sim.r * 0.8), cy: round(-sim.r * 0.8), r: 4.2 }));
    group.appendChild(pin);

    if (node.dead) {
      group.appendChild(el('line', {
        class: 'node-strike',
        x1: -sim.r * 1.38, y1: -sim.r * 1.38, x2: sim.r * 1.38, y2: sim.r * 1.38,
      }));
      group.appendChild(el('line', {
        class: 'node-strike node-strike-2',
        x1: sim.r * 1.38, y1: -sim.r * 1.38, x2: -sim.r * 1.38, y2: sim.r * 1.38,
      }));
    }

    const lines = labelLines(node.label);
    const text = el('text', { class: 'node-label', 'text-anchor': 'middle', x: 0, y: sim.r + 15 });
    lines.forEach((line, index) => {
      const tspan = el('tspan', { x: 0, dy: index === 0 ? 0 : 13 });
      tspan.textContent = line;
      text.appendChild(tspan);
    });
    group.appendChild(text);

    const title = el('title');
    title.textContent = `${node.label}${node.dead ? ' (недоступен)' : ''}${node.fixed ? ' · закреплён' : ''}${node.notes ? `\n${node.notes.slice(0, 260)}` : ''}`;
    group.appendChild(title);

    group.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      event.preventDefault();
      event.stopPropagation();
      this.beginNodeDrag(event, node.id);
    });
    group.addEventListener('dblclick', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.focusNode(node.id);
    });
    return group;
  }

  createLink(link) {
    const group = el('g', { class: `link t-${link.tone}${link.directed ? ' directed' : ''}`, 'data-id': link.id });
    const hit = el('line', { class: 'link-hit' });
    const line = el('line', {
      class: 'link-line',
      ...(link.directed ? { 'marker-end': `url(#arrow-${link.tone})` } : {}),
    });
    const label = el('text', { class: 'link-label', 'text-anchor': 'middle' });
    if (link.label) label.textContent = link.label;
    group.append(hit, line, label);

    hit.addEventListener('pointerdown', (event) => event.stopPropagation());
    group.addEventListener('click', (event) => {
      event.stopPropagation();
      this.cbs.onLinkClick?.(link.id);
    });
    return { group, hit, line, label, link };
  }

  /* ---------- отрисовка ---------- */

  renderPositions() {
    if (!this.data) return;
    for (const node of this.data.nodes) {
      const sim = this.sim.get(node.id);
      const element = this.nodeEls.get(node.id);
      if (!sim || !element || !Number.isFinite(sim.x)) continue;
      element.setAttribute('transform', `translate(${round(sim.x)} ${round(sim.y)})`);
    }

    for (const entry of this.linkEls.values()) {
      const source = this.sim.get(entry.link.source);
      const target = this.sim.get(entry.link.target);
      if (!source || !target) continue;
      let dx = target.x - source.x;
      let dy = target.y - source.y;
      let distance = Math.hypot(dx, dy);
      if (distance < 0.001) {
        dx = 1;
        dy = 0;
        distance = 1;
      }
      const ux = dx / distance;
      const uy = dy / distance;
      const startGap = source.r + 2;
      const endGap = entry.link.directed ? target.r + 6 : target.r + 2;
      const x1 = source.x + ux * startGap;
      const y1 = source.y + uy * startGap;
      const x2 = target.x - ux * endGap;
      const y2 = target.y - uy * endGap;
      entry.line.setAttribute('x1', round(x1));
      entry.line.setAttribute('y1', round(y1));
      entry.line.setAttribute('x2', round(x2));
      entry.line.setAttribute('y2', round(y2));
      entry.hit.setAttribute('x1', round(x1));
      entry.hit.setAttribute('y1', round(y1));
      entry.hit.setAttribute('x2', round(x2));
      entry.hit.setAttribute('y2', round(y2));
      entry.label.setAttribute('x', round((x1 + x2) / 2));
      entry.label.setAttribute('y', round((y1 + y2) / 2) - 5);
    }

    if (this.showMentions) {
      for (const line of this.mentionLayer.children) {
        const source = this.sim.get(line.dataset.source);
        const target = this.sim.get(line.dataset.target);
        if (!source || !target) continue;
        line.setAttribute('x1', round(source.x));
        line.setAttribute('y1', round(source.y));
        line.setAttribute('x2', round(target.x));
        line.setAttribute('y2', round(target.y));
      }
    }
  }

  applyView() {
    const x = this.width / 2 + this.view.x;
    const y = this.height / 2 + this.view.y;
    this.viewport.setAttribute('transform', `translate(${round(x)} ${round(y)}) scale(${this.view.k})`);
  }

  /* ---------- фильтры и выделение ---------- */

  setQuery(query) {
    this.query = String(query || '').trim().toLowerCase();
    this.applyFilter();
  }

  setHidden(groups) {
    this.hidden = new Set(groups || []);
    this.applyFilter();
  }

  setMentions(enabled) {
    const next = Boolean(enabled);
    if (next === this.showMentions) return;
    this.showMentions = next;
    this.refresh();
  }

  setEdgeLabels(enabled) {
    this.edgeLabels = Boolean(enabled);
    this.svg.classList.toggle('labels-on', this.edgeLabels);
  }

  matches(node) {
    if (!node) return false;
    if (!this.query) return true;
    const haystack = [node.label, ...(node.tags || []), node.notes || ''].join(' ').toLowerCase();
    return haystack.includes(this.query);
  }

  applyFilter() {
    const hiddenGroups = this.hidden;
    for (const node of this.data.nodes) {
      const element = this.nodeEls.get(node.id);
      if (!element) continue;
      const hidden = hiddenGroups.has(node.group);
      const hit = Boolean(this.query) && this.matches(node);
      element.classList.toggle('hidden', hidden);
      element.classList.toggle('dim', Boolean(this.query) && !hit);
      element.classList.toggle('hit', hit);
    }

    for (const entry of this.linkEls.values()) {
      const source = this.data.nodes.find((node) => node.id === entry.link.source);
      const target = this.data.nodes.find((node) => node.id === entry.link.target);
      const hidden = !source || !target || hiddenGroups.has(source.group) || hiddenGroups.has(target.group);
      const dim = Boolean(this.query) && !(this.matches(source) || this.matches(target));
      entry.group.classList.toggle('hidden', hidden);
      entry.group.classList.toggle('dim', dim);
    }

    for (const line of [...this.mentionLayer.children]) {
      const source = this.data.nodes.find((node) => node.id === line.dataset.source);
      const target = this.data.nodes.find((node) => node.id === line.dataset.target);
      const hidden = !source || !target || hiddenGroups.has(source.group) || hiddenGroups.has(target.group);
      const dim = Boolean(this.query) && !(this.matches(source) || this.matches(target));
      line.classList.toggle('hidden', hidden);
      line.classList.toggle('dim', dim);
    }
  }

  setSelection(kind, id) {
    this.selected = { kind: kind || null, id: id || null };
    this.applySelection();
  }

  applySelection() {
    for (const [id, element] of this.nodeEls) {
      element.classList.toggle('sel', this.selected.kind === 'node' && this.selected.id === id);
    }
    for (const [id, entry] of this.linkEls) {
      entry.group.classList.toggle('sel', this.selected.kind === 'link' && this.selected.id === id);
    }
  }

  /* ---------- силовая раскладка ---------- */

  startSim(alpha = 1) {
    if (!this.data.nodes.length) return;
    this.alpha = Math.max(this.alpha, alpha);
    this.alphaTarget = 0;
    this.ensureRaf();
  }

  reheat(alpha = 0.6) {
    if (!this.data.nodes.length) return;
    this.alpha = Math.max(this.alpha, alpha);
    this.ensureRaf();
  }

  ensureRaf() {
    if (this.raf) return;
    this.lastEmit = 0;
    this.raf = requestAnimationFrame(this.tickFrame);
  }

  tickFrame = (now) => {
    this.raf = null;
    if (!this.data.nodes.length) return;
    this.alpha += (this.alphaTarget - this.alpha) * this.alphaDecay;
    this.step();
    this.renderPositions();
    if (now - this.lastEmit > 700) {
      this.lastEmit = now;
      this.emitPositions();
    }
    if (this.alpha > this.alphaMin || this.alphaTarget > 0.001) {
      this.raf = requestAnimationFrame(this.tickFrame);
    } else {
      this.alpha = 0;
      this.emitPositions();
      this.cbs.onSettled?.();
    }
  };

  step() {
    const alpha = this.alpha;
    const nodes = [];
    for (const node of this.data.nodes) {
      const sim = this.sim.get(node.id);
      if (sim) nodes.push(sim);
    }
    const count = nodes.length;
    if (!count) return;

    const charge = 380;
    for (let i = 0; i < count; i += 1) {
      const a = nodes[i];
      for (let j = i + 1; j < count; j += 1) {
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let distance2 = dx * dx + dy * dy;
        if (distance2 < 1) {
          dx = (Math.random() - 0.5) * 2;
          dy = (Math.random() - 0.5) * 2;
          distance2 = dx * dx + dy * dy;
        }
        const distance = Math.sqrt(distance2);
        const force = (charge * alpha) / distance;
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        if (!a.fixed) {
          a.vx -= fx;
          a.vy -= fy;
        }
        if (!b.fixed) {
          b.vx += fx;
          b.vy += fy;
        }
        const minDistance = a.r + b.r + 14;
        if (distance < minDistance) {
          const push = ((minDistance - distance) / distance) * 0.32 * alpha;
          if (!a.fixed) {
            a.vx -= dx * push;
            a.vy -= dy * push;
          }
          if (!b.fixed) {
            b.vx += dx * push;
            b.vy += dy * push;
          }
        }
      }
    }

    for (const link of this.data.links) {
      const source = this.sim.get(link.source);
      const target = this.sim.get(link.target);
      if (!source || !target) continue;
      const distance = Math.max(1, Math.hypot(target.x - source.x, target.y - source.y));
      const desired = 72 + source.r + target.r + (source.degree > 4 ? 12 : 0);
      const strength = 0.09 / Math.min(4, Math.max(1, Math.min(source.degree, target.degree)));
      const force = ((distance - desired) / distance) * strength * alpha;
      const dx = (source.x - target.x) * force;
      const dy = (source.y - target.y) * force;
      if (!source.fixed) {
        source.vx -= dx;
        source.vy -= dy;
      }
      if (!target.fixed) {
        target.vx += dx;
        target.vy += dy;
      }
    }

    for (const node of nodes) {
      if (node.fixed) {
        node.vx = 0;
        node.vy = 0;
        continue;
      }
      node.vx -= node.x * 0.008 * alpha;
      node.vy -= node.y * 0.008 * alpha;
      node.vx *= 0.42;
      node.vy *= 0.42;
      node.x += node.vx;
      node.y += node.vy;
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
        node.x = (Math.random() - 0.5) * 200;
        node.y = (Math.random() - 0.5) * 200;
        node.vx = 0;
        node.vy = 0;
      }
    }
  }

  emitPositions() {
    for (const node of this.data.nodes) {
      const sim = this.sim.get(node.id);
      if (!sim || !Number.isFinite(sim.x) || !Number.isFinite(sim.y)) continue;
      node.x = round(sim.x);
      node.y = round(sim.y);
    }
    this.cbs.onLayout?.();
  }

  /* ---------- указатель ---------- */

  bindEvents() {
    this.onPointerDown = (event) => this.handlePointerDown(event);
    this.onPointerMove = (event) => this.handlePointerMove(event);
    this.onPointerUp = (event) => this.handlePointerUp(event);
    this.onWheel = (event) => {
      event.preventDefault();
      const rect = this.svg.getBoundingClientRect();
      const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.04 : 0.0018));
      this.zoomAt(event.clientX - rect.left, event.clientY - rect.top, this.view.k * factor);
    };

    this.svg.addEventListener('pointerdown', this.onPointerDown);
    this.svg.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
  }

  handlePointerDown(event) {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    const target = event.target;
    if (target.closest?.('.node, .link-hit')) return;
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size === 1) {
      this.pan = { startX: event.clientX, startY: event.clientY, x: this.view.x, y: this.view.y };
      this.moved = false;
      this.svg.classList.add('panning');
    } else if (this.pointers.size === 2) {
      this.pan = null;
      this.pinch = { ...this.pinchStart() };
    }
  }

  pinchStart() {
    const points = [...this.pointers.values()];
    const [a, b] = points;
    const rect = this.svg.getBoundingClientRect();
    return {
      distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      k: this.view.k,
      midX: (a.x + b.x) / 2 - rect.left,
      midY: (a.y + b.y) / 2 - rect.top,
    };
  }

  handlePointerMove(event) {
    if (this.pointers.has(event.pointerId)) {
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }

    if (this.drag) {
      const { id, startX, startY, originX, originY } = this.drag;
      const sim = this.sim.get(id);
      if (!sim) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (!this.drag.moved) {
        // Пока курсор почти не сдвинулся, это ещё клик: раскладку не трогаем,
        // иначе граф «дрожит» от каждого нажатия на узел.
        if (Math.hypot(dx, dy) <= 5) return;
        this.drag.moved = true;
        this.alphaTarget = 0.25;
        this.ensureRaf();
      }
      sim.x = originX + dx / this.view.k;
      sim.y = originY + dy / this.view.k;
      sim.vx = 0;
      sim.vy = 0;
      this.renderPositions();
      return;
    }

    if (this.pinch && this.pointers.size >= 2) {
      const points = [...this.pointers.values()];
      const [a, b] = points;
      const rect = this.svg.getBoundingClientRect();
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const midX = (a.x + b.x) / 2 - rect.left;
      const midY = (a.y + b.y) / 2 - rect.top;
      this.zoomAt(this.pinch.midX, this.pinch.midY, this.pinch.k * (distance / this.pinch.distance));
      this.view.x += midX - this.pinch.midX;
      this.view.y += midY - this.pinch.midY;
      this.pinch.midX = midX;
      this.pinch.midY = midY;
      this.applyView();
      return;
    }

    if (this.pan) {
      const dx = event.clientX - this.pan.startX;
      const dy = event.clientY - this.pan.startY;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.moved = true;
      this.view.x = this.pan.x + dx;
      this.view.y = this.pan.y + dy;
      this.applyView();
    }
  }

  handlePointerUp(event) {
    if (this.drag) {
      const drag = this.drag;
      const sim = this.sim.get(drag.id);
      const node = this.data.nodes.find((item) => item.id === drag.id);
      this.drag = null;
      this.alphaTarget = 0;
      if (sim && node) {
        if (drag.moved) {
          // Перетаскивание только перемещает узел: раскладка остаётся «живой»,
          // а закрепление — отдельное явное действие в карточке персонажа.
          node.x = round(sim.x);
          node.y = round(sim.y);
          this.emitPositions();
          this.reheat(0.35);
        } else {
          this.cbs.onNodeClick?.(drag.id);
        }
      }
    }

    if (this.pointers.has(event.pointerId)) this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinch = null;

    if (this.pointers.size === 0) {
      if (this.pan && !this.moved) this.cbs.onBackgroundClick?.();
      if (this.pan) this.saveView();
      this.pan = null;
      this.svg.classList.remove('panning');
      this.moved = false;
    }
  }

  beginNodeDrag(event, id) {
    const sim = this.sim.get(id);
    if (!sim) return;
    this.drag = {
      id,
      startX: event.clientX,
      startY: event.clientY,
      originX: sim.x,
      originY: sim.y,
      moved: false,
    };
  }

  setPinned(id, pinned) {
    const node = this.data.nodes.find((item) => item.id === id);
    const sim = this.sim.get(id);
    if (!node || !sim) return false;
    const next = Boolean(pinned);
    if (node.fixed === next) return next;
    node.fixed = next;
    sim.fixed = next;
    sim.vx = 0;
    sim.vy = 0;
    node.x = round(sim.x);
    node.y = round(sim.y);
    this.nodeEls.get(id)?.classList.toggle('pinned', next);
    if (!next) this.reheat(0.35);
    this.emitPositions();
    this.cbs.onPinChange?.(id, next);
    return next;
  }

  /* ---------- вид ---------- */

  zoomAt(screenX, screenY, nextK) {
    const k = clamp(nextK, MIN_ZOOM, MAX_ZOOM);
    if (Math.abs(k - this.view.k) < 0.0001) return;
    const worldX = (screenX - this.width / 2 - this.view.x) / this.view.k;
    const worldY = (screenY - this.height / 2 - this.view.y) / this.view.k;
    this.view.k = k;
    this.view.x = screenX - this.width / 2 - worldX * k;
    this.view.y = screenY - this.height / 2 - worldY * k;
    this.applyView();
    this.saveView();
  }

  zoomBy(factor) {
    this.zoomAt(this.width / 2, this.height / 2, this.view.k * factor);
  }

  fit() {
    if (!this.data.nodes.length) {
      this.view = { x: 0, y: 0, k: 1 };
      this.applyView();
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of this.data.nodes) {
      const sim = this.sim.get(node.id);
      if (!sim) continue;
      minX = Math.min(minX, sim.x - sim.r - 20);
      minY = Math.min(minY, sim.y - sim.r - 20);
      maxX = Math.max(maxX, sim.x + sim.r + 20);
      maxY = Math.max(maxY, sim.y + sim.r + 46);
    }
    if (!Number.isFinite(minX)) return;
    const padding = 64;
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const k = clamp(Math.min((this.width - padding * 2) / width, (this.height - padding * 2) / height), MIN_ZOOM, 1.6);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    this.view = { x: -centerX * k, y: -centerY * k, k };
    this.applyView();
    this.saveView();
  }

  focusNode(id) {
    const sim = this.sim.get(id);
    if (!sim) return;
    const k = clamp(Math.max(this.view.k, 0.85), MIN_ZOOM, MAX_ZOOM);
    this.view = { x: -sim.x * k, y: -sim.y * k, k };
    this.applyView();
    this.saveView();
  }

  screenCenter() {
    return { x: -this.view.x / this.view.k, y: -this.view.y / this.view.k };
  }

  readView() {
    try {
      const raw = localStorage.getItem(VIEW_KEY);
      if (!raw) return false;
      const value = JSON.parse(raw);
      if (!value || !Number.isFinite(value.k) || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return false;
      this.view = { x: value.x, y: value.y, k: clamp(value.k, MIN_ZOOM, MAX_ZOOM) };
      return true;
    } catch {
      return false;
    }
  }

  saveView() {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(this.view));
    } catch {
      /* приватный режим */
    }
  }
}
