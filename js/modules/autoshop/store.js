// Гараж транспорта Кочевника: несколько машин, активная и её сборка.
// Данные живут в localStorage; модуль общий для Автомастерской и Экипировки персонажа.
export const GARAGE_KEY = 'infusion.garage';
export const LEGACY_KEY = 'infusion.build';
export const MAX_NAME = 48;

export const blankBuild = () => ({
  body: null, wheels: null, engine: null,
  weapons: [null, null, null], modules: [null, null, null, null, null],
  discount: 0, currentHp: null, partHp: {},
});
export const newId = () => `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const list = (v, n) => Array.from({ length: n }, (_, i) => (Array.isArray(v) ? v[i] ?? null : null));
const read = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };

// Текущее ОЗ деталей (например, дрона-холодильника) хранится по ID предмета.
const normPartHp = (v) => {
  if (!v || typeof v !== 'object') return {};
  const out = {};
  for (const [id, n] of Object.entries(v)) {
    const hp = Math.max(0, Math.round(Number(n) || 0));
    if (id && hp) out[id] = hp;
  }
  return out;
};

export const normBuild = (b) => {
  const src = b && typeof b === 'object' ? b : {};
  return {
    body: src.body ?? null, wheels: src.wheels ?? null, engine: src.engine ?? null,
    weapons: list(src.weapons, 3), modules: list(src.modules, 5),
    discount: Math.min(100, Math.max(0, Number(src.discount) || 0)),
    currentHp: src.currentHp == null || src.currentHp === '' ? null : Math.max(0, Math.round(Number(src.currentHp) || 0)),
    partHp: normPartHp(src.partHp),
  };
};

export const saveGarage = (g = G) => { try { localStorage.setItem(GARAGE_KEY, JSON.stringify(g)); } catch { /* память браузера недоступна */ } };

export function normGarage(raw, legacy) {
  const seen = new Set();
  const vehicles = (Array.isArray(raw?.vehicles) ? raw.vehicles : [])
    .filter((v) => v && typeof v === 'object')
    .map((v, i) => {
      let id = String(v.id || newId());
      while (seen.has(id)) id = newId();
      seen.add(id);
      const name = String(v.name ?? '').trim().slice(0, MAX_NAME) || `Транспорт ${i + 1}`;
      return { id, name, notes: String(v.notes ?? ''), build: normBuild(v.build) };
    });
  // Старая одиночная сборка становится первым транспортом гаража.
  // if (!vehicles.length) vehicles.push({ id: newId(), name: 'Транспорт 1', notes: '', build: normBuild(legacy) });
  const active = vehicles.length > 0 && vehicles.some((v) => v.id === raw?.active) ? raw.active : (vehicles[0]?.id || null);
  return { active, vehicles };
}

const stored = read(GARAGE_KEY);
export const G = normGarage(stored, read(LEGACY_KEY));
// Если гаража ещё нет (или он повреждён), сразу сохраняем перенесённую сборку.
if (!Array.isArray(stored?.vehicles) || !stored.vehicles.length) saveGarage(G);

export const currentVehicle = () => G.vehicles.find((v) => v.id === G.active) || G.vehicles[0];
export const partCount = (b) => [b.body, b.wheels, b.engine, ...b.weapons, ...b.modules].filter(Boolean).length;

// Выгрузка всего гаража в JSON: резервная копия или перенос.
export function exportGarage() {
  const payload = { v: 1, exportedAt: new Date().toISOString(), active: G.active, vehicles: G.vehicles };
  if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  a.download = 'transport.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

// Загрузка JSON обратно. Поддерживает выгрузку гаража, массив машин и старую одиночную сборку.
// Импортированные машины получают новые ID и добавляются к текущему гаражу.
export function importGarage(text) {
  const parsed = JSON.parse(text);
  const raw = Array.isArray(parsed) ? { vehicles: parsed } : parsed;
  if (!raw || typeof raw !== 'object') throw new Error('Файл не похож на транспорт');
  const hasVehicles = Array.isArray(raw.vehicles) && raw.vehicles.length > 0;
  const looksLikeBuild = ['body', 'wheels', 'engine', 'weapons', 'modules'].some((k) => k in raw);
  if (!hasVehicles && !looksLikeBuild) throw new Error('В файле нет транспорта');
  const normalized = normGarage(hasVehicles ? raw : { vehicles: [{ name: raw.name, build: raw }] }, null);
  const added = normalized.vehicles.map((v) => ({ ...v, id: newId() }));
  G.vehicles.push(...added);
  G.active = added[0].id;
  saveGarage(G);
  return added.length;
}
