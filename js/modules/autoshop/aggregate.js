// Итоги сборки. build = { body, wheels, engine, weapons: [..3], modules: [..5], discount: 0 }.
// Деталь = { cost, stats }, где stats — результат parsePart(). Деталь с excluded: true не учитывается.
const live = (p) => (p && !p.excluded ? p : null);
const sum = (parts, f) => parts.reduce((a, p) => a + (f(p.stats) || 0), 0);

export function summarize(build) {
  const frame = [build.body, build.wheels, build.engine].map(live).filter(Boolean);
  const mods = (build.modules || []).map(live).filter(Boolean);
  const weapons = (build.weapons || []).map(live).filter(Boolean);
  const hull = [...frame, ...mods];
  const body = live(build.body);

  const total = {
    maxHp: sum(hull, (s) => s.hp + s.extraHp),
    defP: sum(hull, (s) => s.defP),
    evasion: sum(hull, (s) => s.evasion),
    speed: sum(hull, (s) => s.speed),
    screen: sum(hull, (s) => s.screen),
    flight: Math.max(0, ...[build.wheels, build.engine].map(live).filter(Boolean).map((p) => p.stats.flight)),
    weaponSlots: (body?.stats.weaponSlots || 0) + sum(mods, (s) => s.weaponSlots),
    heavySlots: body?.stats.heavySlots || 0,
    seats: (body?.stats.seats || 0) + sum(mods, (s) => s.seats),
    cost: Math.round([...hull, ...weapons].reduce((a, p) => a + (p.cost || 0), 0) * (1 - (build.discount || 0) / 100)),
  };
  const warnings = [];
  if (weapons.length > total.weaponSlots) warnings.push(`Оружия ${weapons.length}, а слотов ${total.weaponSlots}`);
  return { ...total, weapons: weapons.map((p) => p.stats), warnings };
}
