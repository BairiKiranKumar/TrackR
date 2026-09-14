'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { seedDemoData } from '@/lib/db/seed';
import { dataService } from '@/lib/services/DataService';
import { DailyStreakState, Item, Theme } from '@/types';
import { useAuth } from '@/components/providers/AuthProvider';

// ─── Context types ─────────────────────────────────────────────────────────

interface AppContextValue {
  theme: Theme;
  toggleTheme: () => void;
  items: Item[];
  refreshItems: () => Promise<void>;
  isLoading: boolean;
  isReady: boolean;
  dailyStreak: DailyStreakState | null;
  /** The left nav drawer on mobile (hidden by default below 768px; the header's burger button toggles it). */
  mobileNavOpen: boolean;
  openMobileNav: () => void;
  closeMobileNav: () => void;
  toggleMobileNav: () => void;
}

const AppContext = createContext<AppContextValue>({
  theme: 'dark',
  toggleTheme: () => {},
  items: [],
  refreshItems: async () => {},
  isLoading: true,
  isReady: false,
  dailyStreak: null,
  mobileNavOpen: false,
  openMobileNav: () => {},
  closeMobileNav: () => {},
  toggleMobileNav: () => {},
});

export function useAppContext() {
  return useContext(AppContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('trackr_theme');
        if (saved === 'light' || saved === 'dark') return saved;
      } catch {}
    }
    return 'dark';
  });
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [dailyStreak, setDailyStreak] = useState<DailyStreakState | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Initialize DB and seed
  useEffect(() => {
    async function init() {
      try {
        // Seed demo data on first launch
        await seedDemoData();

        // Load saved theme
        const savedTheme = await dataService.getSetting<Theme>('theme');
        if (savedTheme) {
          setTheme(savedTheme);
          document.documentElement.setAttribute('data-theme', savedTheme);
          try {
            localStorage.setItem('trackr_theme', savedTheme);
          } catch {}
        }

        // Load all items
        const allItems = await dataService.getAllItems();
        setItems(allItems);

        setIsReady(true);
      } catch (err) {
        console.error('TRACKR init error:', err);
        setIsReady(true);
      } finally {
        setIsLoading(false);
      }
    }

    init();
  }, []);

  useEffect(() => {
    if (!isReady || !user) return;

    dataService.recordDailyAppOpen().then(setDailyStreak).catch(error => {
      console.error('TRACKR daily streak error:', error);
    });
  }, [isReady, user]);

  const refreshItems = useCallback(async () => {
    const allItems = await dataService.getAllItems();
    setItems(allItems);
  }, []);

  // ── Cross-device sync ──────────────────────────────────────────────────
  // pullFromSupabase() previously only ran on sign-in / token refresh, so a
  // change made on another device never showed up here until this tab was
  // reloaded. Pull (and re-render from local) whenever a change from
  // elsewhere has plausibly happened: the tab/app regains focus, the
  // network comes back, or — as a safety net — on a periodic interval.
  const pullingRef = useRef(false);
  const pullAndRefresh = useCallback(async () => {
    if (pullingRef.current) return;
    pullingRef.current = true;
    try {
      await dataService.pullFromSupabase();
      await refreshItems();
    } catch {
      // Best-effort — the local sync queue/status indicator already surface
      // real connectivity problems; a failed opportunistic pull is silent.
    } finally {
      pullingRef.current = false;
    }
  }, [refreshItems]);

  useEffect(() => {
    if (!isReady || !user) return;

    function handleVisible() {
      if (document.visibilityState === 'visible') pullAndRefresh();
    }
    function handlePull() {
      pullAndRefresh();
    }

    document.addEventListener('visibilitychange', handleVisible);
    window.addEventListener('focus', handlePull);
    window.addEventListener('online', handlePull);
    const interval = setInterval(() => {
      if (typeof navigator === 'undefined' || navigator.onLine) pullAndRefresh();
    }, 30_000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisible);
      window.removeEventListener('focus', handlePull);
      window.removeEventListener('online', handlePull);
      clearInterval(interval);
    };
  }, [isReady, user, pullAndRefresh]);

  const toggleTheme = useCallback(async () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('trackr_theme', next);
    } catch {}
    await dataService.setSetting('theme', next);
  }, [theme]);

  const openMobileNav = useCallback(() => setMobileNavOpen(true), []);
  const closeMobileNav = useCallback(() => setMobileNavOpen(false), []);
  const toggleMobileNav = useCallback(() => setMobileNavOpen(v => !v), []);

  return (
    <AppContext.Provider value={{
      theme, toggleTheme, items, refreshItems, isLoading, isReady, dailyStreak,
      mobileNavOpen, openMobileNav, closeMobileNav, toggleMobileNav,
    }}>
      {children}
    </AppContext.Provider>
  );
}
