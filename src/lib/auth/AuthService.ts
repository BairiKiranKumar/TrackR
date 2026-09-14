import { getMasterSupabase, isMasterSupabaseConfigured, clearSessionCookies } from '@/lib/supabase';
import type { User, Session } from '@supabase/supabase-js';

export type { User, Session };

// ─── Sign Up ────────────────────────────────────────────────────────────────

export async function signUpWithEmail(email: string, password: string) {
  const sb = getMasterSupabase();
  if (!sb) throw new Error('Master Supabase is not configured. Please set NEXT_PUBLIC_MASTER_SUPABASE_URL and NEXT_PUBLIC_MASTER_SUPABASE_ANON_KEY in your .env.local file.');

  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
  });
  if (error) throw error;
  return data;
}

// ─── Sign In ────────────────────────────────────────────────────────────────

export async function signInWithEmail(email: string, password: string) {
  const sb = getMasterSupabase();
  if (!sb) throw new Error('Master Supabase is not configured.');

  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// ─── Google OAuth ───────────────────────────────────────────────────────────

export async function signInWithGoogle() {
  const sb = getMasterSupabase();
  if (!sb) throw new Error('Master Supabase is not configured.');

  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  });
  if (error) throw error;
  return data;
}

// ─── Sign Out ───────────────────────────────────────────────────────────────

export async function signOut() {
  clearSessionCookies();
  const sb = getMasterSupabase();
  if (!sb) return;
  await sb.auth.signOut();
}

// ─── Session / User ──────────────────────────────────────────────────────────

export async function getSession(): Promise<Session | null> {
  const sb = getMasterSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function getCurrentUser(): Promise<User | null> {
  const sb = getMasterSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user;
}

// ─── Password reset ──────────────────────────────────────────────────────────

export async function sendPasswordReset(email: string) {
  const sb = getMasterSupabase();
  if (!sb) throw new Error('Master Supabase is not configured.');
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset`,
  });
  if (error) throw error;
}

export async function updatePassword(newPassword: string): Promise<void> {
  const sb = getMasterSupabase();
  if (!sb) throw new Error('Master Supabase is not configured.');
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

// ─── Config check ────────────────────────────────────────────────────────────

export function isSupabaseConfigured(): boolean {
  return isMasterSupabaseConfigured();
}
