// Идентификаторы записей базы: «0x» и минимум четыре hex-цифры — 0x00c9.
// Трёхзначный вид (0x0c9) остался в старых ссылках, карточках и выгрузках:
// его дополняем нулём на входе, чтобы всё внутри приложения сравнивалось одной строкой.
export const ID_DIGITS = 4;

const ID_RE = /^0x([0-9a-f]+)$/i;
// ID внутри составного ключа справочника: skill-0x0c1.
const EMBEDDED_RE = /0x([0-9a-f]{1,3})(?![0-9a-f])/gi;

// Строка целиком похожа на ID базы (0x1ac, 0x00c9), а не на название или тег.
export const isId = (v) => typeof v === 'string' && ID_RE.test(v);

// Канонический вид: нижний регистр и минимум ID_DIGITS цифр; всё остальное — как есть.
// Номера длиннее четырёх цифр (0x10000) не трогаем: они и так уникальны.
export const canonId = (v) => {
  const m = typeof v === 'string' ? ID_RE.exec(v) : null;
  if (!m) return v;
  const hex = m[1].toLowerCase();
  return `0x${hex.length < ID_DIGITS ? hex.padStart(ID_DIGITS, '0') : hex}`;
};

// Прежний трёхзначный вид — для редиректов со ссылок, которые уже разошлись.
// null, если такого вида не было: номер не помещается в три цифры.
export const legacyId = (v) => {
  const c = canonId(v);
  const m = typeof c === 'string' ? ID_RE.exec(c) : null;
  if (!m) return null;
  const hex = m[1].replace(/^0+/, '') || '0';
  return hex.length <= ID_DIGITS - 1 ? `0x${hex.padStart(ID_DIGITS - 1, '0')}` : null;
};

// Составной ключ с ID внутри: skill-0x0c1 → skill-0x00c1. Остальное не меняется.
export const canonKey = (v) => (typeof v === 'string' ? v.replace(EMBEDDED_RE, (m, hex) => `0x${hex.padStart(ID_DIGITS, '0')}`) : v);

// Тот же ключ в прежнем виде — для страниц-редиректов. null, если менять нечего.
export const legacyKey = (v) => {
  if (typeof v !== 'string') return null;
  let changed = false;
  const out = v.replace(/0x([0-9a-f]+)/gi, (m, hex) => {
    const old = legacyId(`0x${hex}`);
    if (!old || old === m.toLowerCase()) return m;
    changed = true;
    return old;
  });
  return changed ? out : null;
};

// Глубокая правка ссылок: карточка персонажа, гараж, роботы, импорт выгрузок.
// Ключи объектов тоже бывают ID (partHp, statsToggles.sources), поэтому их тоже выравниваем.
export const padIds = (v) => {
  if (typeof v === 'string') return canonId(v);
  if (Array.isArray(v)) return v.map(padIds);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [canonKey(k), padIds(x)]));
  return v;
};
