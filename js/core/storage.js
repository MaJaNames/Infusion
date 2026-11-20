import { blankRO, blankROStatus } from '../character/rules.js';
import { padIds } from './ids.js';

const KEY = 'infusion.char';
export const blankChar = () => ({
  v: 1, name: '', player: '', race: '0x0002', rank: 1, class: 'Соло', trait: null, essence: null,
  stats: { strength: 5, dexterity: 5, intelligence: 5, will: 5, charisma: 5, perception: 5, technique: 5, luck: 5, constitution: 5 },
  skills: [], abilities: [], pockets: [], equipment: [], implants: [], repository: [], beasts: [], beastPath: null, storage: null, notes: '', clinicImplants: [],
  transport: null, ro: blankRO(), roStatus: blankROStatus(), robots: [],
  statsWeapon: null, statsToggles: { sources: {}, effects: {} },
  overrides: { freePoints: null, hpMax: null, kronosMax: null, shards: {} },
});
// Старые карточки могли не иметь новых полей — дополняем их при загрузке.
// Ссылки на базу приводим к каноническому ID: карточки, коды сборки и выгрузки
// могли быть сделаны до перехода на четырёхзначные номера.
export const normChar = (raw) => {
  const c = padIds(raw);
  const b = blankChar();
  return {
    ...b, ...c,
    stats: { ...b.stats, ...(c?.stats || {}) },
    ro: { ...b.ro, ...(c?.ro || {}) },
    roStatus: { ...b.roStatus, ...(c?.roStatus || {}) },
    robots: Array.isArray(c?.robots) ? c.robots : b.robots,
    statsToggles: {
      sources: { ...(c?.statsToggles?.sources || {}) },
      effects: { ...(c?.statsToggles?.effects || {}) },
    },
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

// Код сборки — base64url от JSON карточки. Удобно пересылать строкой в чате.
export const CHAR_CODE_PREFIX = 'INF1.';
export function charToCode(c) {
  const bytes = new TextEncoder().encode(JSON.stringify(c));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base64 = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return CHAR_CODE_PREFIX + base64;
}
export function codeToChar(code) {
  let raw = String(code ?? '').trim().replace(/\s+/g, '');
  if (!raw) throw new Error('Вставьте код сборки');
  if (raw.startsWith(CHAR_CODE_PREFIX)) raw = raw.slice(CHAR_CODE_PREFIX.length);
  raw = raw.replace(/-/g, '+').replace(/_/g, '/');
  while (raw.length % 4) raw += '=';
  let json;
  try {
    const binary = atob(raw);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    json = new TextDecoder().decode(bytes);
  } catch {
    throw new Error('Код сборки повреждён');
  }
  let c;
  try { c = JSON.parse(json); } catch { throw new Error('Код сборки повреждён'); }
  if (c?.v !== 1 || !c.stats) throw new Error('Это не код персонажа Инфузии');
  return normChar(c);
}
