// Сводка характеристик персонажа по источникам: экипировка, импланты,
// способности, мутации и способности зверя. Модуль только читает карточку:
// существующие расчёты (ОЗ, инициатива и т. п.) он не меняет.

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

// Ручные правки разбора. STAT_OVERRIDES — способности и мутации, у них
// ключ — id из базы. BEAST_STAT_OVERRIDES — способности зверя: у них своя
// нумерация, поэтому ключи не должны пересекаться со способностями персонажа.
// Если для id есть запись, автоматический разбор описания не используется:
// бонусы берутся только из effects. Значение можно задать числом или формулой
// ('2n', 'n/2', '1 + n').
// Поля записи:
//   n        — 'rank' (ранг персонажа), 'beast' (число способностей зверя) или число;
//   effects  — список бонусов, каждое поле:
//     stat        — atk | ksh | tchn | avx | kc | defP | defA | evasion | speed | flight | od;
//     value       — число или формула с n;
//     active      — true: учитывается только после включения источника в «Статах»;
//     conditional — true: условный бонус, по умолчанию не входит в сумму;
//     text        — пояснение для карточки (необязательно).
// Пример:
//   '0x001': { n: 'rank', effects: [
//     { stat: 'atk', value: '2n', active: false, conditional: false, text: 'Пассивно: +2n АТК' },
//     { stat: 'ksh', value: 1, active: true, conditional: true, text: 'В ближнем бою: +1 КШ' },
//   ] },
export const STAT_OVERRIDES = {
  // Способности и мутации разобраны вручную: запись есть для каждой,
  // поэтому автопарсер для них больше не используется.
  '0x001': { n: 'rank', effects: [] }, // Ловкие пальчики
  '0x002': { n: 'rank', effects: [] }, // Я Особенный
  '0x003': { n: 'rank', effects: [] }, // Наш пострел везде поспел
  '0x004': { n: 'rank', effects: [] }, // Мастер
  '0x005': { n: 'rank', effects: [] }, // Перемена блюд
  '0x006': { n: 'rank', effects: [] }, // Атака вдогонку
  '0x007': { n: 'rank', effects: [ // Преимущество высоты
    { stat: 'atk', value: '5n', conditional: true, text: 'Когда вы находитесь выше цели' },
  ] },
  '0x008': { n: 'rank', effects: [] }, // Связи в тенях
  '0x009': { n: 'rank', effects: [ // Мастерство прицеливания
    { stat: 'tchn', value: 20, active: true, conditional: true, text: 'Следующая атака после активации' },
  ] },
  '0x00a': { n: 'rank', effects: [] }, // Магма в венах
  '0x00b': { n: 'rank', effects: [] }, // Неутомимость
  '0x00c': { n: 'rank', effects: [] }, // Игра с позициями
  '0x00d': { n: 'rank', effects: [] }, // Пламенный сердцем
  '0x00e': { n: 'rank', effects: [] }, // Путь познания
  '0x00f': { n: 'rank', effects: [] }, // Путь жертвы
  '0x010': { n: 'rank', effects: [] }, // Путь риска
  '0x011': { n: 'rank', effects: [] }, // Путь безумия
  '0x012': { n: 'rank', effects: [] }, // Последнее безумие?
  '0x013': { n: 'rank', effects: [ // Первая стадия Безумия
    { stat: 'atk', value: '4n', conditional: true, text: 'Ближним оружием' },
    { stat: 'atk', value: '-4n', conditional: true, text: 'Дальним оружием' },
  ] },
  '0x014': { n: 'rank', effects: [ // Вторая стадия Безумия
    { stat: 'atk', value: '6n', conditional: true, text: 'Ближним оружием' },
    { stat: 'atk', value: '-6n', conditional: true, text: 'Дальним оружием' },
    { stat: 'defA', value: 15, text: 'Пассивно' },
  ] },
  '0x015': { n: 'rank', effects: [ // Третья стадия Безумия
    { stat: 'atk', value: '10n', conditional: true, text: 'Ближним оружием' },
    { stat: 'atk', value: '-10n', conditional: true, text: 'Дальним оружием' },
    { stat: 'defP', value: -60, text: 'Пассивно' },
    { stat: 'defA', value: 60, text: 'Пассивно' },
  ] },
  '0x016': { n: 'rank', effects: [] }, // Скоротечность весны
  '0x017': { n: 'rank', effects: [ // Где твоя мотивация
    { stat: 'atk', value: '3n', active: true, conditional: true, text: 'Бросок защитной атаки' },
  ] },
  '0x018': { n: 'rank', effects: [] }, // Еще не пал
  '0x019': { n: 'rank', effects: [] }, // Долг еще не оплачен
  '0x01a': { n: 'rank', effects: [] }, // Зажигаем!
  '0x01b': { n: 'rank', effects: [] }, // Ударное соло!
  '0x01c': { n: 'rank', effects: [] }, // Мэшап
  '0x01d': { n: 'rank', effects: [] }, // На бис!
  '0x01e': { n: 'rank', effects: [] }, // Адреналиновый бит
  '0x01f': { n: 'rank', effects: [ // Особый маневр
    { stat: 'od', value: 1, active: true, text: 'Раз в бой' },
    { stat: 'speed', value: 1, active: true, text: 'Раз в бой' },
  ] },
  '0x020': { n: 'rank', effects: [] }, // Сквозной калибр
  '0x021': { n: 'rank', effects: [ // Удар из тени
    { stat: 'ksh', value: 25, conditional: true, text: 'Первая атака из стелса' },
  ] },
  '0x022': { n: 'rank', effects: [] }, // Геометрия смерти
  '0x023': { n: 'rank', effects: [ // Импульс стрелка
    { stat: 'speed', value: 2, conditional: true, text: 'На следующий раунд после убийства из пистолета или ПП' },
  ] },
  '0x024': { n: 'rank', effects: [] }, // Встречный свинец
  '0x025': { n: 'rank', effects: [] }, // Шквальный сектор
  '0x026': { n: 'rank', effects: [ // Метка наемника
    { stat: 'atk', value: 10, active: true, conditional: true, text: 'После метки, накопительно' },
  ] },
  '0x027': { n: 'rank', effects: [] }, // Не тот человек в том месте
  '0x028': { n: 'rank', effects: [ // Использование окружения
    { stat: 'atk', value: '8n', active: true, text: 'Свободная атака' },
  ] },
  '0x029': { n: 'rank', effects: [] }, // Рободруг
  '0x02a': { n: 'rank', effects: [] }, // Заслон
  '0x02b': { n: 'rank', effects: [] }, // Реальная сталь
  '0x02c': { n: 'rank', effects: [] }, // Стальная месть
  '0x02d': { n: 'rank', effects: [] }, // Мастер управления
  '0x02e': { n: 'rank', effects: [ // Повелитель стихии
    { stat: 'atk', value: '5n', conditional: true, text: 'При использовании общих базисов и базисов Трансгрессора' },
  ] },
  '0x02f': { n: 'rank', effects: [] }, // Элементальный пробой
  '0x030': { n: 'rank', effects: [ // Мастер одной стихии
    { stat: 'atk', value: 8, conditional: true, text: 'За карту той же элементальной сущности, накопительно' },
  ] },
  '0x031': { n: 'rank', effects: [] }, // Эфирный резонанс
  '0x032': { n: 'rank', effects: [] }, // Адаптация метакризны
  '0x033': { n: 'rank', effects: [] }, // Мне не важно какого размера комната
  '0x034': { n: 'rank', effects: [] }, // Вам лучше пригнуться
  '0x035': { n: 'rank', effects: [] }, // Магический мученик
  '0x036': { n: 'rank', effects: [] }, // Умри, но не сейчас
  '0x037': { n: 'rank', effects: [] }, // Тик-Так Тактик
  '0x038': { n: 'rank', effects: [] }, // Мастер Столбов
  '0x039': { n: 'rank', effects: [] }, // Ой, а кто это сделал?
  '0x03a': { n: 'rank', effects: [] }, // Я этого не говорил
  '0x03b': { n: 'rank', effects: [] }, // Как мухи на варенье...
  '0x03c': { n: 'rank', effects: [] }, // Ментальное противостояние
  '0x03d': { n: 'rank', effects: [] }, // Кошмар наяву
  '0x03e': { n: 'rank', effects: [] }, // Ментальная пиявка
  '0x03f': { n: 'rank', effects: [] }, // Вторжение в разум
  '0x040': { n: 'rank', effects: [] }, // Коллективное бессознательное
  '0x041': { n: 'rank', effects: [] }, // Бэкдор
  '0x042': { n: 'rank', effects: [] }, // Тихий взлом
  '0x043': { n: 'rank', effects: [] }, // Перегрузка ядра
  '0x044': { n: 'rank', effects: [] }, // Многопоточность
  '0x045': { n: 'rank', effects: [] }, // Дух машины
  '0x046': { n: 'rank', effects: [] }, // Школа экстримального вождения
  '0x047': { n: 'rank', effects: [] }, // Борт-механик
  '0x048': { n: 'rank', effects: [] }, // Полевой врач
  '0x049': { n: 'rank', effects: [] }, // Никто не умрет в мою смену
  '0x04a': { n: 'rank', effects: [] }, // Комплексная терапия
  '0x04b': { n: 'rank', effects: [] }, // Лечебная атмосфера
  '0x04c': { n: 'rank', effects: [] }, // Генно-модифицированные жабры
  '0x04d': { n: 'rank', effects: [] }, // Фасеточные глаза
  '0x04e': { n: 'rank', effects: [] }, // Симбиотическая кровеносная система
  '0x04f': { n: 'rank', effects: [ // Когти
    { stat: 'atk', value: 40, conditional: true, text: 'В бою без оружия' },
  ] },
  '0x050': { n: 'rank', effects: [] }, // Биолюминесцентные татуировки
  '0x051': { n: 'rank', effects: [] }, // Тепловизионное зрение
  '0x052': { n: 'rank', effects: [] }, // Псио-барьер ума
  '0x053': { n: 'rank', effects: [] }, // Гравитационные узлы
  '0x054': { n: 'rank', effects: [] }, // Кроно-регенератор клеток
  '0x055': { n: 'rank', effects: [ // Ядовитые клыки
    { stat: 'atk', value: '4n', conditional: true, text: 'Ближняя атака клыками' },
    { stat: 'tchn', value: '3n', conditional: true, text: 'Ближняя атака клыками' },
    { stat: 'ksh', value: '2n', conditional: true, text: 'Ближняя атака клыками' },
  ] },
  '0x056': { n: 'rank', effects: [ // Крылья
    { stat: 'flight', value: 3, text: 'Пассивно' },
  ] },
  '0x057': { n: 'rank', effects: [ // Прочная чешуя
    { stat: 'defP', value: 15, conditional: true, text: 'Против термического урона' },
  ] },
  '0x058': { n: 'rank', effects: [] }, // Цепкий хвост
  '0x059': { n: 'rank', effects: [] }, // Кроно-резонаторные кристаллиты
  '0x05a': { n: 'rank', effects: [] }, // Рога
  '0x05b': { n: 'rank', effects: [ // Термическая стойкость
    { stat: 'defP', value: 15, conditional: true, text: 'Против крио-урона' },
  ] },
  '0x05c': { n: 'rank', effects: [] }, // Неутомимость
  '0x05d': { n: 'rank', effects: [] }, // Саморегулирующаяся кровеносная система
  '0x05e': { n: 'rank', effects: [] }, // Истинная всеядность
  '0x05f': { n: 'rank', effects: [] }, // Ментальные блокаторы
  '0x060': { n: 'rank', effects: [] }, // Несломленный
  '0x061': { n: 'rank', effects: [] }, // Выживший
  '0x062': { n: 'rank', effects: [] }, // Термостабильная кожа
};

// Способности зверя: n — количество взятых способностей зверя (не ранг).
// Как и у способностей персонажа, автопарсер здесь не используется.
export const BEAST_STAT_OVERRIDES = {
  '0x001': { n: 'beast', effects: [ // Путь городского хищника
    { stat: 'kc', value: '1 + n/4', text: 'КЦ 1 + n/4' },
  ] },
  '0x002': { n: 'beast', effects: [] }, // Обворожительное присутствие
  '0x003': { n: 'beast', effects: [] }, // Затягивание ошейника
  '0x004': { n: 'beast', effects: [] }, // Просьба
  '0x005': { n: 'beast', effects: [] }, // Приказ
  '0x006': { n: 'beast', effects: [ // Сила в стае
    { stat: 'atk', value: 'n', conditional: true, text: 'За каждого союзника в бою' },
    { stat: 'defP', value: '2n', conditional: true, text: 'За каждого союзника в бою' },
  ] },
  '0x007': { n: 'beast', effects: [] }, // Приготовление
  '0x008': { n: 'beast', effects: [] }, // Убеждение защиты
  '0x009': { n: 'beast', effects: [] }, // Путь сокрытия
  '0x00a': { n: 'beast', effects: [] }, // Теневое отражение
  '0x00b': { n: 'beast', effects: [] }, // Расширение домена
  '0x00c': { n: 'beast', effects: [] }, // Истинное скрытое ношение
  '0x00d': { n: 'beast', effects: [ // Раскрытие потенциала оружия
    { stat: 'atk', value: '8n', conditional: true, text: 'Атака из сокрытого оружия' },
    { stat: 'tchn', value: '3n', conditional: true, text: 'Атака из сокрытого оружия' },
    { stat: 'ksh', value: 2, conditional: true, text: 'Атака из сокрытого оружия' },
  ] },
  '0x00e': { n: 'beast', effects: [] }, // Единение с тенью
  '0x00f': { n: 'beast', effects: [] }, // Контроль территории
  '0x010': { n: 'beast', effects: [] }, // Аватар тени
  '0x011': { n: 'beast', effects: [] }, // Званный ужин
  '0x012': { n: 'beast', effects: [] }, // Путь изменений
  '0x013': { n: 'beast', effects: [] }, // Практичное искусство
  '0x014': { n: 'beast', effects: [] }, // Репетиция облика
  '0x015': { n: 'beast', effects: [] }, // Приманка
  '0x016': { n: 'beast', effects: [] }, // Развитие тела
  '0x017': { n: 'beast', effects: [ // Кровавый цветок
    { stat: 'atk', value: '15n', active: true, text: 'Атака шипами по целям в радиусе 1 ОП' },
    { stat: 'ksh', value: '5n', active: true, text: 'Атака шипами по целям в радиусе 1 ОП' },
  ] },
  '0x018': { n: 'beast', effects: [] }, // Схлопывание ловушки
  '0x019': { n: 'beast', effects: [ // Апекс развития
    { stat: 'atk', value: 20, active: true, text: 'Изменённая форма' },
    { stat: 'defP', value: 60, active: true, text: 'Изменённая форма' },
    { stat: 'defA', value: 30, active: true, text: 'Изменённая форма' },
    { stat: 'evasion', value: 70, active: true, text: 'Изменённая форма' },
    { stat: 'od', value: 1, active: true, text: 'Изменённая форма' },
  ] },
  '0x01a': { n: 'beast', effects: [ // Кровавая ярость
    { stat: 'avx', value: 1, conditional: true, text: 'Пока ОЗ ниже половины' },
    { stat: 'speed', value: 2, conditional: true, text: 'Пока ОЗ ниже половины' },
  ] },
  '0x01b': { n: 'beast', effects: [] }, // Отчаяние
  '0x01c': { n: 'beast', effects: [] }, // Здоровое питание
  '0x01d': { n: 'beast', effects: [] }, // Голод превыше всего
  '0x01e': { n: 'beast', effects: [] }, // Голод подождет
  '0x01f': { n: 'beast', effects: [] }, // Очистка тела
  '0x020': { n: 'beast', effects: [ // Стремительность
    { stat: 'od', value: 1, active: true, text: 'КД 2' },
    { stat: 'speed', value: 'n/2 + 1', active: true, text: 'КД 2, ОП с округлением вниз' },
  ] },
};

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
const CONDITION_RE = /(если|при(?:\s|$)|только|находясь|пока |до тех пор|в бою|ближн|дальн|против|цел(?:ь|и|ям|ью|ей)|союзник|враг|за кажд|радиус|пределах|дистанц|расстояни|на линии|в темноте|без оружи|с оружи|оруж|зависит|провал|успешн|использовани|применени|после |перед |в течение|в течении|в момент|выше своей цели|ниже вас|в стелсе|ярост|состояни|форма|до конца|каждый ход|каждое|каждую|каждого|раз в (?:бой|раунд|ход))/i;
const SOURCE_CONDITION_RE = /(бонус[^.;|]{0,40}только|только в (?:ближнем|дальнем) бою|работает только)/i;

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
  if (/эффект[а-яё]*\s*:\s*активн/i.test(t)) return true;
  if (/(?<![А-Яа-яЁё])активн(?:ый|ая|ое|ые|ого|ому|ым|ой|ую|ых)(?![А-Яа-яЁё])/i.test(t)) return true;
  if (/(?:(?<![А-Яа-яЁё])кд\s*[-:]?\s*\d|раз в (?:бой|раунд|ход)|до конца боя|активир|мгновенн)/i.test(t)) return true;
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
      const conditional = sourceConditional || clauseHasCondition(clause);
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
          active,
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

// Подстановка n для ручной правки и готовые эффекты из STAT_OVERRIDES.
function overrideN(ov, rank, beastCount, fallback) {
  if (!ov || ov.n === undefined) return fallback;
  if (ov.n === 'beast') return beastCount;
  if (ov.n === 'rank') return rank;
  return Number.isFinite(Number(ov.n)) ? Number(ov.n) : fallback;
}

function overrideEffects(ov, n) {
  return (ov?.effects || []).map((e, i) => ({
    stat: e.stat,
    value: typeof e.value === 'number' ? e.value : evalStatFormula(String(e.value), n),
    raw: String(e.value),
    text: e.text || `Ручная правка №${i + 1}`,
    section: 'unique',
    conditional: e.conditional === true,
    active: e.active === true,
  }));
}

function addEffects(result, source, effects, toggles) {
  const prepared = effects.map((e, i) => {
    const effectKey = `${source.key}:${i}`;
    const conditional = !!e.conditional;
    const active = !!e.active;
    const sourceOn = toggles.sources[source.key] === true;
    const effectOn = toggles.effects[effectKey] === true;
    const enabled = conditional
      ? (effectOn && (!active || sourceOn))
      : (!active || sourceOn);
    return {
      ...e,
      key: effectKey,
      conditional,
      active,
      sourceOn,
      toggled: effectOn,
      enabled,
    };
  });
  if (!prepared.length) return;
  const hasActive = prepared.some((e) => e.active);
  const sourceCard = { ...source, effects: prepared, hasActive, sourceOn: toggles.sources[source.key] === true };
  result.sources.push(sourceCard);
  for (const e of prepared) {
    if (e.enabled) {
      result.totals[e.stat] = num(result.totals[e.stat]) + e.value;
      result.byStat[e.stat].push({
        name: sourceCard.label,
        value: e.value,
        conditional: e.conditional,
        active: e.active,
        sourceKey: source.key,
        effectKey: e.key,
      });
    }
    if (e.conditional) {
      result.conditional.push({
        sourceKey: source.key,
        sourceName: sourceCard.label,
        effectKey: e.key,
        stat: e.stat,
        value: e.value,
        text: e.text,
        active: e.active,
        sourceOn: e.sourceOn,
        toggled: e.toggled,
        enabled: e.enabled,
      });
    }
  }
}

export function collectCharacterStats(c, d) {
  const rank = d.rankMap.get(Number(c.rank))?.level || d.ranks[0]?.level || 1;
  const beastCount = Array.isArray(c.beasts) ? c.beasts.length : 0;
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

  // Способности и мутации разбираются только вручную: автопарсер для них не
  // используется, чтобы спорные описания не давали случайных бонусов.
  for (const [i, id] of (c.abilities || []).entries()) {
    if (!id) continue;
    const a = d.abilityMap.get(id);
    if (!a) continue;
    const ov = STAT_OVERRIDES[a.id];
    if (!ov) continue;
    const n = overrideN(ov, rank, beastCount, rank);
    const effects = overrideEffects(ov, n);
    if (!effects.length) continue;
    const type = a.kind === 'mutation' ? 'mutation' : 'ability';
    addEffects(result, {
      key: `ab:${a.id}:${i}`,
      type,
      name: a.name,
      label: a.name,
      description: a.description || '',
      ability: a,
    }, effects, toggles);
  }

  // Способности зверя: n — количество взятых способностей зверя, бонусы
  // задаются только вручную (своя нумерация, см. BEAST_STAT_OVERRIDES).
  for (const [i, id] of (c.beasts || []).entries()) {
    const b = (d.beastMap && d.beastMap.get(id)) || d.beasts.find((x) => x.id === id);
    if (!b) continue;
    const ov = BEAST_STAT_OVERRIDES[b.id];
    if (!ov) continue;
    const n = overrideN(ov, rank, beastCount, beastCount);
    const effects = overrideEffects(ov, n);
    if (!effects.length) continue;
    addEffects(result, {
      key: `beast:${b.id}`,
      type: 'beast',
      name: b.name,
      label: b.name,
      description: b.description || '',
      beast: b,
    }, effects, toggles);
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
  ability: 'Способность',
  mutation: 'Мутация',
  beast: 'Способность зверя',
});
