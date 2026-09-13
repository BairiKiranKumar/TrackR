'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Folder,
  CheckSquare,
  FileText,
  DollarSign,
  TrendingUp,
  Star,
  PlusCircle,
  Compass,
  Settings,
  PieChart,
  Wallet,
} from 'lucide-react';
import { contextGraphService } from '@/lib/services/ContextGraphService';
import styles from './CommandPalette.module.css';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenQuickAdd?: () => void;
}

interface CommandAction {
  id: string;
  category: 'navigate' | 'create' | 'entity';
  title: string;
  subtitle?: string;
  badge?: string;
  icon: React.ReactNode;
  perform: () => void;
}

export function CommandPalette({ isOpen, onClose, onOpenQuickAdd }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [entityResults, setEntityResults] = useState<
    Array<{ id: string; type: string; title: string; subtitle?: string }>
  >([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    setQuery('');
    setSelectedIndex(0);
    onClose();
  }, [onClose]);

  // Search entities when query changes
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      return;
    }

    let active = true;
    const timer = setTimeout(async () => {
      try {
        const found = await contextGraphService.searchLinkableEntities(q);
        if (active) {
          setEntityResults(
            found.slice(0, 6).map(f => ({
              id: f.id,
              type: f.type,
              title: f.title,
              subtitle: f.subtitle,
            }))
          );
        }
      } catch (err) {
        console.error('CommandPalette search error:', err);
      }
    }, 120);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const navCommands = useMemo(() => {
    return [
      { id: 'nav-today', title: 'Open Today / Overview', alias: ['today', 'home', 'overview'], url: '/today', icon: <Compass size={15} /> },
      { id: 'nav-inbox', title: 'Open Inbox', alias: ['inbox', 'capture'], url: '/inbox', icon: <Compass size={15} /> },
      { id: 'nav-projects', title: 'Open Projects', alias: ['projects', 'cockpit'], url: '/projects', icon: <Folder size={15} /> },
      { id: 'nav-tasks', title: 'Open Tasks', alias: ['tasks', 'todo'], url: '/tasks', icon: <CheckSquare size={15} /> },
      { id: 'nav-notes', title: 'Open Notes', alias: ['notes', 'docs', 'journal'], url: '/notes', icon: <FileText size={15} /> },
      { id: 'nav-money', title: 'Open Money / Finance', alias: ['money', 'finance', 'expenses'], url: '/money', icon: <DollarSign size={15} /> },
      { id: 'nav-txns', title: 'Open Transactions', alias: ['transactions', 'txns', 'spending'], url: '/money/transactions', icon: <DollarSign size={15} /> },
      { id: 'nav-budgets', title: 'Open Budgets', alias: ['budgets', 'budget'], url: '/money/budgets', icon: <Wallet size={15} /> },
      { id: 'nav-reports', title: 'Open Financial Reports', alias: ['reports', 'analytics', 'charts'], url: '/money/reports', icon: <PieChart size={15} /> },
      { id: 'nav-investments', title: 'Open Investments', alias: ['investments', 'portfolio'], url: '/money/investments', icon: <TrendingUp size={15} /> },
      { id: 'nav-track', title: 'Open Track / Goals', alias: ['track', 'goals', 'trackers'], url: '/track', icon: <Star size={15} /> },
      { id: 'nav-settings', title: 'Open Settings', alias: ['settings', 'preferences'], url: '/settings', icon: <Settings size={15} /> },
      { id: 'nav-search', title: 'Open Universal Search', alias: ['search', 'find'], url: '/search', icon: <Search size={15} /> },
    ];
  }, []);

  const createCommands = useMemo(() => {
    return [
      {
        id: 'create-task',
        title: 'New Task',
        alias: ['new task', 'add task', 'create task'],
        action: () => {
          onClose();
          if (onOpenQuickAdd) onOpenQuickAdd();
          else router.push('/track/new?type=task');
        },
        icon: <PlusCircle size={15} />,
      },
      {
        id: 'create-expense',
        title: 'New Expense / Transaction',
        alias: ['new expense', 'new transaction', 'add expense', 'expense'],
        action: () => {
          onClose();
          router.push('/money/transactions');
        },
        icon: <DollarSign size={15} />,
      },
      {
        id: 'create-note',
        title: 'New Note',
        alias: ['new note', 'add note', 'write note'],
        action: () => {
          onClose();
          router.push('/track/new?type=note');
        },
        icon: <FileText size={15} />,
      },
      {
        id: 'create-project',
        title: 'New Project',
        alias: ['new project', 'add project'],
        action: () => {
          onClose();
          router.push('/projects');
        },
        icon: <Folder size={15} />,
      },
      {
        id: 'create-goal',
        title: 'New Goal',
        alias: ['new goal', 'add goal'],
        action: () => {
          onClose();
          router.push('/track/new?type=goal');
        },
        icon: <Star size={15} />,
      },
      {
        id: 'create-tracker',
        title: 'New Tracker',
        alias: ['new tracker', 'add tracker'],
        action: () => {
          onClose();
          router.push('/track/new?type=tracker');
        },
        icon: <TrendingUp size={15} />,
      },
    ];
  }, [onClose, onOpenQuickAdd, router]);

  const filteredCommands: CommandAction[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const actions: CommandAction[] = [];

    // Filter Navigation
    const matchingNav = navCommands.filter(c => {
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        c.alias.some(a => a.includes(q))
      );
    });

    for (const c of matchingNav.slice(0, q ? 4 : 5)) {
      actions.push({
        id: c.id,
        category: 'navigate',
        title: c.title,
        badge: 'Navigate',
        icon: c.icon,
        perform: () => {
          onClose();
          router.push(c.url);
        },
      });
    }

    // Filter Creation
    const matchingCreate = createCommands.filter(c => {
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        c.alias.some(a => a.includes(q))
      );
    });

    for (const c of matchingCreate.slice(0, q ? 3 : 4)) {
      actions.push({
        id: c.id,
        category: 'create',
        title: c.title,
        badge: 'Create',
        icon: c.icon,
        perform: c.action,
      });
    }

    // Entity results (Search)
    const activeEntities = query.trim() ? entityResults : [];
    for (const e of activeEntities) {
      let icon = <CheckSquare size={15} />;
      let url = `/track/${e.id}`;
      if (e.type === 'project') {
        icon = <Folder size={15} />;
        url = `/projects/${e.id}`;
      } else if (e.type === 'note' || e.type === 'journal') {
        icon = <FileText size={15} />;
        url = `/notes/${e.id}`;
      } else if (e.type === 'fa_transaction' || e.type === 'expense' || e.type === 'income') {
        icon = <DollarSign size={15} />;
        url = `/money/transactions`;
      } else if (e.type === 'fa_budget' || e.type === 'budget') {
        icon = <Wallet size={15} />;
        url = `/money/budgets`;
      } else if (e.type === 'goal') {
        icon = <Star size={15} />;
        url = `/track/${e.id}`;
      } else if (e.type === 'tracker') {
        icon = <TrendingUp size={15} />;
        url = `/track/${e.id}`;
      }

      actions.push({
        id: `entity-${e.id}`,
        category: 'entity',
        title: e.title,
        subtitle: e.subtitle,
        badge: e.type.replace('fa_', ''),
        icon,
        perform: () => {
          handleClose();
          router.push(url);
        },
      });
    }

    return actions;
  }, [query, navCommands, createCommands, entityResults, router, handleClose, onClose]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % Math.max(1, filteredCommands.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const safeIndex = Math.min(selectedIndex, Math.max(0, filteredCommands.length - 1));
      if (filteredCommands[safeIndex]) {
        filteredCommands[safeIndex].perform();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
    }
  }

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={handleClose} id="command-palette-overlay">
      <div
        className={styles.modal}
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        id="command-palette-modal"
      >
        <div className={styles.searchHeader}>
          <Search size={18} className={styles.searchIcon} />
          <input
            ref={inputRef}
            type="text"
            className={styles.input}
            placeholder="Search commands, items, amounts (e.g. 'Goa', 'new task', '₹500')..."
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            id="input-command-palette"
          />
          <span className={styles.shortcutBadge}>ESC</span>
        </div>

        <div className={styles.results} id="command-palette-results">
          {filteredCommands.length === 0 ? (
            <div className={styles.empty}>No commands or items found for &quot;{query}&quot;</div>
          ) : (
            filteredCommands.map((cmd, idx) => (
              <button
                key={cmd.id}
                type="button"
                className={`${styles.resultItem} ${idx === selectedIndex ? styles.resultItemActive : ''}`}
                onClick={cmd.perform}
                onMouseEnter={() => setSelectedIndex(idx)}
                id={`cmd-item-${cmd.id}`}
              >
                <div className={styles.itemLeft}>
                  <span className={styles.itemIcon}>{cmd.icon}</span>
                  <span className={styles.itemTitle}>{cmd.title}</span>
                  {cmd.subtitle && <span className={styles.itemSubtitle}>{cmd.subtitle}</span>}
                </div>
                {cmd.badge && <span className={styles.itemBadge}>{cmd.badge}</span>}
              </button>
            ))
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.footerHints}>
            <span className={styles.footerHint}>
              <kbd className={styles.footerKbd}>↑</kbd>
              <kbd className={styles.footerKbd}>↓</kbd> navigate
            </span>
            <span className={styles.footerHint}>
              <kbd className={styles.footerKbd}>↵</kbd> select
            </span>
            <span className={styles.footerHint}>
              <kbd className={styles.footerKbd}>esc</kbd> close
            </span>
          </div>
          <span>Deterministic Context Engine</span>
        </div>
      </div>
    </div>
  );
}
