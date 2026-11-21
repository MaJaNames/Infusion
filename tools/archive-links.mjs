// node tools/archive-links.mjs — записать в data/archived-links.json записи,
// которые исчезли из data/data.json по сравнению с предыдущим коммитом.
// Запускать после обновления снимка, в котором что-то удалили из базы.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { indexData } from '../js/core/util.js';
import { rulesRows } from '../js/core/rules-rows.js';

const ROOT = new URL('../', import.meta.url);
const ARCHIVE = new URL('../data/archived-links.json', import.meta.url);
const SNAPSHOT = new URL('../data/data.json', import.meta.url);

const previous = JSON.parse(execFileSync('git', ['show', 'HEAD:data/data.json'], {
  cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
}));
const current = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
const archive = existsSync(ARCHIVE)
  ? JSON.parse(readFileSync(ARCHIVE, 'utf8').replace(/^\uFEFF/, ''))
  : { items: {}, cards: {}, rules: {} };
for (const kind of ['items', 'cards', 'rules']) {
  if (!archive[kind] || typeof archive[kind] !== 'object') archive[kind] = {};
}

const now = new Date().toISOString();
let added = 0;
for (const kind of ['items', 'cards']) {
  const live = new Set(current[kind].map((x) => x.id));
  for (const row of previous[kind] || []) {
    if (live.has(row.id) || archive[kind][row.id]) continue;
    archive[kind][row.id] = { title: row.name || row.id, at: now };
    added += 1;
  }
}
const prevRules = new Set(rulesRows(indexData(previous)).map((r) => r.id));
const liveRules = new Set(rulesRows(indexData(current)).map((r) => r.id));
for (const id of prevRules) {
  if (liveRules.has(id) || archive.rules[id]) continue;
  archive.rules[id] = { title: id, at: now };
  added += 1;
}

writeFileSync(ARCHIVE, `${JSON.stringify(archive, null, 2)}\n`);
console.log(added ? `В архив добавлено записей: ${added}` : 'Новых удалённых записей нет.');
