// Вход администратора по ссылке из письма. Настоящая защита — правила RLS в Supabase; здесь только показ кнопки.
import config from '../../config.js';
const KEY = 'infusion.auth';
const api = (path, opt = {}) => fetch(`${config.SUPABASE_URL}${path}`, { ...opt, headers: { apikey: config.SUPABASE_ANON_KEY, 'Content-Type': 'application/json', ...opt.headers } });

export function captureLogin() {
  const token = new URLSearchParams(location.hash.slice(1)).get('access_token');
  if (!token) return;
  try { localStorage.setItem(KEY, token); } catch { /* ничего */ }
  history.replaceState(null, '', `${location.pathname}#settings`);
}
export async function sendLink(email) {
  const r = await api(`/auth/v1/otp?redirect_to=${encodeURIComponent(location.origin + location.pathname)}`, { method: 'POST', body: JSON.stringify({ email, create_user: true }) });
  if (!r.ok) throw new Error('Не удалось отправить письмо');
}
export async function isAdmin() {
  try {
    const token = localStorage.getItem(KEY);
    if (!token || !config.SUPABASE_URL) return false;
    const r = await api('/rest/v1/admins?select=user_id', { headers: { Authorization: `Bearer ${token}` } });
    return r.ok && (await r.json()).length > 0;
  } catch { return false; }
}
export const signOut = () => { try { localStorage.removeItem(KEY); } catch { /* ничего */ } };
