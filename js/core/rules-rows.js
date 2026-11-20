import { RC } from './util.js';

// Строки справочника: общий источник для вкладки «Справочник» и сборки OG-страниц.
export function rulesRows(d) {
  const rows = [];
  d.ranks.forEach((x) => rows.push({ id: `rank-${x.level}`, group: 'Константы', sub: 'Ранги', type: 'Ранг', name: `${x.level}. ${x.name}`, sortName: `${String(x.level).padStart(3, '0')} ${x.name}`, rarity: '', detail: `Уровень ${x.level}`, description: `ОЗ ${x.hp_base}, Кронос ${x.kronos_max}` }));
  d.essences.forEach((x) => rows.push({ id: `essence-${x.id}`, dbId: x.id, group: 'Константы', sub: 'Сущности', type: 'Сущность', name: x.name, rarity: '', detail: x.full_name || '', description: x.description }));
  d.abilities.forEach((x) => rows.push({ id: `ability-${x.id}`, dbId: x.id, group: 'Способности', sub: x.kind === 'mutation' ? 'Мутации' : 'Способности', type: x.kind === 'mutation' ? 'Мутация' : 'Способность', name: x.name, rarity: '', detail: x.class_requirement || '', description: x.description }));
  d.beasts.forEach((x) => rows.push({ id: `beast-${x.id}`, dbId: x.id, group: 'Зверь', sub: x.group_name || 'Без группы', type: 'Зверь', name: x.name, rarity: x.rarity || '', detail: x.group_name || '', description: x.description, rc: RC[x.rarity] }));
  d.traits.forEach((x) => rows.push({ id: `trait-${x.id}`, dbId: x.id, group: 'Черта', sub: 'Черты', type: 'Черта', name: x.name, rarity: '', detail: '', description: x.description }));
  d.skills.forEach((x) => rows.push({ id: `skill-${x.id}`, dbId: x.id, group: 'Навыки', sub: d.statMap.get(x.stat)?.name || x.stat, type: 'Навык', name: x.name, rarity: x.rarity || '', detail: `${d.statMap.get(x.stat)?.name || x.stat} ${x.tier}`, description: x.description }));
  return rows;
}
