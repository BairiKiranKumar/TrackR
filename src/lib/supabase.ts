import { createClient } from '@supabase/supabase-js';

// ─── Master Supabase (YOUR admin project) ────────────────────────────────────
// Used for: authentication (email/password + Google) and user_configs table

const MASTER_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const MASTER_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

function isMasterConfigured(): boolean {
  return !!(
    MASTER_URL &&
    MASTER_KEY &&
    MASTER_URL.startsWith('https://') &&
    (MASTER_KEY.startsWith('sb_publishable_') || MASTER_KEY.startsWith('eyJ'))
  );
}

export function syncSessionCookies(rawSession?: unknown) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  try {
    const projectRef = MASTER_URL.replace('https://', '').split('.')[0];
    const cookieName = `sb-${projectRef}-auth-token`;
    const value = rawSession
      ? (typeof rawSession === 'string' ? rawSession : JSON.stringify(rawSession))
      : (window.localStorage.getItem(cookieName) || '1');
    document.cookie = `${cookieName}=${encodeURIComponent(value)}; path=/; max-age=2592000; SameSite=Lax`;
    document.cookie = `trackr-session=1; path=/; max-age=2592000; SameSite=Lax`;
  } catch {}
}

export function clearSessionCookies() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  try {
    const projectRef = MASTER_URL.replace('https://', '').split('.')[0];
    const cookieName = `sb-${projectRef}-auth-token`;
    document.cookie = `${cookieName}=; path=/; max-age=0; SameSite=Lax`;
    document.cookie = `trackr-session=; path=/; max-age=0; SameSite=Lax`;
  } catch {}
}

const cookieStorage = {
  getItem: (key: string) => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
    syncSessionCookies(value);
  },
  removeItem: (key: string) => {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
    clearSessionCookies();
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _masterClient: any = null;

export function getMasterSupabase() {
  if (!isMasterConfigured()) return null;
  if (_masterClient) return _masterClient;
  _masterClient = createClient(MASTER_URL, MASTER_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: cookieStorage,
    },
  });
  return _masterClient;
}

export function isMasterSupabaseConfigured(): boolean {
  return isMasterConfigured();
}

// ─── User Supabase (each user's own project) ─────────────────────────────────
// Used for: all TRACKR app data (items, trackers, money, notes)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _userClient: any = null;
let _userUrl = '';

export function initUserSupabase(url: string, anonKey: string) {
  if (_userClient && _userUrl === url) return _userClient;
  _userClient = createClient(url, anonKey, {
    auth: { persistSession: false },
  });
  _userUrl = url;
  return _userClient;
}

export function getUserSupabase() {
  return _userClient;
}

export function clearUserSupabase() {
  _userClient = null;
  _userUrl = '';
}

// Legacy alias
export function getSupabase() {
  return getMasterSupabase();
}
