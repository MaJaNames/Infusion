// Необязательное ускорение онлайн-режима: подписка Supabase Realtime на meta.
// Любое изменение справочников обновляет meta.data_version, поэтому достаточно
// слушать эту таблицу и затем проверить версию обычным запросом.
// Если Realtime для meta не включён, модуль тихо отступает — остаётся опрос.
import { SUPABASE_KEY, SUPABASE_URL } from './data-source.js';

const TOPIC = 'realtime:public:meta';
const HEARTBEAT_MS = 25 * 1000;
const RETRY_MIN_MS = 1000;
const RETRY_MAX_MS = 5 * 60 * 1000;

let socket = null;
let onChange = null;
let ref = 0;
let heartbeat = 0;
let retryTimer = 0;
let retryMs = RETRY_MIN_MS;
let stopped = true;

const nextRef = () => String((ref += 1));

function send(message) {
  if (socket?.readyState !== WebSocket.OPEN) return;
  try { socket.send(JSON.stringify(message)); } catch { /* соединение уже закрывается */ }
}

function stopHeartbeat() {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = 0;
}

function closeSocket() {
  const ws = socket;
  socket = null;
  stopHeartbeat();
  if (ws) {
    try { ws.close(); } catch { /* уже закрыт */ }
  }
}

function scheduleReconnect() {
  if (stopped || retryTimer) return;
  const delay = retryMs;
  retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
  retryTimer = setTimeout(() => { retryTimer = 0; connect(); }, delay);
}

function connect() {
  if (stopped || typeof WebSocket === 'undefined') return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    scheduleReconnect();
    return;
  }
  let ws;
  try {
    const base = SUPABASE_URL.replace(/^http/, 'ws');
    ws = new WebSocket(`${base}/realtime/v1/websocket?apikey=${encodeURIComponent(SUPABASE_KEY)}&vsn=1.0.0`);
  } catch {
    scheduleReconnect();
    return;
  }
  socket = ws;

  ws.addEventListener('open', () => {
    if (stopped || ws !== socket) return;
    const joinRef = nextRef();
    send({
      topic: TOPIC,
      event: 'phx_join',
      payload: {
        config: {
          broadcast: { self: false },
          presence: { key: '' },
          postgres_changes: [{ event: '*', schema: 'public', table: 'meta' }],
        },
        access_token: SUPABASE_KEY,
      },
      ref: joinRef,
      join_ref: joinRef,
    });
    stopHeartbeat();
    heartbeat = setInterval(() => {
      send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: nextRef() });
    }, HEARTBEAT_MS);
  });

  ws.addEventListener('message', (event) => {
    if (stopped || ws !== socket) return;
    let message;
    try { message = JSON.parse(event.data); } catch { return; }

    if (message.event === 'phx_reply' && message.topic === TOPIC) {
      if (message.payload?.status === 'ok') {
        retryMs = RETRY_MIN_MS;
        return;
      }
      closeSocket();
      scheduleReconnect();
      return;
    }

    // Например, Realtime выключен для meta: не долбим сервер, но иногда пробуем.
    if (message.event === 'system' && message.payload?.status === 'error') {
      retryMs = Math.max(retryMs, 60 * 1000);
      closeSocket();
      scheduleReconnect();
      return;
    }

    if (message.event === 'postgres_changes') {
      const data = message.payload?.data;
      if (data?.schema === 'public' && data?.table === 'meta') onChange?.();
    }
  });

  ws.addEventListener('close', () => {
    if (ws !== socket) return;
    socket = null;
    stopHeartbeat();
    if (!stopped) scheduleReconnect();
  });

  ws.addEventListener('error', () => {
    try { ws.close(); } catch { /* уже закрыт */ }
  });
}

// Подписка на изменения; повторный вызов просто заменяет обработчик.
export function startRealtime(handler) {
  onChange = handler;
  if (!stopped) return;
  stopped = false;
  retryMs = RETRY_MIN_MS;
  connect();
}

export function stopRealtime() {
  stopped = true;
  onChange = null;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = 0;
  closeSocket();
}

if (typeof addEventListener === 'function') {
  addEventListener('online', () => {
    if (stopped) return;
    retryMs = RETRY_MIN_MS;
    closeSocket();
    connect();
  });
  addEventListener('offline', () => closeSocket());
}
