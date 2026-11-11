import { parsePart } from '../autoshop/parser.js';
import { ROBOT_IMPLANTS, CORE_IMPLANT } from '../../character/rules.js';

const has = (v, re) => re.test(String(v || ''));
export const isBmet = (it) => has(it?.name, /^БМЕТ/i);
export const isPrism = (it) => has(it?.name, /^Призма/i);
export const isCore = (it) => has(it?.name, /^Ядро/i);
export const isRobotBase = (it) => it?.category === 'Техник' && it.tag === 'Sat' && (isBmet(it) || isPrism(it) || isCore(it));
export const isRobotWeapon = (it) => it?.category === 'Оружие';
export const isRobotModule = (it) => it?.category === 'Техник' && it.tag === 'Mod';
export const isSkeleton = (it) => it?.category === 'Экзо-Синты' && /Модульный скелет/i.test(String(it.name || ''));
export const robotKind = (it) => (isBmet(it) ? 'bmet' : isPrism(it) ? 'prism' : isCore(it) ? 'core' : null);
export const robotKindLabel = { bmet: 'БМЕТ', prism: 'Призма', core: 'Ядро' };

// У Модульного скелета в описании указано, сколько модулей он принимает.
export const skeletonSlots = (it) => Number((String(it?.description || '').match(/(\d+)\s*модул/i) || [])[1]) || 2;

export const robotBase = (robot, d) => (robot?.base ? d.itemMap.get(robot.base) : null);

// Характеристики робота: основа + оружие + модули (у БМЕТ — только основа).
export function robotStats(robot, d) {
  const base = robotBase(robot, d);
  const kind = robotKind(base);
  const attachments = kind === 'bmet' ? [] : [...(robot.weapons || []), ...(robot.modules || [])];
  const parts = [base, ...attachments.map((id) => (id ? d.itemMap.get(id) : null))].filter(Boolean);
  const stats = parts.map((it) => {
    const s = parsePart(it.description);
    const defA = Number((String(it.description || '').match(/(\d+)\s*ДЕФ\s*\(?а/i) || [])[1]) || 0;
    return { ...s, defA };
  });
  const total = { hp: 0, defP: 0, defA: 0, evasion: 0, atk: 0, speed: 0, flight: 0, cost: 0 };
  for (const s of stats) {
    total.hp += s.hp || 0;
    total.defP += s.defP || 0;
    total.defA += s.defA || 0;
    total.evasion += s.evasion || 0;
    total.atk += s.atk || 0;
    total.speed += s.speed || 0;
    total.flight += s.flight || 0;
  }
  total.cost = parts.reduce((a, it) => a + (it.cost || 0), 0);
  total.unique = stats.map((s) => s.unique).filter(Boolean).join(' ');
  return { total, base, kind, parts };
}

export const hasImplant = (c, d, req) => {
  const ids = Array.isArray(req) ? req : [req];
  return ids.some((x) => (typeof x === 'string' ? (c.implants || []).includes(x) : (x.id ? (c.implants || []).includes(x.id) : (c.implants || []).some((id) => d.itemMap.get(id)?.name === x.name))));
};

const implantName = (req, d) => (typeof req === 'string' ? (d.itemMap.get(req)?.name || req) : req.name);

// Проверка «можно ли надеть робота»: импланты, а не наличие деталей.
export function robotRequirement(robot, d, c) {
  const base = robotBase(robot, d), kind = robotKind(base);
  if (!kind) return { ok: false, needs: ['основа робота'], kind };
  if (kind === 'core') {
    const ok = hasImplant(c, d, CORE_IMPLANT);
    return { ok, needs: ok ? [] : [CORE_IMPLANT.name], kind };
  }
  // Имплант Ядра несовместим с Призмой. Пока импланта нет в базе, проверка не срабатывает.
  if (kind === 'prism' && hasImplant(c, d, CORE_IMPLANT)) {
    return { ok: false, needs: [], reason: 'Имплант Ядра несовместим с Призмой', kind };
  }
  const req = kind === 'bmet' ? ROBOT_IMPLANTS.bmet : ROBOT_IMPLANTS.prism;
  const ok = hasImplant(c, d, req);
  return { ok, needs: ok ? [] : [req.map((id) => implantName(id, d)).join(' / ')], kind };
}

export const pocketQty = (c, id) => (c?.pockets || []).filter((e) => e.id === id).reduce((a, e) => a + (Number(e.qty) || 0), 0);
export const equipmentCount = (c, id) => (c?.equipment || []).filter((x) => x === id).length;

// Сколько экземпляров предмета уже занято роботами. skip позволяет не учитывать
// текущий слот при выборе — чтобы уже выбранный предмет оставался доступен.
export function robotUsage(robots, id, skip = null) {
  let n = 0;
  for (const robot of robots || []) {
    if (robot.base === id && !(skip?.robotId === robot.id && skip?.path === 'base')) n++;
    for (let i = 0; i < (robot.weapons || []).length; i++) {
      if (robot.weapons[i] === id && !(skip?.robotId === robot.id && skip?.path === `weapons.${i}`)) n++;
    }
    for (let i = 0; i < (robot.modules || []).length; i++) {
      if (robot.modules[i] === id && !(skip?.robotId === robot.id && skip?.path === `modules.${i}`)) n++;
    }
  }
  return n;
}

// Свободные экземпляры с учётом экипировки персонажа и всех собранных роботов.
export const availableCount = (c, robots, id, skip = null) =>
  Math.max(0, pocketQty(c, id) - equipmentCount(c, id) - robotUsage(robots, id, skip));
