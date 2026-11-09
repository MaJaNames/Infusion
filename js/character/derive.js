// Расчёты Билдостроя. Любое значение можно перекрыть вручную через character.overrides.
const GEAR = ['cl', 'armor', 'helm', 'exo', 'synth', 'acs', 'tr'];
const norm = (t) => String(t || '').replace(/^\[|\]$/g, '').toLowerCase();
const flat = (s) => String(s).replace(/\s+/g, '');
const val = (auto, o) => ({ value: o ?? auto, auto, overridden: o !== null && o !== undefined });

export const sellPrice = (it, c, d) => val(it.sell_price ?? Math.round(it.cost * (d.rules.sellPriceRate ?? 0.05)), c.overrides.sellPrice?.[it.id] ?? null);

function slotUsage(ids, limits, d, gear) {
  const used = new Map(limits.map((s) => [norm(s.tag), 0]));
  for (const id of ids) {
    const it = d.itemMap.get(id);
    if (!it) continue;
    const combo = !gear && d.implant_combos.find((x) => flat(x.name) === flat(`[${it.tag}]${it.name}`));
    if (combo) { for (const [t, n] of Object.entries(combo.uses)) used.set(norm(t), (used.get(norm(t)) || 0) + n); continue; }
    let t = norm(it.tag);
    if (gear && !GEAR.includes(t)) t = 'we';
    if (used.has(t)) used.set(t, used.get(t) + 1);
  }
  return limits.map((s) => {
    const u = used.get(norm(s.tag)) || 0;
    return { tag: s.tag, limit: s.max_count, used: u, status: u > s.max_count ? 'Сверх лимита!' : u === s.max_count ? 'Занято' : u > 0 ? 'ОК' : 'Свободно' };
  });
}

export function derive(c, d) {
  const o = c.overrides, f = d.rules, rank = d.rankMap.get(Number(c.rank)) || d.ranks[0];
  const skills = c.skills.map((s, i) => {
    const sk = d.skillMap.get(s.id);
    return sk && { i, sk, level: s.level, available: (c.stats[sk.stat] ?? 0) >= sk.tier, shards: val((sk.tier - 4) * s.level, o.shards?.[s.id] ?? null) };
  }).filter(Boolean);
  return {
    freePoints: val(f.pointsBudget - Object.values(c.stats).reduce((a, b) => a + b, 0), o.freePoints),
    hpMax: val(rank.hp_base + c.stats.constitution * f.hpPerConstitution, o.hpMax),
    kronosMax: val(rank.kronos_max, o.kronosMax),
    skills, shardsTotal: skills.reduce((a, s) => a + s.shards.value, 0),
    gearSlots: slotUsage(c.equipment, d.slots.filter((s) => s.grp === 'gear'), d, true),
    implantSlots: slotUsage(c.implants, d.slots.filter((s) => s.grp === 'implant'), d, false),
  };
}
