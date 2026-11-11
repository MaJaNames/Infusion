// Достаёт числовые характеристики детали из текста «Параметры: … Эффект: … Уникальный эффект: …».
// Правила повторяют регулярки листа «Бэкенд-Кочевник». Чтобы научить парсер новому параметру,
// добавьте строку в NUMERIC (число) или обработайте его ниже в parsePart.

const int = (s) => Number(String(s).replace(/\s+/g, ''));
const find = (re, text) => re.exec(text)?.[1];

// ключ → [регулярка, значение по умолчанию]
const NUMERIC = {
  hp:       [/(\d+)\s*(?:ОЗ|ХП)/i, 0],
  extraHp:  [/(\d+)\s*доп\s*хп/i, 0],
  speed:    [/скороход\s*(-?\s*\d+)/i, 0],
  screen:   [/экран\s*(\d+)/i, 0],
  flight:   [/пол[её]т\s*\(?(\d+)/i, 0],
  cd:       [/кд\s*(\d+)/i, 0],
  act:      [/акт\s*(\d+)/i, 0],
  atk:      [/атк\.?\s*(\d+)/i, 0],
  // «ТЧН - 25» означает −25 (так оформлены описания), «ТЧН 25» — +25.
  accuracy: [/(?:тчн|тчн\s*-)\s*(-?\s*\d+)/i, 0],
  ksh:      [/кш\s*(\d+)/i, 0],
  avx:      [/авх\s*(\d+)/i, 0],
  kc:       [/кц\s*(\d+)/i, 1],
};

const N = { одно: 1, один: 1, два: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8 };
const word = (text, re) => { const w = find(re, text)?.toLowerCase(); return w ? N[w] ?? 0 : 0; };

const KIND = { 'кузов': 'body', 'колеса': 'wheels', 'двигатель': 'engine', 'кочевник': 'module', 'кочевник - оружие': 'weapon' };

export function parsePart(text = '') {
  const t = String(text);
  const out = {};
  for (const [key, [re, dflt]] of Object.entries(NUMERIC)) { const v = find(re, t); out[key] = v === undefined ? dflt : int(v); }

  const def = find(/(\d+)\s*деф/i, t) ?? find(/деф\s*п?\.?\s*(\d+)/i, t);
  out.defP = def === undefined ? 0 : int(def);
  const ev = find(/укл\s*(\d+)/i, t) ?? find(/(\d+)\s*укл/i, t);
  out.evasion = ev === undefined ? 0 : int(ev);

  out.seats = Number(find(/(\d+)\s*мест/i, t)) || word(t, /(одно|два|три|четыре|пять|шесть|семь|восемь)\s*мест/i);
  out.weaponSlots = Number(find(/(\d+)\s*слот[а-я]*\s*под\s*оружие/i, t))
    || word(t, /(одно|один|два|три|четыре|пять)\s*слот[а-я]*\s*под\s*оружие/i)
    || (/ещ[её]\s*одно\s*оружие|ещ[её]\s*один\s*слот/i.test(t) ? 1 : 0);
  out.heavySlots = Number(find(/(\d+)\s*сверхтяжел/i, t))
    || (/два\s*сверхтяжел/i.test(t) ? 2 : /сверхтяжел(?:ое|ым)/i.test(t) ? 1 : 0);

  out.range = find(/дист\s*([\d\-–]+)/i, t) ?? '0';
  const kind = find(/Эффект:\s*Модификация\s*:\s*([^;]+);/i, t)?.trim().toLowerCase() ?? '';
  out.kind = KIND[kind] ?? null;
  out.unique = find(/Уникальный эффект:\s*(.*)/i, t)?.trim() ?? '';
  // Механические уникальные эффекты: «пол» Скорохода и требование к колёсам.
  out.speedFloor = Number(find(/скороход транспорта не может упасть ниже\s*(\d+)/i, t)) || 0;
  out.wheelReq = find(/ставиться только с направляющими\s*"?([^"\n]+)"?/i, t)?.trim() ?? '';
  return out;
}

// Отдельный разбор для дронов: в их описании число стоит после параметра («хп 300», «Деф п 80», «ОП 1»).
// «ОП» — это запас хода, по смыслу совпадает со «Скороходом».
export function parseDrone(text = '') {
  const t = String(text);
  const after = (re) => { const m = re.exec(t); return m ? int(m[1]) : 0; };
  return {
    hp: after(/(?:хп|оз)\s*(\d+)/i),
    defP: after(/деф\s*п?\.?\s*(\d+)/i),
    op: after(/(?:^|\s)оп\s*(\d+)/i),
  };
}
