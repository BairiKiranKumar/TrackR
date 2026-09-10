'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { getSession, signOut, isSupabaseConfigured } from '@/lib/auth/AuthService';
import { getMasterSupabase, initUserSupabase, clearUserSupabase, syncSessionCookies, clearSessionCookies } from '@/lib/supabase';
import { getUserConfig, type UserConfig } from '@/lib/services/UserConfigService';
import { dataService } from '@/lib/services/DataService';
import { storageModeService } from '@/lib/services/StorageModeService';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  userConfig: UserConfig | null;
  isLoading: boolean;
  isConfigured: boolean;
  hasUserDb: boolean;
  signOut: () => Promise<void>;
  refreshUserConfig: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  userConfig: null,
  isLoading: true,
  isConfigured: false,
  hasUserDb: false,
  signOut: async () => {},
  refreshUserConfig: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userConfig, setUserConfig] = useState<UserConfig | null>(null);
  const configured = isSupabaseConfigured();
  const [isLoading, setIsLoading] = useState(configured);

  // The auth-state-change subscription below is wired up once on mount, so
  // `handleAuthState` must not close over a stale `pathname` from that first
  // render — it reads the latest value from this ref instead. (This was the
  // source of the redirect race condition: navigating, then triggering an
  // auth event, would redirect based on wherever the user was when the app
  // first loaded.)
  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  const loadUserConfig = useCallback(async (userId: string): Promise<UserConfig | null> => {
    storageModeService.setActiveUser(userId);
    try {
      const config = await getUserConfig(userId);
      storageModeService.setCustomConfigured(!!config);
      if (config) {
        setUserConfig(config);
        initUserSupabase(config.supabase_url, config.supabase_anon_key);
      } else {
        setUserConfig(null);
      }
      // Pull from whichever provider is active — TRACKR Cloud by default,
      // or the user's own Supabase project for BYODB — into IndexedDB
      // (background, non-blocking; no configuration is required for this).
      dataService.pullFromSupabase().catch(() => {});
      return config ?? null;
    } catch {
      return null;
    }
  }, []);

  const refreshUserConfig = useCallback(async () => {
    if (!user) return;
    await loadUserConfig(user.id);
  }, [user, loadUserConfig]);

  const handleAuthState = useCallback(async (newSession: Session | null, isInitial = false) => {
    const newUser = newSession?.user ?? null;
    setSession(newSession);
    setUser(newUser);

    // Read the current path from the ref, not a closed-over `pathname` —
    // this callback is handed to a subscription set up once on mount, so a
    // captured `pathname` prop would go stale after the first navigation.
    const currentPath = pathnameRef.current;

    if (newUser) {
      syncSessionCookies(newSession);
      await loadUserConfig(newUser.id);
      const isOnAuth = currentPath.startsWith('/auth');

      // No database setup step — a signed-in user is immediately usable via
      // TRACKR Cloud. /auth/setup is reached only from Settings → Data &
      // Storage → Advanced now, as an explicit opt-in, never a forced gate.
      if (isOnAuth) {
        const redirectUrl = typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search).get('redirect') || '/'
          : '/';
        router.replace(redirectUrl);
      }
    } else {
      clearSessionCookies();
      clearUserSupabase();
      storageModeService.setActiveUser(null);
      storageModeService.setCustomConfigured(false);
      setUserConfig(null);
      // Only redirect if on a protected route
      const protectedPrefixes = ['/notes', '/track', '/money', '/search', '/settings', '/auth/setup'];
      const isProtected = protectedPrefixes.some(p => currentPath.startsWith(p));
      if (isProtected) router.replace('/auth');
    }

    if (isInitial) setIsLoading(false);
  }, [loadUserConfig, router]);

  useEffect(() => {
    syncSessionCookies();
    if (!configured) {
      return;
    }

    getSession().then(s => handleAuthState(s, true));

    const sb = getMasterSupabase();
    if (!sb) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: { subscription } } = sb.auth.onAuthStateChange((_event: string, newSession: any) => {
      handleAuthState(newSession as Session | null);
    });

    return () => subscription.unsubscribe();
    // `handleAuthState` is stable (see pathnameRef above) so this effect still
    // only subscribes once per mount — it's listed to satisfy the linter, not
    // because it changes.
  }, [configured, handleAuthState]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    clearUserSupabase();
    storageModeService.setActiveUser(null);
    storageModeService.setCustomConfigured(false);
    setUser(null);
    setSession(null);
    setUserConfig(null);
    router.replace('/');
  }, [router]);

  return (
    <AuthContext.Provider value={{
      user,
      session,
      userConfig,
      isLoading,
      isConfigured: configured,
      hasUserDb: !!(userConfig?.supabase_url),
      signOut: handleSignOut,
      refreshUserConfig,
    }}>
      {children}
    </AuthContext.Provider>
  );
}
