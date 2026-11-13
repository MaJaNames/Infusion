import { blankRO, blankROStatus } from '../character/rules.js';

const KEY = 'infusion.char';
export const blankChar = () => ({
  v: 1, name: '', player: '', race: '0x002', rank: 1, class: 'Соло', trait: null, essence: null,
  stats: { strength: 5, dexterity: 5, intelligence: 5, will: 5, charisma: 5, perception: 5, technique: 5, luck: 5, constitution: 5 },
  skills: [], abilities: [], pockets: [], equipment: [], implants: [], repository: [], beasts: [], beastPath: null, storage: null, notes: '', clinicImplants: [],
  transport: null, ro: blankRO(), roStatus: blankROStatus(), robots: [],
  overrides: { freePoints: null, hpMax: null, kronosMax: null, shards: {} },
});
// Старые карточки могли не иметь новых полей — дополняем их при загрузке.
export const normChar = (c) => {
  const b = blankChar();
  return {
    ...b, ...c,
    stats: { ...b.stats, ...(c?.stats || {}) },
    ro: { ...b.ro, ...(c?.ro || {}) },
    roStatus: { ...b.roStatus, ...(c?.roStatus || {}) },
    robots: Array.isArray(c?.robots) ? c.robots : b.robots,
    overrides: { ...b.overrides, ...(c?.overrides || {}), shards: { ...b.overrides.shards, ...(c?.overrides?.shards || {}) } },
  };
};
export const loadChar = () => { try { return normChar(JSON.parse(localStorage.getItem(KEY))); } catch { return blankChar(); } };
export const saveChar = (c) => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* память браузера недоступна */ } };

export function downloadJson(payload, filename) {
  if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function exportChar(c) {
  downloadJson(c, `${c.name || 'character'}.json`);
}
export async function importChar(file) {
  const c = JSON.parse(await file.text());
  if (c?.v !== 1 || !c.stats) throw new Error('Это не карточка персонажа Инфузии');
  return normChar(c);
}
