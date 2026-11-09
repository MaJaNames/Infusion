// Расчёты Билдостроителя. Работает и в браузере (ES-модуль), и в Node.
// Любое вычисляемое значение можно переопределить в character.overrides — как в ДНД.

const GEAR_TAGS = ['cl', 'armor', 'helm', 'exo', 'synth', 'acs', 'tr'];
const norm = (t) => String(t || '').replace(/^\[|\]$/g, '').toLowerCase();

/** Собирает индексы из загруженных JSON: { items, cards, rules: { ranks, skills, ... } } */
export function indexDb({ items, cards = [], rules }) {
  const by = (a) => new Map(a.map((x) => [x.id, x]));
  return {
    items: by(items), cards: by(cards),
    skills: by(rules.skills), abilities: by(rules.abilities), traits: by(rules.traits),
    ranks: by(rules.ranks), slots: rules.slots, combos: rules['implant-combos'] || [],
    formulas: rules.formulas, stats: rules.stats,
  };
}

const val = (auto, override) => ({
  value: override ?? auto, auto, overridden: override !== null && override !== undefined,
});

/** Цена продажи: ручная в персонаже → ручная в каталоге → 5% от стоимости. */
export function sellPrice(item, char = {}, db) {
  const rate = db?.formulas?.sellPriceRate ?? 0.05;
  const auto = item.sellPrice ?? Math.round(item.cost * rate);
  return val(auto, char.overrides?.sellPrice?.[item.id]);
}

function slotUsage(entries, limits, db, isGear) {
  const used = new Map(limits.map((s) => [norm(s.tag), 0]));
  for (const e of entries) {
    const it = db.items.get(e.item);
    if (!it) continue;
    const full = (it.tag ? `[${it.tag}] ` : '') + it.name;
    const combo = !isGear && db.combos.find((c) => full.includes(c.name.replace(/^\[.*?\]x\d+ \+ \[.*?\]\s*/, '')) && c.name.startsWith(`[${it.tag}]`));
    if (combo) {
      for (const [t, n] of Object.entries(combo.uses)) used.set(norm(t), (used.get(norm(t)) || 0) + n);
      continue;
    }
    let t = norm(it.tag);
    if (isGear && !GEAR_TAGS.includes(t)) t = 'we';
    if (used.has(t)) used.set(t, used.get(t) + 1);
  }
  return limits.map((s) => {
    const u = used.get(norm(s.tag)) || 0;
    const status = u > s.limit ? 'Сверх Лимита!' : u === s.limit ? 'Занято' : u > 0 ? 'ОК' : 'Свободно';
    return { tag: s.tag, limit: s.limit, used: u, status };
  });
}

/** Все производные значения персонажа. */
export function derive(char, db) {
  const f = db.formulas, ov = char.overrides || {};
  const rank = db.ranks.get(char.rank);
  const sum = Object.values(char.stats).reduce((a, b) => a + b, 0);

  const skills = char.skills.map((s) => {
    const sk = db.skills.get(s.skill);
    const auto = (sk.tier - 4) * s.level;
    return {
      skill: s.skill, name: sk.name, level: s.level, tier: sk.tier,
      available: char.stats[sk.stat] >= sk.tier,
      shards: val(auto, ov.skillShards?.[s.skill]),
    };
  });

  return {
    freePoints: val(f.pointsBudget - sum, ov.freePoints),
    hpMax: val(rank.hpBase + char.stats.constitution * f.hpPerConstitution, ov.hpMax),
    kronosMax: val(rank.kronosMax, ov.kronosMax),
    skills,
    shardsTotal: skills.reduce((a, s) => a + s.shards.value, 0),
    gearSlots: slotUsage(char.equipment, db.slots.filter((s) => s.group === 'gear'), db, true),
    implantSlots: slotUsage(char.implants, db.slots.filter((s) => s.group === 'implant'), db, false),
    pocketRows: char.pockets.length,
  };
}
