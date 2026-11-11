// Калькулятор вероятностей из таблицы «Калькулятор Инфузии» (лист «Калькулятор»).
// Столбцы: A — характеристика, B — бонус, C — цель, H — преимущество/помеха.
export const MODES = Object.freeze([['none', 'Нет'], ['adv', 'Преимущество'], ['dis', 'Помеха']]);

// Excel ROUND: половина округляется от нуля, а не всегда вверх.
const xlRound = (v) => (v < 0 ? -Math.round(-v) : Math.round(v));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// «Вер» и «Цель» — одно и то же, но с разных концов: кубы начинаются с 1,
// поэтому вер 15 соответствует цели 86 (101 − 15).
export const targetFromVer = (ver) => 101 - num(ver);
export const verFromTarget = (target) => 101 - num(target);

export function probability({ stat = 7, bonus = 0, target = 81, mode = 'none' } = {}) {
  const A = Math.max(0, num(stat));
  const B = num(bonus);
  const C = num(target);
  // E = MAX(1, MIN(100, ROUND((C-B)/(0.5+A*0.1),0)))
  const denom = (5 + A) / 10; // 0.5 + A*0.1 без ошибки плавающей точки
  const result = Math.max(1, Math.min(100, xlRound((C - B) / denom)));
  // I = (101-E)/100
  const base = (101 - result) / 100;
  // F = IFS(H="Преимущество", 1-(1-I)^2, H="Помеха", I^2, TRUE, I)
  const chance = mode === 'adv' ? 1 - (1 - base) ** 2 : mode === 'dis' ? base ** 2 : base;
  return { result, base, chance };
}

export const percent = (x) => `${(Math.round(num(x) * 1000) / 10).toLocaleString('ru-RU')}%`;
