// Лёгкий SVG-граф без внешних библиотек: силовая раскладка, панорамирование,
// масштаб, перетаскивание узлов, поиск и пунктирные связи из [[упоминаний]].

import { TONES, VIEW_KEY, mentionPairs, factionPalette, normFaction } from './store.js';

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

// Оболочка-блиб: выпуклая обертка вокруг участников с запасом и сглаживанием,
// чтобы форма была живой, но не дёргалась при каждом шаге раскладки.
function convexHull(points) {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const point of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const point = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// Точки на окружности ноды: из них вместе с прямоугольником подписи
// собирается оболочка блиба.
function circlePoints(cx, cy, r, segments = 24) {
  const points = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
  }
  return points;
}

// Прямоугольник подписи ноды: блиб должен накрывать и текст, иначе он
// вылезает за край. Ширина оценивается по 11px шрифту.
function labelPoints(node, sim) {
  const lines = labelLines(node.label);
  const width = Math.max(24, Math.max(...lines.map((line) => line.length)) * 6.1) + 8;
  const top = sim.r + 4;
  const bottom = sim.r + 18 + Math.max(0, lines.length - 1) * 13;
  const x1 = sim.x - width / 2;
  const x2 = sim.x + width / 2;
  return [
    { x: x1, y: sim.y + top },
    { x: x2, y: sim.y + top },
    { x: x2, y: sim.y + bottom },
    { x: x1, y: sim.y + bottom },
  ];
}

// Надуваем выпуклую оболочку на radius: стороны сдвигаются наружу, а в углах
// ставятся дуги. В отличие от сглаживания через середины, такая кривая
// гарантированно содержит все исходные точки — ноды не выходят за край.
function inflateHullPath(hull, radius) {
  const count = hull.length;
  if (count < 3) return { path: '', points: [] };
  const normals = hull.map((point, index) => {
    const next = hull[(index + 1) % count];
    const dx = next.x - point.x;
    const dy = next.y - point.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: dy / length, y: -dx / length };
  });
  const points = [];
  let path = '';
  for (let i = 0; i < count; i += 1) {
    const vertex = hull[i];
    const previous = normals[(i - 1 + count) % count];
    const next = normals[i];
    const from = { x: vertex.x + previous.x * radius, y: vertex.y + previous.y * radius };
    const to = { x: vertex.x + next.x * radius, y: vertex.y + next.y * radius };
    points.push(from, to);
    path += `${i === 0 ? 'M' : ' L'}${round(from.x)},${round(from.y)}`;
    path += ` A${radius},${radius} 0 0 1 ${round(to.x)},${round(to.y)}`;
  }
  return { path: `${path} Z`, points };
}

function ellipsePath(cx, cy, rx, ry) {
  const x = round(cx);
  const y = round(cy);
  const a = round(rx);
  const b = round(ry);
  return `M${x - a},${y} A${a},${b} 0 1 0 ${x + a},${y} A${a},${b} 0 1 0 ${x - a},${y} Z`;
}

export class GraphView {
  constructor(host, callbacks = {}) {
    this.host = host;
    this.cbs = callbacks;
    this.data = { nodes: [], links: [] };
    this.sim = new Map();
    this.nodeEls = new Map();
    this.clusterEls = new Map();
    this.clusters = [];
    this.clusterKey = '';
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
        viewBox: '0 -7 14 14',
        refX: 12,
        refY: 0,
        markerWidth: 9,
        markerHeight: 9,
        orient: 'auto-start-reverse',
        markerUnits: 'userSpaceOnUse',
      });
      marker.appendChild(el('path', { d: 'M0,-6 L12,0 L0,6 Z', class: `marker marker-${tone}` }));
      defs.appendChild(marker);
    }

    this.svg.appendChild(defs);

    this.viewport = el('g', { class: 'viewport' });
    this.grid = el('rect', {
      x: -12000, y: -12000, width: 24000, height: 24000, fill: 'url(#dot-grid)', class: 'grid-rect',
    });
    this.clusterLayer = el('g', { class: 'clusters' });
    this.mentionLayer = el('g', { class: 'mentions' });
    this.linkLayer = el('g', { class: 'links' });
    this.nodeLayer = el('g', { class: 'nodes' });
    this.viewport.append(this.grid, this.clusterLayer, this.mentionLayer, this.linkLayer, this.nodeLayer);
    this.svg.appendChild(this.viewport);

    this.host.prepend(this.svg);
    this.applyView();
  }

  /* ---------- данные ---------- */

  setData(data, { layout = false } = {}) {
    this.data = data;
    const assigned = this.buildSim();
    this.refresh();
    if (layout && assigned) this.startSim(1);
    else {
      // Позиции, которые раскладка назначила новым нодам без координат,
      // сразу фиксируем в данных — без этого они «прыгали» при перезагрузке.
      if (assigned) this.emitPositions();
      this.renderPositions();
    }
  }

  buildSim() {
    const alive = new Set();
    const missing = [];
    for (const node of this.data.nodes) {
      alive.add(node.id);
      let sim = this.sim.get(node.id);
      if (!sim) {
        sim = { id: node.id, x: null, y: null, vx: 0, vy: 0, fixed: false, r: 10, degree: 0 };
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
    for (const layer of [this.clusterLayer, this.mentionLayer, this.linkLayer, this.nodeLayer]) layer.replaceChildren();
    this.nodeEls.clear();
    this.clusterEls.clear();
    this.linkEls.clear();

    const byId = new Map(this.data.nodes.map((node) => [node.id, node]));

    this.clusterKey = '';
    this.computeClusters();
    this.clusterKey = this.clusters.map((cluster) => cluster.key).join('~');
    this.rebuildClusters();

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

    const bends = this.computeBends();
    for (const link of this.data.links) {
      const source = byId.get(link.source);
      const target = byId.get(link.target);
      if (!source || !target) continue;
      const entry = this.createLink(link, bends.get(link.id) || 0);
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
    if (node.group === 'org') return 18;
    return 9 + Math.min(8, Math.log2(degree + 1) * 2.6);
  }

  // Блиб — визуальная микро-зона. Ноды одной фракции сливаются, только если
  // стоят достаточно близко: иначе одна фракция даёт несколько локальных
  // блибов, и огромная оболочка не накрывает полкарты. Ноды без фракции
  // собираются в безымянные блибы по близости и связям.
  computeClusters() {
    for (const node of this.data.nodes) {
      const sim = this.sim.get(node.id);
      if (sim) sim.r = this.radiusOf(node, sim.degree);
    }
    const points = this.data.nodes
      .map((node) => ({ node, sim: this.sim.get(node.id) }))
      .filter((item) => item.sim && Number.isFinite(item.sim.x) && !this.hidden.has(item.node.group));
    if (!points.length) {
      this.clusters = [];
      return;
    }

    const parent = points.map((_, index) => index);
    const find = (a) => {
      while (parent[a] !== a) {
        parent[a] = parent[parent[a]];
        a = parent[a];
      }
      return a;
    };
    const union = (a, b) => { parent[find(a)] = find(b); };

    // Блиб — только у настоящей фракции. Ноды без фракции не получают
    // серой окантовки: это были бы «фракции поневоле».
    const FACTION_GAP = 210;
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        const a = points[i];
        const b = points[j];
        const fa = normFaction(a.node.faction);
        const fb = normFaction(b.node.faction);
        if (!fa || fa !== fb) continue;
        const distance = Math.hypot(a.sim.x - b.sim.x, a.sim.y - b.sim.y);
        if (distance < a.sim.r + b.sim.r + FACTION_GAP) union(i, j);
      }
    }

    const components = new Map();
    points.forEach((item, index) => {
      const root = find(index);
      if (!components.has(root)) components.set(root, []);
      components.get(root).push(item);
    });

    const palette = factionPalette(this.data.nodes);
    this.clusters = [...components.values()]
      .filter((items) => normFaction(items[0].node.faction))
      .map((items, index) => {
        const faction = normFaction(items[0].node.faction);
        const center = items.find((item) => item.node.group === 'org')?.node || null;
        const samples = [];
        for (const item of items) {
          samples.push(...circlePoints(item.sim.x, item.sim.y, item.sim.r + 5, 20));
          samples.push(...labelPoints(item.node, item.sim));
        }
        const hull = convexHull(samples);
        const inflated = inflateHullPath(hull, 14);
        let path = inflated.path;
        let edge = inflated.points;
        if (!path || !edge.length) {
          const sim = items[0].sim;
          const radius = sim.r + 30;
          path = ellipsePath(sim.x, sim.y, radius, radius);
          edge = [
            { x: sim.x - radius, y: sim.y - radius },
            { x: sim.x + radius, y: sim.y + radius },
          ];
        }
        const xs = edge.map((point) => point.x);
        const ys = edge.map((point) => point.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const rx = Math.max(30, (maxX - minX) / 2);
        const ry = Math.max(26, (maxY - minY) / 2);
        const members = items.map((item) => item.node.id).sort();
        // Если в блибе есть нода-центр с тем же названием, её подпись уже
        // стоит на карте — второй такой же заголовок не нужен.
        const centerNames = Boolean(center) && center.label.trim() === faction;
        return {
          id: `cluster-${index}`,
          key: members.join('|'),
          members,
          path,
          cx,
          cy,
          rx,
          ry,
          faction,
          color: palette.get(faction) || '',
          label: faction && !centerNames ? faction : '',
          count: items.length,
          center: Boolean(center),
        };
      });
  }

  rebuildClusters() {
    this.clusterLayer.replaceChildren();
    this.clusterEls.clear();
    for (const cluster of this.clusters) {
      const entry = this.createCluster(cluster);
      this.clusterLayer.appendChild(entry.group);
      this.clusterEls.set(cluster.id, entry);
    }
  }

  createCluster(cluster) {
    const group = el('g', { class: `cluster${cluster.faction ? ' named' : ''}`, 'data-id': cluster.id });
    group.style.setProperty('--zc', cluster.color || 'var(--mute)');
    const hull = el('path', { class: 'cluster-hull' });
    hull.setAttribute('d', cluster.path);
    const label = el('text', { class: 'cluster-label', 'text-anchor': 'middle' });
    label.textContent = cluster.label;
    group.append(hull, label);
    return { group, hull, label, cluster };
  }

  // Параллельные связи между одной парой разводим по дугам, иначе вторая
  // стрелка рисуется поверх первой и её не видно. Смещение считается
  // относительно собственного направления каждой связи: встречные дуги
  // расходятся в разные стороны, односторонние — веером.
  computeBends() {
    const groups = new Map();
    for (const link of this.data.links) {
      const key = [link.source, link.target].sort().join('\u0000');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(link);
    }
    const bends = new Map();
    for (const list of groups.values()) {
      const first = list[0].source < list[0].target ? list[0].source : list[0].target;
      const forward = list.filter((link) => link.source === first);
      const backward = list.filter((link) => link.target === first);
      const twoWay = forward.length > 0 && backward.length > 0;
      for (const group of [forward, backward]) {
        group.forEach((link, index) => {
          const spread = (index - (group.length - 1) / 2) * 30;
          bends.set(link.id, spread + (twoWay ? 20 : 0));
        });
      }
    }
    return bends;
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

  createLink(link, bend = 0) {
    const group = el('g', { class: `link t-${link.tone}${link.directed ? ' directed' : ''}`, 'data-id': link.id });
    const hit = el('path', { class: 'link-hit' });
    const line = el('path', {
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
    return { group, hit, line, label, link, bend };
  }

  /* ---------- отрисовка ---------- */

  endpointPos(id) {
    const sim = this.sim.get(id);
    if (!sim || !Number.isFinite(sim.x)) return null;
    return { x: sim.x, y: sim.y, r: sim.r || 10 };
  }

  renderPositions() {
    if (!this.data) return;
    this.computeClusters();
    const key = this.clusters.map((cluster) => cluster.key).join('~');
    if (key !== this.clusterKey) {
      this.clusterKey = key;
      this.rebuildClusters();
    }

    for (const cluster of this.clusters) {
      const entry = this.clusterEls.get(cluster.id);
      if (!entry) continue;
      entry.hull.setAttribute('d', cluster.path);
      entry.label.textContent = cluster.label;
      entry.label.setAttribute('x', round(cluster.cx));
      entry.label.setAttribute('y', round(cluster.cy - cluster.ry - 9));
      entry.group.classList.toggle('named', Boolean(cluster.faction));
      entry.group.style.setProperty('--zc', cluster.color || 'var(--mute)');
    }
    this.applyClusterFilter();

    for (const node of this.data.nodes) {
      const sim = this.sim.get(node.id);
      const element = this.nodeEls.get(node.id);
      if (!sim || !element || !Number.isFinite(sim.x)) continue;
      element.setAttribute('transform', `translate(${round(sim.x)} ${round(sim.y)})`);
    }

    for (const entry of this.linkEls.values()) {
      const source = this.endpointPos(entry.link.source);
      const target = this.endpointPos(entry.link.target);
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
      const x1 = source.x + ux * (source.r + 2);
      const y1 = source.y + uy * (source.r + 2);
      const x2 = target.x - ux * (entry.link.directed ? target.r + 10 : target.r + 2);
      const y2 = target.y - uy * (entry.link.directed ? target.r + 10 : target.r + 2);
      // Нормаль к направлению связи; по ней смещается управляющая точка дуги.
      const nx = -uy;
      const ny = ux;
      const bend = Math.max(-distance * 0.5, Math.min(distance * 0.5, entry.bend));
      const cx = (x1 + x2) / 2 + nx * bend;
      const cy = (y1 + y2) / 2 + ny * bend;
      const path = `M${round(x1)},${round(y1)} Q${round(cx)},${round(cy)} ${round(x2)},${round(y2)}`;
      entry.line.setAttribute('d', path);
      entry.hit.setAttribute('d', path);
      // Точка кривой при t = 0.5: (P0 + 2·C + P2) / 4.
      entry.label.setAttribute('x', round((x1 + x2) / 2 + nx * bend / 2));
      entry.label.setAttribute('y', round((y1 + y2) / 2 + ny * bend / 2) - 5);
    }

    if (this.showMentions) {
      for (const line of this.mentionLayer.children) {
        const source = this.endpointPos(line.dataset.source);
        const target = this.endpointPos(line.dataset.target);
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
    this.renderPositions();
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
    const resolve = (id) => this.data.nodes.find((node) => node.id === id);
    const hiddenEnd = (item) => !item || hiddenGroups.has(item.group);

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
      const source = resolve(entry.link.source);
      const target = resolve(entry.link.target);
      const hidden = hiddenEnd(source) || hiddenEnd(target);
      const dim = Boolean(this.query) && !(this.matches(source) || this.matches(target));
      entry.group.classList.toggle('hidden', hidden);
      entry.group.classList.toggle('dim', dim);
    }

    for (const line of [...this.mentionLayer.children]) {
      const source = resolve(line.dataset.source);
      const target = resolve(line.dataset.target);
      const hidden = hiddenEnd(source) || hiddenEnd(target);
      const dim = Boolean(this.query) && !(this.matches(source) || this.matches(target));
      line.classList.toggle('hidden', hidden);
      line.classList.toggle('dim', dim);
    }

    this.applyClusterFilter();
  }

  applyClusterFilter() {
    const byId = new Map(this.data.nodes.map((node) => [node.id, node]));
    for (const cluster of this.clusters) {
      const entry = this.clusterEls.get(cluster.id);
      if (!entry) continue;
      const hit = !this.query || cluster.members.some((id) => this.matches(byId.get(id)));
      entry.group.classList.toggle('dim', Boolean(this.query) && !hit);
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
    // На всякий случай сбрасываем старый кадр: иначе ensureRaf может
    // решить, что анимация уже идёт, и не запустить её.
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.alpha = Math.max(this.alpha, alpha);
    this.alphaTarget = 0;
    this.ensureRaf();
  }

  // Перетаскивание — ручное действие: замораживаем раскладку целиком,
  // чтобы тащимая нода не тащила за собой весь граф.
  stopSim() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.alpha = 0;
    this.alphaTarget = 0;
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

  // Раскладка как в Obsidian: связи, личное расстояние и мнимый центр.
  // Фракции и блибы чисто визуальные и на физику не влияют.
  step() {
    const alpha = this.alpha;
    const nodes = [];
    for (const node of this.data.nodes) {
      const sim = this.sim.get(node.id);
      if (sim) nodes.push(sim);
    }
    const count = nodes.length;
    if (!count) return;

    // Мнимый центр — просто средняя точка нод, а не нода на карте. Ноды
    // обитают вокруг него по орбите, а не стягиваются в саму точку.
    let centerX = 0;
    let centerY = 0;
    for (const sim of nodes) {
      centerX += sim.x;
      centerY += sim.y;
    }
    centerX /= count;
    centerY /= count;
    const orbit = Math.max(180, (count * 120) / (2 * Math.PI));

    // Отталкивание 1/d² заметно только рядом и не раздувает карту.
    const charge = 900;
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
        // Ограничиваем знаменатель: совпадающие ноды иначе дают бесконечную
        // силу и разлетаются (или залипают в нуле).
        const force = (charge * alpha) / Math.max(distance2, 100);
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
        // Личное пространство есть у всех нод, даже одиночек без связей —
        // иначе центр тяжести собрал бы их в одну точку.
        const minDistance = Math.max(a.r + b.r + 14, 120);
        if (distance < minDistance) {
          const push = ((minDistance - distance) / distance) * 0.22 * alpha;
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

    // Мягкая орбита вокруг мнимого центра: ближе к нему — выталкиваем,
    // дальше — возвращаем. Центр не притягивает ноды в точку.
    const ORBIT_PULL = 0.02;
    for (const sim of nodes) {
      if (sim.fixed) continue;
      const dx = centerX - sim.x;
      const dy = centerY - sim.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 0.001) continue;
      const force = clamp((distance - orbit) * ORBIT_PULL, -12, 12) * alpha;
      sim.vx += (dx / distance) * force;
      sim.vy += (dy / distance) * force;
    }

    // Блибы разных фракций не должны пересекаться: это не притяжение, а
    // только расталкивание целых групп по их воображаемым оболочкам.
    const byFaction = new Map();
    for (const node of this.data.nodes) {
      const faction = normFaction(node.faction);
      if (!faction) continue;
      const sim = this.sim.get(node.id);
      if (!sim || !Number.isFinite(sim.x)) continue;
      if (!byFaction.has(faction)) byFaction.set(faction, []);
      byFaction.get(faction).push(sim);
    }
    const blobs = [];
    for (const sims of byFaction.values()) {
      let cx = 0;
      let cy = 0;
      for (const sim of sims) {
        cx += sim.x;
        cy += sim.y;
      }
      cx /= sims.length;
      cy /= sims.length;
      let radius = 0;
      for (const sim of sims) {
        radius = Math.max(radius, Math.hypot(sim.x - cx, sim.y - cy) + sim.r + 34);
      }
      blobs.push({ cx, cy, radius, sims });
    }
    const BLOB_GAP = 30;
    for (let i = 0; i < blobs.length; i += 1) {
      for (let j = i + 1; j < blobs.length; j += 1) {
        const a = blobs[i];
        const b = blobs[j];
        let dx = b.cx - a.cx;
        let dy = b.cy - a.cy;
        let distance = Math.hypot(dx, dy);
        if (distance < 0.001) {
          dx = 1;
          dy = 0;
          distance = 1;
        }
        const need = a.radius + b.radius + BLOB_GAP;
        if (distance >= need) continue;
        const push = (need - distance) * 0.06 * alpha;
        const ux = dx / distance;
        const uy = dy / distance;
        for (const sim of a.sims) {
          if (sim.fixed) continue;
          sim.vx -= ux * push;
          sim.vy -= uy * push;
        }
        for (const sim of b.sims) {
          if (sim.fixed) continue;
          sim.vx += ux * push;
          sim.vy += uy * push;
        }
      }
    }

    for (const node of nodes) {
      if (node.fixed) {
        node.vx = 0;
        node.vy = 0;
        continue;
      }
      node.vx = clamp(node.vx * 0.42, -40, 40);
      node.vy = clamp(node.vy * 0.42, -40, 40);
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
      const { startX, startY, originX, originY } = this.drag;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (!this.drag.moved) {
        // Пока курсор почти не сдвинулся, это ещё клик: раскладку не трогаем,
        // иначе граф «дрожит» от каждого нажатия на узел.
        if (Math.hypot(dx, dy) <= 5) return;
        this.drag.moved = true;
        this.stopSim();
      }
      const sim = this.sim.get(this.drag.id);
      if (!sim) return;
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
      this.drag = null;
      this.alphaTarget = 0;
      const sim = this.sim.get(drag.id);
      const node = this.data.nodes.find((item) => item.id === drag.id);
      if (sim && node) {
        if (drag.moved) {
          // Перетаскивание только перемещает узел. Раскладку не разогреваем:
          // она не должна переставлять остальные ноды под рукой.
          node.x = round(sim.x);
          node.y = round(sim.y);
          this.emitPositions();
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
      kind: 'node',
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
    this.computeClusters();
    for (const cluster of this.clusters) {
      minX = Math.min(minX, cluster.cx - cluster.rx - 20);
      minY = Math.min(minY, cluster.cy - cluster.ry - 30);
      maxX = Math.max(maxX, cluster.cx + cluster.rx + 20);
      maxY = Math.max(maxY, cluster.cy + cluster.ry + 20);
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

  // Показать на карте сразу несколько нод (например, всю фракцию).
  focusNodes(ids) {
    const sims = (ids || [])
      .map((id) => this.sim.get(id))
      .filter((sim) => sim && Number.isFinite(sim.x));
    if (!sims.length) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const sim of sims) {
      minX = Math.min(minX, sim.x - sim.r - 30);
      minY = Math.min(minY, sim.y - sim.r - 30);
      maxX = Math.max(maxX, sim.x + sim.r + 30);
      maxY = Math.max(maxY, sim.y + sim.r + 48);
    }
    const padding = 80;
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const k = clamp(
      Math.min((this.width - padding * 2) / width, (this.height - padding * 2) / height),
      MIN_ZOOM,
      1.4,
    );
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    this.view = { x: -cx * k, y: -cy * k, k };
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
