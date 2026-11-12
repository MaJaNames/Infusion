// Мастерская техники: собранные роботы хранятся в браузере и доступны
// в «Утилитах» и в карточке Техника. Предметы при этом остаются в инвентаре.
import { downloadJson } from '../../core/storage.js';

export const ROBOTS_KEY = 'infusion.robots';
export const MAX_ROBOT_NAME = 48;

export const newRobotId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const list = (v, n) => Array.from({ length: n }, (_, i) => (Array.isArray(v) ? v[i] ?? null : null));
const flags = (v, n) => Array.from({ length: n }, (_, i) => !!(Array.isArray(v) && v[i]));
const read = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };

export const blankRobot = () => ({
  id: newRobotId(), name: '', base: null,
  weapons: [null, null], weapon: null,
  modules: [null, null, null, null, null], modulesActive: [false, false, false, false, false],
  notes: '', currentHp: null,
});

export const normRobot = (r, i = 0) => {
  const src = r && typeof r === 'object' ? r : {};
  const weapon = Number.isInteger(src.weapon) && src.weapon >= 0 ? src.weapon : null;
  return {
    id: String(src.id || newRobotId()),
    name: String(src.name ?? '').trim().slice(0, MAX_ROBOT_NAME) || `Робот ${i + 1}`,
    base: src.base ?? null,
    weapons: list(src.weapons, 2),
    weapon,
    modules: list(src.modules, 5),
    modulesActive: flags(src.modulesActive, 5),
    notes: String(src.notes ?? ''),
    currentHp: src.currentHp == null || src.currentHp === '' ? null : Math.max(0, Math.round(Number(src.currentHp) || 0)),
  };
};

export function normRobots(raw) {
  const seen = new Set();
  const robots = (Array.isArray(raw?.robots) ? raw.robots : [])
    .filter((r) => r && typeof r === 'object')
    .map((r, i) => {
      const robot = normRobot(r, i);
      while (seen.has(robot.id)) robot.id = newRobotId();
      seen.add(robot.id);
      return robot;
    });
  const active = robots.some((r) => r.id === raw?.active) ? raw.active : (robots[0]?.id || null);
  return { active, robots };
}

export const saveRobots = (state = R) => { try { localStorage.setItem(ROBOTS_KEY, JSON.stringify(state)); } catch { /* память браузера недоступна */ } };

export const R = normRobots(read(ROBOTS_KEY));
export const currentRobot = () => R.robots.find((r) => r.id === R.active) || R.robots[0] || null;

export function addRobot() {
  const used = new Set(R.robots.map((r) => r.name));
  let n = R.robots.length + 1;
  while (used.has(`Робот ${n}`)) n++;
  const robot = { ...blankRobot(), name: `Робот ${n}` };
  R.robots.push(robot);
  R.active = robot.id;
  saveRobots(R);
  return robot;
}

export function removeRobot(id) {
  const robot = R.robots.find((r) => r.id === id);
  if (!robot) return false;

  const ok = typeof confirm === 'function' ? confirm(`Удалить «${robot.name}»?`) : true;
  if (!ok) return false;

  const i = R.robots.indexOf(robot);
  if (i < 0) return false;

  R.robots.splice(i, 1);

  R.active = R.robots.length > 0 
    ? (R.robots[i] || R.robots[i - 1] || R.robots[0]).id 
    : null;

  saveRobots(R);
  return true;
}

// Выгрузка всех роботов в JSON — так же, как у транспорта Кочевника.
export function exportRobots() {
  downloadJson({ v: 1, exportedAt: new Date().toISOString(), active: R.active, robots: R.robots }, 'robots.json');
}

// Загрузка добавляет роботов из файла, не затирая текущих. ID всегда новые.
export function importRobots(text) {
  const parsed = JSON.parse(text);
  const raw = Array.isArray(parsed) ? { robots: parsed } : parsed;
  if (!raw || typeof raw !== 'object') throw new Error('Файл не похож на роботов');
  const source = Array.isArray(raw.robots) ? raw.robots : (raw.base || raw.weapons || raw.modules ? [raw] : []);
  if (!source.length) throw new Error('В файле нет роботов');
  const normalized = normRobots({ robots: source });
  const added = normalized.robots.map((r) => ({ ...r, id: newRobotId() }));
  R.robots.push(...added);
  R.active = added[0].id;
  saveRobots(R);
  return added.length;
}
