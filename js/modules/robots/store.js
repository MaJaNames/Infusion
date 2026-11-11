// Мастерская техники: собранные роботы хранятся в браузере и доступны
// в «Утилитах» и в карточке Техника. Предметы при этом остаются в инвентаре.
export const ROBOTS_KEY = 'infusion.robots';
export const MAX_ROBOT_NAME = 48;

export const newRobotId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const list = (v, n) => Array.from({ length: n }, (_, i) => (Array.isArray(v) ? v[i] ?? null : null));
const read = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };

export const blankRobot = () => ({
  id: newRobotId(), name: '', base: null,
  weapons: [null, null], modules: [null, null, null, null, null],
  notes: '', currentHp: null,
});

export const normRobot = (r, i = 0) => {
  const src = r && typeof r === 'object' ? r : {};
  return {
    id: String(src.id || newRobotId()),
    name: String(src.name ?? '').trim().slice(0, MAX_ROBOT_NAME) || `Робот ${i + 1}`,
    base: src.base ?? null,
    weapons: list(src.weapons, 2),
    modules: list(src.modules, 5),
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
  if (R.robots.length <= 1) return false;
  const i = R.robots.findIndex((r) => r.id === id);
  if (i < 0) return false;
  R.robots.splice(i, 1);
  R.active = (R.robots[i] || R.robots[i - 1] || R.robots[0]).id;
  saveRobots(R);
  return true;
}
