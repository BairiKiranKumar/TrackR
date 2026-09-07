'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { seedDemoData } from '@/lib/db/seed';
import { dataService } from '@/lib/services/DataService';
import { Item, Theme } from '@/types';

// ─── Context types ─────────────────────────────────────────────────────────

interface AppContextValue {
  theme: Theme;
  toggleTheme: () => void;
  items: Item[];
  refreshItems: () => Promise<void>;
  isLoading: boolean;
  isReady: boolean;
}

const AppContext = createContext<AppContextValue>({
  theme: 'dark',
  toggleTheme: () => {},
  items: [],
  refreshItems: async () => {},
  isLoading: true,
  isReady: false,
});

export function useAppContext() {
  return useContext(AppContext);
}

// ─── Provider ─────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark');
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);

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

  const refreshItems = useCallback(async () => {
    const allItems = await dataService.getAllItems();
    setItems(allItems);
  }, []);

  const toggleTheme = useCallback(async () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    await dataService.setSetting('theme', next);
  }, [theme]);

  return (
    <AppContext.Provider value={{ theme, toggleTheme, items, refreshItems, isLoading, isReady }}>
      {children}
    </AppContext.Provider>
  );
}
