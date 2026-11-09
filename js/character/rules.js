// Жёсткие константы правил. Это не хранимые данные, поэтому они живут в коде,
// а не в таблице formulas базы Supabase.
export const RULES = Object.freeze({
  pointsBudget: 56,
  hpPerConstitution: 25,
  sellPriceRate: 0.05,
  skillLimitPerRank: 4,
});

// Стоимость навыка в щепках и проверка доступности по характеристике.
export const shardCost = (tier, level) => (tier - 4) * level;
export const skillAvailable = (stat, tier) => stat >= tier;

