import { parsePart, parseDrone } from './parser.js';
export const KIND_LABEL = { body: 'Кузов', wheels: 'Колёса', engine: 'Двигатель', module: 'Модуль', weapon: 'Оружие' };
export const STAT_LABEL = { hp: 'ОЗ', extraHp: 'Доп.ХП', defP: 'ДЕФ(П)', evasion: 'УКЛ', speed: 'Скороход', screen: 'Экран', flight: 'Полёт', seats: 'Места',
  weaponSlots: 'Слоты оружия', heavySlots: 'Сверхтяж.', atk: 'АТК', accuracy: 'ТЧН', avx: 'АВХ', cd: 'КД', kc: 'КЦ', ksh: 'КШ', act: 'АКТ' };

// Дрон: его ОЗ, защита и запас хода считаются отдельно и не входят в статы Кочевника.
const DRONE_RE = /бронированный\s+холодильник\s+для\s+напитков/i;

let cache = { src: null, parts: [] };
// Детали техники — это предметы с тегом «Tr Mod»; числа и тип берутся из текста описания.
export function partsOf(d) {
  if (cache.src !== d.items) cache = {
    src: d.items,
    parts: d.items.filter((i) => i.tag === 'Tr Mod').map((item) => {
      const part = { item, stats: parsePart(item.description) };
      if (DRONE_RE.test(item.name)) part.drone = parseDrone(item.description);
      return part;
    }),
  };
  return cache.parts;
}
export const statChips = (s) => Object.entries(STAT_LABEL).filter(([k]) => s[k] && !(k === 'kc' && s[k] === 1))
  .map(([k, t]) => `<span class="chip">${t} ${s[k]}</span>`).join('') + (s.range && s.range !== '0' ? `<span class="chip">Дист ${s.range}</span>` : '');
export const droneChips = (d, current = null) => [
  d.hp ? `<span class="chip">ОЗ ${current == null ? d.hp : `${current} / ${d.hp}`}</span>` : '',
  d.defP ? `<span class="chip">ДЕФ(П) ${d.defP}</span>` : '',
  d.op ? `<span class="chip">ОП ${d.op}</span>` : '',
].join('');
