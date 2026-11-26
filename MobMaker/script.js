const ATTRIBUTES = [
    "Сила", "Ловкость", "Интеллект", "Воля", "Харизма",
    "Восприятие", "Техника", "Удача", "Телосложение"
];

// Все коэффициенты и справочники баланса лежат в balance.js (объект BALANCE).
// Здесь только короткие псевдонимы, чтобы формулы в этом файле читались компактно.
// Меняете числа — только в balance.js.
if (!window.BALANCE) {
    throw new Error("balance.js не загружен: подключите его перед script.js.");
}
const BAL = window.BALANCE;

const DAMAGE_TYPES_INFO = BAL.damageTypes;
const ATTACK_TYPES = BAL.attackTypes;
const EFFECT_GROUPS = BAL.effectGroups;
const PASSIVE_EFFECTS = BAL.passives.items;

const DAMAGE_WEAKNESS_POINTS = BAL.weaknesses.damagePoints;
const BODY_PART_WEAKNESSES = BAL.weaknesses.bodyParts;
const CUSTOM_WEAKNESS_POINTS = BAL.weaknesses.customPoints;

// Бюджеты, тиры и типы мобов.
const BUDGETS = BAL.budgets;

// Цена базовых характеристик и защит.
const STAT_COSTS = BAL.stats;

// Цена атак и эффектов.
const ATTACK_COSTS = BAL.attacks;
const ATTACK_ATK_COST = ATTACK_COSTS.localAtkCost;
const ATTACK_KS_COST = ATTACK_COSTS.localKsCost;
const ATTACK_TCHN_COST = ATTACK_COSTS.localTchnCost;
const GLOBAL_AVH_BASE = ATTACK_COSTS.globalAvhBase;
const GLOBAL_KC_BASE = ATTACK_COSTS.globalKcBase;
const AVH_STEP_COST = ATTACK_COSTS.repetition.avhStep;
const KC_STEP_COST = ATTACK_COSTS.repetition.kcStep;
const OD_LINEAR_COST = ATTACK_COSTS.repetition.odLinear;
const OD_QUAD_COST = ATTACK_COSTS.repetition.odQuad;
const IGNORE_DEF_COST = ATTACK_COSTS.ignoreDefCost;
const IGNORE_UKL_COST = ATTACK_COSTS.ignoreUklCost;
const PERMANENT_MULT = ATTACK_COSTS.permanentMultiplier;
const INFINITE_MULT = ATTACK_COSTS.infiniteMultiplier;
const ATTACK_THRESHOLDS = ATTACK_COSTS.thresholds;
const CURVE_DIVISOR = ATTACK_COSTS.curveDivisor;
const STAT_COST_FACTOR = ATTACK_COSTS.statCostFactor;
const GLOBAL_COST_FACTOR = ATTACK_COSTS.globalCostFactor;
const DISTANCE_COSTS = ATTACK_COSTS.distance;
const EFFECT_FORMULA = ATTACK_COSTS.effect;

// Резисты.
const IMMUNITY_BALANCE = BAL.immunities;
const CUSTOM_IMMUNITY_COST_100 = IMMUNITY_BALANCE.customCost100;

// Калькулятор урона.
const CALC_BALANCE = BAL.calculator;

function getBaseResistCost100(item) {
    const stepMult = item.step ? ((item.defN || 1) / item.step) : 1;
    const verFactor50 = Math.pow(IMMUNITY_BALANCE.defaultVer / EFFECT_FORMULA.verBase, EFFECT_FORMULA.verExponent);
    const aktMult = Math.max(1, item.defAkt || 1);
    const baselineInflictCost = (item.baseCost || IMMUNITY_BALANCE.defaultEffectBaseCost) * stepMult * verFactor50 * aktMult * IMMUNITY_BALANCE.inflictMultiplier;
    return Math.max(IMMUNITY_BALANCE.baseResistMinCost100, Math.round(baselineInflictCost * IMMUNITY_BALANCE.resistMultiplier));
}

const IMMUNITY_GROUPS = [
    {
        title: "Игноры эффектов Атак",
        css: "p4-bg",
        items: EFFECT_GROUPS.flatMap(group =>
            group.items
                // Сначала отсеиваем "Кому" и свойства оружия
                .filter(item => item.name !== "Кома" && !item.isItemProperty)
                // А затем уже формируем объект для резиста
                .map(item => ({
                    name: item.name,
                    cost100: getBaseResistCost100(item),
                    desc: item.desc
                }))
        )
    },
];

// Словарь для переименования Типов юнитов
const TYPE_RENAME = {
    "Моб": "Шестёрка",
    "Элитный": "Лейтенант",
    "Босс": "Босс"
};

// Словарь для переименования Сложностей (Тиров)
const TIER_RENAME = {
    "Новичок": "Новичок",
    "Обычный": "Обычный",
    "Опасный": "Опасный",
    "Элитный": "Элитный",
    "Смерть": "Смерть"
};

let attacks = [];
let passiveEffects = {};
let weaknesses = {};
let immunities = {};
let nextAttackId = 1;
let lastOutputText = "";
let currentBudget = { spent: 0, max: 0 };
let calcAttackId = null;

// M6: Переменные для вкладок и сохранений
let savedMobs = {};
let activeMobId = null;
let isApplyingState = false;
let saveTimeout = null;
let draggedAttackId = null;

// ============================================================
// ПЕРСОНАЖ: РЕЖИМ ПРОФИЛЯ И СНАРЯЖЕНИЕ
// ============================================================
// Персонаж отличается от моба тем, что не ограничен очками генерации:
// у него считается только цена выбранного снаряжения в кредитах.

const GEAR_KINDS = {
    weapons: { label: "Оружие" },
    items: { label: "Предметы" },
    skills: { label: "Навыки" },
    abilities: { label: "Способности" },
    cards: { label: "Карты" }
};
const GEAR_KIND_ORDER = Object.keys(GEAR_KINDS);
const GEAR_PAGE_SIZE = 24;
const CREDIT_ICON = "../assets/icons/croncred.webp";

function creditNumber(value) {
    return (Number(value) || 0).toLocaleString("ru-RU");
}

function creditIcon(value, extraClass = "") {
    return `<span class="credit-price${extraClass ? ` ${extraClass}` : ""}"><img src="${CREDIT_ICON}" alt="кредиты" title="кредиты" loading="lazy"><span class="credit-num">${creditNumber(value)}</span></span>`;
}

// Оружие с этими тегами считается дистанционным.
const RANGED_WEAPON_TAGS = new Set(["P", "Sub", "SG", "AR", "S", "He", "Ar", "Sg"]);

const STAT_LABELS = {
    strength: "Сила", dexterity: "Ловкость", intelligence: "Интеллект",
    will: "Воля", charisma: "Харизма", perception: "Восприятие",
    technique: "Техника", luck: "Удача", constitution: "Телосложение"
};

// Быстрый поиск эффекта атаки по названию (для разбора описаний оружия).
const EFFECT_BY_NAME = {};
EFFECT_GROUPS.forEach(group => {
    group.items.forEach(item => {
        EFFECT_BY_NAME[item.name.toLowerCase()] = { item, level: group.level };
    });
});
EFFECT_BY_NAME["электромгнитное"] = EFFECT_BY_NAME["электромагнитное"]; // опечатка в базе

let unitMode = "mob";
let gear = createEmptyGear();
let gearTab = "weapons";
let gearPage = 0;
let gameData = null;
let gameDataStatus = "idle"; // idle | loading | ready | error
let gameDataPromise = null;

// Z8: Навигация по Enter
document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        const target = e.target;
        if (target.tagName === 'INPUT' && target.type !== 'checkbox') {
            e.preventDefault();
            const focusable = Array.from(document.querySelectorAll('input:not([type="checkbox"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'));
            const index = focusable.indexOf(target);
            if (index > -1 && index < focusable.length - 1) {
                focusable[index + 1].focus();
                if (focusable[index + 1].type === 'text' || focusable[index + 1].type === 'number') {
                    focusable[index + 1].select();
                }
            }
        }
    }
});

function init() {
    // 1. Готовим пустые контейнеры
    renderAttributes();
    renderPassiveEffects();
    renderWeaknesses();
    renderImmunities();

    // 2. Загружаем сохранения из LocalStorage
    const saved = localStorage.getItem('mobConstructorSaves');
    if (saved) {
        try { savedMobs = JSON.parse(saved); } catch (e) { savedMobs = {}; }
    }

    // 3. Пытаемся загрузить из ссылки
    const loadedFromUrl = loadStateFromUrl();
    
    if (!loadedFromUrl) {
        const keys = Object.keys(savedMobs);
        if (keys.length > 0) {
            // Если есть сохранения — загружаем самый первый моб
            activeMobId = keys[0];
            applyState(savedMobs[activeMobId]);
        } else {
            // Если вообще ничего нет (первый заход) — используем логику "+ Новый моб"
            addNewTab(); 
            return; // addNewTab уже всё отрисовал, выходим
        }
    }
    
    renderTabs();
}

function createAttack(partial = {}) {
    const id = nextAttackId++;
    const base = { id, name: "Атака", ...ATTACK_COSTS.defaults, effects: {} };
    const attack = Object.assign(base, partial, { id });
    attack.effects = {};
    Object.keys(partial.effects || {}).forEach(name => {
        attack.effects[name] = Object.assign({}, partial.effects[name]);
    });
    return attack;
}

function getAttack(id) { return attacks.find(a => a.id === Number(id)); }
function findAttackEffect(name) {
    for (const group of EFFECT_GROUPS) {
        const item = group.items.find(i => i.name === name);
        if (item) return { ...item, level: group.level };
    }
    return null;
}
function findPassive(name) { return PASSIVE_EFFECTS.find(i => i.name === name) || null; }
function findImmunity(name) {
    for (const group of IMMUNITY_GROUPS) {
        const item = group.items.find(i => i.name === name);
        if (item) return item;
    }
    return null;
}

// ============================================================
// ПЕРСОНАЖ: ДАННЫЕ, СНАРЯЖЕНИЕ И РАЗБОР ОРУЖИЯ
// ============================================================

function createEmptyGear() {
    return { weapons: [], items: [], skills: [], abilities: [], cards: [] };
}

function normalizeGear(raw) {
    const result = createEmptyGear();
    if (!raw || typeof raw !== "object") return result;
    GEAR_KIND_ORDER.forEach(kind => {
        const list = Array.isArray(raw[kind]) ? raw[kind] : [];
        result[kind] = list
            .filter(entry => entry && entry.id && entry.name)
            .map(entry => ({
                id: String(entry.id),
                name: String(entry.name),
                cost: Math.max(0, Number(entry.cost) || 0),
                qty: Math.max(1, Math.min(99, Number(entry.qty) || 1)),
                desc: typeof entry.desc === "string" ? entry.desc : "",
                fullDesc: typeof entry.fullDesc === "string" ? entry.fullDesc : (typeof entry.desc === "string" ? entry.desc : ""),
                category: typeof entry.category === "string" ? entry.category : "",
                rarity: typeof entry.rarity === "string" ? entry.rarity : "",
                organization: typeof entry.organization === "string" ? entry.organization : "",
                iconic: Boolean(entry.iconic),
                attackId: entry.attackId !== undefined && entry.attackId !== null && Number.isFinite(Number(entry.attackId))
                    ? Number(entry.attackId) : null
            }));
    });
    return result;
}

function calculateGearCost() {
    return GEAR_KIND_ORDER.reduce((total, kind) =>
        total + gear[kind].reduce((sum, entry) =>
            sum + (Number(entry.cost) || 0) * Math.max(1, Number(entry.qty) || 1), 0), 0);
}

function gearPositionCount() {
    return GEAR_KIND_ORDER.reduce((sum, kind) => sum + gear[kind].length, 0);
}

function setUnitMode(mode) {
    const next = mode === "character" ? "character" : "mob";
    if (unitMode === next) return;
    unitMode = next;
    applyUnitModeUI();
    recalcStats();
    if (unitMode === "character") ensureGameData().catch(() => {});
}

function applyUnitModeUI() {
    const character = unitMode === "character";

    const gearCard = document.getElementById("gearCard");
    if (gearCard) gearCard.hidden = !character;
    const gearSummary = document.getElementById("gearSummaryBox");
    if (gearSummary) gearSummary.hidden = !character;
    document.querySelectorAll(".mob-only").forEach(el => { el.hidden = character; });
    document.body.classList.toggle("character-mode", character);

    const modeSelect = document.getElementById("unitMode");
    if (modeSelect && modeSelect.value !== unitMode) modeSelect.value = unitMode;

    const budgetLabel = document.getElementById("budgetLabel");
    if (budgetLabel) budgetLabel.textContent = character ? "Цена снаряжения:" : "Очки генерации:";
    const attrLabel = document.getElementById("attrLabel");
    if (attrLabel) attrLabel.textContent = character ? "Хар-ки (без лимита):" : "Хар-ки:";

    const externalLabel = document.getElementById("externalBudgetLabel");
    if (externalLabel) externalLabel.textContent = character ? "Цена снаряжения" : "Бюджет моба";
    const barWrap = document.getElementById("externalBudgetBarWrap");
    if (barWrap) barWrap.hidden = character;
}

function readCachedGameData() {
    try {
        const raw = localStorage.getItem("infusion.db");
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const data = parsed && parsed.data ? parsed.data : parsed;
        if (data && Array.isArray(data.items)) return data;
    } catch (error) { /* кэш может быть повреждён — просто игнорируем */ }
    return null;
}

function ensureGameData() {
    if (gameData) return Promise.resolve(gameData);
    if (gameDataPromise) return gameDataPromise;

    const cached = readCachedGameData();
    if (cached) {
        gameData = cached;
        gameDataStatus = "ready";
        enrichGearFromData();
        renderGear();
        recalcStats();
        return Promise.resolve(gameData);
    }

    gameDataStatus = "loading";
    renderGear();
    gameDataPromise = fetch("../data/data.json", { cache: "no-store" })
        .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then(data => {
            gameData = data;
            gameDataStatus = "ready";
            gameDataPromise = null;
            enrichGearFromData();
            renderGear();
            recalcStats();
            return data;
        })
        .catch(error => {
            gameDataStatus = "error";
            gameDataPromise = null;
            renderGear();
            throw error;
        });
    return gameDataPromise;
}

function normalizeSearch(value) {
    return String(value || "").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

function flatText(value, limit = 260) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

// Нечёткий поиск: точное совпадение, начало слова, подстрока, подпоследовательность,
// опечатки/перестановки и ввод в неверной раскладке. Логика совпадает с js/core/fuzzy.js.
const FUZZY_EN_KEYS = "`qwertyuiop[]asdfghjkl;'zxcvbnm,.";
const FUZZY_RU_KEYS = "ейцукенгшщзхъфывапролджэячсмитьбю";
const FUZZY_EN_TO_RU = Object.create(null);
const FUZZY_RU_TO_EN = Object.create(null);
for (let i = 0; i < FUZZY_EN_KEYS.length; i++) {
    FUZZY_EN_TO_RU[FUZZY_EN_KEYS[i]] = FUZZY_RU_KEYS[i];
    if (FUZZY_RU_KEYS[i] !== "е" || FUZZY_EN_KEYS[i] === "t") FUZZY_RU_TO_EN[FUZZY_RU_KEYS[i]] = FUZZY_EN_KEYS[i];
}

function fuzzyWords(value) {
    return normalizeSearch(value).split(/[^a-zа-я0-9]+/).filter(Boolean);
}

function fuzzySwitchLayout(value) {
    let hasEn = false;
    let hasRu = false;
    for (const char of value) {
        if (char >= "a" && char <= "z") hasEn = true;
        else if (char >= "а" && char <= "я") hasRu = true;
    }
    if (hasEn === hasRu) return value;
    const map = hasEn ? FUZZY_EN_TO_RU : FUZZY_RU_TO_EN;
    let result = "";
    for (const char of value) result += map[char] ?? char;
    return result;
}

// Расстояние Дамерау — Левенштейна (OSA): соседняя перестановка = 1 правка.
function fuzzyDistance(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev2 = null;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const row = [i];
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            let distance = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                distance = Math.min(distance, prev2[j - 2] + 1);
            }
            row[j] = distance;
        }
        prev2 = prev;
        prev = row;
    }
    return prev[b.length];
}

// Самое плотное вхождение запроса как подпоследовательности в слово.
function fuzzySubsequenceDensity(query, word) {
    let best = 0;
    for (let start = 0; start < word.length; start++) {
        if (word[start] !== query[0]) continue;
        let queryIndex = 1;
        let end = start;
        for (let i = start + 1; i < word.length && queryIndex < query.length; i++) {
            if (word[i] === query[queryIndex]) {
                end = i;
                queryIndex++;
            }
        }
        if (queryIndex === query.length) {
            const density = query.length / (end - start + 1);
            if (density > best) best = density;
            if (best === 1) break;
        }
    }
    return best;
}

function fuzzyWordScore(query, word) {
    if (!query || !word) return 0;
    if (word === query) return 1;
    if (word.startsWith(query)) return 0.94 - Math.min(0.12, (word.length - query.length) * 0.008);
    const at = word.indexOf(query);
    if (at >= 0) return 0.84 - Math.min(0.18, at * 0.015 + (word.length - query.length) * 0.004);

    if (query.length >= 3) {
        const density = fuzzySubsequenceDensity(query, word);
        const minDensity = query.length === 3 ? 0.6 : 0.72;
        if (density >= minDensity) return 0.5 + density * 0.18;
    }

    if (query.length >= 4) {
        const max = query.length >= 8 ? 2 : 1;
        if (Math.abs(word.length - query.length) <= max) {
            const distance = fuzzyDistance(query, word);
            if (distance <= max) return Math.max(0.45, 0.78 - distance * 0.14);
        }
    }
    return 0;
}

function fuzzyScoreTokens(tokens, words, normalizedText, normalizedQuery) {
    if (!tokens.length || !words.length) return 0;

    let total = 0;
    const matchedIndexes = [];
    for (const token of tokens) {
        let best = 0;
        let bestIndex = -1;
        for (let i = 0; i < words.length; i++) {
            const score = fuzzyWordScore(token, words[i]);
            if (score > best) {
                best = score;
                bestIndex = i;
            }
            if (best === 1) break;
        }

        // Склеенное слово в запросе: «ремперчатка» → «рем перчатка», «мк3» → «мк 3».
        if (best < 0.85 && (token.length >= 5 || /\d/.test(token))) {
            for (let i = 0; i < words.length - 1; i++) {
                const score = fuzzyWordScore(token, words[i] + words[i + 1]) * 0.92;
                if (score > best) {
                    best = score;
                    bestIndex = i;
                }
            }
        }

        if (!best) {
            // Случайный пробел в запросе: «пер чатка» → «перчатка».
            if (tokens.length >= 2) {
                const merged = tokens.join("");
                if (merged.length >= 4) {
                    let mergedBest = 0;
                    for (const word of words) mergedBest = Math.max(mergedBest, fuzzyWordScore(merged, word) * 0.9);
                    return mergedBest;
                }
            }
            return 0;
        }

        total += best;
        matchedIndexes.push(bestIndex);
    }

    const average = total / tokens.length;
    if (tokens.length === 1) return average;
    if (normalizedText && normalizedQuery && normalizedText.includes(normalizedQuery)) {
        return Math.min(1, average * 0.95 + 0.05);
    }

    let inOrder = 0;
    let close = 0;
    for (let i = 1; i < matchedIndexes.length; i++) {
        const gap = matchedIndexes[i] - matchedIndexes[i - 1];
        if (gap > 0) inOrder++;
        if (gap > 0 && gap <= 2) close++;
    }
    const pairs = tokens.length - 1;
    const orderFactor = (inOrder / pairs) * 0.6 + (close / pairs) * 0.4;
    return average * (0.92 + 0.08 * orderFactor);
}

function fuzzyTextScore(query, text) {
    const normalizedQuery = normalizeSearch(query);
    if (!normalizedQuery) return 1;
    const normalizedText = normalizeSearch(text);
    const words = fuzzyWords(normalizedText);
    if (!words.length) return 0;

    const tokens = fuzzyWords(normalizedQuery);
    let score = fuzzyScoreTokens(tokens, words, normalizedText, normalizedQuery);
    const switched = fuzzySwitchLayout(normalizedQuery);
    if (switched !== normalizedQuery) {
        const altScore = fuzzyScoreTokens(fuzzyWords(switched), words, normalizedText, switched) * 0.96;
        if (altScore > score) score = altScore;
    }
    return score;
}

function parseNum(value) {
    const number = Number(String(value).replace(",", "."));
    return Number.isFinite(number) ? number : 0;
}

function itemSource(item) {
    const fullDesc = String(item.description || "");
    const iconic = Boolean(item.iconic) || item.rarity === "Культовый";
    return {
        id: String(item.id),
        name: item.name,
        cost: Number(item.cost) || 0,
        desc: flatText(fullDesc),
        fullDesc,
        rarity: item.rarity || "",
        organization: item.organization || "",
        iconic,
        meta: [item.category, item.rarity].filter(Boolean).join(" · "),
        raw: item
    };
}

function skillSource(skill) {
    const fullDesc = String(skill.description || "");
    return {
        id: String(skill.id),
        name: skill.name,
        cost: 0,
        desc: flatText(fullDesc),
        fullDesc,
        rarity: skill.rarity || "",
        organization: "",
        iconic: skill.rarity === "Культовый",
        meta: [STAT_LABELS[skill.stat] || skill.stat, skill.rarity, skill.tier !== undefined ? `тир ${skill.tier}` : ""].filter(Boolean).join(" · "),
        raw: skill
    };
}

function abilitySource(ability) {
    const fullDesc = String(ability.description || "");
    return {
        id: String(ability.id),
        name: ability.name,
        cost: 0,
        desc: flatText(fullDesc),
        fullDesc,
        rarity: "",
        organization: "",
        iconic: false,
        meta: ability.class_requirement ? `Класс: ${ability.class_requirement}` : "Способность",
        raw: ability
    };
}

function cardSource(card) {
    const fullDesc = String(card.mechanics || card.effect || "");
    return {
        id: String(card.id),
        name: card.name,
        cost: 0,
        desc: flatText(fullDesc),
        fullDesc,
        rarity: card.rarity || "",
        organization: "",
        iconic: Boolean(card.iconic) || card.rarity === "Культовый",
        meta: [card.rarity, card.school, (card.classes || []).join(", ")].filter(Boolean).join(" · "),
        raw: card
    };
}

function findGearSource(kind, id) {
    if (!gameData) return null;
    const wanted = String(id);
    if (kind === "weapons" || kind === "items") {
        const item = (gameData.items || []).find(entry => String(entry.id) === wanted);
        return item ? itemSource(item) : null;
    }
    if (kind === "skills") {
        const skill = (gameData.skills || []).find(entry => String(entry.id) === wanted);
        return skill ? skillSource(skill) : null;
    }
    if (kind === "abilities") {
        const ability = (gameData.abilities || []).find(entry => String(entry.id) === wanted);
        return ability ? abilitySource(ability) : null;
    }
    if (kind === "cards") {
        const card = (gameData.cards || []).find(entry => String(entry.id) === wanted);
        return card ? cardSource(card) : null;
    }
    return null;
}

function enrichGearFromData() {
    if (!gameData) return;
    GEAR_KIND_ORDER.forEach(kind => {
        gear[kind].forEach(entry => {
            const source = findGearSource(kind, entry.id);
            if (!source) return;
            if (!entry.fullDesc) entry.fullDesc = source.fullDesc || entry.desc || "";
            if (!entry.category) entry.category = source.meta || "";
            if (!entry.rarity) entry.rarity = source.rarity || "";
            if (!entry.organization) entry.organization = source.organization || "";
            if (!entry.iconic) entry.iconic = Boolean(source.iconic);
        });
    });
}

function gearSourceList() {
    if (!gameData) return [];
    if (gearTab === "weapons") {
        return (gameData.items || [])
            .filter(item => item.category === "Оружие")
            .map(itemSource);
    }
    if (gearTab === "items") {
        const select = document.getElementById("gearCategory");
        const category = select && select.value ? select.value : "all";
        return (gameData.items || [])
            .filter(item => item.category !== "Оружие")
            .filter(item => category === "all" || item.category === category)
            .map(itemSource);
    }
    if (gearTab === "skills") return (gameData.skills || []).map(skillSource);
    if (gearTab === "abilities") return (gameData.abilities || []).map(abilitySource);
    if (gearTab === "cards") return (gameData.cards || []).map(cardSource);
    return [];
}

function filterGearSources(list) {
    const search = document.getElementById("gearSearch");
    const query = normalizeSearch(search ? search.value : "");
    if (!query) return list;

    const scored = [];
    list.forEach(source => {
        const searchText = `${source.name} ${source.fullDesc || source.desc} ${source.meta} ${source.organization || ""} ${source.iconic ? "Культовое" : ""}`;
        const fullScore = fuzzyTextScore(query, searchText);
        const nameScore = fuzzyTextScore(query, source.name);
        const score = Math.max(fullScore, nameScore) + nameScore * 0.08;
        if (score > 0) scored.push({ source, score });
    });
    scored.sort((a, b) => b.score - a.score || a.source.name.localeCompare(b.source.name, "ru"));
    return scored.map(entry => entry.source);
}

function handleGearSearch() {
    gearPage = 0;
    renderGearPicker();
}

function handleGearCategoryChange() {
    gearPage = 0;
    renderGearPicker();
}

function changeGearPage(delta) {
    gearPage = Math.max(0, gearPage + Number(delta || 0));
    renderGearPicker();
}

function setGearTab(kind) {
    if (!GEAR_KINDS[kind] || gearTab === kind) return;
    gearTab = kind;
    gearPage = 0;
    renderGear();
}

function renderGear() {
    renderGearTabs();
    renderGearCategory();
    renderGearPicker();
    renderGearSelected();
    updateGearCostHint();
}

function renderGearTabs() {
    const container = document.getElementById("gearTabs");
    if (!container) return;
    container.innerHTML = GEAR_KIND_ORDER.map(kind => {
        const count = gear[kind].length;
        return `<button type="button" class="gear-tab ${gearTab === kind ? "active" : ""}"
            onclick="setGearTab(${jsAttr(kind)})">${esc(GEAR_KINDS[kind].label)}${count ? ` <span class="gear-tab-count">${count}</span>` : ""}</button>`;
    }).join("");
}

function renderGearCategory() {
    const select = document.getElementById("gearCategory");
    if (!select) return;
    if (gearTab !== "items" || !gameData) { select.hidden = true; return; }

    const categories = Array.from(new Set((gameData.items || [])
        .filter(item => item.category !== "Оружие")
        .map(item => item.category)
        .filter(Boolean))).sort((a, b) => a.localeCompare(b, "ru"));

    const current = select.value;
    select.innerHTML = `<option value="all">Все категории</option>` +
        categories.map(category => `<option value="${esc(category)}">${esc(category)}</option>`).join("");
    select.hidden = false;
    if (categories.includes(current)) select.value = current;
}

function gearTagsHtml(source) {
    const tags = [];
    if (source.meta) tags.push(`<span class="gear-tag">${esc(source.meta)}</span>`);
    if (source.organization) tags.push(`<span class="gear-tag gear-tag-org" title="Организация">${esc(source.organization)}</span>`);
    if (source.iconic) tags.push(`<span class="gear-tag gear-tag-cult" title="Культовое">★ Культовое</span>`);
    return tags.length ? `<div class="gear-tags">${tags.join("")}</div>` : "";
}

function gearDescriptionHtml(fullDesc) {
    const text = String(fullDesc || "").trim();
    if (!text) return "";
    return `<details class="gear-desc" onclick="event.stopPropagation()">
        <summary>Описание</summary>
        <div class="gear-desc-body">${esc(text)}</div>
    </details>`;
}

function renderGearPicker() {
    const container = document.getElementById("gearPicker");
    const pager = document.getElementById("gearPager");
    if (!container) return;

    if (pager) pager.innerHTML = "";

    if (!gameData) {
        container.innerHTML = gameDataStatus === "error"
            ? `<div class="empty-state">Не удалось загрузить справочники. Откройте страницу через HTTP-сервер (например, <code>npx serve</code>) и обновите.</div>`
            : `<div class="empty-state">Загрузка справочников…</div>`;
        return;
    }

    const list = filterGearSources(gearSourceList());
    if (!list.length) {
        container.innerHTML = `<div class="empty-state">Ничего не найдено.</div>`;
        return;
    }

    const totalPages = Math.max(1, Math.ceil(list.length / GEAR_PAGE_SIZE));
    gearPage = Math.min(Math.max(0, gearPage), totalPages - 1);
    const start = gearPage * GEAR_PAGE_SIZE;
    const shown = list.slice(start, start + GEAR_PAGE_SIZE);

    container.innerHTML = shown.map(source => {
        const selected = gear[gearTab].some(entry => entry.id === source.id);
        return `
            <div class="gear-pick ${selected ? "selected" : ""}" onclick="addGearEntry(${jsAttr(gearTab)}, ${jsAttr(source.id)})">
                <div class="gear-pick-top">
                    <span class="gear-pick-name">${esc(source.name)}</span>
                    ${source.cost ? creditIcon(source.cost, "gear-pick-cost") : ""}
                </div>
                ${source.desc ? `<div class="gear-pick-desc">${esc(source.desc)}</div>` : ""}
                ${gearTagsHtml(source)}
                ${gearDescriptionHtml(source.fullDesc || source.desc)}
            </div>
        `;
    }).join("");

    if (pager) renderGearPager(pager, list.length, totalPages);
}

function renderGearPager(container, total, totalPages) {
    if (totalPages <= 1) {
        container.innerHTML = `<span class="gear-page-count">${total} шт.</span>`;
        return;
    }

    const from = gearPage * GEAR_PAGE_SIZE + 1;
    const to = Math.min(total, (gearPage + 1) * GEAR_PAGE_SIZE);
    container.innerHTML = `
        <button type="button" class="gear-page-btn" onclick="changeGearPage(-1)"
            ${gearPage === 0 ? "disabled" : ""} aria-label="Предыдущая страница">←</button>
        <span class="gear-page-info">Страница <b>${gearPage + 1}</b> из ${totalPages}
            <span class="gear-page-count">· ${from}–${to} из ${total} шт.</span></span>
        <button type="button" class="gear-page-btn" onclick="changeGearPage(1)"
            ${gearPage >= totalPages - 1 ? "disabled" : ""} aria-label="Следующая страница">→</button>
    `;
}

function renderGearSelected() {
    const container = document.getElementById("gearSelected");
    if (!container) return;

    const list = gear[gearTab];
    if (!list.length) {
        container.innerHTML = `<div class="empty-effects">В этой категории пока ничего не выбрано.</div>`;
        return;
    }

    const canMultiply = gearTab === "weapons" || gearTab === "items";
    container.innerHTML = list.map(entry => `
        <div class="gear-row">
            <div class="gear-row-main">
                <div class="gear-row-name">${esc(entry.name)}</div>
                ${entry.desc ? `<div class="gear-row-desc">${esc(entry.desc)}</div>` : ""}
                ${gearTagsHtml({ meta: entry.category, organization: entry.organization, iconic: entry.iconic })}
                ${gearDescriptionHtml(entry.fullDesc || entry.desc)}
            </div>
            ${canMultiply ? `
                <div class="gear-row-qty">
                    <button type="button" class="gear-qty-btn" title="Убрать одну" onclick="changeGearQty(${jsAttr(gearTab)}, ${jsAttr(entry.id)}, -1)">−</button>
                    <input type="number" min="1" max="99" value="${entry.qty}" aria-label="Количество"
                        onchange="setGearQty(${jsAttr(gearTab)}, ${jsAttr(entry.id)}, this.value)">
                    <button type="button" class="gear-qty-btn" title="Добавить одну" onclick="changeGearQty(${jsAttr(gearTab)}, ${jsAttr(entry.id)}, 1)">+</button>
                </div>` : ""}
            ${entry.cost
                ? `<div class="gear-row-cost">${creditIcon(entry.cost * Math.max(1, Number(entry.qty) || 1))}</div>`
                : `<div class="gear-row-cost muted">—</div>`}
            <button type="button" class="btn-del" title="Убрать" onclick="removeGearEntry(${jsAttr(gearTab)}, ${jsAttr(entry.id)})">✕</button>
        </div>
    `).join("");
}

function updateGearCostHint() {
    const cost = calculateGearCost();
    const positions = gearPositionCount();

    const hint = document.getElementById("gearCostHint");
    if (hint) hint.innerHTML = creditIcon(cost);
    const summary = document.getElementById("gearSummaryValue");
    if (summary) summary.innerHTML = creditIcon(cost);
    const note = document.getElementById("gearCostNote");
    if (note) {
        note.innerHTML = positions
            ? `Итого: ${creditIcon(cost)} · Позиций: ${positions}`
            : "Снаряжение не выбрано.";
    }
}

function addGearEntry(kind, id) {
    if (!GEAR_KINDS[kind] || !gameData) return;
    const source = findGearSource(kind, id);
    if (!source) return;

    const list = gear[kind];
    const existing = list.find(entry => entry.id === source.id);
    if (existing) {
        if (kind === "weapons" || kind === "items") {
            existing.qty = Math.min(99, (Number(existing.qty) || 1) + 1);
        } else {
            return; // навыки, способности и карты не дублируются
        }
    } else {
        const entry = {
            id: source.id,
            name: source.name,
            cost: source.cost || 0,
            qty: 1,
            desc: source.desc || "",
            fullDesc: source.fullDesc || source.desc || "",
            category: source.meta || "",
            rarity: source.rarity || "",
            organization: source.organization || "",
            iconic: Boolean(source.iconic),
            attackId: null
        };
        if (kind === "weapons" && source.raw) {
            const attack = createWeaponAttack(source.raw);
            entry.attackId = attack.id;
            attacks.push(attack);
        }
        list.push(entry);
    }

    renderGear();
    if (kind === "weapons") renderAttacks();
    recalcStats();
}

function removeGearEntry(kind, id) {
    const list = gear[kind];
    const entry = list.find(item => item.id === String(id));
    if (!entry) return;

    if (kind === "weapons" && entry.attackId !== null) {
        const linkedId = `weapons:${entry.id}`;
        attacks = attacks.filter(attack =>
            !(attack.id === Number(entry.attackId) && attack.linkedGearId === linkedId));
    }

    gear[kind] = list.filter(item => item !== entry);
    renderGear();
    if (kind === "weapons") renderAttacks();
    recalcStats();
}

function changeGearQty(kind, id, delta) {
    const entry = gear[kind].find(item => item.id === String(id));
    if (!entry) return;
    const next = Math.max(1, Math.min(99, (Number(entry.qty) || 1) + Number(delta)));
    if (next === entry.qty) return;
    entry.qty = next;
    renderGear();
    recalcStats();
}

function setGearQty(kind, id, value) {
    const entry = gear[kind].find(item => item.id === String(id));
    if (!entry) return;
    entry.qty = Math.max(1, Math.min(99, Number(value) || 1));
    renderGear();
    recalcStats();
}

// Разбор «Параметры: АТК 53; ТЧН 15; АВХ 2» в поля атаки.
function parseWeaponStats(description) {
    const text = String(description || "").replace(/\r\n?/g, "\n");
    const result = {
        atk: 0, ks: 0, tchn: 0, avh: 1, kc: 1,
        distMin: 0, distMax: 0, damageType: "Кинетический"
    };

    const paramMatch = text.match(/Параметр(?:ы)?\s*:\s*([^\n]+)/i);
    const paramText = paramMatch ? paramMatch[1] : text;

    const statKeys = { "АТК": "atk", "ТЧН": "tchn", "КШ": "ks", "АВХ": "avh", "КЦ": "kc" };
    const statRe = /(\d+(?:[.,]\d+)?)\s*(АТК|ТЧН|АВХ|КШ|КЦ)|(АТК|ТЧН|АВХ|КШ|КЦ)\s*[:\-]?\s*(\d+(?:[.,]\d+)?)/gi;
    let match;
    while ((match = statRe.exec(paramText))) {
        const key = statKeys[(match[2] || match[3] || "").toUpperCase()];
        if (key) result[key] = parseNum(match[1] !== undefined ? match[1] : match[4]);
    }

    const distance = text.match(/Дальност[ьи]?\s*[-–—:]?\s*(\d+)/i);
    if (distance) result.distMax = Number(distance[1]);

    const range = text.match(/(\d+)\s*[-–]\s*(\d+)\s*ОП/i);
    if (range) {
        result.distMin = Number(range[1]);
        result.distMax = Number(range[2]);
    } else if (!distance) {
        const single = text.match(/(\d+)\s*ОП/i);
        if (single) result.distMax = Number(single[1]);
    }

    const damageLine = text.match(/(?:Тип\s+урона|Урон)\s*:\s*([^\n]+)/i);
    const inflicts = text.match(/Наносит\s+([А-Яа-яЁё+\s]+?)\s+урон/i);
    const damageText = `${damageLine ? damageLine[1] : ""} ${inflicts ? inflicts[1] : ""}`.trim();
    const damageTypes = [
        [/электро|электрич|^эл/i, "Электрический"],
        [/термо|термич/i, "Термический"],
        [/хим|кеми/i, "Химический"],
        [/крио/i, "Криотический"],
        [/кроно/i, "Кронотический"],
        [/пси/i, "Псионический"],
        [/радио/i, "Радиоактивный"],
        [/гидро/i, "Гидравлический"]
    ];
    for (const [pattern, type] of damageTypes) {
        if (pattern.test(damageText)) { result.damageType = type; break; }
    }

    return result;
}

// Разбор строки «Эффекты: Кровотечение 30; Шок 25 ВЕР; ...».
function parseWeaponEffects(description) {
    const text = String(description || "").replace(/\r\n?/g, "\n");
    const section = text.match(/(?:^|\n)\s*Эффект(?:ы)?\s*:\s*([\s\S]*?)(?=\n\s*\n|\n\s*(?:Уникальн|Тип\s+урона|Урон|Качество|Комплекс)|$)/i);
    const inline = text.match(/(?:^|\n)\s*Эффект(?:ы)?\s*:\s*([^\n]+)/i);
    const chunk = section ? section[1] : (inline ? inline[1] : "");
    if (!chunk.trim()) return {};

    const effects = {};
    const tokens = chunk.split(/[;,.]/).map(token => token.trim()).filter(Boolean);
    const effectNames = Object.keys(EFFECT_BY_NAME).sort((a, b) => b.length - a.length);

    tokens.forEach(token => {
        if (/не\s+наносит\s+урон/i.test(token)) {
            const noDamage = EFFECT_BY_NAME["без урона"];
            if (noDamage) effects[noDamage.item.name] = makeAttackEffectState(noDamage.item.name, noDamage.level);
            return;
        }

        const lower = token.toLowerCase();
        const effectName = effectNames.find(name => {
            if (!lower.startsWith(name)) return false;
            const next = lower.charAt(name.length);
            return !next || !/[a-zа-яё0-9]/.test(next);
        });
        if (!effectName) return;

        const info = EFFECT_BY_NAME[effectName];
        const rest = token.slice(effectName.length);
        const verMatch = rest.match(/(\d+)\s*ВЕР|ВЕР\s*(\d+)/i);
        const aktMatch = rest.match(/(\d+)\s*АКТ|АКТ\s*(\d+)/i);
        const withoutVer = rest
            .replace(/\d+\s*ВЕР/ig, "").replace(/ВЕР\s*\d+/ig, "")
            .replace(/\d+\s*АКТ/ig, "").replace(/АКТ\s*\d+/ig, "");
        const numMatch = withoutVer.match(/(\d+(?:[.,]\d+)?)/);

        const overrides = {};
        if (verMatch) overrides.ver = Math.max(1, Math.min(100, Number(verMatch[1] || verMatch[2])));
        if (aktMatch) overrides.akt = Math.max(0, Number(aktMatch[1] || aktMatch[2]));
        if (numMatch) overrides.n = parseNum(numMatch[1]);

        const state = makeAttackEffectState(info.item.name, info.level, overrides);
        if (state) effects[info.item.name] = state;
    });

    return effects;
}

function weaponAttackType(item, parsed) {
    if (item && RANGED_WEAPON_TAGS.has(item.tag)) return "Дальняя";
    if (item && item.tag === "Me") return "Ближняя";
    return (parsed.distMax || 0) > 2 ? "Дальняя" : "Ближняя";
}

function createWeaponAttack(item) {
    const parsed = parseWeaponStats(item.description);
    const attack = createAttack({
        name: item.name,
        type: weaponAttackType(item, parsed),
        distMin: parsed.distMin,
        distMax: parsed.distMax,
        damageType: parsed.damageType,
        atk: parsed.atk,
        ks: parsed.ks,
        tchn: parsed.tchn,
        avh: Math.max(1, parsed.avh || 1),
        kc: Math.max(1, parsed.kc || 1),
        ignDef: 0,
        ignUkl: 0
    });
    attack.effects = parseWeaponEffects(item.description);
    attack.linkedGearId = `weapons:${item.id}`;
    return attack;
}

// Единое создание состояния эффекта — используется и в редакторе, и при разборе оружия.
function makeAttackEffectState(name, level, overrides = {}) {
    const item = findAttackEffect(name);
    if (!item) return null;
    return {
        n: overrides.n !== undefined ? overrides.n : item.defN,
        ver: overrides.ver !== undefined ? overrides.ver : item.defVer,
        akt: overrides.akt !== undefined ? overrides.akt : 1,
        baseCost: item.baseCost,
        step: item.step,
        isInfinite: false,
        isPermanent: item.isPermanent || false,
        isItemProperty: item.isItemProperty || false,
        hideN: item.hideN || false,
        hideVer: item.hideVer || false,
        hideAkt: item.hideAkt || false,
        linearVer: item.linearVer || false,
        priority: level
    };
}


function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
}
function jsAttr(value) { return JSON.stringify(String(value ?? "")).replace(/"/g, "&quot;"); }
function readNum(id, fallback = 0) {
    const el = document.getElementById(id);
    if (!el) return fallback;
    const value = Number(el.value);
    return Number.isFinite(value) ? value : fallback;
}
function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (el && value !== undefined && value !== null) el.value = value;
}
function signed(value) {
    const n = Number(value) || 0;
    return n >= 0 ? `+${n}` : `${n}`;
}
function getDamageMult(type) { return DAMAGE_TYPES_INFO[type] ? DAMAGE_TYPES_INFO[type].mult : 1.0; }
function attackTypeMult(type) { return ATTACK_TYPES[type] ? ATTACK_TYPES[type].mult : 1.0; }

function getGlobalStats() {
    return {
        atk: readNum("globalAtk", 0), ks: readNum("globalKs", 0), tchn: readNum("globalTchn", 0),
        avh: readNum("globalAvh", 0), kc: readNum("globalKc", 0)
    };
}

function effectiveAttackStats(attack) {
    const global = getGlobalStats();
    const hasNoDamage = !!attack.effects["Без урона"];
    const hasGrenade = !!attack.effects["Граната"];

    let finalAtk = 0;
    if (!hasNoDamage) {
        finalAtk = hasGrenade ? attack.atk : (attack.atk + global.atk);
    }

    return {
        atk: finalAtk,
        ks: (hasNoDamage || hasGrenade) ? 0 : attack.ks + global.ks,
        tchn: hasGrenade ? 0 : attack.tchn + global.tchn,
        avh: attack.avh + global.avh,
        kc: (hasNoDamage || hasGrenade) ? 1 : attack.kc + global.kc
    };
}

function hasGlobalStats() { return Object.values(getGlobalStats()).some(value => value !== 0); }

function renderAttributes() {
    const attrsDiv = document.getElementById("attrsContainer");
    attrsDiv.innerHTML = "";
    ATTRIBUTES.forEach(attr => {
        const div = document.createElement("div");
        div.innerHTML = `
            <label>${esc(attr)}</label>
            <input type="number" class="attr-input" data-name="${esc(attr)}" value="5" min="0" max="10" oninput="handleAttrInput()">
        `;
        attrsDiv.appendChild(div);
    });
}

function handleAttrInput() { recalcStats(); }

function diceThresholdText(ver) {
    const v = Math.min(100, Math.max(1, Number(ver) || 1));
    if (v >= 100) return "Полный иммунитет (любой бросок)";
    return `куб Удачи ${101 - v}–100`;
}

function renderImmunities() {
    const catalog = document.getElementById("immunityCatalog");
    if (!catalog) return;

    const known = new Set();
    let html = "";

    IMMUNITY_GROUPS.forEach(group => {
        html += `
            <div class="priority-block immunity-group">
                <div class="priority-header ${group.css}">${esc(group.title)}</div>
                <div class="effects-grid">
                    ${group.items.map(item => {
                        known.add(item.name);
                        return renderImmunityChip(item.name, item.desc, item.cost100);
                    }).join("")}
                </div>
            </div>
        `;
    });

    const custom = Object.keys(immunities).filter(name => !known.has(name));
    if (custom.length) {
        html += `
            <div class="priority-block immunity-group">
                <div class="priority-header p3-bg">Свои резисты</div>
                <div class="effects-grid">
                    ${custom.map(name => renderImmunityChip(name, "Пользовательский резист к эффекту.", immunities[name].cost100 || CUSTOM_IMMUNITY_COST_100)).join("")}
                </div>
            </div>
        `;
    }

    catalog.innerHTML = html;
    const badge = document.getElementById("immunityCountBadge");
    if (badge) {
        const selected = Object.keys(immunities).length;
        const total = IMMUNITY_GROUPS.reduce((sum, group) => sum + group.items.length, 0) + custom.length;
        badge.textContent = `${selected} / ${total}`;
    }
    renderImmunitySettings();
}

function renderImmunityChip(name, desc, cost100) {
    const active = !!immunities[name];
    return `
        <div class="effect-chip immunity-chip ${active ? "active" : ""}" data-immunity-name="${esc(name)}" onclick="toggleImmunityChip(event, ${jsAttr(name)})">
            <div class="effect-top">
                <span>${esc(name)}</span>
                <input type="checkbox" ${active ? "checked" : ""} onchange="toggleImmunity(${jsAttr(name)}, this.checked)">
            </div>
            <div class="effect-desc">${esc(desc)}</div>
        </div>
    `;
}

function renderImmunitySettings() {
    const settings = document.getElementById("immunitySettings");
    if (!settings) return;

    const names = Object.keys(immunities);
    if (!names.length) { settings.innerHTML = ""; return; }

    settings.innerHTML = `
        <label style="color: var(--accent); margin-bottom: 6px;">Настройка выбранных резистов</label>
        ${names.map(name => {
            const item = immunities[name];
            const ver = item.ver ?? IMMUNITY_BALANCE.defaultVer;
            const cost = immunityEffectiveCost(item);
            return `
                <div class="immunity-settings-row">
                    <div class="eff-name-col">
                        <strong>${esc(name)}</strong>
                        <div class="eff-desc" data-immunity-desc="${esc(name)}">Срабатывает при защите: <b>${diceThresholdText(ver)}</b>.</div>
                    </div>
                    <div>
                        <label>ВЕР (%)</label>
                        <input type="number" value="${ver}" min="1" max="100" oninput="updateImmunityVer(${jsAttr(name)}, this.value)">
                    </div>
                    <div class="eff-cost-badge" data-immunity-cost="${esc(name)}">${cost} оч.</div>
                    <button type="button" class="btn-del" title="Удалить резист" onclick="removeImmunity(${jsAttr(name)})">✕</button>
                </div>
            `;
        }).join("")}
    `;
}

function toggleImmunityChip(event, name) {
    if (event.target.tagName === "INPUT") return;
    const chip = event.currentTarget;
    const cb = chip.querySelector('input[type="checkbox"]');
    cb.checked = !cb.checked;
    toggleImmunity(name, cb.checked);
}

function toggleImmunity(name, isChecked) {
    if (isChecked) {
        const item = findImmunity(name);
        immunities[name] = {
            name, cost100: item ? item.cost100 : CUSTOM_IMMUNITY_COST_100,
            desc: item ? item.desc : "Пользовательский резист.", ver: IMMUNITY_BALANCE.defaultVer
        };
    } else { delete immunities[name]; }
    renderImmunities();
    recalcStats();
}

function updateImmunityVer(name, value) {
    const item = immunities[name];
    if (!item) return;
    item.ver = Math.min(100, Math.max(1, Number(value) || 1));
    
    const badge = document.querySelector(`[data-immunity-cost="${name}"]`);
    if (badge) badge.textContent = `${immunityEffectiveCost(item)} оч.`;
    const descEl = document.querySelector(`[data-immunity-desc="${name}"]`);
    if (descEl) descEl.innerHTML = `Срабатывает при защите: <b>${diceThresholdText(item.ver)}</b>.`;
    
    recalcStats();
}

function removeImmunity(name) { delete immunities[name]; renderImmunities(); recalcStats(); }

function immunityEffectiveCost(item) {
    const base100 = item.cost100 || CUSTOM_IMMUNITY_COST_100;
    const ver = Math.min(100, Math.max(1, item.ver ?? IMMUNITY_BALANCE.defaultVer));
    return Math.max(IMMUNITY_BALANCE.effectiveMinCost, Math.round(base100 * Math.pow(ver / 100, IMMUNITY_BALANCE.effectiveExponent)));
}

function immunityLabel(name) {
    const item = immunities[name];
    if (!item) return name;
    const ver = item.ver ?? IMMUNITY_BALANCE.defaultVer;
    return ver >= 100 ? `${name} (Иммунитет 100%)` : `${name} (ВЕР ${ver}% · ${diceThresholdText(ver)})`;
}

function addCustomImmunity() {
    const input = document.getElementById("customImmunityInput");
    const name = input.value.trim();
    if (!name) return;
    if (!immunities[name]) {
        immunities[name] = { name, cost100: CUSTOM_IMMUNITY_COST_100, desc: "Пользовательский резист.", ver: IMMUNITY_BALANCE.defaultVer };
    }
    input.value = "";
    renderImmunities();
    recalcStats();
}

function renderPassiveEffects() {
    const catalog = document.getElementById("passiveEffectsCatalog");
    if (!catalog) return;
    catalog.innerHTML = `
        <div class="effects-grid">
            ${PASSIVE_EFFECTS.map(item => {
                const active = !!passiveEffects[item.name];
                return `
                    <div class="effect-chip ${active ? "active" : ""}" onclick="togglePassiveChip(event, ${jsAttr(item.name)})">
                        <div class="effect-top">
                            <span>${esc(item.name)}</span>
                            <input type="checkbox" ${active ? "checked" : ""} onchange="togglePassiveEffect(${jsAttr(item.name)}, this.checked)">
                        </div>
                        <div class="effect-desc">${esc(item.desc)}</div>
                        <div class="mini-cost">${passiveCost(item)} оч.</div>
                    </div>
                `;
            }).join("")}
        </div>
    `;
}

function togglePassiveChip(event, name) {
    if (event.target.tagName === "INPUT") return;
    const chip = event.currentTarget;
    const cb = chip.querySelector('input[type="checkbox"]');
    cb.checked = !cb.checked;
    togglePassiveEffect(name, cb.checked);
}

function togglePassiveEffect(name, isChecked) {
    if (isChecked) {
        const item = findPassive(name);
        if (item) passiveEffects[name] = { name, baseCost: item.baseCost };
    } else { delete passiveEffects[name]; }
    renderPassiveEffects();
    recalcStats();
}

function passiveCost(item) { return Math.round((item.baseCost || 0) * BAL.passives.costMultiplier); }

// Слабости моба: дают бюджет, но делают его уязвимым.
function damageWeaknessItems() {
    return Object.keys(DAMAGE_TYPES_INFO).map(name => ({
        name,
        desc: DAMAGE_TYPES_INFO[name].desc,
        points: DAMAGE_WEAKNESS_POINTS[name] ?? CUSTOM_WEAKNESS_POINTS
    }));
}

function findWeakness(name) {
    const damage = damageWeaknessItems().find(item => item.name === name);
    if (damage) return { ...damage, kind: "damage" };
    const body = BODY_PART_WEAKNESSES.find(item => item.name === name);
    if (body) return { ...body, kind: "body" };
    return null;
}

function weaknessLabel(item) {
    return `${item.name}`;
}

function weaknessPoints(item) {
    const known = findWeakness(item.name);
    return known ? known.points : Math.max(0, Number(item.points) || CUSTOM_WEAKNESS_POINTS);
}

function calculateWeaknessBonus() {
    return Object.values(weaknesses).reduce((sum, item) => sum + weaknessPoints(item), 0);
}

function updateWeaknessCostNote() {
    const note = document.getElementById("weaknessCostNote");
    if (!note) return;
    const bonus = calculateWeaknessBonus();
    note.textContent = bonus > 0
        ? `Слабости дают +${bonus} оч. бюджета`
        : "Выберите слабости, чтобы получить дополнительные очки бюджета";
}

function renderWeaknessChip(item) {
    const active = !!weaknesses[item.name];
    return `
        <div class="effect-chip weakness-chip ${active ? "active" : ""}" onclick="toggleWeaknessChip(event, ${jsAttr(item.name)})">
            <div class="effect-top">
                <span>${esc(item.name)}</span>
                <input type="checkbox" ${active ? "checked" : ""} onchange="toggleWeakness(${jsAttr(item.name)}, this.checked)">
            </div>
            <div class="effect-desc">${esc(item.desc)}</div>
            <!-- <div class="mini-cost">+${weaknessPoints(item)} оч.</div> -->
        </div>
    `;
}

function renderWeaknesses() {
    const catalog = document.getElementById("weaknessCatalog");
    if (!catalog) return;

    const custom = Object.values(weaknesses).filter(item => item.kind === "custom");
    catalog.innerHTML = `
        <div class="priority-block">
            <div class="priority-header p3-bg">Слабости к типам урона</div>
            <div class="effects-grid">${damageWeaknessItems().map(renderWeaknessChip).join("")}</div>
        </div>
        <div class="priority-block">
            <div class="priority-header p2-bg">Слабости к частям тела</div>
            <div class="effects-grid">${BODY_PART_WEAKNESSES.map(renderWeaknessChip).join("")}</div>
        </div>
        <div class="priority-block">
            <div class="priority-header p4-bg">Свои слабости</div>
            <div class="block-head">
                <label>Своя слабость <span class="hint">+${CUSTOM_WEAKNESS_POINTS} оч.</span></label>
                <div class="custom-weakness">
                    <input type="text" id="customWeaknessInput" placeholder="Например, уязвимость к огню" onkeydown="if(event.key==='Enter') addCustomWeakness()">
                    <button type="button" class="btn btn-small btn-outline" onclick="addCustomWeakness()">+</button>
                </div>
            </div>
            ${custom.length
                ? `<div class="effects-grid">${custom.map(renderWeaknessChip).join("")}</div>`
                : '<div class="empty-effects">Своих слабостей нет.</div>'}
        </div>
        <div class="cost-note" id="weaknessCostNote"></div>
    `;
    updateWeaknessCostNote();
}

function toggleWeaknessChip(event, name) {
    if (event.target.tagName === "INPUT") return;
    const chip = event.currentTarget;
    const cb = chip.querySelector('input[type="checkbox"]');
    cb.checked = !cb.checked;
    toggleWeakness(name, cb.checked);
}

function toggleWeakness(name, isChecked) {
    if (isChecked) {
        const item = findWeakness(name);
        weaknesses[name] = item
            ? { name, points: item.points, kind: item.kind, desc: item.desc }
            : { name, points: CUSTOM_WEAKNESS_POINTS, kind: "custom", desc: "Пользовательская слабость." };
    } else { delete weaknesses[name]; }
    renderWeaknesses();
    recalcStats();
}

function addCustomWeakness() {
    const input = document.getElementById("customWeaknessInput");
    if (!input) return;
    const name = input.value.trim();
    if (!name) return;
    if (!weaknesses[name]) {
        const item = findWeakness(name);
        weaknesses[name] = item
            ? { name, points: item.points, kind: item.kind, desc: item.desc }
            : { name, points: CUSTOM_WEAKNESS_POINTS, kind: "custom", desc: "Пользовательская слабость." };
    }
    input.value = "";
    renderWeaknesses();
    recalcStats();
}

function toggleAllAttacks() {
    const detailsList = document.querySelectorAll('.attack-effects');
    if (detailsList.length === 0) return;
    
    // Проверяем, открыт ли хотя бы один
    const isAnyOpen = Array.from(detailsList).some(d => d.open);
    
    // Если хоть один открыт — закрываем все. Иначе — открываем все.
    detailsList.forEach(d => d.open = !isAnyOpen);
}

function renderAttacks() {
    const container = document.getElementById("attacksContainer");
    if (!container) return;

    const openStates = {};
    container.querySelectorAll('.attack-editor').forEach(editor => {
        const id = editor.dataset.attackId;
        const details = editor.querySelector('.attack-effects');
        if (details) openStates[id] = details.open;
    });

    if (!attacks.length) {
        container.innerHTML = `
            <div class="empty-state">
                <div>Атаки пока не добавлены.</div>
                <button type="button" class="btn btn-small" onclick="addAttack()">+ Добавить атаку</button>
            </div>
        `;
        return;
    }

    container.innerHTML = attacks.map((attack, index) => renderAttackEditor(attack, index, openStates[attack.id])).join("");
    updateAllAttackCostDisplays();
}

function renderAttackEditor(attack, index, wasOpen = null) {
    const typeOptions = Object.entries(ATTACK_TYPES).map(([name, info]) =>
        `<option value="${esc(name)}" ${attack.type === name ? "selected" : ""}>${info.icon} ${esc(name)}</option>`
    ).join("");

    const damageOptions = Object.keys(DAMAGE_TYPES_INFO).map(name =>
        `<option value="${esc(name)}" ${attack.damageType === name ? "selected" : ""}>${esc(name)}</option>`
    ).join("");

    const effectCount = Object.keys(attack.effects).length;
    const typeInfo = ATTACK_TYPES[attack.type] || ATTACK_TYPES["Ближняя"];
    const isOpen = wasOpen !== null ? wasOpen : effectCount > 0;
    const hasNoDamage = !!attack.effects["Без урона"];
    const hasGrenade = !!attack.effects["Граната"];

        return `
        <div class="attack-editor" data-attack-id="${attack.id}" 
             ondragover="handleDragOver(event)" 
             ondragleave="handleDragLeave(event)"
             ondrop="handleDrop(event, ${attack.id})">
            <div class="attack-editor-head">
                <div class="attack-number" 
                     draggable="true" 
                     ondragstart="handleDragStart(event, ${attack.id})" 
                     ondragend="handleDragEnd(event)"
                     title="Перетащите, чтобы изменить порядок">
                    ${index + 1}
                </div>
                <input type="text" class="attack-name-input" data-field="name" value="${esc(attack.name)}"
                    placeholder="Название атаки" oninput="updateAttackField(${attack.id}, 'name', this.value)">
                <div class="attack-head-actions">
                    <button type="button" class="btn-icon" title="Переместить выше" onclick="moveAttack(${attack.id}, -1)">↑</button>
                    <button type="button" class="btn-icon" title="Переместить ниже" onclick="moveAttack(${attack.id}, 1)">↓</button>
                    <button type="button" class="btn-icon" title="Дублировать атаку" onclick="duplicateAttack(${attack.id})">⧉</button>
                    <button type="button" class="btn-icon danger" title="Удалить атаку" onclick="removeAttack(${attack.id})">✕</button>
                </div>
            </div>

            <div class="attack-hint">${typeInfo.icon} ${esc(typeInfo.desc)}</div>

            <div class="grid-4">
                <div>
                    <label>Тип атаки</label>
                    <select data-field="type" onchange="updateAttackType(${attack.id}, this.value)">${typeOptions}</select>
                </div>
                <div>
                    <label>Дистанция (Range ОП)</label>
                    <div class="range-inputs">
                        <input type="number" data-field="distMin" value="${attack.distMin}" min="0" max="25"
                            oninput="updateAttackField(${attack.id}, 'distMin', this.value)">
                        <span class="range-separator">-</span>
                        <input type="number" data-field="distMax" value="${attack.distMax}" min="0" max="30"
                            oninput="updateAttackField(${attack.id}, 'distMax', this.value)">
                    </div>
                </div>
                <div>
                    <label>Тип урона</label>
                    <select data-field="damageType" onchange="updateAttackField(${attack.id}, 'damageType', this.value)">${damageOptions}</select>
                </div>
                <div style="${hasNoDamage ? 'display: none;' : ''}">
                    <label>АТК (х1.5 оч.)</label>
                    <input type="number" data-field="atk" value="${attack.atk}" min="-100"
                        oninput="updateAttackField(${attack.id}, 'atk', this.value)">
                </div>
            </div>

            <div class="grid-4">
                <div>
                    <label title="Каждый дополнительный удар: +80% к стоимости атаки">АВХ (атак)</label>
                    <input type="number" data-field="avh" value="${attack.avh}" min="1" step="1"
                        oninput="updateAttackField(${attack.id}, 'avh', this.value)">
                </div>
                <div style="${hasNoDamage || hasGrenade ? 'display: none;' : ''}">
                    <label>КШ (х2.0 оч.)</label>
                    <input type="number" data-field="ks" value="${attack.ks}" min="0" max="100"
                        oninput="updateAttackField(${attack.id}, 'ks', this.value)">
                </div>
                <div style="${hasNoDamage || hasGrenade ? 'display: none;' : ''}">
                    <label title="Каждая дополнительная цель: +30% к стоимости атаки (доп. цели ситуативны)">КЦ (целей)</label>
                    <input type="number" data-field="kc" value="${attack.kc}" min="1" step="1"
                        oninput="updateAttackField(${attack.id}, 'kc', this.value)">
                </div>
                <div style="${hasGrenade ? 'display: none;' : ''}">
                    <label>ТЧН (х1.0 оч.)</label>
                    <input type="number" data-field="tchn" value="${attack.tchn}"
                        oninput="updateAttackField(${attack.id}, 'tchn', this.value)">
                </div>
            </div>

            <div class="grid-4" style="margin-top: 8px;">
                <div>
                    <label>Игнор Деф.П (гарант · х4)</label>
                    <input type="number" data-field="ignDef" value="${attack.ignDef}" min="0"
                        oninput="updateAttackField(${attack.id}, 'ignDef', this.value)">
                </div>
                <div>
                    <label>Игнор УКЛ (гарант · х3)</label>
                    <input type="number" data-field="ignUkl" value="${attack.ignUkl}" min="0"
                        oninput="updateAttackField(${attack.id}, 'ignUkl', this.value)">
                </div>
            </div>

            <details class="attack-effects" ${isOpen ? "open" : ""}>
                <summary>
                    <span>Эффекты атаки (накладываемые при уроне)</span>
                    <span class="badge">${effectCount}</span>
                </summary>
                <div class="effects-catalog">
                    ${renderAttackEffectsCatalog(attack)}
                </div>
                <div class="selected-effects">
                    <label>Настройка накладываемых эффектов</label>
                    ${renderAttackSelectedEffects(attack)}
                </div>
            </details>

            <div class="effective-stats" data-role="effective-stats"></div>

            <div class="attack-cost-line">
                <span>Статы и дистанция: <b data-role="attack-stat-cost">0</b> оч.</span>
                <span>Эффекты: <b data-role="attack-effect-cost">0</b> оч.</span>
                <span class="attack-total">Итого за атаку: <b data-role="attack-total-cost">0</b> оч.</span>
            </div>
        </div>
    `;
}

function renderAttackEffectsCatalog(attack) {
    return EFFECT_GROUPS.map(group => `
        <div class="priority-block">
            <div class="priority-header ${group.css}">${esc(group.title)}</div>
            <div class="effects-grid">
                ${group.items.map(item => {
                    const active = !!attack.effects[item.name];
                    return `
                        <div class="effect-chip ${active ? "active" : ""}" onclick="toggleAttackChip(event, ${attack.id}, ${jsAttr(item.name)}, ${group.level})">
                            <div class="effect-top">
                                <span>${esc(item.name)}</span>
                                <input type="checkbox" ${active ? "checked" : ""} onchange="toggleAttackEffect(${attack.id}, ${jsAttr(item.name)}, this.checked, ${group.level})">
                            </div>
                            <div class="effect-desc">${esc(item.desc)}</div>
                        </div>
                    `;
                }).join("")}
            </div>
        </div>
    `).join("");
}

function renderAttackSelectedEffects(attack) {
    const names = Object.keys(attack.effects);
    if (!names.length) return `<div class="empty-effects">Эффекты не выбраны — откройте каталог выше.</div>`;

    return names.map(name => {
        const eff = attack.effects[name];
        const item = findAttackEffect(name);
        const cost = calculateAttackEffectCost(attack, name);
        
        const showN = !eff.hideN;
        const showVer = !eff.hideVer;
        const showAkt = !eff.hideAkt;

        return `
            <div class="selected-effect-row">
                <div class="eff-name-col">
                    <b>${esc(name)}</b>
                    <div class="eff-desc">${esc(item ? item.desc : "")}</div>
                </div>
                
                ${showN ? `
                <div>
                    <label>${name === "Граната" ? "Кол-во (n)" : "Параметр (n)"}</label>
                    <input type="number" value="${eff.n}" min="0" step="any"
                        oninput="updateAttackEffectVal(${attack.id}, ${jsAttr(name)}, 'n', this.value)">
                </div>` : ''}
                
                ${showVer ? `
                <div>
                    <label>ВЕР (%)</label>
                    <input type="number" value="${eff.ver}" min="1" max="100"
                        oninput="updateAttackEffectVal(${attack.id}, ${jsAttr(name)}, 'ver', this.value)">
                </div>` : ''}
                
                ${showAkt ? `
                <div>
                    ${eff.isPermanent ? `
                        <label>Длительность</label>
                        <div style="color: var(--accent); font-weight: bold; padding: 8px 0; font-size: 0.85rem;" title="Эффект срабатывает в момент нанесения урона и не имеет длительности в ходах">Срабатывает при атаке</div>
                    ` : `
                        <label>АКТ (ходы)</label>
                        <input type="number" value="${eff.akt}" min="0" ${eff.isInfinite ? "disabled" : ""}
                            oninput="updateAttackEffectVal(${attack.id}, ${jsAttr(name)}, 'akt', this.value)">
                        <label class="inf-label">
                            <input type="checkbox" ${eff.isInfinite ? "checked" : ""}
                                onchange="toggleAttackInfinite(${attack.id}, ${jsAttr(name)}, this.checked)">
                            ∞
                        </label>
                    `}
                </div>` : ''}

                <div class="eff-cost-badge" data-effect-cost="${esc(name)}">${cost} оч.</div>
                <button type="button" class="btn-del" title="Удалить эффект"
                    onclick="removeAttackEffect(${attack.id}, ${jsAttr(name)})">✕</button>
            </div>
        `;
    }).join("");
}

function toggleAttackChip(event, attackId, name, level) {
    if (event.target.tagName === "INPUT") return;
    const chip = event.currentTarget;
    const cb = chip.querySelector('input[type="checkbox"]');
    cb.checked = !cb.checked;
    toggleAttackEffect(attackId, name, cb.checked, level);
}

function toggleAttackEffect(attackId, name, isChecked, level) {
    const attack = getAttack(attackId);
    if (!attack) return;

    if (isChecked) {
        const item = findAttackEffect(name);
        if (!item) return;
        attack.effects[name] = makeAttackEffectState(name, item.level);
    } else { delete attack.effects[name]; }

    renderAttacks();
    recalcStats();
}

function removeAttackEffect(attackId, name) {
    const attack = getAttack(attackId);
    if (!attack) return;
    delete attack.effects[name];
    renderAttacks();
    recalcStats();
}

function updateAttackEffectVal(attackId, name, field, value) {
    const attack = getAttack(attackId);
    if (!attack || !attack.effects[name]) return;
    attack.effects[name][field] = Number(value);
    updateAttackCostDisplay(attack);
    recalcStats();
}

function toggleAttackInfinite(attackId, name, isInfinite) {
    const attack = getAttack(attackId);
    if (!attack || !attack.effects[name]) return;
    attack.effects[name].isInfinite = isInfinite;
    renderAttacks();
    recalcStats();
}

function updateAttackType(attackId, type) {
    const attack = getAttack(attackId);
    if (!attack) return;
    attack.type = type;
    if (type === "Ближняя" && attack.distMax > 2 && attack.distMin === 0) { attack.distMax = 0; }
    else if (type === "Дальняя" && attack.distMax <= 1) { attack.distMin = 1; attack.distMax = 7; }
    else if (type === "Особая" && attack.distMax <= 1) { attack.distMin = 0; attack.distMax = 5; }
    renderAttacks();
    recalcStats();
}

function updateAttackField(attackId, field, value) {
    const attack = getAttack(attackId);
    if (!attack) return;
    const numericFields = ["distMin", "distMax", "atk", "ks", "tchn", "avh", "kc", "ignDef", "ignUkl"];
    attack[field] = numericFields.includes(field) ? Number(value) : value;
    recalcStats();
}

function addAttack() {
    attacks.push(createAttack({
        name: `Атака ${attacks.length + 1}`,
        ...ATTACK_COSTS.newAttack
    }));
    renderAttacks();
    recalcStats();
}

function duplicateAttack(attackId) {
    const source = getAttack(attackId);
    if (!source) return;
    attacks.push(createAttack({
        name: `${source.name} (копия)`, type: source.type, distMin: source.distMin, distMax: source.distMax,
        damageType: source.damageType, atk: source.atk, ks: source.ks, tchn: source.tchn, avh: source.avh, kc: source.kc,
        ignDef: source.ignDef, ignUkl: source.ignUkl, effects: source.effects
    }));
    renderAttacks();
    recalcStats();
}

function removeAttack(attackId) {
    attacks = attacks.filter(a => a.id !== Number(attackId));
    renderAttacks();
    recalcStats();
}

// Перемещение атаки кнопками — удобно на телефоне, где drag-and-drop недоступен.
function moveAttack(attackId, delta) {
    const from = attacks.findIndex(a => a.id === Number(attackId));
    const to = from + delta;
    if (from < 0 || to < 0 || to >= attacks.length) return;
    const [moved] = attacks.splice(from, 1);
    attacks.splice(to, 0, moved);
    renderAttacks();
    recalcStats();
}

function avhCostFactor(avh) {
    return 1 + Math.max(0, (Number(avh) || 1) - 1) * AVH_STEP_COST;
}

function kcCostFactor(kc) {
    return 1 + Math.max(0, (Number(kc) || 1) - 1) * KC_STEP_COST;
}

function odCostFactor(od) {
    const extra = Math.max(0, (Number(od) || 1) - 1);
    return 1 + extra * OD_LINEAR_COST + extra * extra * OD_QUAD_COST;
}

function attackCostBreakdown(attack) {
    const global = getGlobalStats();
    const hasNoDamage = !!attack.effects["Без урона"];
    const hasGrenade = !!attack.effects["Граната"];

    // Итоговые значения с учётом глобальных бонусов.
    const totalAvh = (Number(attack.avh) || 1) + global.avh;

    // У Гранаты и Без урона КЦ всегда 1. В остальных случаях — локальный + глобальный.
    const totalKc = (hasNoDamage || hasGrenade) ? 1 : ((Number(attack.kc) || 1) + global.kc);

    const od = Math.max(1, readNum("statOd", 1) || 1);

    const avh = avhCostFactor(totalAvh);
    const kc = kcCostFactor(totalKc);
    const odFactor = odCostFactor(od);
    const damage = getDamageMult(attack.damageType);
    const type = attackTypeMult(attack.type);

    return {
        avh, kc, od: odFactor, damage, type,
        total: Math.max(1, avh * kc * odFactor * damage) * type
    };
}

function attackCostMultiplier(attack) {
    return attackCostBreakdown(attack).total;
}

function attackDistanceCost(attack) {
    const minD = Math.max(0, Number(attack.distMin) || 0);
    const maxD = Math.max(minD, Number(attack.distMax) || 0);
    const span = maxD - minD;

    if (attack.type === "Ближняя") { return Math.round(maxD * DISTANCE_COSTS.meleePerOp); }
    else if (attack.type === "Дальняя") {
        let cost = span * DISTANCE_COSTS.rangedSpanPerOp;
        if (maxD > DISTANCE_COSTS.rangedFarThreshold) cost += (maxD - DISTANCE_COSTS.rangedFarThreshold) * DISTANCE_COSTS.rangedOver7PerOp;
        if (maxD > DISTANCE_COSTS.rangedVeryFarThreshold) cost += (maxD - DISTANCE_COSTS.rangedVeryFarThreshold) * DISTANCE_COSTS.rangedOver17PerOp;
        if (minD === 0 && maxD >= DISTANCE_COSTS.rangedShortMax) cost += DISTANCE_COSTS.rangedShortBonus;
        return Math.round(cost);
    } else { return Math.round(span * DISTANCE_COSTS.specialSpanPerOp); }
}

// Функция прогрессивной стоимости (кривой)
function calcCurvedCost(value, baseCost, threshold = 0) {
    if (value <= 0) return 0;
    
    // Насколько значение превысило безопасный порог
    const penaltyValue = Math.max(0, value - threshold);
    
    // Квадратичный штраф применяется ТОЛЬКО к превышению
    return Math.round((value + (penaltyValue * penaltyValue) / CURVE_DIVISOR) * baseCost);
}

function calculateAttackStatCost(attack) {
    const mult = attackCostMultiplier(attack);
    const hasNoDamage = !!attack.effects["Без урона"];
    const hasGrenade = !!attack.effects["Граната"];

    const atk = (hasNoDamage) ? 0 : attack.atk;
    const ks = (hasNoDamage || hasGrenade) ? 0 : attack.ks;
    const tchn = hasGrenade ? 0 : attack.tchn;

    // Пороги из balance.js.
    const statCost = Math.max(0, 
        calcCurvedCost(atk, ATTACK_ATK_COST, ATTACK_THRESHOLDS.localAtk) + 
        calcCurvedCost(ks, ATTACK_KS_COST, ATTACK_THRESHOLDS.localKs) + 
        calcCurvedCost(tchn, ATTACK_TCHN_COST, ATTACK_THRESHOLDS.localTchn)
    );
    
    const ignDefCost = (Number(attack.ignDef) || 0) * IGNORE_DEF_COST;
    const ignUklCost = (Number(attack.ignUkl) || 0) * IGNORE_UKL_COST;
    return Math.round((statCost + ignDefCost + ignUklCost) * (STAT_COST_FACTOR * mult) + attackDistanceCost(attack));
}

function calculateGlobalAttackStatCost() {
    const global = getGlobalStats();
    let totalEquivalentCost = 0;
    
    attacks.forEach(attack => {
        const mult = attackCostMultiplier(attack);
        const hasNoDamage = !!attack.effects["Без урона"];
        const hasGrenade = !!attack.effects["Граната"];
        
        const gAtk = hasNoDamage ? 0 : global.atk;
        const gKs = (hasNoDamage || hasGrenade) ? 0 : global.ks;
        const gTchn = hasGrenade ? 0 : global.tchn;
        // Порог 30 для АТК.
        const statCost = Math.max(0, 
            calcCurvedCost(gAtk, ATTACK_ATK_COST, ATTACK_THRESHOLDS.globalAtk) + 
            calcCurvedCost(gKs, ATTACK_KS_COST, 0) + 
            calcCurvedCost(gTchn, ATTACK_TCHN_COST, 0)
        );
        
        totalEquivalentCost += statCost * (STAT_COST_FACTOR * mult);
        
        totalEquivalentCost += Math.max(0, global.avh) * GLOBAL_AVH_BASE;
        if (!hasNoDamage && !hasGrenade) {
            totalEquivalentCost += Math.max(0, global.kc) * GLOBAL_KC_BASE;
        }
    });
    
    const finalCost = totalEquivalentCost * GLOBAL_COST_FACTOR;
    return Math.round(finalCost);
}

function calculateAttackEffectCost(attack, name) {
    const eff = attack.effects[name];
    if (!eff) return 0;

    let verFactor = eff.ver / 100;
    
    // Если у эффекта включен флаг linearVer, используем чистую линейку
    if (eff.linearVer) {
        // Начинается с 0.5 (50%) и растет до 1.0 (100%)
        verFactor = EFFECT_FORMULA.linearVerStart + (eff.ver / EFFECT_FORMULA.linearVerDivisor); 
    } else if (eff.ver > EFFECT_FORMULA.verBase) {
        // Старая экспонента для остальных эффектов
        verFactor = Math.pow(eff.ver / EFFECT_FORMULA.verBase, EFFECT_FORMULA.verExponent);
    }

    const stepMult = eff.n / eff.step;
    
    let aktMult = Math.max(1, eff.akt);
    if (eff.isInfinite) aktMult = INFINITE_MULT;
    if (eff.isPermanent) aktMult = PERMANENT_MULT;

    const attackMult = attackCostMultiplier(attack);
    return Math.round(eff.baseCost * stepMult * verFactor * aktMult * attackMult);
}

function calculateAttackEffectsCost(attack) {
    return Object.keys(attack.effects).reduce((sum, name) => sum + calculateAttackEffectCost(attack, name), 0);
}

function calculateAttackCost(attack) {
    return calculateAttackStatCost(attack) + calculateAttackEffectsCost(attack);
}

function calculateImmunityCost() {
    return Object.values(immunities).reduce((sum, item) => sum + immunityEffectiveCost(item), 0);
}

function calculatePassiveCost() {
    return Object.keys(passiveEffects).reduce((sum, name) => {
        const item = findPassive(name);
        return sum + (item ? passiveCost(item) : 0);
    }, 0);
}

function updateAttackCostDisplay(attack) {
    const card = document.querySelector(`.attack-editor[data-attack-id="${attack.id}"]`);
    if (!card) return;

    const statCost = calculateAttackStatCost(attack);
    const effectCost = calculateAttackEffectsCost(attack);
    const totalCost = statCost + effectCost;

    const statEl = card.querySelector('[data-role="attack-stat-cost"]');
    const effectEl = card.querySelector('[data-role="attack-effect-cost"]');
    const totalEl = card.querySelector('[data-role="attack-total-cost"]');
    if (statEl) {
        const b = attackCostBreakdown(attack);
        statEl.textContent = statCost;
        statEl.title = `База + Дистанция. Множитель атаки: ${b.total.toFixed(2)} (АВХ ×${b.avh.toFixed(2)} · КЦ ×${b.kc.toFixed(2)} · ОД ×${b.od.toFixed(2)} · урон ×${b.damage.toFixed(2)} · тип ×${b.type.toFixed(2)})`;
    }
    if (effectEl) {
        effectEl.textContent = effectCost;
        effectEl.title = `Сумма всех наложенных эффектов`;
    }
    if (totalEl) {
        totalEl.textContent = totalCost;
        totalEl.title = `Статы (${statCost}) + Эффекты (${effectCost})`;
    }

    card.querySelectorAll("[data-effect-cost]").forEach(el => {
        const effName = el.dataset.effectCost;
        el.textContent = `${calculateAttackEffectCost(attack, effName)} оч.`;
    });

    const effective = effectiveAttackStats(attack);
    const effectiveEl = card.querySelector('[data-role="effective-stats"]');
    if (effectiveEl) {
        effectiveEl.innerHTML = `
            <b>Итоговые статы атаки (с учётом общих):</b>
            АТК ${esc(signed(effective.atk))} · ТЧН ${esc(signed(effective.tchn))} · КШ ${esc(signed(effective.ks))} · АВХ ${esc(effective.avh)} · КЦ ${esc(effective.kc)} · Range ${attack.distMin}-${attack.distMax} ОП
        `;
    }
}

function updateAllAttackCostDisplays() { attacks.forEach(updateAttackCostDisplay); }

function applyTierPreset() {
    isApplyingState = true;
    const tier = document.getElementById("mobTier").value;
    const mobType = document.getElementById("mobType").value;

    // Базовые статы тира берём из balance.js.
    const tierInfo = BUDGETS.tiers[tier] || BUDGETS.tiers["Новичок"];
    const preset = tierInfo.preset;

    let hp = preset.hp, defP = preset.defP, defA = preset.defA, ukl = preset.ukl;
    let atk = preset.atk, crit = preset.ks, acc = preset.tchn;
    let od = preset.od, op = preset.op, avh = preset.avh, kc = preset.kc;

    // Дальше — модификаторы типа моба.
    const typeInfo = BUDGETS.mobTypes[mobType] || {};
    const typePreset = typeInfo.preset;

    if (typePreset) {
        hp = Math.round(hp * typePreset.hpMult);
        defP = Math.round(defP * typePreset.defPMult);
        defA = Math.round(defA * typePreset.defAMult);
        ukl = Math.round(ukl * typePreset.uklMult);
        atk = Math.round(atk * typePreset.atkMult);
        crit += typePreset.ksBonus;
        acc += typePreset.tchnBonus;
    }

    if (mobType === "Элитный") {
        op = Math.min(typePreset.opMax, op + typePreset.opBonus);
        avh = Math.max(typePreset.avhMin, avh);
        kc = typePreset.kc;
    } else if (mobType === "Босс") {
        const bossTier = (typeInfo.perTier || {})[tier];
        if (bossTier) {
            op = bossTier.op ?? (op + bossTier.opBonus);
            od = bossTier.od;
            avh = bossTier.avh;
            kc = bossTier.kc;
        }
    }

    setInputValue("statHp", hp);
    setInputValue("statExtraHp", 0); 
    setInputValue("statDefP", defP);
    setInputValue("statDefA", defA);
    setInputValue("statUkl", ukl);
    setInputValue("statOd", od);
    setInputValue("statOp", op);

    attacks.forEach(attack => {
        attack.atk = atk; attack.ks = crit; attack.tchn = acc; attack.avh = avh; attack.kc = kc;
    });

    renderAttacks();
    recalcStats();
    isApplyingState = false;
}

function recalcStats() {
    const tierSelect = document.getElementById("mobTier");
    const tier = tierSelect.value;
    const tierInfo = BUDGETS.tiers[tier];
    const baseBudgetNum = tierInfo ? tierInfo.budget : 0;
    const mobType = document.getElementById("mobType").value;
    const isBoss = mobType === "Босс";
    const isElite = mobType === "Элитный";
    const typeInfo = BUDGETS.mobTypes[mobType] || {};

    let budgetBonus = 0;
    let baseAttrs = BUDGETS.baseAttrs;
    let attrBonus = 0;

    if (isElite) {
        budgetBonus = Math.round(baseBudgetNum * (typeInfo.budgetBonusMult || 0));
        attrBonus = typeInfo.attrBonus || 0;
    } else if (isBoss) {
        const bossTier = (typeInfo.perTier || {})[tier];
        if (bossTier) {
            budgetBonus = bossTier.budgetBonus;
            attrBonus = bossTier.attrBonus;
            baseAttrs = bossTier.baseAttrs;
        }
    }

    const isCharacter = unitMode === "character";
    const maxBudget = isCharacter ? Infinity : baseBudgetNum + budgetBonus + calculateWeaknessBonus();
    const maxAttrs = baseAttrs + attrBonus;

    const hp = readNum("statHp", 0);
    const extraHp = readNum("statExtraHp", 0);
    const defP = readNum("statDefP", 0);
    const defA = readNum("statDefA", 0);
    const ukl = readNum("statUkl", 0);
    const op = readNum("statOp", 0);

    const resType = document.getElementById("resType").value;
    const resActive = readNum("resActive", 0);

    let attrSum = 0;
    document.querySelectorAll(".attr-input").forEach(inp => { attrSum += Number(inp.value) || 0; });

    const baseStatsCost = Math.round((hp * STAT_COSTS.hp) + (extraHp * STAT_COSTS.extraHp) + (defP * STAT_COSTS.defP) + (defA * STAT_COSTS.defA) + (ukl * STAT_COSTS.ukl) + (op * STAT_COSTS.op));
    const attacksCost = attacks.reduce((sum, attack) => sum + calculateAttackCost(attack), 0);
    const globalAttackCost = calculateGlobalAttackStatCost();

    const globalNote = document.getElementById("globalAttackCostNote");
    if (globalNote) globalNote.textContent = `Стоимость общих параметров: ${globalAttackCost} оч.`;

    let resistanceCost = 0;
    if (resActive > 0 && resType !== "Нет") {
        resistanceCost = resType === "Все типы урона" ? Math.round(hp * STAT_COSTS.resistanceAllTypesMult) : Math.round(hp * STAT_COSTS.resistanceSingleTypeMult);
    }

    const immunityCost = calculateImmunityCost();
    const passiveCostValue = calculatePassiveCost();

    const immNote = document.getElementById("immunityCostNote");
    if (immNote) immNote.textContent = `Стоимость резистов к эффектам: ${immunityCost} оч. · Пассивные эффекты: ${passiveCostValue} оч.`;

    const totalSpent = baseStatsCost + attacksCost + globalAttackCost + resistanceCost + immunityCost + passiveCostValue;
    const gearCostValue = isCharacter ? calculateGearCost() : 0;
    currentBudget = { spent: totalSpent, max: maxBudget, gear: gearCostValue };

    const budgetDisplay = document.getElementById("budgetDisplay");
    if (isCharacter) {
        budgetDisplay.innerHTML = creditIcon(gearCostValue);
        budgetDisplay.className = "budget-val ok";
    } else {
        budgetDisplay.textContent = `${totalSpent} / ${maxBudget}`;
        budgetDisplay.className = totalSpent > maxBudget ? "budget-val over" : "budget-val ok";
    }

    const extBudget = document.getElementById("externalBudget");
    const extBudgetBar = document.getElementById("externalBudgetBar");
    const extBudgetText = document.getElementById("externalBudgetText");
    
    if (extBudget && extBudgetBar && extBudgetText) {
        if (isCharacter) {
            extBudgetText.innerHTML = creditIcon(gearCostValue);
            extBudgetBar.style.width = "0%";
            extBudget.classList.remove("over");
            extBudgetText.style.color = "var(--p3-color)";
        } else {
            extBudgetText.textContent = `${totalSpent} / ${maxBudget}`;
            extBudgetBar.style.width = `${budgetPercent()}%`;

            if (totalSpent > maxBudget) {
                extBudget.classList.add("over");
                extBudgetText.style.color = "var(--p1-color)";
            } else {
                extBudget.classList.remove("over");
                extBudgetText.style.color = "var(--ok-color)";
            }
        }
    }

    const attrBudgetDisplay = document.getElementById("attrBudgetDisplay");
    if (isCharacter) {
        attrBudgetDisplay.textContent = `${attrSum}`;
        attrBudgetDisplay.className = "budget-val ok";
    } else {
        attrBudgetDisplay.textContent = `${attrSum} / ${maxAttrs}`;
        attrBudgetDisplay.className = attrSum > maxAttrs ? "budget-val over" : "budget-val ok";
    }

    updateGearCostHint();
    updateAllAttackCostDisplays();
    updateWeaknessCostNote();
    renderOutput();
    
    // Обновляем калькулятор
    updateDamageCalc();

    // M6: Автосохранение при любом изменении
    if (!isApplyingState) {
        triggerAutoSave();
    }
}

function handleInput(id, val) { recalcStats(); }

function renderOutput() {
    const character = unitMode === "character";
    const name = document.getElementById("mobName").value.trim() || (character ? "Безымянный персонаж" : "Безымянный моб");
    const tier = document.getElementById("mobTier").value;
    const type = document.getElementById("mobType").value;
    const role = document.getElementById("mobRole").value;

    const hp = readNum("statHp", 0);
    const extraHp = readNum("statExtraHp", 0);
    const defP = readNum("statDefP", 0);
    const defA = readNum("statDefA", 0);
    const ukl = readNum("statUkl", 0);
    const od = readNum("statOd", 1);
    const op = readNum("statOp", 0);

    const resType = document.getElementById("resType").value;
    const resActive = readNum("resActive", 0);
    const notes = document.getElementById("mobNotes").value.trim();

    const attrs = [];
    document.querySelectorAll(".attr-input").forEach(inp => {
        const value = Number(inp.value) || 0;
        if (value > 0) attrs.push({ name: inp.dataset.name, value });
    });

    const immunityNames = Object.keys(immunities);
    const passiveNames = Object.keys(passiveEffects);
    const weaknessNames = unitMode === "character" ? [] : Object.values(weaknesses).map(weaknessLabel);

    const gearSnapshot = GEAR_KIND_ORDER.reduce((snapshot, kind) => {
        snapshot[kind] = gear[kind].map(entry => ({ ...entry }));
        return snapshot;
    }, {});

    updateOutputBudgetHint();

    const outData = {
        name, tier, type, role, hp, extraHp, defP, defA, ukl, od, op, resType, resActive, notes,
        attrs, immunityNames, passiveNames, weaknessNames,
        unitMode, gear: gearSnapshot
    };
    lastOutputText = buildPlainText(outData);
    document.getElementById("outputBox").textContent = lastOutputText;
    document.getElementById("outputCard").innerHTML = buildOutputHtml(outData);
}

function updateOutputBudgetHint() {
    const hint = document.getElementById("outputBudgetHint");
    if (!hint) return;
    if (unitMode === "character") {
        hint.innerHTML = `Цена снаряжения: ${creditIcon(calculateGearCost())}`;
        hint.className = "hint text-ok";
        return;
    }
    const over = currentBudget.spent > currentBudget.max;
    hint.textContent = `Бюджет: ${currentBudget.spent} / ${currentBudget.max}`;
    hint.className = `hint ${over ? "text-over" : "text-ok"}`;
}

function buildPlainText(data) {
    const lines = [];
    const isCharacter = data.unitMode === "character";
    const displayType = isCharacter ? "Персонаж" : (TYPE_RENAME[data.type] || data.type);
    lines.push(`=== ${data.name} (${displayType}) ===`);
    if (data.role) lines.push(`Роль: ${data.role}`);

    if (data.attrs.length) lines.push(`- Характеристики: ${data.attrs.map(attr => `${attr.name}: ${attr.value}`).join(", ")}`);
    
    let hpLine = `- ОЗ: ${data.hp}/${data.hp}`;
    if (data.extraHp > 0) hpLine += ` | Доп.ОЗ: ${data.extraHp}/${data.extraHp}`;
    hpLine += ` | Деф(П): ${signed(data.defP)} | Деф(А): ${signed(data.defA)} | УКЛ: ${signed(data.ukl)}`;
    lines.push(hpLine);
    lines.push(`- ОД: ${data.od} | ОП: ${data.op}`);
    
    if (data.resActive > 0 && data.resType !== "Нет") lines.push(`- Сопротивление: ${data.resType}`);

    if (isCharacter) {
        lines.push(`- Цена снаряжения: ${creditNumber(calculateGearCost())} кредитов`);
        gearPlainLines(data.gear).forEach(line => lines.push(line));
    }

    const globalStats = getGlobalStats();
    if (hasGlobalStats()) lines.push(`- Общие статы: АТК: ${signed(globalStats.atk)} | КШ: ${signed(globalStats.ks)} | ТЧН: ${signed(globalStats.tchn)}`);

    if (attacks.length > 0) {
        lines.push("");
        attacks.forEach(attack => {
            const typeInfo = ATTACK_TYPES[attack.type] || ATTACK_TYPES["Ближняя"];
            const damageInfo = DAMAGE_TYPES_INFO[attack.damageType] || { desc: "" };
            const effective = effectiveAttackStats(attack);
            
            lines.push(`── ${attack.name} [${typeInfo.icon} ${attack.type} · ${attack.distMin}-${attack.distMax} ОП] ──`);
            lines.push(`- Тип урона: ${attack.damageType}${damageInfo.desc ? ` (${damageInfo.desc})` : ""}`);
            lines.push(`- АТК: ${signed(effective.atk)} | ТЧН: ${signed(effective.tchn)} | КШ: ${signed(effective.ks)} | АВХ: ${effective.avh} | КЦ: ${effective.kc}`);
            
            if (attack.ignDef > 0 || attack.ignUkl > 0) {
                let ignParts = [];
                if (attack.ignDef > 0) ignParts.push(`Деф(П): ${attack.ignDef}`);
                if (attack.ignUkl > 0) ignParts.push(`УКЛ: ${attack.ignUkl}`);
                lines.push(`- Гарантированный игнор: ${ignParts.join(" | ")}`);
            }
            
            const effectNames = Object.keys(attack.effects);
            if (effectNames.length) {
                lines.push("- Эффекты:");
                effectNames.forEach(effectName => {
                    const eff = attack.effects[effectName];
                    let details = [];
                    if (!eff.hideN) details.push(`n: ${eff.n}`);
                    if (!eff.hideVer) details.push(`ВЕР: ${eff.ver}%`);
                    if (!eff.hideAkt) details.push(`АКТ: ${eff.isPermanent ? "при атаке" : (eff.isInfinite ? "∞" : eff.akt)}`);
                    const detailStr = details.length ? ` (${details.join(" | ")})` : "";
                    lines.push(`  • ${effectName}${detailStr}`);
                });
            } else { lines.push("- Эффекты: Нет"); }
            lines.push("");
        });
    } else {
        lines.push(""); lines.push("- Атаки: Нет"); lines.push("");
    }

    if (data.immunityNames.length) lines.push(`- Резисты: ${data.immunityNames.map(immunityLabel).join(", ")}`);
    if (data.passiveNames.length) lines.push(`- Пассивные эффекты: ${data.passiveNames.join(", ")}`);
    if (data.weaknessNames.length) lines.push(`- Слабости: ${data.weaknessNames.join(", ")}`);
    if (data.notes) lines.push(`- Примечания: ${data.notes.replace(/\n/g, " ")}`);

    return lines.join("\n");
}

function gearPlainLines(snapshot) {
    if (!snapshot) return [];
    return GEAR_KIND_ORDER.reduce((lines, kind) => {
        const list = snapshot[kind] || [];
        if (!list.length) return lines;
        const parts = list.map(entry => {
            const qty = entry.qty > 1 ? ` ×${entry.qty}` : "";
            const meta = [entry.organization, entry.iconic ? "Культовое" : ""].filter(Boolean).join(", ");
            const metaText = meta ? ` [${meta}]` : "";
            const cost = entry.cost
                ? ` — ${creditNumber(entry.cost * Math.max(1, Number(entry.qty) || 1))} кредитов`
                : "";
            return `${entry.name}${qty}${metaText}${cost}`;
        });
        lines.push(`- ${GEAR_KINDS[kind].label}: ${parts.join(", ")}`);
        return lines;
    }, []);
}

function formatMarkdown(text) {
    if (!text) return "";
    return esc(text)
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.*?)\*/g, '<i>$1</i>')
        .replace(/`(.*?)`/g, '<code style="background: var(--bg-main); padding: 2px 4px; border-radius: 4px; font-size: 0.85em;">$1</code>')
        .replace(/\n/g, '<br>');
}

function buildOutputHtml(data) {
    const statTiles = [
        statTile("ОЗ", `${data.hp}/${data.hp}`, "hp"),
        data.extraHp > 0 ? statTile("Доп.ОЗ", `${data.extraHp}/${data.extraHp}`, "hp") : "",
        statTile("Деф(П)", signed(data.defP), "def"),
        statTile("Деф(А)", signed(data.defA), "def"),
        statTile("УКЛ", signed(data.ukl), "ukl"),
        statTile("ОД", data.od, "action"),
        statTile("ОП", data.op, "move")
    ].join("");

    const resistanceTile = data.resActive > 0 && data.resType !== "Нет" ? statTile("Сопротивление", data.resType, "res") : "";
    const attacksHtml = attacks.length ? attacks.map(renderAttackOutput).join("") : `<div class="empty-state">Атаки не добавлены.</div>`;

    const globalStats = getGlobalStats();
    const globalHtml = hasGlobalStats() ? `
        <div class="sheet-section">
            <div class="sheet-section-title">Общие параметры атак</div>
            <div class="attr-chips">
                <span class="attr-chip global-chip"><b>АТК</b> ${esc(signed(globalStats.atk))}</span>
                <span class="attr-chip global-chip"><b>ТЧН</b> ${esc(signed(globalStats.tchn))}</span>
                <span class="attr-chip global-chip"><b>КШ</b> ${esc(signed(globalStats.ks))}</span>
                <span class="attr-chip global-chip"><b>АВХ</b> ${esc(globalStats.avh)}</span>
                <span class="attr-chip global-chip"><b>КЦ</b> ${esc(globalStats.kc)}</span>
            </div>
        </div>` : "";

    const immunityHtml = data.immunityNames.length ? `<div class="sheet-section"><div class="sheet-section-title">Резисты (Игнор эффектов)</div><div class="immunity-list">${data.immunityNames.map(name => `<span class="attr-chip immunity-chip-out">${esc(immunityLabel(name))}</span>`).join("")}</div></div>` : "";
    const attrsHtml = data.attrs.length ? `<div class="attr-chips">${data.attrs.map(attr => `<span class="attr-chip"><b>${esc(attr.name)}</b> ${attr.value}</span>`).join("")}</div>` : `<div class="empty-effects">Характеристики не заданы.</div>`;
    const passivesHtml = data.passiveNames.length ? `<div class="attr-chips">${data.passiveNames.map(name => `<span class="attr-chip passive-chip">${esc(name)}</span>`).join("")}</div>` : `<div class="empty-effects">Пассивные эффекты не выбраны.</div>`;
    const weaknessesHtml = data.weaknessNames.length ? `<div class="attr-chips">${data.weaknessNames.map(name => `<span class="attr-chip weakness-chip-out">${esc(name)}</span>`).join("")}</div>` : `<div class="empty-effects">Слабости не выбраны.</div>`;

    const isCharacter = data.unitMode === "character";
    const displayType = isCharacter ? "Персонаж" : (TYPE_RENAME[data.type] || data.type);
    const gearHtml = isCharacter ? buildGearOutputHtml(data.gear) : "";
    const weaknessesSection = isCharacter ? "" : `<div class="sheet-section">
                <div class="sheet-section-title">Слабости</div>
                ${weaknessesHtml}
            </div>`;

    return `
        <div class="mob-sheet">
            <div class="mob-sheet-head">
                <div>
                    <h3 class="mob-name">${esc(data.name)}</h3>
                    <div class="mob-sub">${esc(displayType)}${data.role ? ` · ${esc(data.role)}` : ""}</div>
                </div>
                <div class="mob-tags">
                    <!-- <span class="tag tag-tier">${esc(TIER_RENAME[data.tier] || data.tier)}</span> -->
                    <span class="tag tag-type">${esc(displayType)}</span>
                </div>
            </div>
            <div class="sheet-section">
                <div class="sheet-section-title">Защита и ресурсы</div>
                <div class="stat-grid">${statTiles}${resistanceTile}</div>
            </div>
            ${globalHtml}
            ${gearHtml}
            <div class="sheet-section">
                <div class="sheet-section-title">Атаки <span class="badge">${attacks.length}</span></div>
                <div class="attack-output-list">${attacksHtml}</div>
            </div>
            ${immunityHtml}
            <div class="sheet-section">
                <div class="sheet-section-title">Характеристики</div>
                ${attrsHtml}
            </div>
            <div class="sheet-section">
                <div class="sheet-section-title">Пассивные эффекты</div>
                ${passivesHtml}
            </div>
            ${weaknessesSection}
            ${data.notes ? `<div class="notes-block"><div class="sheet-section-title">Особые примечания</div><div>${formatMarkdown(data.notes)}</div></div>` : ""}
        </div>
    `;
}

function buildGearOutputHtml(snapshot) {
    const groups = snapshot
        ? GEAR_KIND_ORDER.map(kind => {
            const list = snapshot[kind] || [];
            if (!list.length) return "";
            const chips = list.map(entry => {
                const qty = entry.qty > 1 ? ` ×${entry.qty}` : "";
                const meta = [entry.organization, entry.iconic ? "Культовое" : ""].filter(Boolean).join(" · ");
                const price = entry.cost
                    ? creditIcon(entry.cost * Math.max(1, Number(entry.qty) || 1), "gear-chip-price")
                    : "";
                const title = [meta, entry.desc].filter(Boolean).join(" · ");
                return `<span class="attr-chip gear-chip" title="${esc(title)}">
                    <span class="gear-chip-name">${esc(entry.name)}${qty}</span>
                    ${meta ? `<small class="gear-chip-meta">${esc(meta)}</small>` : ""}
                    ${price}
                </span>`;
            }).join("");
            return `<div class="gear-output-group">
                <div class="gear-output-label">${esc(GEAR_KINDS[kind].label)}</div>
                <div class="attr-chips">${chips}</div>
            </div>`;
        }).filter(Boolean).join("")
        : "";

    return `<div class="sheet-section">
        <div class="sheet-section-title">Снаряжение и умения <span class="badge gear-total">${creditIcon(calculateGearCost())}</span></div>
        ${groups || `<div class="empty-effects">Снаряжение не выбрано.</div>`}
    </div>`;
}

function budgetPercent() { return currentBudget.max && isFinite(currentBudget.max) ? Math.min(100, Math.round((currentBudget.spent / currentBudget.max) * 100)) : 0; }

function statTile(label, value, cssClass) {
    return `<div class="stat-tile ${cssClass || ""}"><span class="stat-label">${esc(label)}</span><span class="stat-value">${esc(value)}</span></div>`;
}

function renderAttackOutput(attack) {
    const typeInfo = ATTACK_TYPES[attack.type] || ATTACK_TYPES["Ближняя"];
    const typeSlug = attack.type === "Дальняя" ? "ranged" : attack.type === "Особая" ? "cyber" : "melee";
    const effectNames = Object.keys(attack.effects);
    const effective = effectiveAttackStats(attack);

    const effectsHtml = effectNames.length
        ? `<div class="output-effects">${effectNames.map(name => {
            const eff = attack.effects[name];
            let details = [];
            if (!eff.hideN) details.push(`n ${eff.n}`);
            if (!eff.hideVer) details.push(`ВЕР ${eff.ver}%`);
            if (!eff.hideAkt) details.push(`АКТ ${eff.isPermanent ? "При атаке" : (eff.isInfinite ? "∞" : eff.akt)}`);
            const detailStr = details.join(" · ");
            return `<span class="effect-out" title="${esc(name)}"><b>${esc(name)}</b>${detailStr ? `<small>${detailStr}</small>` : ''}</span>`;
        }).join("")}</div>` : `<div class="empty-effects">Без накладываемых эффектов</div>`;

    let ignoreBadges = [];
    if (attack.ignDef > 0) ignoreBadges.push(`<span class="stat-pill"><b>Игнор Деф(П)</b> ${attack.ignDef}</span>`);
    if (attack.ignUkl > 0) ignoreBadges.push(`<span class="stat-pill"><b>Игнор УКЛ</b> ${attack.ignUkl}</span>`);

    return `
        <div class="attack-output attack-${typeSlug}">
            <div class="attack-output-head">
                <div>
                    <div class="attack-output-name">${esc(attack.name)}</div>
                    <div class="attack-output-sub">${esc(attack.damageType)} · Range ${attack.distMin}-${attack.distMax} ОП</div>
                </div>
                <div class="attack-output-tags"><span class="tag">${typeInfo.icon} ${esc(attack.type)}</span></div>
            </div>
            <div class="attack-stat-row">
                <span class="stat-pill"><b>АТК</b> ${esc(signed(effective.atk))}</span>
                <span class="stat-pill"><b>ТЧН</b> ${esc(signed(effective.tchn))}</span>
                <span class="stat-pill"><b>КШ</b> ${esc(signed(effective.ks))}</span>
                <span class="stat-pill"><b>АВХ</b> ${esc(effective.avh)}</span>
                <span class="stat-pill"><b>КЦ</b> ${esc(effective.kc)}</span>
                ${ignoreBadges.join("")}
            </div>
            ${effectsHtml}
            <!-- <div class="attack-output-cost">Стоимость атаки: <b>${calculateAttackCost(attack)}</b> оч.</div> -->
        </div>
    `;
}

function writeClipboard(text) {
    const fallback = () => new Promise((resolve, reject) => {
        const area = document.createElement("textarea");
        area.value = text; area.style.position = "fixed"; area.style.opacity = "0";
        document.body.appendChild(area); area.select();
        try { document.execCommand("copy") ? resolve() : reject(new Error("copy failed")); } catch (error) { reject(error); } finally { area.remove(); }
    });
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).catch(fallback);
    return fallback();
}

function showButtonFeedback(btn, text) {
    if (!btn) return;
    const original = btn.textContent;
    btn.textContent = text;
    setTimeout(() => btn.textContent = original, 1500);
}

function downloadCardAsImage() {
    const cardElement = document.getElementById('outputCard');
    if (!cardElement || !cardElement.innerHTML.trim()) {
        alert("Сначала создайте моба!");
        return;
    }

    // Меняем текст кнопки, чтобы показать, что идет процесс
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = "Генерация...";
    btn.disabled = true;

    // Настройки рендера
    html2canvas(cardElement, {
        scale: 2, // Увеличение разрешения (х2) для четкости на Retina-экранах
        backgroundColor: "#09090b", // Цвет фона (чтобы не было прозрачности, берем цвет из твоего CSS .mob-sheet)
        useCORS: true, // Разрешает загрузку внешних картинок (если они будут)
        logging: false // Отключает спам в консоли
    }).then(canvas => {
        // Получаем картинку в формате PNG
        const imgData = canvas.toDataURL('image/png');
        
        // Создаем ссылку для скачивания
        const link = document.createElement('a');
        
        // Имя файла: берем имя моба и дату
        const mobName = document.getElementById("mobName").value.trim() || "mob";
        link.download = `${mobName.replace(/[^a-zа-я0-9]/gi, '_')}_card.png`;
        
        link.href = imgData;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Возвращаем кнопку в исходное состояние
        btn.textContent = originalText;
        btn.disabled = false;
    }).catch(err => {
        console.error("Ошибка при создании картинки:", err);
        alert("Не удалось создать картинку. Попробуйте еще раз.");
        btn.textContent = originalText;
        btn.disabled = false;
    });
}

function copyResult() {
    const text = lastOutputText || document.getElementById("outputBox").textContent;
    const btn = document.querySelector(".action-buttons .btn");
    writeClipboard(text).then(() => showButtonFeedback(btn, "Скопировано!")).catch(() => showButtonFeedback(btn, "Ошибка"));
}

// M6 / EM9: Функции для работы с Вкладками и Сохранениями
function getCurrentState() {
    const attrs = {};
    document.querySelectorAll(".attr-input").forEach(inp => {
        attrs[inp.dataset.name] = Number(inp.value) || 0;
    });

    return {
        v: 6,
        unitMode,
        name: document.getElementById("mobName").value,
        tier: document.getElementById("mobTier").value,
        type: document.getElementById("mobType").value,
        role: document.getElementById("mobRole").value,
        hp: document.getElementById("statHp").value,
        extraHp: document.getElementById("statExtraHp").value,
        defP: document.getElementById("statDefP").value,
        defA: document.getElementById("statDefA").value,
        ukl: document.getElementById("statUkl").value,
        od: document.getElementById("statOd").value,
        op: document.getElementById("statOp").value,
        globalAtk: document.getElementById("globalAtk").value,
        globalKs: document.getElementById("globalKs").value,
        globalKc: document.getElementById("globalKc").value,
        globalTchn: document.getElementById("globalTchn").value,
        globalAvh: document.getElementById("globalAvh").value,
        resType: document.getElementById("resType").value,
        resActive: document.getElementById("resActive").value,
        notes: document.getElementById("mobNotes").value,
        attrs,
        immunities: Object.values(immunities),
        passiveEffects,
        weaknesses: Object.values(weaknesses),
        gear: normalizeGear(gear),
        attacks
    };
}

function shareLink() {
    const state = getCurrentState();
    const jsonStr = JSON.stringify(state);
    const encoded = btoa(unescape(encodeURIComponent(jsonStr)));
    const currentUrl = window.location.href.split("#")[0];
    const shareUrl = `${currentUrl}#state=${encoded}`;
    const btn = document.querySelector(".action-buttons .btn-link");

    writeClipboard(shareUrl)
        .then(() => showButtonFeedback(btn, "Ссылка скопирована!"))
        .catch(() => showButtonFeedback(btn, "Не удалось скопировать ссылку"));
}

function applyState(state) {
    isApplyingState = true;
    setInputValue("mobName", state.name || "Безымянный");
    setInputValue("mobTier", state.tier || "Новичок");
    setInputValue("mobType", state.type || "Моб");
    setInputValue("mobRole", state.role || "");
    setInputValue("statHp", state.hp || 1000);
    setInputValue("statExtraHp", state.extraHp ?? 0);
    setInputValue("statDefP", state.defP ?? 0);
    setInputValue("statDefA", state.defA ?? 0);
    setInputValue("statUkl", state.ukl ?? 0);
    setInputValue("statOd", state.od || 1);
    setInputValue("statOp", state.op ?? 1);
    setInputValue("globalAtk", state.globalAtk ?? 0);
    setInputValue("globalKs", state.globalKs ?? 0);
    setInputValue("globalKc", state.globalKc ?? 0);
    setInputValue("globalTchn", state.globalTchn ?? 0);
    setInputValue("globalAvh", state.globalAvh ?? 0);
    setInputValue("resType", state.resType || "Нет");
    setInputValue("resActive", state.resActive || "0");
    setInputValue("mobNotes", state.notes || "");

    unitMode = state.unitMode === "character" ? "character" : "mob";
    gear = normalizeGear(state.gear);
    applyUnitModeUI();

    if (state.attrs) {
        document.querySelectorAll(".attr-input").forEach(inp => {
            if (state.attrs[inp.dataset.name] !== undefined) inp.value = state.attrs[inp.dataset.name];
        });
    }

    passiveEffects = {};
    if (state.passiveEffects && typeof state.passiveEffects === "object") passiveEffects = state.passiveEffects;

    weaknesses = {};
    if (Array.isArray(state.weaknesses)) {
        state.weaknesses.forEach(item => {
            const name = typeof item === "string" ? item : item && item.name;
            if (!name) return;
            const known = findWeakness(name);
            const points = Number(item && item.points);
            weaknesses[name] = {
                name,
                points: Number.isFinite(points) ? Math.max(0, points) : (known ? known.points : CUSTOM_WEAKNESS_POINTS),
                kind: (item && item.kind) || (known ? known.kind : "custom"),
                desc: (item && item.desc) || (known ? known.desc : "Пользовательская слабость.")
            };
        });
    }

    immunities = {};
    if (Array.isArray(state.immunities)) {
        state.immunities.forEach(item => {
            const name = typeof item === "string" ? item : item && item.name;
            if (!name) return;
            const known = findImmunity(name);
            immunities[name] = {
                name,
                cost100: (item && (item.cost100 || item.cost)) || (known ? known.cost100 : CUSTOM_IMMUNITY_COST_100),
                desc: (item && item.desc) || (known ? known.desc : "Пользовательский резист."),
                ver: (item && item.ver) || IMMUNITY_BALANCE.defaultVer
            };
        });
    }

    if (Array.isArray(state.attacks)) {
        attacks = state.attacks.map(item => {
            const attack = createAttack({
                name: item.name || "Атака", type: item.type || "Ближняя",
                distMin: Number(item.distMin ?? 0), distMax: Number(item.distMax ?? item.distance ?? 1),
                damageType: item.damageType || "Кинетический",
                atk: Number(item.atk) || 0, ks: Number(item.ks) || 0, tchn: Number(item.tchn) || 0,
                avh: Number(item.avh) || 1, kc: Number(item.kc) || 1, ignDef: Number(item.ignDef) || 0,
                ignUkl: Number(item.ignUkl) || 0, effects: item.effects || {}
            });
            if (item.linkedGearId) attack.linkedGearId = item.linkedGearId;
            return attack;
        });

        // Сохраняем исходные id атак, иначе ссылки снаряжения на атаки потеряются.
        const usedIds = new Set();
        attacks.forEach((attack, index) => {
            const savedId = Number(state.attacks[index] && state.attacks[index].id);
            if (Number.isFinite(savedId) && savedId > 0 && !usedIds.has(savedId)) {
                attack.id = savedId;
                usedIds.add(savedId);
            }
        });
        nextAttackId = attacks.reduce((max, attack) => Math.max(max, attack.id + 1), 1);
    }

    // Если атака, привязанная к оружию, больше не существует — просто снимаем ссылку.
    gear.weapons.forEach(entry => {
        if (entry.attackId !== null && !attacks.some(attack => attack.id === entry.attackId)) {
            entry.attackId = null;
        }
    });

    renderAttacks();
    renderGear();
    renderImmunities();
    renderPassiveEffects();
    renderWeaknesses();
    recalcStats();
    isApplyingState = false;

    if (unitMode === "character") ensureGameData().catch(() => {});
}

function loadStateFromUrl() {
    const hash = window.location.hash;
    if (!hash || !hash.startsWith("#state=")) return false;

    try {
        const encoded = hash.replace("#state=", "");
        const jsonStr = decodeURIComponent(escape(atob(encoded)));
        const state = JSON.parse(jsonStr);
        
        applyState(state);
        
        // EM9: Очищаем URL после загрузки
        history.replaceState(null, document.title, window.location.pathname + window.location.search);
        return true;
    } catch (error) {
        console.error("Ошибка загрузки состояния из ссылки", error);
        return false;
    }
}

// M6: Автосохранение и вкладки
function triggerAutoSave() {
    if (isApplyingState) return;
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        if (!activeMobId) {
            activeMobId = 'mob_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        }
        savedMobs[activeMobId] = getCurrentState();
        localStorage.setItem('mobConstructorSaves', JSON.stringify(savedMobs));
        renderTabs();
    }, 500);
}

function renderTabs() {
    const container = document.getElementById('mobTabs');
    if (!container) return;

    let html = Object.entries(savedMobs).map(([id, state]) => {
        const name = state.name || 'Безымянный';
        const activeClass = id === activeMobId ? 'active' : '';
        return `
            <div class="mob-tab ${activeClass}" onclick="switchTab('${id}')">
                <span class="mob-tab-name">${esc(name)}</span>
                <button type="button" class="mob-tab-close" onclick="deleteTab('${id}', event)">✕</button>
            </div>
        `;
    }).join('');

    if (!html) {
        html = `<div style="color: var(--text-muted); font-size: 0.85rem; padding: 6px 0;">Черновик (изменения сохранятся автоматически)</div>`;
    }
    container.innerHTML = html;
}

function switchTab(id) {
    if (activeMobId === id) return;
    activeMobId = id;
    applyState(savedMobs[id]);
    renderTabs();
}

function deleteTab(id, event) {
    event.stopPropagation();
    delete savedMobs[id];
    localStorage.setItem('mobConstructorSaves', JSON.stringify(savedMobs));
    
    if (activeMobId === id) {
        const keys = Object.keys(savedMobs);
        if (keys.length > 0) {
            activeMobId = keys[0];
            applyState(savedMobs[activeMobId]);
        } else {
            addNewTab();
            return;
        }
    }
    renderTabs();
}

function addNewTab() {
    activeMobId = 'mob_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    isApplyingState = true;

    // Сбрасываем всё в ноль
    setInputValue("mobName", "Новый моб");
    setInputValue("mobTier", "Новичок");
    setInputValue("mobType", "Моб");
    setInputValue("mobRole", "");
    setInputValue("mobNotes", "");

    setInputValue("statHp", 0);
    setInputValue("statExtraHp", 0);
    setInputValue("statDefP", 0);
    setInputValue("statDefA", 0);
    setInputValue("statUkl", 0);
    setInputValue("statOd", 1);
    setInputValue("statOp", 1);

    setInputValue("globalAtk", 0);
    setInputValue("globalKs", 0);
    setInputValue("globalKc", 0);
    setInputValue("globalTchn", 0);
    setInputValue("globalAvh", 0);

    setInputValue("resType", "Нет");
    setInputValue("resActive", "0");

    document.querySelectorAll(".attr-input").forEach(inp => {
        inp.value = 5; // Характеристики по умолчанию 5
    });

    passiveEffects = {};
    weaknesses = {};
    immunities = {};
    unitMode = "mob";
    gear = createEmptyGear();
    applyUnitModeUI();
    // Создаем чистую атаку без статов
    attacks = [createAttack({ name: "Основная атака", ...ATTACK_COSTS.newAttack })];

    isApplyingState = false;
    
    renderAttacks();
    renderGear();
    renderImmunities();
    renderPassiveEffects();
    renderWeaknesses();
    recalcStats(); 

    savedMobs[activeMobId] = getCurrentState();
    localStorage.setItem('mobConstructorSaves', JSON.stringify(savedMobs));
    renderTabs();
}

function clearCurrentMob() {
    if (!confirm("Вы уверены, что хотите полностью очистить поля текущего моба?")) {
        return;
    }

    isApplyingState = true; 

    // Сбрасываем профиль (пресеты не трогаем, они просто дают лимиты)
    setInputValue("mobName", unitMode === "character" ? "Пустой персонаж" : "Пустой моб");
    setInputValue("mobTier", "Новичок");
    setInputValue("mobType", "Моб");
    setInputValue("mobRole", "");
    setInputValue("mobNotes", "");

    // Сбрасываем боевые параметры в ноль
    setInputValue("statHp", 0);
    setInputValue("statExtraHp", 0);
    setInputValue("statDefP", 0);
    setInputValue("statDefA", 0);
    setInputValue("statUkl", 0);
    setInputValue("statOd", 1);
    setInputValue("statOp", 1);

    // Сбрасываем общие параметры
    setInputValue("globalAtk", 0);
    setInputValue("globalKs", 0);
    setInputValue("globalKc", 0);
    setInputValue("globalTchn", 0);
    setInputValue("globalAvh", 0);

    // Сбрасываем сопротивление и заметки
    setInputValue("resType", "Нет");
    setInputValue("resActive", "0");
    setInputValue("mobNotes", "");

    // Сбрасываем характеристики на 5
    document.querySelectorAll(".attr-input").forEach(inp => {
        inp.value = 5;
    });

    // Удаляем все эффекты и создаем пустую атаку
    passiveEffects = {};
    weaknesses = {};
    immunities = {};
    gear = createEmptyGear();
    applyUnitModeUI();
    attacks = [createAttack({ name: "Основная атака", ...ATTACK_COSTS.newAttack })];

    isApplyingState = false;

    renderAttacks();
    renderGear();
    renderImmunities();
    renderPassiveEffects();
    renderWeaknesses();
    recalcStats(); 
    
    if (!activeMobId) {
        activeMobId = 'mob_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        savedMobs[activeMobId] = getCurrentState();
        localStorage.setItem('mobConstructorSaves', JSON.stringify(savedMobs));
    }
    renderTabs();
}

function exportJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(savedMobs, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "mobs_backup.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

function importJSON(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            Object.assign(savedMobs, imported); // Объединяем с текущими
            localStorage.setItem('mobConstructorSaves', JSON.stringify(savedMobs));
            renderTabs();
            alert("База мобов успешно загружена!");
        } catch (err) {
            alert("Ошибка: файл поврежден или имеет неверный формат.");
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // Сбрасываем инпут
}

function handleDragStart(e, id) {
    draggedAttackId = id;
    e.dataTransfer.effectAllowed = 'move';
    // Добавляем класс для визуального эффекта, что мы что-то тащим
    e.currentTarget.closest('.attack-editor').style.opacity = '0.4';
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    // Подсвечиваем карточку, над которой находимся
    e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e, targetId) {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    
    if (!draggedAttackId || draggedAttackId === targetId) return;
    
    const fromIndex = attacks.findIndex(a => a.id === draggedAttackId);
    const toIndex = attacks.findIndex(a => a.id === targetId);
    
    // Меняем атаки местами в массиве
    const [moved] = attacks.splice(fromIndex, 1);
    attacks.splice(toIndex, 0, moved);
    
    renderAttacks();
    recalcStats();
}

function handleDragEnd(e) {
    // Возвращаем прозрачность
    e.currentTarget.closest('.attack-editor').style.opacity = '1';
    draggedAttackId = null;
    // Убираем подсветку со всех карточек
    document.querySelectorAll('.attack-editor').forEach(el => el.classList.remove('drag-over'));
}

function updateDamageCalc() {
    const el = document.getElementById("damageCalcResult");
    if (!el) return;
    const select = document.getElementById("calcAttack");

    const stat = Number(document.getElementById("calcStat").value) || CALC_BALANCE.statBase;
    const bonus = Number(document.getElementById("calcBonus").value) || 0;
    const defP = Number(document.getElementById("calcDefP").value) || 0;

    // Множитель СТАТА (1 = 0.6, 5 = 1.0, 10 = 1.5)
    const mult = 1 + (stat - CALC_BALANCE.statBase) * CALC_BALANCE.statStep;

    if (!attacks.length) {
        if (select) {
            select.innerHTML = '<option value="">— нет атак —</option>';
            select.disabled = true;
            delete select.dataset.optionsKey;
        }
        el.innerHTML = "Нет атак для расчета.";
        return;
    }

    if (select) {
        select.disabled = false;
        // Запоминаем выбор до пересборки списка: иначе переименование атаки сбросит выбор на первую.
        const before = Number(select.value);
        if (attacks.some(a => a.id === before)) calcAttackId = before;
        const optionsKey = attacks.map(a => `${a.id}:${a.name}`).join("|");
        if (select.dataset.optionsKey !== optionsKey) {
            select.innerHTML = attacks.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join("");
            select.dataset.optionsKey = optionsKey;
        }
        // Если выбранную атаку удалили — берём первую.
        const chosen = attacks.find(a => a.id === calcAttackId) || attacks[0];
        calcAttackId = chosen.id;
        select.value = String(chosen.id);
    }

    const attack = attacks.find(a => a.id === calcAttackId) || attacks[0];
    const eff = effectiveAttackStats(attack);

    // Нам нужно: D100 * mult + bonus > eff.atk
    // Отсюда: D100 > (eff.atk - bonus) / mult
    const target = (eff.atk - bonus) / mult;
    const reqD100 = Math.floor(target) + 1;

    let evadeText = "";
    if (reqD100 <= 1) {
        evadeText = `<span style="color: var(--ok-color); font-weight: 700;">Уклонение при любом броске</span>`;
    } else if (reqD100 > 100) {
        evadeText = `<span style="color: var(--p1-color); font-weight: 700;">Невозможно уклониться</span>`;
    } else {
        evadeText = `нужно выкинуть <b>${reqD100}+</b> на D100`;
    }

    // Если уклонение провалено (игрок выкинул меньше), считаем урон
    let hitText = "";
    if (reqD100 <= 100) {
        // ВНИМАНИЕ: Здесь мы берем АТК как урон. Если урон оружия фиксирован,
        // формулу нужно будет поменять на фактический урон оружия.
        const dmgPerHit = Math.max(0, eff.atk - defP);
        const totalDmg = dmgPerHit * eff.avh;
        hitText = ` (при провале: ~${totalDmg} урона)`;
    }

    el.innerHTML = `<b>${esc(attack.name)}</b> (АТК ${eff.atk}): ${evadeText}${hitText}`;
}

init();