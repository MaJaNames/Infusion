// Жёсткие константы правил. Это не хранимые данные, поэтому они живут в коде,
// а не в таблице formulas базы Supabase.
export const RULES = Object.freeze({
  pointsBudget: 56,
  hpPerConstitution: 25,
  sellPriceRate: 0.05,
  skillLimitPerRank: 4,
  pocketLimit: 20,
});

// Стоимость навыка в щепках и проверка доступности по характеристике.
export const shardCost = (tier, level) => (tier - 4) * level;
export const skillAvailable = (stat, tier) => stat >= tier;

// Ограничения классов по расе. Ключ — ID расы из data.json.
// only — разрешённый список, except — запрещённые классы (остальные доступны).
export const CLASS_RESTRICTIONS = Object.freeze({
  '0x001': Object.freeze({ only: Object.freeze(['Трансгрессор', 'Авангард', 'Медикус', 'Нейромант', 'Свой']) }), // Новуссит
  '0x002': Object.freeze({ except: Object.freeze(['Трансгрессор', 'Авангард', 'Медикус', 'Нейромант']) }), // Поляриец
  '0x003': Object.freeze({ only: Object.freeze(['Кочевник', 'Зверь', 'Рокер']) }), // Хуманиец
});

export function classAllowed(raceId, name) {
  const rule = CLASS_RESTRICTIONS[raceId];
  if (!rule) return true;
  return rule.only ? rule.only.includes(name) : !rule.except.includes(name);
}

export const allowedClasses = (raceId, classes) => classes.filter((x) => classAllowed(raceId, x.name));

