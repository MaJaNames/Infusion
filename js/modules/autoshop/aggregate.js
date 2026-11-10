// Итоги сборки. build = { body, wheels, engine, weapons: [..3], modules: [..5], discount: 0 }.
// Деталь = { cost, stats, drone? }, где stats — результат parsePart(). Деталь с excluded: true не учитывается.
// Дрон (drone) даёт стоимость, но его характеристики считаются отдельно и не входят в итоги.
const live = (p) => (p && !p.excluded ? p : null);
const counted = (p) => (p && !p.excluded && !p.drone ? p : null);
const sum = (parts, f) => parts.reduce((a, p) => a + (f(p.stats) || 0), 0);
const sources = (parts, f) => parts
  .map((p) => ({ name: p.name, value: f(p.stats) || 0 }))
  .filter((x) => x.value);

export function summarize(build) {
  const engineRaw = live(build.engine);
  // «Торус» совместим только с направляющими «Элиада»: чужие колёса не идут в итоги.
  const wheelReq = engineRaw?.stats.wheelReq || '';
  const wheelRaw = live(build.wheels);
  const wheelsFit = !wheelReq || (!!wheelRaw && String(wheelRaw.name).toLowerCase().includes(wheelReq.toLowerCase()));
  const drive = [wheelsFit ? wheelRaw : null, engineRaw].filter(Boolean);
  const frameAll = [live(build.body), ...drive].filter(Boolean);
  const modsAll = (build.modules || []).map(live).filter(Boolean);
  const weaponsAll = (build.weapons || []).map(live).filter(Boolean);

  const frame = frameAll.map(counted).filter(Boolean);
  const mods = modsAll.map(counted).filter(Boolean);
  const weapons = weaponsAll.map(counted).filter(Boolean);
  const hull = [...frame, ...mods];
  const body = counted(build.body);
  const engine = counted(build.engine);
  const wheels = wheelsFit ? counted(build.wheels) : null;
  const speedRaw = sum(hull, (s) => s.speed);
  // Уникальные эффекты двигателей задают «пол» Скорохода.
  const speedFloor = Math.max(0, ...hull.map((p) => p.stats.speedFloor || 0));

  const total = {
    maxHp: sum(hull, (s) => s.hp + s.extraHp),
    defP: sum(hull, (s) => s.defP),
    evasion: sum(hull, (s) => s.evasion),
    speed: Math.max(speedRaw, speedFloor),
    screen: sum(hull, (s) => s.screen),
    flight: Math.max(0, ...drive.map(counted).filter(Boolean).map((p) => p.stats.flight)),
    weaponSlots: (body?.stats.weaponSlots || 0) + sum(mods, (s) => s.weaponSlots),
    heavySlots: body?.stats.heavySlots || 0,
    seats: (body?.stats.seats || 0) + sum(mods, (s) => s.seats),
    cost: Math.round([...frameAll, ...modsAll, ...weaponsAll].reduce((a, p) => a + (p.cost || 0), 0) * (1 - (build.discount || 0) / 100)),
  };

  // Источники для каждого параметра: что именно дало значение. Нужны для раскрытия по клику.
  const src = {
    maxHp: sources(hull, (s) => s.hp + s.extraHp),
    defP: sources(hull, (s) => s.defP),
    evasion: sources(hull, (s) => s.evasion),
    speed: [
      ...sources(hull, (s) => s.speed),
      ...(speedFloor > speedRaw ? [{ name: `Минимум Скорохода (не ниже ${speedFloor})`, value: speedFloor - speedRaw }] : []),
    ],
    screen: sources(hull, (s) => s.screen),
    flight: sources(drive.map(counted).filter(Boolean), (s) => s.flight),
    weaponSlots: [
      ...(body?.stats.weaponSlots ? [{ name: body.name, value: body.stats.weaponSlots }] : []),
      ...sources(mods, (s) => s.weaponSlots),
    ],
    heavySlots: body?.stats.heavySlots ? [{ name: body.name, value: body.stats.heavySlots }] : [],
    seats: [
      ...(body?.stats.seats ? [{ name: body.name, value: body.stats.seats }] : []),
      ...sources(mods, (s) => s.seats),
    ],
    cost: [],
  };
  const costParts = [...frameAll, ...modsAll, ...weaponsAll].filter((p) => p.cost);
  const gross = costParts.reduce((a, p) => a + p.cost, 0);
  src.cost = costParts.map((p) => ({ name: p.name, value: p.cost }));
  if (build.discount && gross) src.cost.push({ name: `Скидка ${build.discount}%`, value: total.cost - gross });

  const warnings = [];
  if (weapons.length > total.weaponSlots) warnings.push(`Оружия ${weapons.length}, а слотов ${total.weaponSlots}`);
  // Реактивный двигатель ставится только с направляющими «Элиада».
  if (wheelReq && !wheelsFit) warnings.push(`${engineRaw.name}: нужны колёса «${wheelReq}»`);
  return { ...total, speedFloor, weapons: weapons.map((p) => p.stats), warnings, sources: src };
}
