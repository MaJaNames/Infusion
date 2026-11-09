const KEY = 'infusion.char';
export const blankChar = () => ({
  v: 1, name: '', player: '', race: '0x001', rank: 1, class: 'Свой', trait: null, essence: null,
  stats: { strength: 5, dexterity: 5, intelligence: 5, will: 5, charisma: 5, perception: 5, technique: 5, luck: 5, constitution: 5 },
  skills: [], abilities: [], pockets: [], equipment: [], implants: [], repository: [], beasts: [], notes: '',
  overrides: { freePoints: null, hpMax: null, kronosMax: null, sellPrice: {}, shards: {} },
});
export const loadChar = () => { try { return { ...blankChar(), ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return blankChar(); } };
export const saveChar = (c) => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* память браузера недоступна */ } };

export function exportChar(c) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(c, null, 1)], { type: 'application/json' }));
  a.download = `${c.name || 'character'}.json`; a.click(); URL.revokeObjectURL(a.href);
}
export async function importChar(file) {
  const c = JSON.parse(await file.text());
  if (c?.v !== 1 || !c.stats) throw new Error('Это не карточка персонажа Инфузии');
  return { ...blankChar(), ...c };
}
