// Расчёты Билдостроя. Любое значение можно перекрыть вручную через character.overrides.
import { RULES, shardCost, skillAvailable } from './rules.js';

const GEAR = ['cl', 'armor', 'helm', 'exo', 'synth', 'acs', 'tr'];
const norm = (t) => String(t || '').replace(/^\[|\]$/g, '').toLowerCase();
const flat = (s) => String(s).replace(/\s+/g, '');
const val = (auto, o) => ({ value: o ?? auto, auto, overridden: o !== null && o !== undefined });

export const sellPrice = (it) => it.sell_price ?? Math.round(it.cost * RULES.sellPriceRate);

// Максимум выбранных навыков: 4 × ранг персонажа (от 4 до 40).
export const skillLimit = (c, d) => (d.rankMap.get(Number(c.rank))?.level || d.ranks[0]?.level || 1) * RULES.skillLimitPerRank;

function slotUsage(ids, limits, d, gear, extraTags = []) {
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
  // Транспорт Кочевника занимает слот [Tr], хотя хранится не в списке экипировки.
  for (const tag of extraTags) {
    const t = norm(tag);
    if (used.has(t)) used.set(t, used.get(t) + 1);
  }
  return limits.map((s) => {
    const u = used.get(norm(s.tag)) || 0;
    return { tag: s.tag, limit: s.max_count, used: u, status: u > s.max_count ? 'Сверх лимита!' : u === s.max_count ? 'Занято' : u > 0 ? 'ОК' : 'Свободно' };
  });
}

export function derive(c, d, extraGear = []) {
  const o = c.overrides, rank = d.rankMap.get(Number(c.rank)) || d.ranks[0], limit = skillLimit(c, d);
  const skills = c.skills.map((s, i) => {
    const sk = d.skillMap.get(s.id);
    if (!sk) return null;
    const have = c.stats[sk.stat] ?? 0;
    return { i, sk, level: s.level, have, available: skillAvailable(have, sk.tier), shards: val(shardCost(sk.tier, s.level), o.shards?.[s.id] ?? null) };
  }).filter(Boolean);
  const statIssues = {};
  for (const s of skills) {
    if (s.available) continue;
    const issue = statIssues[s.sk.stat] || (statIssues[s.sk.stat] = { need: s.sk.tier, have: s.have, skills: [] });
    issue.need = Math.max(issue.need, s.sk.tier);
    issue.skills.push(s.sk.name);
  }
  return {
    freePoints: val(RULES.pointsBudget - Object.values(c.stats).reduce((a, b) => a + b, 0), o.freePoints),
    hpMax: val(rank.hp_base + c.stats.constitution * RULES.hpPerConstitution, o.hpMax),
    kronosMax: val(rank.kronos_max, o.kronosMax),
    rankLevel: rank.level,
    skills, shardsTotal: skills.reduce((a, s) => a + s.shards.value, 0),
    skillCount: c.skills.length, skillLimit: limit, skillsOverLimit: c.skills.length > limit,
    statIssues,
    gearSlots: slotUsage(c.equipment, d.slots.filter((s) => s.grp === 'gear'), d, true, extraGear),
    implantSlots: slotUsage(c.implants, d.slots.filter((s) => s.grp === 'implant'), d, false),
  };
}
