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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _masterClient: any = null;

export function getMasterSupabase() {
  if (!isMasterConfigured()) return null;
  if (_masterClient) return _masterClient;
  _masterClient = createClient(MASTER_URL, MASTER_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
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
