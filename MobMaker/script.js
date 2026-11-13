const ATTRIBUTES = [
    "Сила", "Ловкость", "Интеллект", "Воля", "Харизма",
    "Восприятие", "Техника", "Удача", "Телосложение"
];

const DAMAGE_TYPES_INFO = {
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
};

const ATTACK_TYPES = {
    "Ближняя": { icon: "⚔", desc: "Контактный бой. Огромная цена за дальность (х300 за ОП).", mult: 0.8 },
    "Дальняя": { icon: "➤", desc: "Стрелковая атака. Цена скейлится от диапазона ОП и дальности > 7 ОП.", mult: 1.0 },
    "Особая": { icon: "⚡", desc: "Нестандартные действия (конусы, площадки, спавн поверхностей, х100 за ОП).", mult: 1.1 }
};

const EFFECT_GROUPS = [
    {
        level: 1,
        title: "Эффекты атак (Пробитие и Урон)",
        css: "p5-bg",
        items: [
            { name: "Проницаемость", desc: "Атака игнорирует Деф. Базовая ВЕР 20.", defN: 20, defVer: 50, defAkt: 1, baseCost: 12, step: 10, isPermanent: true },
            { name: "Распад", desc: "Снимает n ОЗ НАВСЕГДА.", defN: 5, defVer: 50, defAkt: 1, baseCost: 15, step: 1, isPermanent: true },
            { name: "Излучение", desc: "УКЛ от атак с этим эффектом бросается с помехой.", defN: 1, defVer: 50, defAkt: 1, baseCost: 200, step: 1, isPermanent: true },
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
            { name: "Кома", desc: "Лишает противника всех ОЗ при срабатывании.", defN: 1, defVer: 50, defAkt: 1, baseCost: 3500, step: 1, isPermanent: true },
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
];

const PASSIVE_EFFECTS = [
    { name: "Конструкт", desc: "Иммунитет к кровотечению, страху, сну и т.д. Уязвим к ЭМИ.", baseCost: 100 },
    { name: "Невидимость", desc: "Персонаж не может быть замечен без указанного броска ВОСПР.", baseCost: 150 }
];

function getBaseResistCost100(item) {
    const stepMult = item.step ? ((item.defN || 1) / item.step) : 1;
    const verFactor50 = Math.pow(50 / 30, 1.6); 
    const aktMult = Math.max(1, item.defAkt || 1);
    const baselineInflictCost = (item.baseCost || 50) * stepMult * verFactor50 * aktMult * 2.0;
    return Math.max(250, Math.round(baselineInflictCost * 2.5));
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

const GLOBAL_ATK_COST = 4.0;
const GLOBAL_KS_COST = 5.0;
const GLOBAL_TCHN_COST = 3.0;
const GLOBAL_AVH_BASE = 200;
const GLOBAL_KC_BASE = 250;

const ATTACK_ATK_COST = 1.5;
const ATTACK_KS_COST = 2.0;
const ATTACK_TCHN_COST = 1.0;

const IGNORE_DEF_COST = 4.0;
const IGNORE_UKL_COST = 3.0;
const PERMANENT_MULT = 3.0;
const INFINITE_MULT = 5.0;
const CUSTOM_IMMUNITY_COST_100 = 2750;

let attacks = [];
let passiveEffects = {};
let immunities = {};
let nextAttackId = 1;
let lastOutputText = "";
let currentBudget = { spent: 0, max: 0 };

// M6: Переменные для вкладок и сохранений
let savedMobs = {};
let activeMobId = null;
let isApplyingState = false;
let saveTimeout = null;

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
    const base = {
        id, name: "Атака", type: "Ближняя", distMin: 0, distMax: 0,
        damageType: "Кинетический", atk: 70, ks: 10, tchn: 25, avh: 2, kc: 1,
        ignDef: 0, ignUkl: 0, effects: {}
    };
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
            const ver = item.ver ?? 50;
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
            desc: item ? item.desc : "Пользовательский резист.", ver: 50
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
    const ver = Math.min(100, Math.max(1, item.ver ?? 50));
    return Math.max(50, Math.round(base100 * Math.pow(ver / 100, 0.8)));
}

function immunityLabel(name) {
    const item = immunities[name];
    if (!item) return name;
    const ver = item.ver ?? 50;
    return ver >= 100 ? `${name} (Иммунитет 100%)` : `${name} (ВЕР ${ver}% · ${diceThresholdText(ver)})`;
}

function addCustomImmunity() {
    const input = document.getElementById("customImmunityInput");
    const name = input.value.trim();
    if (!name) return;
    if (!immunities[name]) {
        immunities[name] = { name, cost100: CUSTOM_IMMUNITY_COST_100, desc: "Пользовательский резист.", ver: 50 };
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

function passiveCost(item) { return Math.round((item.baseCost || 0) * 2.5); }

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
        <div class="attack-editor" data-attack-id="${attack.id}">
            <div class="attack-editor-head">
                <div class="attack-number">${index + 1}</div>
                <input type="text" class="attack-name-input" data-field="name" value="${esc(attack.name)}"
                    placeholder="Название атаки" oninput="updateAttackField(${attack.id}, 'name', this.value)">
                <div class="attack-head-actions">
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
                    <label>АВХ (атак)</label>
                    <input type="number" data-field="avh" value="${attack.avh}" min="1" step="1"
                        oninput="updateAttackField(${attack.id}, 'avh', this.value)">
                </div>
                <div style="${hasNoDamage || hasGrenade ? 'display: none;' : ''}">
                    <label>КШ (х2.0 оч.)</label>
                    <input type="number" data-field="ks" value="${attack.ks}" min="0" max="100"
                        oninput="updateAttackField(${attack.id}, 'ks', this.value)">
                </div>
                <div style="${hasNoDamage || hasGrenade ? 'display: none;' : ''}">
                    <label>КЦ (целей)</label>
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
        attack.effects[name] = {
            n: item.defN, ver: item.defVer, akt: 1, baseCost: item.baseCost, step: item.step,
            isInfinite: false, isPermanent: item.isPermanent || false, isItemProperty: item.isItemProperty || false,
            hideN: item.hideN || false, hideVer: item.hideVer || false, hideAkt: item.hideAkt || false,
            priority: level
        };
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
        type: "Ближняя",
        distMin: 0,
        distMax: 0,
        damageType: "Кинетический",
        atk: 0,
        ks: 0,
        tchn: 0,
        avh: 1,
        kc: 1
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

function attackCostMultiplier(attack) {
    const global = getGlobalStats();
    const hasNoDamage = !!attack.effects["Без урона"];
    const hasGrenade = !!attack.effects["Граната"];
    
    // Базовые значения атаки (с защитой от пустых строк)
    const baseAvh = Number(attack.avh) || 1;
    const baseKc = Number(attack.kc) || 1;
    
    // Считаем ИТОГОВЫЕ значения с учетом глобальных бонусов
    const totalAvh = baseAvh + global.avh;
    
    // У Гранаты и Без урона КЦ всегда 1. В остальных случаях — локальный + глобальный.
    const totalKc = (hasNoDamage || hasGrenade) ? 1 : (baseKc + global.kc);
    
    const od = readNum("statOd", 1) || 1;
    
    // Умножаем на итоговые АВХ и КЦ
    return Math.max(1, totalAvh * totalKc * od * getDamageMult(attack.damageType)) * attackTypeMult(attack.type);
}

function attackDistanceCost(attack) {
    const minD = Math.max(0, Number(attack.distMin) || 0);
    const maxD = Math.max(minD, Number(attack.distMax) || 0);
    const span = maxD - minD;

    if (attack.type === "Ближняя") { return Math.round(maxD * 300); }
    else if (attack.type === "Дальняя") {
        let cost = span * 100;
        if (maxD > 7) cost += (maxD - 7) * 50;
        if (maxD > 17) cost += (maxD - 17) * 250;
        if (minD === 0 && maxD >= 5) cost += 150;
        return Math.round(cost);
    } else { return Math.round(span * 100); }
}

// Функция прогрессивной стоимости (кривой)
function calcCurvedCost(value, baseCost, threshold = 0) {
    if (value <= 0) return 0;
    
    // Насколько значение превысило безопасный порог
    const penaltyValue = Math.max(0, value - threshold);
    
    // Квадратичный штраф применяется ТОЛЬКО к превышению
    return Math.round((value + (penaltyValue * penaltyValue) / 40) * baseCost);
}

function calculateAttackStatCost(attack) {
    const mult = attackCostMultiplier(attack);
    const hasNoDamage = !!attack.effects["Без урона"];
    const hasGrenade = !!attack.effects["Граната"];

    const atk = (hasNoDamage) ? 0 : attack.atk;
    const ks = (hasNoDamage || hasGrenade) ? 0 : attack.ks;
    const tchn = hasGrenade ? 0 : attack.tchn;

    // ДЛЯ АТК СТАВИМ ПОРОГ 25 (до 25 АТК считается линейно, после — по кривой)
    const statCost = Math.max(0, 
        calcCurvedCost(atk, ATTACK_ATK_COST, 50) + 
        calcCurvedCost(ks, ATTACK_KS_COST, 10) + 
        calcCurvedCost(tchn, ATTACK_TCHN_COST, 25)
    );
    
    const ignDefCost = (Number(attack.ignDef) || 0) * IGNORE_DEF_COST;
    const ignUklCost = (Number(attack.ignUkl) || 0) * IGNORE_UKL_COST;
    return Math.round((statCost + ignDefCost + ignUklCost) * (2 * mult) + attackDistanceCost(attack));
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
        
        const statCost = Math.max(0, 
            calcCurvedCost(gAtk, ATTACK_ATK_COST, 30) + 
            calcCurvedCost(gKs, ATTACK_KS_COST, 0) + 
            calcCurvedCost(gTchn, ATTACK_TCHN_COST, 0)
        );
        
        totalEquivalentCost += statCost * (2 * mult);
        
        totalEquivalentCost += Math.max(0, global.avh) * GLOBAL_AVH_BASE;
        if (!hasNoDamage && !hasGrenade) {
            totalEquivalentCost += Math.max(0, global.kc) * GLOBAL_KC_BASE;
        }
    });
    
    const finalCost = totalEquivalentCost * 0.85;
    return Math.round(finalCost);
}

function calculateAttackEffectCost(attack, name) {
    const eff = attack.effects[name];
    if (!eff) return 0;

    let verFactor = eff.ver / 100;
    if (eff.ver > 30) { verFactor = Math.pow(eff.ver / 30, 1.6); }
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
    if (statEl) statEl.textContent = statCost;
    if (effectEl) effectEl.textContent = effectCost;
    if (totalEl) totalEl.textContent = totalCost;

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

    let hp, defP, defA, ukl, atk, crit, acc, od, op, avh, kc;

    if (tier === "Новичок") { hp=150; defP=0; defA=0; ukl=5; atk=10; crit=5; acc=-20; od=1; op=1; avh=1; kc=1; }
    else if (tier === "Обычный") { hp=300; defP=5; defA=10; ukl=15; atk=25; crit=5; acc=0; od=1; op=1; avh=1; kc=1; }
    else if (tier === "Опасный") { hp=500; defP=15; defA=25; ukl=35; atk=40; crit=10; acc=10; od=1; op=2; avh=2; kc=1; }
    else if (tier === "Элитный") { hp=800; defP=30; defA=45; ukl=60; atk=65; crit=15; acc=15; od=1; op=2; avh=2; kc=1; }
    else if (tier === "Смерть") { hp=1000; defP=55; defA=75; ukl=110; atk=90; crit=20; acc=25; od=1; op=3; avh=2; kc=1; }

    if (mobType === "Элитный") {
        hp=Math.round(hp*2.0); defP=Math.round(defP*1.5); defA=Math.round(defA*1.5); ukl=Math.round(ukl*1.3); atk=Math.round(atk*1.2);
        crit+=5; acc+=10; op=Math.min(4, op+1); avh=Math.max(2, avh); kc=1;
    } else if (mobType === "Босс") {
        hp=Math.round(hp*3.0); defP=Math.round(defP*2.0); defA=Math.round(defA*2.0); ukl=Math.round(ukl*1.5); atk=Math.round(atk*1.4);
        crit+=10; acc+=15;
        if (tier==="Новичок"||tier==="Обычный") { op+=1; od=1; avh=2; kc=1; }
        else if (tier==="Опасный"||tier==="Элитный") { op+=2; od=2; avh=3; kc=2; }
        else if (tier==="Смерть") { op=6; od=2; avh=4; kc=3; }
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
    const baseBudgetNum = Number(tierSelect.options[tierSelect.selectedIndex].dataset.budget);
    const mobType = document.getElementById("mobType").value;
    const isBoss = mobType === "Босс";
    const isElite = mobType === "Элитный";

    let budgetBonus = 0;
    let baseAttrs = 58;
    let attrBonus = 0;

    if (isElite) { budgetBonus = Math.round(baseBudgetNum * 1.5); attrBonus = 4; }
    else if (isBoss) {
        if (tier === "Новичок") { budgetBonus = 500; attrBonus = 2; baseAttrs = 52; }
        else if (tier === "Обычный") { budgetBonus = 1500; attrBonus = 4; baseAttrs = 54; }
        else if (tier === "Опасный") { budgetBonus = 8000; attrBonus = 6; baseAttrs = 56; }
        else if (tier === "Элитный") { budgetBonus = 12000; attrBonus = 8; baseAttrs = 58; }
        else if (tier === "Смерть") { budgetBonus = 30000; attrBonus = 10; baseAttrs = 60; }
    }

    const maxBudget = baseBudgetNum + budgetBonus;
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

    const baseStatsCost = Math.round((hp * 0.2) + (extraHp * 0.15) + (defP * 5.0) + (defA * 4.0) + (ukl * 4.0) + (op * 150));
    const attacksCost = attacks.reduce((sum, attack) => sum + calculateAttackCost(attack), 0);
    const globalAttackCost = calculateGlobalAttackStatCost();

    const globalNote = document.getElementById("globalAttackCostNote");
    if (globalNote) globalNote.textContent = `Стоимость общих параметров: ${globalAttackCost} оч.`;

    let resistanceCost = 0;
    if (resActive > 0 && resType !== "Нет") {
        resistanceCost = resType === "Все типы урона" ? Math.round(hp * 1.0) : Math.round(hp * 0.3);
    }

    const immunityCost = calculateImmunityCost();
    const passiveCostValue = calculatePassiveCost();

    const immNote = document.getElementById("immunityCostNote");
    if (immNote) immNote.textContent = `Стоимость резистов к эффектам: ${immunityCost} оч. · Пассивные эффекты: ${passiveCostValue} оч.`;

    const totalSpent = baseStatsCost + attacksCost + globalAttackCost + resistanceCost + immunityCost + passiveCostValue;
    currentBudget = { spent: totalSpent, max: maxBudget };

    const budgetDisplay = document.getElementById("budgetDisplay");
    budgetDisplay.textContent = `${totalSpent} / ${maxBudget}`;
    budgetDisplay.className = totalSpent > maxBudget ? "budget-val over" : "budget-val ok";

    const attrBudgetDisplay = document.getElementById("attrBudgetDisplay");
    attrBudgetDisplay.textContent = `${attrSum} / ${maxAttrs}`;
    attrBudgetDisplay.className = attrSum > maxAttrs ? "budget-val over" : "budget-val ok";

    updateAllAttackCostDisplays();
    renderOutput();
    
    // M6: Автосохранение при любом изменении
    if (!isApplyingState) {
        triggerAutoSave();
    }
}

function handleInput(id, val) { recalcStats(); }

function renderOutput() {
    const name = document.getElementById("mobName").value.trim() || "Безымянный моб";
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

    updateOutputBudgetHint();

    const outData = { name, tier, type, role, hp, extraHp, defP, defA, ukl, od, op, resType, resActive, notes, attrs, immunityNames, passiveNames };
    lastOutputText = buildPlainText(outData);
    document.getElementById("outputBox").textContent = lastOutputText;
    document.getElementById("outputCard").innerHTML = buildOutputHtml(outData);
}

function updateOutputBudgetHint() {
    const hint = document.getElementById("outputBudgetHint");
    if (!hint) return;
    const over = currentBudget.spent > currentBudget.max;
    hint.textContent = `${currentBudget.spent} / ${currentBudget.max} оч.`;
    hint.className = `hint ${over ? "text-over" : "text-ok"}`;
}

function buildPlainText(data) {
    const lines = [];
    lines.push(`=== [${data.tier.toUpperCase()}] ${data.name} (${data.type}) ===`);
    if (data.role) lines.push(`Роль: ${data.role}`);

    if (data.attrs.length) lines.push(`- Характеристики: ${data.attrs.map(attr => `${attr.name}: ${attr.value}`).join(", ")}`);
    
    let hpLine = `- ОЗ: ${data.hp}/${data.hp}`;
    if (data.extraHp > 0) hpLine += ` | Доп.ОЗ: ${data.extraHp}/${data.extraHp}`;
    hpLine += ` | Деф(П): ${signed(data.defP)} | Деф(А): ${signed(data.defA)} | УКЛ: ${signed(data.ukl)}`;
    lines.push(hpLine);
    lines.push(`- ОД: ${data.od} | ОП: ${data.op}`);
    
    if (data.resActive > 0 && data.resType !== "Нет") lines.push(`- Сопротивление: ${data.resType}`);

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
                    const cost = calculateAttackEffectCost(attack, effectName);
                    lines.push(`  • ${effectName}${detailStr} — ${cost} оч.`);
                });
            } else { lines.push("- Эффекты: Нет"); }
            lines.push("");
        });
    } else {
        lines.push(""); lines.push("- Атаки: Нет"); lines.push("");
    }

    if (data.immunityNames.length) lines.push(`- Резисты: ${data.immunityNames.map(immunityLabel).join(", ")}`);
    if (data.passiveNames.length) lines.push(`- Пассивные эффекты: ${data.passiveNames.join(", ")}`);
    if (data.notes) lines.push(`- Примечания: ${data.notes.replace(/\n/g, " ")}`);

    return lines.join("\n");
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

    return `
        <div class="mob-sheet">
            <div class="mob-sheet-head">
                <div>
                    <h3 class="mob-name">${esc(data.name)}</h3>
                    <div class="mob-sub">${esc(data.type)}${data.role ? ` · ${esc(data.role)}` : ""}</div>
                </div>
                <div class="mob-tags">
                    <span class="tag tag-tier">${esc(data.tier)}</span>
                    <span class="tag tag-type">${esc(data.type)}</span>
                </div>
            </div>
            <div class="sheet-section">
                <div class="sheet-section-title">Защита и ресурсы</div>
                <div class="stat-grid">${statTiles}${resistanceTile}</div>
            </div>
            ${globalHtml}
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
            ${data.notes ? `<div class="notes-block"><div class="sheet-section-title">Особые примечания</div><div>${esc(data.notes)}</div></div>` : ""}
            <div class="sheet-budget ${currentBudget.spent > currentBudget.max ? "over" : ""}">
                <span class="sheet-budget-label">Бюджет</span>
                <div class="budget-bar"><span style="width:${budgetPercent()}%"></span></div>
                <b>${currentBudget.spent} / ${currentBudget.max}</b>
            </div>
        </div>
    `;
}

function budgetPercent() { return currentBudget.max ? Math.min(100, Math.round((currentBudget.spent / currentBudget.max) * 100)) : 0; }

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
            <div class="attack-output-cost">Стоимость атаки: <b>${calculateAttackCost(attack)}</b> оч.</div>
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
        v: 4,
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
    setInputValue("mobTier", state.tier || "Элитный");
    setInputValue("mobType", state.type || "Босс");
    setInputValue("mobRole", state.role || "Универсал");
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

    if (state.attrs) {
        document.querySelectorAll(".attr-input").forEach(inp => {
            if (state.attrs[inp.dataset.name] !== undefined) inp.value = state.attrs[inp.dataset.name];
        });
    }

    passiveEffects = {};
    if (state.passiveEffects && typeof state.passiveEffects === "object") passiveEffects = state.passiveEffects;

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
                ver: (item && item.ver) || 50
            };
        });
    }

    if (Array.isArray(state.attacks)) {
        attacks = state.attacks.map(item => createAttack({
            name: item.name || "Атака", type: item.type || "Ближняя",
            distMin: Number(item.distMin ?? 0), distMax: Number(item.distMax ?? item.distance ?? 1),
            damageType: item.damageType || "Кинетический",
            atk: Number(item.atk) || 0, ks: Number(item.ks) || 0, tchn: Number(item.tchn) || 0,
            avh: Number(item.avh) || 1, kc: Number(item.kc) || 1, ignDef: Number(item.ignDef) || 0,
            ignUkl: Number(item.ignUkl) || 0, effects: item.effects || {}
        }));
    }

    renderAttacks();
    renderImmunities();
    renderPassiveEffects();
    recalcStats();
    isApplyingState = false;
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
            createNewMob();
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
    immunities = {};
    // Создаем чистую атаку без статов
    attacks = [createAttack({ name: "Основная атака", atk: 0, ks: 0, tchn: 0, avh: 1, kc: 1 })];

    isApplyingState = false;
    
    renderAttacks();
    renderImmunities();
    renderPassiveEffects();
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
    setInputValue("mobName", "Пустой моб");
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
    immunities = {};
    attacks = [createAttack({ name: "Основная атака", atk: 0, ks: 0, tchn: 0, avh: 1, kc: 1 })];

    isApplyingState = false;

    renderAttacks();
    renderImmunities();
    renderPassiveEffects();
    recalcStats(); 
    
    if (!activeMobId) {
        activeMobId = 'mob_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        savedMobs[activeMobId] = getCurrentState();
        localStorage.setItem('mobConstructorSaves', JSON.stringify(savedMobs));
    }
    renderTabs();
}

init();