// Работа с файлами: скачивание, импорт, а также File System Access API
// (Chromium): можно привязать JSON-файл и сохранять в него по Ctrl+S.

const DB_NAME = 'infusion-relationships';
const STORE = 'kv';
const HANDLE_KEY = 'file-handle';

const canUseDom = () => typeof window !== 'undefined' && typeof document !== 'undefined';

function openDb() {
  return new Promise((resolve, reject) => {
    if (!canUseDom() || !window.indexedDB) return resolve(null);
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getStoredHandle() {
  try {
    const db = await openDb();
    if (!db) return null;
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(HANDLE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function storeHandle(handle) {
  try {
    const db = await openDb();
    if (!db) return;
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      if (handle) tx.objectStore(STORE).put(handle, HANDLE_KEY);
      else tx.objectStore(STORE).delete(HANDLE_KEY);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  } catch {
    /* IndexedDB может быть недоступна в приватном режиме */
  }
}

export const supportsFileSystem = () =>
  canUseDom() && typeof window.showOpenFilePicker === 'function' && typeof window.showSaveFilePicker === 'function';

const JSON_TYPES = [{ description: 'JSON', accept: { 'application/json': ['.json'] } }];

async function ensurePermission(handle, mode) {
  if (!handle) return false;
  const options = { mode };
  if ((await handle.queryPermission(options)) === 'granted') return true;
  return (await handle.requestPermission(options)) === 'granted';
}

export async function pickSaveFile(suggestedName = 'relationships.json') {
  if (!supportsFileSystem()) throw new Error('Браузер не поддерживает сохранение в файл');
  const handle = await window.showSaveFilePicker({ suggestedName, types: JSON_TYPES });
  await storeHandle(handle);
  return handle;
}

export async function writeFile(handle, contents) {
  if (!handle) throw new Error('Файл не привязан');
  if (!(await ensurePermission(handle, 'readwrite'))) throw new Error('Нет разрешения на запись');
  const writable = await handle.createWritable();
  await writable.write(contents);
  await writable.close();
}

export async function readFile(handle) {
  if (!handle) throw new Error('Файл не привязан');
  if (!(await ensurePermission(handle, 'read'))) throw new Error('Нет разрешения на чтение');
  const file = await handle.getFile();
  return file.text();
}

export function downloadJson(contents, filename = 'relationships.json') {
  if (!canUseDom()) return;
  const blob = contents instanceof Blob ? contents : new Blob([contents], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function todayName(prefix = 'relationships') {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${prefix}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}
