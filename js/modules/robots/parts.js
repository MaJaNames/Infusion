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

// Характеристики робота: основа, активные модули и выбранное оружие.
// АТК не суммируется по всем оружиям — берётся у текущего (последнего выбранного).
// Тип модуля указан в описании: «Эффекты: Активный» или «Эффекты: Пассивный».
export const moduleIsActive = (it) => /Эффект[а-яё]*:\s*Активн/i.test(String(it?.description || ''));
// Пассивный модуль даёт параметры всегда, активный — только с галочкой «Активация».
export const moduleChecked = (robot, i) => !!(robot?.modulesActive && robot.modulesActive[i]);
export const moduleEnabled = (robot, i, it) => !moduleIsActive(it) || moduleChecked(robot, i);
export function weaponIndex(robot, d) {
  const weapons = Array.isArray(robot?.weapons) ? robot.weapons : [];
  const explicit = Number.isInteger(robot?.weapon) && robot.weapon >= 0 && robot.weapon < weapons.length && weapons[robot.weapon] ? robot.weapon : null;
  if (explicit !== null) return explicit;
  for (let i = weapons.length - 1; i >= 0; i--) if (weapons[i]) return i;
  return null;
}
export const currentWeapon = (robot, d) => {
  const i = weaponIndex(robot, d);
  return i === null ? null : (robot.weapons[i] ? d.itemMap.get(robot.weapons[i]) : null);
};

export function robotStats(robot, d) {
  const base = robotBase(robot, d);
  const kind = robotKind(base);
  const weapons = kind === 'bmet' ? [] : (robot?.weapons || []).map((id) => (id ? d.itemMap.get(id) : null)).filter(Boolean);
  const modules = kind === 'bmet' ? [] : (robot?.modules || [])
    .map((id, i) => ({ id, i, it: id ? d.itemMap.get(id) : null }))
    .filter(({ i, it }) => it && moduleEnabled(robot, i, it))
    .map(({ it }) => it);
  const weapon = kind === 'bmet' ? null : currentWeapon(robot, d);
  // Стоимость считаем по всем установленным деталям, даже если модуль пока не активирован.
  const allModules = kind === 'bmet' ? [] : (robot?.modules || []).map((id) => (id ? d.itemMap.get(id) : null)).filter(Boolean);
  const parts = [base, ...weapons, ...allModules].filter(Boolean);
  const statParts = [base, ...modules, ...(weapon ? [weapon] : [])].filter(Boolean);
  const stats = statParts.map((it) => {
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
  // АТК — от текущего оружия, а не сумма всех стволов. Без оружия остаётся АТК основы.
  const baseAtk = parsePart(base?.description).atk || 0;
  const moduleAtk = modules.reduce((a, it) => a + (parsePart(it.description).atk || 0), 0);
  const weaponAtk = weapon ? (parsePart(weapon.description).atk || 0) : 0;
  total.atk = (weapon ? weaponAtk : baseAtk) + moduleAtk;
  total.cost = parts.reduce((a, it) => a + (it.cost || 0), 0);

  // Источники для каждого параметра: какая деталь дала значение. Нужны для раскрытия по клику («Итоги»).
  const byPart = (f) => statParts.map((it, i) => ({ item: it, value: f(stats[i]) || 0 })).filter((x) => x.value);
  const sources = {
    hp: byPart((s) => s.hp),
    defP: byPart((s) => s.defP),
    defA: byPart((s) => s.defA),
    evasion: byPart((s) => s.evasion),
    speed: byPart((s) => s.speed),
    flight: byPart((s) => s.flight),
    atk: [
      ...(weapon ? (weaponAtk ? [{ item: weapon, value: weaponAtk }] : []) : (baseAtk ? [{ item: base, value: baseAtk }] : [])),
      ...modules.map((it) => ({ item: it, value: parsePart(it.description).atk || 0 })).filter((x) => x.value),
    ],
    cost: parts.filter((it) => it.cost).map((it) => ({ item: it, value: it.cost })),
  };
  return { total, base, kind, parts, weapon, weaponIndex: weaponIndex(robot, d), modules, sources };
}

export const hasImplant = (c, d, req) => {
  const ids = Array.isArray(req) ? req : [req];
  return ids.some((x) => (typeof x === 'string' ? (c.implants || []).includes(x) : (x.id ? (c.implants || []).includes(x.id) : (c.implants || []).some((id) => d.itemMap.get(id)?.name === x.name))));
};

const implantName = (req, d) => (typeof req === 'string' ? (d.itemMap.get(req)?.name || req) : req.name);

export const pocketQty = (c, id) => (c?.pockets || []).filter((e) => e.id === id).reduce((a, e) => a + (Number(e.qty) || 0), 0);
export const equipmentCount = (c, id) => (c?.equipment || []).filter((x) => x === id).length;

// Все детали, которые нужны роботу: основа, оружие и модули.
export function robotPartsNeeded(robot) {
  const need = new Map();
  for (const id of [robot?.base, ...(robot?.weapons || []), ...(robot?.modules || [])].filter(Boolean)) {
    need.set(id, (need.get(id) || 0) + 1);
  }
  return need;
}

// Чего не хватает в инвентаре персонажа. Нехватка показывается небольшой плашкой,
// а надеть робота можно только когда все его детали есть в наличии.
export function robotMissing(robot, d, c) {
  const out = [];
  for (const [id, need] of robotPartsNeeded(robot)) {
    const have = Math.max(0, pocketQty(c, id) - equipmentCount(c, id));
    if (have < need) out.push({ id, item: d.itemMap.get(id) || null, need, have, missing: need - have });
  }
  return out;
}

// Проверка «можно ли надеть робота»: импланты и наличие всех деталей в инвентаре.
export function robotRequirement(robot, d, c) {
  const base = robotBase(robot, d), kind = robotKind(base);
  const missing = robotMissing(robot, d, c);
  if (!kind) return { ok: false, needs: ['основа робота'], missing, kind };
  if (kind === 'core') {
    const ok = hasImplant(c, d, CORE_IMPLANT);
    return { ok: ok && !missing.length, needs: ok ? [] : [CORE_IMPLANT.name], missing, kind };
  }
  // Имплант Ядра несовместим с Призмой. Пока импланта нет в базе, проверка не срабатывает.
  if (kind === 'prism' && hasImplant(c, d, CORE_IMPLANT)) {
    return { ok: false, needs: [], missing, reason: 'Имплант Ядра несовместим с Призмой', kind };
  }
  const req = kind === 'bmet' ? ROBOT_IMPLANTS.bmet : ROBOT_IMPLANTS.prism;
  const implantOk = hasImplant(c, d, req);
  return { ok: implantOk && !missing.length, needs: implantOk ? [] : [req.map((id) => implantName(id, d)).join(' / ')], missing, kind };
}

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