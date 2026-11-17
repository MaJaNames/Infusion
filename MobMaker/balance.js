/**
 * Единый файл баланса MobMaker.
 *
 * Здесь собраны все коэффициенты стоимости, бюджеты, пресеты и таблицы,
 * которые влияют на очки. Логика расчёта осталась в script.js — правьте
 * числа только здесь.
 *
 * Разделы:
 *   1. Бюджеты, тиры и типы мобов
 *   2. Стоимость базовых характеристик и защит
 *   3. Стоимость атак и эффектов
 *   4. Резисты, пассивные эффекты и слабости
 *   5. Справочники: типы урона, типы атак, каталог эффектов
 *   6. Калькулятор урона
 */
const BALANCE = {
    // ============================================================
    // 1. БЮДЖЕТЫ, ТИРЫ И ТИПЫ МОБОВ
    // ============================================================
    budgets: {
        // Базовый лимит характеристик у обычного моба любого тира.
        baseAttrs: 58,

        // Бюджет тира и стартовые статы для пресета.
        // Поля пресета: hp, defP, defA, ukl — характеристики;
        // atk — АТК, ks — КШ, tchn — ТЧН, od — ОД, op — ОП, avh — АВХ, kc — КЦ.
        tiers: {
            "Новичок": {
                budget: 350,
                preset: { hp: 150, defP: 0, defA: 0, ukl: 5, atk: 10, ks: 5, tchn: -20, od: 1, op: 1, avh: 1, kc: 1 }
            },
            "Обычный": {
                budget: 750,
                preset: { hp: 300, defP: 5, defA: 10, ukl: 15, atk: 25, ks: 5, tchn: 0, od: 1, op: 1, avh: 1, kc: 1 }
            },
            "Опасный": {
                budget: 1300,
                preset: { hp: 500, defP: 15, defA: 25, ukl: 35, atk: 40, ks: 10, tchn: 10, od: 1, op: 2, avh: 2, kc: 1 }
            },
            "Элитный": {
                budget: 2800,
                preset: { hp: 800, defP: 30, defA: 45, ukl: 60, atk: 65, ks: 15, tchn: 15, od: 1, op: 2, avh: 2, kc: 1 }
            },
            "Смерть": {
                budget: 4000,
                preset: { hp: 1000, defP: 55, defA: 75, ukl: 110, atk: 90, ks: 20, tchn: 25, od: 1, op: 3, avh: 2, kc: 1 }
            }
        },

        // Модификаторы пресета и бюджета для типа моба.
        // budgetBonusMult — доля бюджета тира; budgetBonus — фиксированные очки.
        mobTypes: {
            "Моб": {},
            "Элитный": {
                budgetBonusMult: 1.5,
                attrBonus: 4,
                preset: {
                    hpMult: 2.0, defPMult: 1.5, defAMult: 1.5, uklMult: 1.3, atkMult: 1.2,
                    ksBonus: 5, tchnBonus: 10,
                    opBonus: 1, opMax: 4, avhMin: 2, kc: 1
                }
            },
            "Босс": {
                preset: {
                    hpMult: 3.0, defPMult: 2.0, defAMult: 2.0, uklMult: 1.5, atkMult: 1.4,
                    ksBonus: 10, tchnBonus: 15
                },
                perTier: {
                    "Новичок": { budgetBonus: 500, attrBonus: 2, baseAttrs: 52, opBonus: 1, od: 1, avh: 2, kc: 1 },
                    "Обычный": { budgetBonus: 1500, attrBonus: 4, baseAttrs: 54, opBonus: 1, od: 1, avh: 2, kc: 1 },
                    "Опасный": { budgetBonus: 8000, attrBonus: 6, baseAttrs: 56, opBonus: 2, od: 2, avh: 3, kc: 2 },
                    "Элитный": { budgetBonus: 12000, attrBonus: 8, baseAttrs: 58, opBonus: 2, od: 2, avh: 3, kc: 2 },
                    "Смерть": { budgetBonus: 30000, attrBonus: 10, baseAttrs: 60, op: 6, od: 2, avh: 4, kc: 3 }
                }
            }
        }
    },

    // ============================================================
    // 2. СТОИМОСТЬ БАЗОВЫХ ХАРАКТЕРИСТИК И ЗАЩИТ
    // ============================================================
    stats: {
        // Очки за единицу параметра.
        hp: 0.2,
        extraHp: 0.15,
        defP: 5.0,
        defA: 4.0,
        ukl: 4.0,
        op: 150,

        // Сопротивление урону: доля от текущих ОЗ.
        resistanceAllTypesMult: 1.0,
        resistanceSingleTypeMult: 0.3
    },

    // ============================================================
    // 3. СТОИМОСТЬ АТАК И ЭФФЕКТОВ
    // ============================================================
    attacks: {
        // Цена единицы параметра для личной атаки.
        localAtkCost: 1.5,
        localKsCost: 2.0,
        localTchnCost: 1.0,

        // Цена единицы общего параметра (действует на все атаки).
        // Считается по цене локальных статов (local*Cost) с порогом globalAtk
        // и итоговым множителем globalCostFactor.
        globalAvhBase: 150,
        globalKcBase: 90,

        // Бесплатные пороги, после которых включается квадратичный штраф.
        thresholds: {
            localAtk: 50,
            localKs: 10,
            localTchn: 25,
            globalAtk: 30
        },

        // Множители повторяемости атаки.
        // АВХ растёт почти линейно (каждый удар наносит полный урон), КЦ — с
        // большим дисконтом (доп. цели ситуативны), ОД — по нарастающей кривой.
        repetition: {
            avhStep: 0.8,
            kcStep: 0.3,
            odLinear: 0.3,
            odQuad: 0.15
        },

        // Гарантированный игнор защиты.
        ignoreDefCost: 4.0,
        ignoreUklCost: 3.0,

        // Квадратичный штраф за превышение порога: (превышение² / divisor).
        curveDivisor: 40,

        // Общий множитель статов атаки.
        statCostFactor: 2,

        // Итоговая скидка на стоимость общих параметров.
        globalCostFactor: 0.85,

        // Стоимость дистанции (за каждую единицу ОП).
        distance: {
            meleePerOp: 300,
            rangedSpanPerOp: 100,
            rangedOver7PerOp: 50,
            rangedOver17PerOp: 250,
            rangedShortBonus: 150,
            rangedShortMax: 5,
            rangedFarThreshold: 7,
            rangedVeryFarThreshold: 17,
            specialSpanPerOp: 100
        },

        // Формула стоимости эффектов от ВЕР.
        effect: {
            verBase: 30,
            verExponent: 1.6,
            linearVerStart: 0.5,
            linearVerDivisor: 200
        },

        // Множители длительности/срабатывания эффектов.
        permanentMultiplier: 3.0,
        infiniteMultiplier: 5.0,

        // Значения новой атаки и чистой атаки из «+ Добавить атаку».
        defaults: {
            type: "Ближняя",
            distMin: 0,
            distMax: 0,
            damageType: "Кинетический",
            atk: 70,
            ks: 10,
            tchn: 25,
            avh: 2,
            kc: 1,
            ignDef: 0,
            ignUkl: 0
        },
        newAttack: {
            atk: 0,
            ks: 0,
            tchn: 0,
            avh: 1,
            kc: 1
        }
    },

    // ============================================================
    // 4. РЕЗИСТЫ, ПАССИВНЫЕ ЭФФЕКТЫ И СЛАБОСТИ
    // ============================================================
    immunities: {
        // Цена пользовательского резиста при ВЕР 100%.
        customCost100: 2750,

        // ВЕР по умолчанию для нового резиста.
        defaultVer: 50,

        // Итоговая цена резиста: base100 × (ВЕР / 100)^exponent, но не ниже minCost.
        effectiveMinCost: 50,
        effectiveExponent: 0.8,

        // Расчёт базовой цены резиста из параметров эффекта.
        baseResistMinCost100: 250,
        defaultEffectBaseCost: 50,
        inflictMultiplier: 2.0,
        resistMultiplier: 2.5
    },

    passives: {
        // Множитель цены пассивного эффекта.
        costMultiplier: 2.5,
        items: [
            { name: "Конструкт", desc: "Иммунитет к кровотечению, страху, сну и т.д. Уязвим к ЭМИ.", baseCost: 100 },
            { name: "Невидимость", desc: "Персонаж не может быть замечен без указанного броска ВОСПР.", baseCost: 150 }
        ]
    },

    // Слабости дают дополнительные очки бюджета. Чем чаще тип урона встречается
    // в игре, тем ценнее уязвимость к нему.
    weaknesses: {
        damagePoints: {
            "Кинетический": 500,
            "Термический": 400,
            "Химический": 350,
            "Электрический": 350,
            "Криотический": 300,
            "Кронотический": 300,
            "Псионический": 300,
            "Гидравлический": 250,
            "Радиоактивный": 250,
            "Психический": 250,
            "Хронотопический": 200,
            "Чистый урон": 200
        },
        bodyParts: [
            { name: "Туловище", desc: "Корпус — самая доступная цель; попадания задевают жизненно важные узлы.", points: 300 },
            { name: "Ноги", desc: "Подсечки и попадания в ноги ограничивают передвижение.", points: 200 },
            { name: "Руки", desc: "Попадания в руки мешают действиям с оружием.", points: 200 },
            { name: "Голова", desc: "Редко достижима, но критична при попадании.", points: 150 }
        ],
        customPoints: 300
    },

    // ============================================================
    // 5. СПРАВОЧНИКИ
    // ============================================================
    damageTypes: {
        "Кинетический": { desc: "Стандартный физический урон.", mult: 1.0 },
        "Термический": { desc: "Урон от высокой температуры. [Элементальный]", mult: 1.1 },
        "Химический": { desc: "Урон от ирритантов и высокоактивных веществ.", mult: 1.1 },
        "Кронотический": { desc: "Урон от чистой кронотической энергии.", mult: 1.2 },
        "Криотический": { desc: "Урон от низких температур. [Элементальный]", mult: 1.1 },
        "Гидравлический": { desc: "Урон от потока воды. [Элементальный]", mult: 1.1 },
        "Электрический": { desc: "Урон от направленного потока электронов. [Элементальный]", mult: 1.1 },
        "Псионический": { desc: "Урон от пси-излучения.", mult: 1.2 },
        "Хронотопический": { desc: "Урон от искажений во времени.", mult: 1.3 },
        "Радиоактивный": { desc: "Урон от радиоактивного излучения.", mult: 1.2 },
        "Психический": { desc: "Защита только Волей/Интеллектом. Уклонение недоступно. Наносится через Испытание.", mult: 1.5 },
        "Чистый урон": { desc: "Игнорирует Деф(П), Деф(А) и Уклонение.", mult: 2.0 }
    },

    attackTypes: {
        "Ближняя": { icon: "⚔", desc: "Контактный бой. Огромная цена за дальность (х300 за ОП).", mult: 0.8 },
        "Дальняя": { icon: "➤", desc: "Стрелковая атака. Цена скейлится от диапазона ОП и дальности > 7 ОП.", mult: 1.0 },
        "Особая": { icon: "⚡", desc: "Нестандартные действия (конусы, площадки, спавн поверхностей, х100 за ОП).", mult: 1.1 }
    },

    effectGroups: [
        {
            level: 1,
            title: "Эффекты атак (Пробитие и Урон)",
            css: "p5-bg",
            items: [
                { name: "Проницаемость", desc: "Атака игнорирует Деф. Базовая ВЕР 20.", defN: 1, defVer: 20, defAkt: 1, baseCost: 600, step: 1, hideN: true, hideAkt: true, isPermanent: true, linearVer: true },
                { name: "Распад", desc: "Снимает n ОЗ НАВСЕГДА.", defN: 5, defVer: 50, defAkt: 1, baseCost: 15, step: 1, hideAkt: true, isPermanent: true },
                { name: "Излучение", desc: "УКЛ от атак с этим эффектом бросается с помехой.", defN: 1, defVer: 50, defAkt: 1, baseCost: 200, step: 1, hideN: true, hideAkt: true, isPermanent: true }
            ]
        },
        {
            level: 2,
            title: "Числовые эффекты (DoT и Истощение)",
            css: "p2-bg",
            items: [
                { name: "Кровотечение", desc: "В конце хода персонаж теряет n ОЗ. 25 на снятие.", defN: 25, defVer: 50, defAkt: 3, baseCost: 2, step: 25 },
                { name: "Увядание", desc: "Пока действует, каждый ход снимает n ОЗ. 10 на снятие.", defN: 15, defVer: 50, defAkt: 3, baseCost: 15, step: 15 },
                { name: "Отравление", desc: "Снижает броски на 10n каждый ход.", defN: 1, defVer: 50, defAkt: 3, baseCost: 120, step: 1 },
                { name: "Ожог", desc: "Штраф -10 к броскам. В голову х2. Суммируется.", defN: 1, defVer: 50, defAkt: 2, baseCost: 40, step: 1 },
                { name: "Шок", desc: "Отключает случайный имплант. Снимается по 1.", defN: 1, defVer: 50, defAkt: 2, baseCost: 100, step: 1 }
            ]
        },
        {
            level: 3,
            title: "Контроль (Запрет и Ограничение)",
            css: "p1-bg",
            items: [
                { name: "Кома", desc: "Лишает противника всех ОЗ при срабатывании.", defN: 1, defVer: 50, defAkt: 1, baseCost: 3500, step: 1, hideN: true, hideAkt: true, isPermanent: true },
                { name: "Оцепенение", desc: "Персонаж не способен совершать никаких действий.", defN: 1, defVer: 50, defAkt: 1, baseCost: 180, step: 1 },
                { name: "Сон", desc: "Выключает цель до пробуждения.", defN: 1, defVer: 50, defAkt: 2, baseCost: 100, step: 1 },
                { name: "Дезориентация", desc: "Персонаж не способен атаковать n ходов.", defN: 1, defVer: 50, defAkt: 1, baseCost: 120, step: 1 },
                { name: "Замедление", desc: "Основное действие тратит n действий.", defN: 1, defVer: 50, defAkt: 1, baseCost: 150, step: 1 },
                { name: "Обездвижен", desc: "Не может перемещаться и уклоняться.", defN: 1, defVer: 50, defAkt: 1, baseCost: 60, step: 1 },
                { name: "Упал", desc: "Помеха себе, преимущество врагам. Подъем - действие.", defN: 1, defVer: 50, defAkt: 1, baseCost: 120, step: 1 },
                { name: "Сложная местность", desc: "Тратится на n ОП больше на передвижение.", defN: 1, defVer: 50, defAkt: 1, baseCost: 30, step: 1 }
            ]
        },
        {
            level: 4,
            title: "Ослабление (Штрафы и уязвимости)",
            css: "p3-bg",
            items: [
                { name: "Перелом", desc: "Не может блокировать и использовать Тяжелое.", defN: 1, defVer: 50, defAkt: 3, baseCost: 70, step: 1 },
                { name: "Подавлен", desc: "Персонаж не может пользоваться навыками и способностями.", defN: 1, defVer: 50, defAkt: 2, baseCost: 50, step: 1 },
                { name: "Обезоружен", desc: "Не может использовать оружие n ходов.", defN: 1, defVer: 50, defAkt: 1, baseCost: 80, step: 1 },
                { name: "Слепота", desc: "Боевые действия только через Удачу без модификаторов.", defN: 1, defVer: 50, defAkt: 1, baseCost: 100, step: 1 },
                { name: "Страх", desc: "В конце хода проверка Воля/2 >= 50, иначе атаки не засчитываются.", defN: 1, defVer: 50, defAkt: 2, baseCost: 90, step: 1 },
                { name: "Мокрый", desc: "Дает Сложную Местность. Продлевает крио-обездвижен.", defN: 1, defVer: 50, defAkt: 2, baseCost: 20, step: 1 }
            ]
        },
        {
            level: 5,
            title: "Свойства оружия / Предметов",
            css: "p4-bg",
            items: [
                { name: "Электромагнитное", desc: "Наносит дополнительно n АТК технике.", defN: 10, defVer: 50, defAkt: 1, baseCost: 15, step: 5, isItemProperty: true, hideVer: true, hideAkt: true },
                { name: "Автоматическое", desc: "Оружие, способное вести огонь на подавление.", defN: 1, defVer: 50, defAkt: 1, baseCost: 150, step: 1, isItemProperty: true, hideN: true, hideVer: true, hideAkt: true },
                { name: "Нелетальное", desc: "Опускание ОЗ до нуля не убивает персонажа.", defN: 1, defVer: 50, defAkt: 1, baseCost: 5, step: 1, isItemProperty: true, hideN: true, hideVer: true, hideAkt: true },
                { name: "Рикошет", desc: "При атаке есть ВЕР, что пуля отскочит в другого противника (макс 2 ОП). Урон такой же.", defN: 1, defVer: 30, defAkt: 1, baseCost: 80, step: 1, isItemProperty: true, hideN: true, hideAkt: true },
                { name: "Взрывчатое", desc: "Наносит урон по области n ОП вокруг цели.", defN: 1, defVer: 50, defAkt: 1, baseCost: 250, step: 1, isItemProperty: true, hideVer: true, hideAkt: true },
                { name: "Граната", desc: "Атака совершается от Техники. n - количество гранат. Не имеет ТЧН и КШ.", defN: 1, defVer: 50, defAkt: 1, baseCost: 30, step: 1, isItemProperty: true, hideVer: true, hideAkt: true },
                { name: "Без урона", desc: "Не наносит урон при применении. Обнуляет АТК, КШ, ТЧН.", defN: 1, defVer: 50, defAkt: 1, baseCost: 0, step: 1, isItemProperty: true, hideN: true, hideVer: true, hideAkt: true }
            ]
        }
    ],

    // ============================================================
    // 6. КАЛЬКУЛЯТОР УРОНА
    // ============================================================
    // Множитель СТАТА в калькуляторе уклонения.
    calculator: {
        statBase: 5,
        statStep: 0.1
    }
};

// Классические скрипты делят глобальную область: script.js читает BALANCE.
window.BALANCE = BALANCE;
