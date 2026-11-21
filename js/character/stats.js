// Сводка характеристик персонажа по источникам: текущее оружие, экипировка
// и импланты. Способности, мутации и способности зверя сюда не входят.
// Модуль только читает карточку: существующие расчёты (ОЗ, инициатива и т. п.)
// он не меняет.

import { CORE_IMPLANT } from './rules.js';

export const CHAR_STAT_LABELS = Object.freeze({
  atk: 'АТК',
  ksh: 'КШ',
  tchn: 'ТЧН',
  avx: 'АВХ',
  kc: 'КЦ',
  defP: 'Деф.п',
  defA: 'Деф.а',
  evasion: 'УКЛ',
  speed: 'Скороход',
  flight: 'Полёт',
  od: 'ОД',
});

export const CHAR_STAT_ORDER = Object.freeze([
  'atk', 'ksh', 'tchn', 'avx', 'kc', 'defP', 'defA', 'evasion', 'speed', 'flight', 'od',
]);

// Параметры, которые у текущего оружия образуют «профиль оружия».
export const WEAPON_STATS = Object.freeze(['atk', 'ksh', 'tchn', 'avx', 'kc']);

const NUM = String.raw`\d+(?:[.,]\d+)?`;
const TERM = String.raw`(?:${NUM}\s*\*?\s*n(?:\s*[*/]\s*${NUM})?|n(?:\s*[*/]\s*${NUM})?|${NUM})`;
const EXPR_SOURCE = String.raw`[+\-−]?\s*${TERM}(?:\s*[+\-−]\s*${TERM})*`;

// Ограничения на источники: транспорт, роботы и «чужие» предметы не должны
// попадать в сводку персонажа.
const GEAR_CATEGORIES = new Set(['Одежда', 'Аксессуар', 'Экзо-Синты', 'Обвес', 'Оружие', 'Имплант', 'Техник', 'Рокер']);
const WEAPON_TAGS = new Set(['P', 'Sub', 'SG', 'AR', 'Me', 'S', 'He', 'Ar', 'Sg', 'W', 'A', 'L']);
const TRANSPORT_RE = /(транспорт|вождени|мотоцикл|аэромобиль|кузов|багажн|машин)/i;
const ROBOT_RE = /(мех\b|призм|ядр|робот|бмет|\bsat\b)/i;
const GENERAL_IGNORE = /(игнор|сниж|штраф|пробива|дебафф|очк|наносящ[^.;|]*урон|наносит[^.;|]*урон|урон[^.;|]*цел|уменьша[^.;|]*урон)/i;
const COST_OD = /(трат|потрат|потрач|стоит|за\s+очк|взамен|отдать|сменить|использ|тратя|имеете|имеет)/i;
const BONUS_RE = /(доп(?:олнительн\w*)?|бесплатн\w*|бонус|получа\w*|прибав\w*|\+)/i;
const DISTANCE_RE = /(радиус|пределах|дистанц|расстояни|на линии|вокруг|диаметр|до\s+\d|на\s+\d|в\s+\d|за\s+кажд\w*\s+пройденн)/i;
const CONDITION_RE = /(если|при(?:\s|$)|только|находясь|пока |до тех пор|в бою|ближн|дальн|против|цел(?:ь|и|ям|ью|ей)|союзник|враг|за кажд|радиус|пределах|дистанц|расстояни|на линии|в темноте|без оружи|с оружи|зависит|провал|успешн|использовани|применени|после |перед |в течение|в течении|в момент|выше своей цели|ниже вас|в стелсе|ярост|состояни|форма|до конца|каждый ход|каждое|каждую|каждого|раз в (?:бой|раунд|ход))/i;
const SOURCE_CONDITION_RE = /(бонус[^.;|]{0,40}только|только в (?:ближнем|дальнем) бою|работает только)/i;
// Явная пометка «активный» отличается от косвенных признаков (КД, раз в бой),
// которые у пассивного бонуса с условием не делают его активным.
const EXPLICIT_ACTIVE_RE = /(?:эффект[а-яё]*\s*:\s*активн|(?<![А-Яа-яЁё])активн(?:ый|ая|ое|ые|ого|ому|ым|ой|ую|ых)(?![А-Яа-яЁё])|активир|мгновенн)/i;

// Звёздочки умножения не трогаем: они встречаются в формулах («n*2»).
// Разметку вида **жирный** вычислитель формул просто игнорирует.
const clean = (s) => String(s ?? '').replace(/[−–—]/g, '-').replace(/[«»“”]/g, '"').replace(/[`_]/g, '');

// Простой вычислитель формул вида «5n», «n/2», «1 + n/4».
export function evalStatFormula(expr, n = 0) {
  // «5n» и «4n» — неявное умножение, а не число с хвостом.
  const src = clean(expr).replace(/\s+/g, '').replace(/,/g, '.').replace(/(\d)n/gi, '$1*n');
  let i = 0;
  const peek = () => src[i];
  const parseExpr = () => {
    let v = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = src[i++];
      const r = parseTerm();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  };
  const parseTerm = () => {
    let v = parseFactor();
    while (peek() === '*' || peek() === '/') {
      const op = src[i++];
      const r = parseFactor();
      v = op === '*' ? v * r : (r === 0 ? 0 : v / r);
    }
    return v;
  };
  const parseFactor = () => {
    let sign = 1;
    while (peek() === '+' || peek() === '-') {
      if (src[i++] === '-') sign = -sign;
    }
    if (peek() === '(') {
      i++;
      const v = parseExpr();
      if (peek() === ')') i++;
      return sign * v;
    }
    if (peek() === 'n' || peek() === 'N') {
      i++;
      return sign * (Number(n) || 0);
    }
    const m = /^\d+(?:\.\d+)?/.exec(src.slice(i));
    if (m) {
      i += m[0].length;
      return sign * Number(m[0]);
    }
    return 0;
  };
  const value = parseExpr();
  return Number.isFinite(value) ? Math.floor(value + 1e-9) : 0;
}

const num = (v) => Number(v) || 0;

function statTokens(text) {
  const t = String(text || '');
  const out = [];
  const add = (stat, re) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(t))) {
      if (!m[0]) { re.lastIndex++; continue; }
      const token = m[0].trimEnd();
      out.push({ stat, start: m.index, end: m.index + token.length, token });
    }
  };
  add('atk', /(?<![А-Яа-яЁё])атк(?![А-Яа-яЁё])/gi);
  add('ksh', /(?<![А-Яа-яЁё])кш(?![А-Яа-яЁё])/gi);
  add('tchn', /(?<![А-Яа-яЁё])тчн(?![А-Яа-яЁё])/gi);
  add('avx', /(?<![А-Яа-яЁё])авх(?![А-Яа-яЁё])/gi);
  add('kc', /(?<![А-Яа-яЁё])кц(?![А-Яа-яЁё])/gi);
  add('evasion', /(?<![А-Яа-яЁё])укл(?:онени[ея])?(?![А-Яа-яЁё])/gi);
  add('speed', /(?<![А-Яа-яЁё])скороход(?![А-Яа-яЁё])/gi);
  add('flight', /(?<![А-Яа-яЁё])пол[её]т(?![А-Яа-яЁё])/gi);
  add('od', /(?<![А-Яа-яЁё])од(?![А-Яа-яЁё])/gi);
  add('op', /(?<![А-Яа-яЁё])оп(?![А-Яа-яЁё])/gi);
  // Деф(п)/Деф.п/деф п/деф(а)/деф А — один токен с определением типа.
  const defRe = /(?<![А-Яа-яЁё])деф(?:\.?\s*\(?\s*([пpаa])\s*\)?\.?)?/gi;
  let m;
  while ((m = defRe.exec(t))) {
    if (!m[0]) { defRe.lastIndex++; continue; }
    const part = String(m[1] || 'п').toLowerCase();
    const token = m[0].trimEnd();
    out.push({ stat: part === 'а' || part === 'a' ? 'defA' : 'defP', start: m.index, end: m.index + token.length, token });
  }
  out.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const filtered = [];
  for (const x of out) {
    if (filtered.some((y) => x.start < y.end && x.end > y.start)) continue;
    filtered.push(x);
  }
  return filtered;
}

function exprTokens(text, n) {
  const out = [];
  const re = new RegExp(EXPR_SOURCE, 'gi');
  let m;
  while ((m = re.exec(text))) {
    if (!m[0].trim()) { re.lastIndex++; continue; }
    const lead = m[0].length - m[0].trimStart().length;
    const raw = m[0].trim();
    out.push({ start: m.index + lead, end: m.index + lead + raw.length, raw, value: evalStatFormula(raw, n) });
  }
  return out;
}

// Стоимость ОД не должна становиться бонусом. Маскируем такие упоминания до
// разбора, чтобы число из «потратив 1 ОД» не приклеилось к соседнему ТЧН.
function maskCostOd(text) {
  return String(text || '')
    .replace(/(?:потрат\w*|потрач\w*|трат\w*|тратя|использ\w*|стоит|за\s+очк\w*|взамен|отдать|сменить|без\s+траты|за\s+(?:один|одно|1)|имеете|имеет)\s*(?:сво[еию]\w*\s*)?(?:ваши\s+)?(?:доступные\s+)?(?:\d+\s*)?(?:доп\w*\s*)?ОД/gi, ' ')
    .replace(/(?:\d+\s*)?ОД\s*(?:будет\s+)?(?:потрачен\w*|тратится|тратит|стоит|уходит)/gi, ' ')
    .replace(/(?:за\s+)?кажд\w*\s+потрач\w*[^.;|]{0,20}ОД/gi, ' ');
}

function splitSections(raw) {
  const text = clean(raw);
  const re = /(Параметры|Эффекты|Эффект|Уникал\w*\s+(?:эффект|свойств)\w*|Описание)\s*:/gi;
  const matches = [...text.matchAll(re)];
  if (!matches.length) return [{ kind: 'text', text }];
  const out = [];
  if (matches[0].index > 0) out.push({ kind: 'text', text: text.slice(0, matches[0].index) });
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const label = matches[i][1].toLowerCase();
    const kind = label.startsWith('параметр') ? 'params'
      : label.startsWith('уникал') ? 'unique'
        : label.startsWith('описан') ? 'desc'
          : 'effects';
    out.push({ kind, text: text.slice(start, end) });
  }
  return out;
}

function splitClauses(text) {
  return clean(text)
    .split(/[;\n|]+|(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function activityOf(text) {
  // «вне активного боя» — условие применения, а не активный эффект.
  const t = String(text || '')
    .replace(/вне\s+активного\s+боя/gi, ' ')
    .replace(/не\s+активн\w*/gi, ' ');
  if (/пассивн/i.test(t)) return false;
  if (EXPLICIT_ACTIVE_RE.test(t)) return true;
  if (/(?:(?<![А-Яа-яЁё])кд\s*[-:]?\s*\d|раз в (?:бой|раунд|ход)|до конца боя)/i.test(t)) return true;
  return null;
}

function clauseHasCondition(text) {
  return CONDITION_RE.test(String(text || ''));
}

function isBonusClause(text) {
  return BONUS_RE.test(String(text || ''));
}

function pairEffects(text, n) {
  const stats = statTokens(text);
  const exprs = exprTokens(text, n);
  const used = new Set();
  const out = [];
  for (const st of stats) {
    const between = (a, b) => stats.some((x) => x !== st && x.start >= a && x.end <= b);
    // Слева и справа ищем ближайшее число, не переходя через другой параметр.
    let left = null;
    for (const e of exprs) {
      if (used.has(e) || e.end > st.start) continue;
      if (between(e.end, st.start)) continue;
      if (!left || e.end > left.end) left = e;
    }
    let right = null;
    for (const e of exprs) {
      if (used.has(e) || e.start < st.end) continue;
      if (between(st.end, e.start)) continue;
      if (!right || e.start < right.start) right = e;
    }
    // Ближе к параметру — обычно и есть его значение: «+4n АТК», «АТК 53», «деф п +n*2».
    let expr = null;
    if (left && right) expr = (st.start - left.end) <= (right.start - st.end) ? left : right;
    else expr = left || right;
    if (expr) {
      used.add(expr);
      out.push({ stat: st.stat, token: st.token, value: expr.value, raw: expr.raw });
      continue;
    }
    // «доп ОД» и «дополнительный ОП» без числа означают +1.
    const before = text.slice(Math.max(0, st.start - 30), st.start);
    if (/(доп(?:олнительн\w*)?|дополнительн\w*)[^.!?;|]{0,20}$/i.test(before)) {
      out.push({ stat: st.stat, token: st.token, value: 1, raw: '1' });
    }
  }
  return out;
}

// Почему эффект не считается автоматически (или не является бонусом персонажа).
function ignoreEffect(effect, clause) {
  if (GENERAL_IGNORE.test(clause)) return true;
  if (TRANSPORT_RE.test(clause)) return true;
  if (ROBOT_RE.test(clause)) return true;
  if (/получа(?:ют|ет)\s+атаку/i.test(clause)) return true;
  if (effect.stat === 'od' || effect.stat === 'op') {
    if (!isBonusClause(clause)) return true;
    if (effect.stat === 'od' && COST_OD.test(clause)) return true;
    if (effect.stat === 'op' && DISTANCE_RE.test(clause) && !isBonusClause(clause)) return true;
  }
  if (effect.stat === 'speed' && /(?<![А-Яа-яЁё])оп(?![А-Яа-яЁё])/i.test(clause) && !/скороход/i.test(clause) && !isBonusClause(clause)) return true;
  return false;
}

// Разбирает текст описания и возвращает найденные бонусы. Значения формул
// вычисляются сразу; «n» подставляет вызывающая сторона.
export function parseStatEffects(raw, opts = {}) {
  const n = Number(opts.n) || 0;
  const text = clean(raw);
  const sections = splitSections(text);
  const effectsSection = sections.find((s) => s.kind === 'effects');
  const effectsActive = effectsSection ? activityOf(effectsSection.text) : null;
  const globalActivity = activityOf(text);
  const conditionText = (sections.some((s) => s.kind !== 'text')
    ? sections.filter((s) => s.kind === 'unique' || s.kind === 'effects').map((s) => s.text).join(' ')
    : text);
  const sourceConditional = SOURCE_CONDITION_RE.test(conditionText);

  const out = [];
  for (const section of sections) {
    const own = activityOf(section.text);
    let active;
    // Параметры предмета — его постоянный профиль; активность из блока
    // «Эффекты» относится к эффектам, а не к самим параметрам.
    if (section.kind === 'params') active = own === true;
    else if (section.kind === 'effects') active = own ?? effectsActive ?? globalActivity ?? false;
    else if (section.kind === 'unique') active = own ?? effectsActive ?? globalActivity ?? false;
    else active = own ?? globalActivity ?? false;

    for (const clause of splitClauses(section.text)) {
      const masked = maskCostOd(clause);
      if (!masked.trim()) continue;
      const conditional = sourceConditional || clauseHasCondition(masked);
      // Условие не делает бонус активным: пассивный бонус с «если…» остаётся пассивным.
      const clauseActive = conditional && !EXPLICIT_ACTIVE_RE.test(masked) ? false : active;
      for (const effect of pairEffects(masked, n)) {
        if (ignoreEffect(effect, clause)) continue;
        out.push({
          stat: effect.stat === 'op' ? 'speed' : effect.stat,
          token: effect.token,
          value: effect.value,
          raw: effect.raw,
          text: clause,
          section: section.kind,
          conditional,
          active: clauseActive,
        });
      }
    }
  }
  return out;
}

// Предмет считается «оружием» для профиля текущего оружия. Обычное оружие —
// вся категория «Оружие»; импланты-клинки и подобное — только при явных АТК
// и одном из боевых параметров.
export function isWeaponItem(it) {
  if (!it) return false;
  if (it.id === CORE_IMPLANT.id) return false;
  if (it.category === 'Оружие') return true;
  if (/смарт\s*линк|нейробустер|гейткодер|перераспределитель/i.test(String(it.name || ''))) return false;
  const t = clean(it.description);
  if (!/(?<![А-Яа-яЁё])атк(?![А-Яа-яЁё])/i.test(t)) return false;
  if (!/(?<![А-Яа-яЁё])(?:кш|тчн|авх|кц)(?![А-Яа-яЁё])/i.test(t)) return false;
  if (it.category === 'Имплант') return it.tag === 'A' || it.tag === 'L';
  return WEAPON_TAGS.has(it.tag);
}

const isGearItem = (it) => !!it && it.id !== CORE_IMPLANT.id && GEAR_CATEGORIES.has(it.category) && !(it.category === 'Техник' && it.tag === 'Sat');

function sourceOfItem(it, type, key) {
  return {
    key,
    type,
    name: it.name || it.id,
    label: it.tag ? `[${it.tag}] ${it.name || it.id}` : (it.name || it.id),
    description: it.description || '',
    item: it,
  };
}

function weaponSources(c, d) {
  const out = [];
  const seen = new Set();
  const add = (it, type, index) => {
    if (!it || seen.has(it.id) || !isWeaponItem(it)) return;
    seen.add(it.id);
    out.push({ item: it, type, index });
  };
  (c.equipment || []).forEach((id, i) => add(d.itemMap.get(id), 'equipment', i));
  (c.implants || []).forEach((id, i) => add(d.itemMap.get(id), 'implant', i));
  return out;
}

function normalizeToggles(t) {
  return {
    sources: (t && typeof t.sources === 'object' && t.sources) ? t.sources : {},
    effects: (t && typeof t.effects === 'object' && t.effects) ? t.effects : {},
  };
}

function addEffects(result, source, effects, toggles) {
  if (!effects.length) return;
  // И активность, и условие — свойства всего источника: один тоггл на все его бонусы.
  // Активный эффект где-то внутри делает активным весь предмет (нейробустер и т. п.).
  const hasConditional = effects.some((e) => e.conditional);
  const hasActive = effects.some((e) => e.active);
  const condKey = `cond:${source.key}`;
  const condOn = toggles.effects[condKey] === true;
  const sourceOn = toggles.sources[source.key] === true;
  const prepared = effects.map((e, i) => ({
    ...e,
    key: `${source.key}:${i}`,
    conditional: hasConditional,
    active: hasActive,
    sourceOn,
    condOn,
    condKey,
    enabled: (!hasActive || sourceOn) && (!hasConditional || condOn),
  }));
  const condText = effects.filter((e) => e.conditional).map((e) => e.text).filter(Boolean).slice(0, 3).join(' ');
  const sourceCard = { ...source, effects: prepared, hasActive, hasConditional, condOn, condKey, condText, sourceOn };
  result.sources.push(sourceCard);
  for (const e of prepared) {
    if (!e.enabled) continue;
    result.totals[e.stat] = num(result.totals[e.stat]) + e.value;
    result.byStat[e.stat].push({
      name: sourceCard.label,
      value: e.value,
      conditional: hasConditional,
      active: e.active,
      sourceKey: source.key,
      effectKey: e.key,
    });
  }
  if (hasConditional) {
    result.conditional.push({
      sourceKey: source.key,
      sourceName: sourceCard.label,
      effectKey: condKey,
      condKey,
      text: condText,
      effects: prepared.map((e) => ({ stat: e.stat, value: e.value, active: e.active, enabled: e.enabled })),
      toggled: condOn,
      enabled: condOn,
      sourceOn,
    });
  }
}

export function collectCharacterStats(c, d) {
  const rank = d.rankMap.get(Number(c.rank))?.level || d.ranks[0]?.level || 1;
  const toggles = normalizeToggles(c.statsToggles);
  const result = {
    totals: Object.fromEntries(CHAR_STAT_ORDER.map((k) => [k, 0])),
    byStat: Object.fromEntries(CHAR_STAT_ORDER.map((k) => [k, []])),
    sources: [],
    conditional: [],
    weapons: [],
    weapon: null,
    weaponStats: null,
    ignoredWeapons: [],
    toggles,
  };

  const weapons = weaponSources(c, d);
  result.weapons = weapons.map((w) => ({ id: w.item.id, name: w.item.name, label: w.item.tag ? `[${w.item.tag}] ${w.item.name}` : w.item.name, type: w.type }));
  const ids = weapons.map((w) => w.item.id);
  const weaponId = c.statsWeapon && ids.includes(c.statsWeapon) ? c.statsWeapon : (ids.length ? ids[ids.length - 1] : null);
  const selected = weapons.find((w) => w.item.id === weaponId) || null;
  result.weapon = selected ? selected.item : null;
  result.ignoredWeapons = weapons.filter((w) => w.item.id !== weaponId).map((w) => w.item.name);

  if (selected) {
    const it = selected.item;
    const n = rank;
    const parsed = parseStatEffects(it.description, { n });
    const profile = {};
    for (const stat of WEAPON_STATS) profile[stat] = 0;
    const profileEffects = [];
    for (const e of parsed) {
      if (!WEAPON_STATS.includes(e.stat)) continue;
      if (e.conditional || e.active) continue;
      profile[e.stat] += e.value;
      profileEffects.push({ ...e, conditional: false, active: false, profile: true });
    }
    // КЦ оружия без явного значения считается равным 1.
    if (!profileEffects.some((e) => e.stat === 'kc')) {
      profile.kc = 1;
      profileEffects.push({
        stat: 'kc', value: 1, raw: '1', text: 'КЦ оружия по умолчанию', section: 'params',
        conditional: false, active: false, profile: true, defaultKc: true,
      });
    }
    result.weaponStats = profile;
    const source = sourceOfItem(it, selected.type, `weapon:${it.id}`);
    source.kind = 'weapon';
    const extras = parsed.filter((e) => e.conditional || e.active || !WEAPON_STATS.includes(e.stat));
    addEffects(result, source, [...profileEffects, ...extras], toggles);
  }

  // Экипировка и импланты: оружие учитывается только как текущий профиль.
  for (const [i, id] of (c.equipment || []).entries()) {
    const it = d.itemMap.get(id);
    if (!isGearItem(it) || isWeaponItem(it)) continue;
    const effects = parseStatEffects(it.description, { n: rank });
    if (effects.length) addEffects(result, sourceOfItem(it, 'equipment', `eq:${it.id}:${i}`), effects, toggles);
  }
  for (const [i, id] of (c.implants || []).entries()) {
    const it = d.itemMap.get(id);
    if (!it || it.id === CORE_IMPLANT.id || isWeaponItem(it)) continue;
    const effects = parseStatEffects(it.description, { n: rank });
    if (effects.length) addEffects(result, sourceOfItem(it, 'implant', `imp:${it.id}:${i}`), effects, toggles);
  }

  // Итоговые значения — только бонусы источников, без базовых характеристик.
  for (const k of CHAR_STAT_ORDER) result.totals[k] = Math.round(result.totals[k] || 0);
  return result;
}

// Публичные подписи для интерфейса.
export const STAT_SOURCE_TYPE_LABEL = Object.freeze({
  weapon: 'Текущее оружие',
  equipment: 'Экипировка',
  implant: 'Имплант',
});
