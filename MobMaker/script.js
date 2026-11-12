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

const EFFECT_GROUPS = [
    {
        level: 1,
        title: "Эффекты атак (Пробитие и Урон)",
        css: "p5-bg",
        items: [
            { name: "Проницаемость", desc: "Атака игнорирует Деф. Базовая ВЕР 20.", defN: 20, defVer: 50, defAkt: 1, baseCost: 12, step: 10 },
            { name: "Распад", desc: "Снимает n ОЗ НАВСЕГДА.", defN: 5, defVer: 50, defAkt: 1, baseCost: 5, step: 1 },
            { name: "Излучение", desc: "УКЛ от атак с этим эффектом бросается с помехой.", defN: 1, defVer: 50, defAkt: 1, baseCost: 200, step: 1 },
            { name: "Модификатор урона", desc: "Увеличивает значение атк*n. Возможен лишь 1 в ход.", defN: 1.5, defVer: 50, defAkt: 1, baseCost: 100, step: 1 }
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
        title: "Контроль (Запрет действий)",
        css: "p1-bg",
        items: [
            { name: "Кома", desc: "Лишает противника всех ОЗ при срабатывании.", defN: 1, defVer: 50, defAkt: 1, baseCost: 3500, step: 1 },
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
            { name: "Подавлен", desc: "Штраф к АТК - АТК/4. 1 АКТ. Не суммируется.", defN: 1, defVer: 50, defAkt: 2, baseCost: 50, step: 1 },
            { name: "Обезоружен", desc: "Не может использовать оружие n ходов.", defN: 1, defVer: 50, defAkt: 1, baseCost: 80, step: 1 },
            { name: "Слепота", desc: "Боевые действия только через Удачу без модификаторов.", defN: 1, defVer: 50, defAkt: 1, baseCost: 100, step: 1 },
            { name: "Страх", desc: "В конце хода проверка Воля/2 >= 50, иначе атаки не засчитываются.", defN: 1, defVer: 50, defAkt: 2, baseCost: 90, step: 1 },
            { name: "Мокрый", desc: "Дает Сложную Местность. Продлевает крио-обездвижен.", defN: 1, defVer: 50, defAkt: 2, baseCost: 20, step: 1 },
            { name: "Громкий", desc: "Порог обнаружения становится 90 вместо 180.", defN: 1, defVer: 50, defAkt: 2, baseCost: 10, step: 1 }
        ]
    },
    {
        level: 5,
        title: "Пассивные и защитные механики",
        css: "p4-bg",
        items: [
            { name: "Конструкт", desc: "Иммунитет к кровотечению, страху, сну и т.д. Уязвим к ЭМИ.", defN: 1, defVer: 50, defAkt: 1, baseCost: 100, step: 1 },
            { name: "Невидимость", desc: "Персонаж не может быть замечен без указанного броска ВОСПР.", defN: 1, defVer: 50, defAkt: 1, baseCost: 150, step: 1 }
        ]
    }
];

let selectedEffects = {};
let stateValues = {};

function init() {
    const attrsDiv = document.getElementById('attrsContainer');
    ATTRIBUTES.forEach(attr => {
        const div = document.createElement('div');
        div.innerHTML = `
            <label>${attr}</label>
            <input type="number" class="attr-input" data-name="${attr}" value="5" min="0" max="10" oninput="handleAttrInput(this)">
        `;
        attrsDiv.appendChild(div);
    });

    const catDiv = document.getElementById('effectsCatalog');
    EFFECT_GROUPS.forEach(group => {
        const block = document.createElement('div');
        block.className = 'priority-block';

        const header = document.createElement('div');
        header.className = `priority-header ${group.css}`;
        header.textContent = group.title;
        block.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'effects-grid';

        group.items.forEach(item => {
            const chip = document.createElement('div');
            chip.className = 'effect-chip';
            chip.id = `chip_${item.name}`;
            chip.onclick = (e) => {
                if (e.target.tagName !== 'INPUT') {
                    const cb = chip.querySelector('input');
                    cb.checked = !cb.checked;
                    toggleEffect(item, cb.checked, group.level);
                }
            };

            chip.innerHTML = `
                <div class="effect-top">
                    <span>${item.name}</span>
                    <input type="checkbox" onchange="toggleEffect(${JSON.stringify(item).replace(/"/g, '&quot;')}, this.checked, ${group.level})">
                </div>
                <div class="effect-desc">${item.desc}</div>
            `;
            grid.appendChild(chip);
        });

        block.appendChild(grid);
        catDiv.appendChild(block);
    });

    // Пытаемся загрузить данные из ссылки
    const loadedFromUrl = loadStateFromUrl();
    
    if (!loadedFromUrl) {
        // Если ссылки нет, ставим дефолтные значения
        updateDamageInfo();
        applyTierPreset();
    }
}

function updateDamageInfo() {
    const dmgType = document.getElementById('damageType').value;
    const infoBox = document.getElementById('damageInfoBox');
    
    if (DAMAGE_TYPES_INFO[dmgType]) {
        infoBox.style.display = 'block';
        infoBox.innerHTML = `<strong>${dmgType}:</strong> ${DAMAGE_TYPES_INFO[dmgType].desc} <br> <em>Множитель стоимости: x${DAMAGE_TYPES_INFO[dmgType].mult}</em>`;
    } else {
        infoBox.style.display = 'none';
    }
    updateAllEffectCosts();
    recalcStats();
}

function handleInput(id, val) {
    stateValues[id] = val;
    updateAllEffectCosts();
    recalcStats();
}

function handleAttrInput(el) {
    recalcStats();
}

function toggleEffect(item, isChecked, level) {
    const chip = document.getElementById(`chip_${item.name}`);
    if (isChecked) {
        chip.classList.add('active');
        
        const infiniteByDefault = ["Конструкт", "Невидимость"].includes(item.name);
        
        selectedEffects[item.name] = {
            n: item.defN,
            ver: item.defVer,
            akt: item.defAkt,
            baseCost: item.baseCost,
            step: item.step,
            isInfinite: infiniteByDefault,
            priority: (level === 5) ? 4 : 1
        };
    } else {
        chip.classList.remove('active');
        delete selectedEffects[item.name];
    }
    renderActiveEffects();
    recalcStats();
}

function removeEffect(name) {
    const chip = document.getElementById(`chip_${name}`);
    if (chip) {
        chip.classList.remove('active');
        chip.querySelector('input').checked = false;
    }
    delete selectedEffects[name];
    renderActiveEffects();
    recalcStats();
}

function getDamageMult() {
    const dmgType = document.getElementById('damageType').value;
    return DAMAGE_TYPES_INFO[dmgType] ? DAMAGE_TYPES_INFO[dmgType].mult : 1.0;
}

function calculateCost(name) {
    const eff = selectedEffects[name];
    let verFactor = eff.ver / 100;
    if (eff.priority < 4 && eff.ver > 30) {
        verFactor = Math.pow(eff.ver / 30, 1.6);
    }
    let stepMult = eff.n / eff.step;
    let aktMult = eff.isInfinite ? 5 : Math.max(1, eff.akt);
    
    const od = Number(document.getElementById('statOd').value) || 1;
    const avh = Number(document.getElementById('statAvh').value) || 1;
    const kc = Number(document.getElementById('statKc').value) || 1;
    const dmgMult = getDamageMult();
    
    const attackMult = Math.max(1, avh * kc * od * dmgMult);

    let calcCost = eff.baseCost * stepMult * verFactor * aktMult;
    if (eff.priority < 4) calcCost *= attackMult;
    return Math.round(calcCost);
}

function renderActiveEffects() {
    const wrapper = document.getElementById('activeEffectsWrapper');
    const list = document.getElementById('activeEffectsList');
    const keys = Object.keys(selectedEffects);

    if (keys.length === 0) {
        wrapper.style.display = 'none';
        return;
    }

    wrapper.style.display = 'block';
    list.innerHTML = '';

    keys.forEach(name => {
        const eff = selectedEffects[name];
        const calcCost = calculateCost(name);

        const row = document.createElement('div');
        row.className = 'active-effect-row';
        row.innerHTML = `
            <div class="eff-name-col"><strong>${name}</strong></div>
            <div>
                <label>Параметр (n)</label>
                <input type="number" value="${eff.n}" min="0" oninput="updateEffectVal('${name}', 'n', this.value, this)">
            </div>
            <div>
                <label>ВЕР (%)</label>
                <input type="number" value="${eff.ver}" min="1" max="100" oninput="updateEffectVal('${name}', 'ver', this.value, this)">
            </div>
            <div>
                <label>АКТ (ходы)</label>
                <input type="number" value="${eff.akt}" min="0" ${eff.isInfinite ? 'disabled' : ''} oninput="updateEffectVal('${name}', 'akt', this.value, this)">
                <label class="inf-label">
                    <input type="checkbox" ${eff.isInfinite ? 'checked' : ''} onchange="toggleInfinite('${name}', this.checked)"> ∞
                </label>
            </div>
            <div class="eff-cost-badge">${calcCost} оч.</div>
            <button class="btn-del" title="Удалить" onclick="removeEffect('${name}')">✕</button>
        `;
        list.appendChild(row);
    });
}

function updateAllEffectCosts() {
    document.querySelectorAll('.active-effect-row').forEach(row => {
        const name = row.querySelector('strong').textContent;
        const calcCost = calculateCost(name);
        row.querySelector('.eff-cost-badge').textContent = `${calcCost} оч.`;
    });
}

function updateEffectVal(name, field, val, el) {
    if (selectedEffects[name]) {
        selectedEffects[name][field] = Number(val);
        
        const row = el.closest('.active-effect-row');
        if (row) {
            const calcCost = calculateCost(name);
            row.querySelector('.eff-cost-badge').textContent = `${calcCost} оч.`;
        }
        
        recalcStats();
    }
}

function toggleInfinite(name, isInf) {
    if (selectedEffects[name]) {
        selectedEffects[name].isInfinite = isInf;
        renderActiveEffects();
        recalcStats();
    }
}

function applyTierPreset() {
    const tier = document.getElementById('mobTier').value;
    const mobType = document.getElementById('mobType').value;

    let hp, defP, defA, ukl, atk, crit, acc, od, op, avh, kc;

    if (tier === 'Новичок') {
        hp = 150; defP = 0; defA = 0; ukl = 5;
        atk = 10; crit = 5; acc = -20;
        od = 1; op = 1; avh = 1; kc = 1;
    } else if (tier === 'Обычный') {
        hp = 300; defP = 5; defA = 10; ukl = 15;
        atk = 25; crit = 5; acc = 0;
        od = 1; op = 1; avh = 1; kc = 1;
    } else if (tier === 'Опасный') {
        hp = 500; defP = 15; defA = 25; ukl = 35;
        atk = 40; crit = 10; acc = 10;
        od = 1; op = 2; avh = 2; kc = 1;
    } else if (tier === 'Элитный') {
        hp = 800; defP = 30; defA = 45; ukl = 60;
        atk = 65; crit = 15; acc = 15;
        od = 1; op = 2; avh = 2; kc = 1;
    } else if (tier === 'Смерть') {
        hp = 1000; defP = 55; defA = 75; ukl = 110;
        atk = 90; crit = 20; acc = 25;
        od = 1; op = 3; avh = 2; kc = 1;
    }

    if (mobType === 'Элитный') {
        hp = Math.round(hp * 2.0);
        defP = Math.round(defP * 1.5);
        defA = Math.round(defA * 1.5);
        ukl = Math.round(ukl * 1.3);
        atk = Math.round(atk * 1.2);
        crit += 5;
        acc += 10;
        op = Math.min(4, op + 1);
        avh = Math.max(2, avh);
        kc = 1;
    } else if (mobType === 'Босс') {
        hp = Math.round(hp * 3.0); 
        defP = Math.round(defP * 2.0);
        defA = Math.round(defA * 2.0);
        ukl = Math.round(ukl * 1.5);
        atk = Math.round(atk * 1.4);
        crit += 10;
        acc += 15;
        
        if (tier === 'Новичок' || tier === 'Обычный') {
            op += 1;
            od = 1;
            avh = 2;
            kc = 1;
        } else if (tier === 'Опасный' || tier === 'Элитный') {
            op += 2;
            od = 2;
            avh = 3;
            kc = 2;
        } else if (tier === 'Смерть') {
            op = 6; 
            od = 2;
            avh = 4;
            kc = 3;
        }
    }

    document.getElementById('statHp').value = hp;
    document.getElementById('statDefP').value = defP;
    document.getElementById('statDefA').value = defA;
    document.getElementById('statUkl').value = ukl;
    document.getElementById('statAtk').value = atk;
    document.getElementById('statCrit').value = crit;
    document.getElementById('statAcc').value = acc;
    document.getElementById('statOd').value = od;
    document.getElementById('statOp').value = op;
    document.getElementById('statAvh').value = avh;
    document.getElementById('statKc').value = kc;

    updateAllEffectCosts();
    recalcStats();
}

function recalcStats() {
    const tierSelect = document.getElementById('mobTier');
    const tier = tierSelect.value;
    let baseBudgetNum = Number(tierSelect.options[tierSelect.selectedIndex].dataset.budget);
    const mobType = document.getElementById('mobType').value;
    const isBoss = mobType === 'Босс';
    const isElite = mobType === 'Элитный';

    let bossBudgetBonus = 0;
    let baseAttrs = 58;
    let bossAttrBonus = 0;

    if (isElite) {
        bossBudgetBonus = Math.round(baseBudgetNum * 1.5);
        bossAttrBonus = 4;
    } else if (isBoss) {
        if (tier === 'Новичок') { bossBudgetBonus = 500; bossAttrBonus = 2; baseAttrs = 52; }
        else if (tier === 'Обычный') { bossBudgetBonus = 1500; bossAttrBonus = 4; baseAttrs = 54; }
        else if (tier === 'Опасный') { bossBudgetBonus = 8000; bossAttrBonus = 6; baseAttrs = 56; }
        else if (tier === 'Элитный') { bossBudgetBonus = 12000; bossAttrBonus = 8; baseAttrs = 58; }
        else if (tier === 'Смерть') { bossBudgetBonus = 30000; bossAttrBonus = 10; baseAttrs = 60; }
    }

    const maxBudget = baseBudgetNum + bossBudgetBonus;
    const maxAttrs = baseAttrs + bossAttrBonus;

    const hp = Number(document.getElementById('statHp').value) || 0;
    const defP = Number(document.getElementById('statDefP').value) || 0;
    const defA = Number(document.getElementById('statDefA').value) || 0;
    const ukl = Number(document.getElementById('statUkl').value) || 0;
    const atk = Number(document.getElementById('statAtk').value) || 0;
    const crit = Number(document.getElementById('statCrit').value) || 0;
    const acc = Number(document.getElementById('statAcc').value) || 0;
    const avh = Number(document.getElementById('statAvh').value) || 1;
    const kc = Number(document.getElementById('statKc').value) || 1;
    const od = Number(document.getElementById('statOd').value) || 1;
    const op = Number(document.getElementById('statOp').value) || 0;
    const ignDef = Number(document.getElementById('statIgnDef').value) || 0;
    const ignUkl = Number(document.getElementById('statIgnUkl').value) || 0;

    const resType = document.getElementById('resType').value;
    const resActive = Number(document.getElementById('resActive').value) || 0;

    let attrSum = 0;
    document.querySelectorAll('.attr-input').forEach(inp => {
        attrSum += Number(inp.value) || 0;
    });

    const dmgMult = getDamageMult();
    const attackMult = Math.max(1, avh * kc * od * dmgMult);
    
    let totalEffectsCost = 0;
    Object.keys(selectedEffects).forEach(name => {
        totalEffectsCost += calculateCost(name);
    });

    if (resActive > 0 && resType !== "Нет") {
        const resCost = (resType === "Все типы урона" ? Math.round(hp * 1.0) : Math.round(hp * 0.3));
        totalEffectsCost += resCost;
    }

    const atkStatsCost = Math.max(0, (atk * 2.0 + crit * 3.0 + acc * 2.0 + ignDef * 4.0 + ignUkl * 3.0));
    
    const spentStats = Math.round(
        (hp * 0.2) +
        (defP * 5.0) +
        (defA * 4.0) +
        (ukl * 4.0) +
        (op * 150) +
        (atkStatsCost * (2 * attackMult))
    );

    const totalSpent = spentStats + totalEffectsCost;

    const budgetDisplay = document.getElementById('budgetDisplay');
    budgetDisplay.textContent = `${totalSpent} / ${maxBudget}`;
    budgetDisplay.className = totalSpent > maxBudget ? 'budget-val over' : 'budget-val ok';

    const attrBudgetDisplay = document.getElementById('attrBudgetDisplay');
    attrBudgetDisplay.textContent = `${attrSum} / ${maxAttrs}`;
    attrBudgetDisplay.className = attrSum > maxAttrs ? 'budget-val over' : 'budget-val ok';

    renderOutput();
}

function renderOutput() {
    const name = document.getElementById('mobName').value.trim() || "Элитный Страж";
    const tier = document.getElementById('mobTier').value;
    const type = document.getElementById('mobType').value;
    const dmgType = document.getElementById('damageType').value;

    const hp = document.getElementById('statHp').value;
    const defP = document.getElementById('statDefP').value;
    const defA = document.getElementById('statDefA').value;
    const ukl = document.getElementById('statUkl').value;

    const atk = document.getElementById('statAtk').value;
    const crit = document.getElementById('statCrit').value;
    const acc = document.getElementById('statAcc').value;
    const avh = document.getElementById('statAvh').value;
    const kc = document.getElementById('statKc').value;

    const od = document.getElementById('statOd').value;
    const op = document.getElementById('statOp').value;
    const ignDef = Number(document.getElementById('statIgnDef').value);
    const ignUkl = Number(document.getElementById('statIgnUkl').value);

    const resType = document.getElementById('resType').value;
    const resActive = Number(document.getElementById('resActive').value);

    const attrs = [];
    document.querySelectorAll('.attr-input').forEach(inp => {
        const v = Number(inp.value);
        if (v > 0) attrs.push(`${inp.dataset.name}: ${v}`);
    });

    const effKeys = Object.keys(selectedEffects);
    let effLines = [];
    if (effKeys.length > 0) {
        effKeys.forEach(k => {
            const e = selectedEffects[k];
            const aktText = e.isInfinite ? "∞" : e.akt;
            effLines.push(`  - ${k} (Параметр: ${e.n} | ВЕР: ${e.ver}% | АКТ: ${aktText})`);
        });
    }
    if (resActive > 0 && resType !== "Нет") {
        effLines.push(`  - Сопротивление: ${resType}`);
    }

    const notes = document.getElementById('mobNotes').value.trim();

    let text = `=== [${tier.toUpperCase()}] ${name} (${type}) ===\n`;
    
    const dmgInfo = DAMAGE_TYPES_INFO[dmgType] || { desc: "", mult: 1.0 };
    text += `- Тип урона: ${dmgType} (${dmgInfo.desc})\n`;
    text += `- ОЗ: ${hp} | Деф(П): ${defP} | Деф(А): ${defA} | УКЛ: ${ukl}\n`;
    text += `- АТК: ${atk} | КШ: ${crit}% | ТЧН: ${acc}\n`;
    text += `- АВХ: ${avh} | КЦ: ${kc} | ОД: ${od} | ОП: ${op}`;
    
    if (ignDef > 0 || ignUkl > 0) {
        text += ` | Игнор Деф(П): ${ignDef} / УКЛ: ${ignUkl}`;
    }
    text += `\n`;
    
    if (attrs.length > 0) {
        text += `- Характеристики: ${attrs.join(', ')}\n`;
    }
    text += `- Эффекты:\n${effLines.length > 0 ? effLines.join('\n') : '  - Нет'}`;
    if (notes) {
        text += `\n- Особые примечания: ${notes}`;
    }

    document.getElementById('outputBox').textContent = text;
}

function copyResult() {
    const text = document.getElementById('outputBox').textContent;
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.querySelector('.btn');
        const orig = btn.textContent;
        btn.textContent = "Скопировано!";
        setTimeout(() => btn.textContent = orig, 1500);
    });
}

// === СОХРАНЕНИЕ И ЗАГРУЗКА (URL) ===

function shareLink() {
    const state = {
        name: document.getElementById('mobName').value,
        tier: document.getElementById('mobTier').value,
        type: document.getElementById('mobType').value,
        dmgType: document.getElementById('damageType').value,
        hp: document.getElementById('statHp').value,
        defP: document.getElementById('statDefP').value,
        defA: document.getElementById('statDefA').value,
        ukl: document.getElementById('statUkl').value,
        atk: document.getElementById('statAtk').value,
        crit: document.getElementById('statCrit').value,
        acc: document.getElementById('statAcc').value,
        avh: document.getElementById('statAvh').value,
        kc: document.getElementById('statKc').value,
        od: document.getElementById('statOd').value,
        op: document.getElementById('statOp').value,
        ignDef: document.getElementById('statIgnDef').value,
        ignUkl: document.getElementById('statIgnUkl').value,
        resType: document.getElementById('resType').value,
        resActive: document.getElementById('resActive').value,
        notes: document.getElementById('mobNotes').value,
        attrs: {},
        effects: selectedEffects
    };

    // Собираем характеристики
    document.querySelectorAll('.attr-input').forEach(inp => {
        state.attrs[inp.dataset.name] = inp.value;
    });

    const jsonStr = JSON.stringify(state);
    // Кодируем в Base64 с поддержкой кириллицы
    const encoded = btoa(unescape(encodeURIComponent(jsonStr)));
    
    // Формируем ссылку
    const currentUrl = window.location.href.split('#')[0];
    const shareUrl = `${currentUrl}#state=${encoded}`;

    navigator.clipboard.writeText(shareUrl).then(() => {
        const btn = document.querySelector('.btn-link');
        const orig = btn.textContent;
        btn.textContent = "Ссылка скопирована!";
        setTimeout(() => btn.textContent = orig, 1500);
    });
}

function loadStateFromUrl() {
    const hash = window.location.hash;
    if (!hash || !hash.startsWith('#state=')) return false;

    try {
        const encoded = hash.replace('#state=', '');
        const jsonStr = decodeURIComponent(escape(atob(encoded)));
        const state = JSON.parse(jsonStr);

        document.getElementById('mobName').value = state.name || "Безымянный";
        document.getElementById('mobTier').value = state.tier || "Элитный";
        document.getElementById('mobType').value = state.type || "Босс";
        document.getElementById('damageType').value = state.dmgType || "Кинетический";
        
        document.getElementById('statHp').value = state.hp || 1000;
        document.getElementById('statDefP').value = state.defP || 0;
        document.getElementById('statDefA').value = state.defA || 0;
        document.getElementById('statUkl').value = state.ukl || 0;
        document.getElementById('statAtk').value = state.atk || 0;
        document.getElementById('statCrit').value = state.crit || 0;
        document.getElementById('statAcc').value = state.acc || 0;
        document.getElementById('statAvh').value = state.avh || 1;
        document.getElementById('statKc').value = state.kc || 1;
        document.getElementById('statOd').value = state.od || 1;
        document.getElementById('statOp').value = state.op || 1;
        document.getElementById('statIgnDef').value = state.ignDef || 0;
        document.getElementById('statIgnUkl').value = state.ignUkl || 0;
        
        document.getElementById('resType').value = state.resType || "Нет";
        document.getElementById('resActive').value = state.resActive || "0";
        document.getElementById('mobNotes').value = state.notes || "";

        if (state.attrs) {
            document.querySelectorAll('.attr-input').forEach(inp => {
                if (state.attrs[inp.dataset.name] !== undefined) {
                    inp.value = state.attrs[inp.dataset.name];
                }
            });
        }

        selectedEffects = state.effects || {};
        
        document.querySelectorAll('.effect-chip input[type="checkbox"]').forEach(cb => {
            const name = cb.closest('.effect-chip').id.replace('chip_', '');
            if (selectedEffects[name]) {
                cb.checked = true;
                cb.closest('.effect-chip').classList.add('active');
            } else {
                cb.checked = false;
                cb.closest('.effect-chip').classList.remove('active');
            }
        });

        updateDamageInfo();
        renderActiveEffects();
        recalcStats();
        
        return true;
    } catch (e) {
        console.error("Ошибка загрузки состояния из ссылки", e);
        return false;
    }
}

init();