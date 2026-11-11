// Жёсткие константы правил. Это не хранимые данные, поэтому они живут в коде,
// а не в таблице formulas базы Supabase.
export const RULES = Object.freeze({
  pointsBudget: 56,
  hpPerConstitution: 25,
  sellPriceRate: 0.05,
  skillLimitPerRank: 4,
  pocketLimit: 20,
  taliToCredits: 10,
  // Стоимость установки импланта в клинике по редкости. В продажу не входит.
  clinicCost: Object.freeze({
    'Обычный': 300, 'Необычный': 450, 'Редкий': 1500,
    'Эпический': 3000, 'Легендарный': 5000, 'Культовый': 5000,
  }),
});

// Стоимость навыка в щепках и проверка доступности по характеристике.
export const shardCost = (tier, level) => (tier - 4) * level;
export const skillAvailable = (stat, tier) => stat >= tier;

// Ограничения классов по расе. Ключ — ID расы из data.json.
// only — разрешённый список, except — запрещённые классы (остальные доступны).
export const CLASS_RESTRICTIONS = Object.freeze({
  '0x001': Object.freeze({ only: Object.freeze(['Трансгрессор', 'Авангард', 'Медикус', 'Нейромант', 'Свой']) }), // Новуссит
  '0x002': Object.freeze({ except: Object.freeze(['Трансгрессор', 'Авангард', 'Медикус', 'Нейромант', 'Зверь']) }), // Поляриец
  '0x003': Object.freeze({ only: Object.freeze(['Кочевник', 'Зверь', 'Рокер']) }), // Хуманиец
});

export function classAllowed(raceId, name) {
  const rule = CLASS_RESTRICTIONS[raceId];
  if (!rule) return true;
  return rule.only ? rule.only.includes(name) : !rule.except.includes(name);
}

export const allowedClasses = (raceId, classes) => classes.filter((x) => classAllowed(raceId, x.name));

// РО (репутация организаций) персонажа: отдельное значение для каждой фракции.
export const RO_FACTIONS = Object.freeze(['Ацуши', 'Хиллз', 'Чёрный Рынок', 'Гончие', 'Икс-Экшен', 'ГРА']);
export const RO_VALUES = Object.freeze([-60, -35, -15, 0, 15, 35, 60]);
export const blankRO = () => Object.fromEntries(RO_FACTIONS.map((f) => [f, 0]));

// Лимит БМЕТов: РО фракции Ацуши, но не меньше одного.
export const bmetLimit = (ro) => {
  const value = Number(ro?.['Ацуши']) || 0;

  if (value >= 60) return 3;
  if (value >= 35) return 2;
  return 1;
};

// Слоты способностей Зверя по уровню ранга. Более высокий слот может занимать
// способность более низкой редкости: Л — О/Р/Л, Р — О/Р, О — только О.
export const BEAST_SLOTS = Object.freeze({
  1: Object.freeze({ 'Обычный': 2, 'Редкий': 0, 'Легендарный': 0 }),
  2: Object.freeze({ 'Обычный': 3, 'Редкий': 0, 'Легендарный': 0 }),
  3: Object.freeze({ 'Обычный': 3, 'Редкий': 1, 'Легендарный': 0 }),
  4: Object.freeze({ 'Обычный': 3, 'Редкий': 2, 'Легендарный': 0 }),
  5: Object.freeze({ 'Обычный': 4, 'Редкий': 3, 'Легендарный': 0 }),
  6: Object.freeze({ 'Обычный': 4, 'Редкий': 4, 'Легендарный': 1 }),
  7: Object.freeze({ 'Обычный': 4, 'Редкий': 4, 'Легендарный': 2 }),
  8: Object.freeze({ 'Обычный': 4, 'Редкий': 4, 'Легендарный': 3 }),
  9: Object.freeze({ 'Обычный': 4, 'Редкий': 4, 'Легендарный': 4 }),
  10: Object.freeze({ 'Обычный': 4, 'Редкий': 4, 'Легендарный': 4 }),
});
export const BEAST_RARITIES = Object.freeze(['Обычный', 'Редкий', 'Легендарный']);
export const BEAST_EXTRA_L_ABILITY = 'Я Особенный';

// Импланты, которые открывают управление роботами.
export const ROBOT_IMPLANTS = Object.freeze({
  prism: Object.freeze(['0x189', '0x1ac', '0x1ad']), // D.P.L РобоСофт, Атсуши продвинутый, Догмат Единства
  bmet: Object.freeze(['0x1ac']), // Атсуши продвинутый робософт
  skeleton: Object.freeze(['0x1ad']), // Догмат Единства
});
// Имплант для Ядра пока отсутствует в data.json. Когда появится — достаточно вписать его ID.
export const CORE_IMPLANT = Object.freeze({ id: '', name: 'Имплант Ядра' });

