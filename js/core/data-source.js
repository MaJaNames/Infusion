// Источник базы: снимок data/data.json (GitHub Actions) или Supabase напрямую.
// Выбор хранится в localStorage; при сбое онлайн-режима используется последняя
// удачная копия, поэтому персонаж и остальные данные остаются доступными.
const CACHE = 'infusion.db';
const SOURCE_KEY = 'infusion.dbSource';
const SNAPSHOT = 'data/data.json';

export const SOURCE_SNAPSHOT = 'snapshot';
export const SOURCE_LIVE = 'live';

// Публичный ключ Supabase даёт только чтение — этого достаточно для справочников.
const SUPABASE_URL = 'https://awsotgciwopymcornpyg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_wEyPdxTM_po23ZZqnoIZ5Q_USO6ZwqN';
const PAGE_SIZE = 1000;
const MAX_PAGES = 50;
const ATTEMPTS = 3;
const TIMEOUT_MS = 15000;
const RETRY_BASE_MS = 700;
const ORDER = {
  items: 'id', cards: 'id', ranks: 'level', races: 'id', classes: 'name', stats: 'key',
  skills: 'id', abilities: 'id', beasts: 'id', traits: 'id', essences: 'id',
  slots: 'tag', implant_combos: 'name',
};

// Если localStorage недоступен, выбор всё равно работает до перезагрузки страницы.
let memorySource = null;

export function getSourcePreference() {
  try {
    const value = localStorage.getItem(SOURCE_KEY);
    return value === SOURCE_LIVE || value === SOURCE_SNAPSHOT ? value : null;
  } catch {
    return memorySource;
  }
}

export function setSourcePreference(source) {
  if (source !== SOURCE_LIVE && source !== SOURCE_SNAPSHOT) return;
  memorySource = source;
  try { localStorage.setItem(SOURCE_KEY, source); } catch { /* память браузера недоступна */ }
}

// Кэш хранит и данные, и их происхождение: так понятно, что показано при сбое.
function readCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE));
    if (!raw) return null;
    if (raw.data && Array.isArray(raw.data.items)) {
      return { data: raw.data, source: raw.source === SOURCE_LIVE ? SOURCE_LIVE : SOURCE_SNAPSHOT, at: raw.at || 0 };
    }
    // Старый формат кэша — просто снимок базы.
    if (Array.isArray(raw.items)) return { data: raw, source: SOURCE_SNAPSHOT, at: 0 };
    return null;
  } catch {
    return null;
  }
}

function writeCache(data, source) {
  try {
    localStorage.setItem(CACHE, JSON.stringify({ v: 2, source, at: Date.now(), data }));
  } catch { /* кэш не обязателен */ }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isRetryable = (status) => status === 408 || status === 425 || status === 429 || status >= 500;

// Один запрос к PostgREST с таймаутом и повторами для временных сбоев.
async function request(path) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  let lastError = null;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error('браузер в офлайн-режиме');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        cache: 'no-store',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = new Error(`Supabase ${res.status}`);
        err.retryable = isRetryable(res.status);
        throw err;
      }
      const rows = await res.json();
      if (!Array.isArray(rows)) throw new Error('неожиданный ответ Supabase');
      return rows;
    } catch (e) {
      lastError = e?.name === 'AbortError' ? new Error('Supabase не ответил вовремя') : e;
      if (!lastError || typeof lastError !== 'object') lastError = new Error(String(lastError));
      if (lastError.retryable === undefined) lastError.retryable = true;
      if (!lastError.retryable || attempt >= ATTEMPTS) break;
      await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function fetchVersion() {
  const rows = await request('meta?key=eq.data_version&select=value');
  const value = rows[0]?.value;
  if (value === undefined || value === null) throw new Error('Supabase не вернул версию базы');
  return String(value);
}

// PostgREST отдаёт не больше 1000 строк за запрос, поэтому читаем страницами.
async function fetchTable(name) {
  const rows = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = new URLSearchParams({
      select: '*',
      order: `${ORDER[name]}.asc`,
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    const part = await request(`${name}?${query.toString()}`);
    rows.push(...part);
    if (part.length < PAGE_SIZE) return rows;
  }
  throw new Error(`таблица ${name} не поместилась в ${MAX_PAGES} страниц`);
}

async function loadLive(force, cached) {
  const version = await fetchVersion();
  if (!force && cached && String(cached.data.version) === version) {
    return { ...cached.data, source: 'Supabase (онлайн, без изменений)', sourceMode: SOURCE_LIVE };
  }
  const tables = await Promise.all(Object.keys(ORDER).map(async (name) => [name, await fetchTable(name)]));
  const data = { version };
  for (const [name, rows] of tables) data[name] = rows;
  writeCache(data, SOURCE_LIVE);
  return { ...data, source: 'Supabase (онлайн)', sourceMode: SOURCE_LIVE };
}

async function loadSnapshot(force) {
  const r = await fetch(force ? `${SNAPSHOT}?t=${Date.now()}` : SNAPSHOT, { cache: force ? 'no-store' : 'default' });
  if (!r.ok) throw new Error(`${SNAPSHOT}: ${r.status}`);
  const data = await r.json();
  if (!data || !Array.isArray(data.items)) throw new Error('в снимке нет базы');
  writeCache(data, SOURCE_SNAPSHOT);
  return { ...data, source: 'снимок data/data.json', sourceMode: SOURCE_SNAPSHOT };
}

export async function loadData({ force = false, source = getSourcePreference() || SOURCE_SNAPSHOT } = {}) {
  const cached = readCache();
  if (source === SOURCE_LIVE) {
    try {
      return await loadLive(force, cached);
    } catch (e) {
      const error = e?.message || String(e);
      if (cached) {
        return {
          ...cached.data,
          source: `кэш браузера (Supabase недоступен: ${error})`,
          sourceMode: SOURCE_LIVE,
          sourceFallback: true,
          sourceError: error,
        };
      }
      try {
        const snapshot = await loadSnapshot(true);
        return {
          ...snapshot,
          source: `снимок data/data.json (Supabase недоступен: ${error})`,
          sourceMode: SOURCE_LIVE,
          sourceFallback: true,
          sourceError: error,
        };
      } catch {
        throw e;
      }
    }
  }
  try {
    return await loadSnapshot(force);
  } catch (e) {
    if (cached) {
      return {
        ...cached.data,
        source: 'кэш браузера (без сети)',
        sourceMode: SOURCE_SNAPSHOT,
        sourceFallback: true,
        sourceError: e?.message || String(e),
      };
    }
    throw e;
  }
}
