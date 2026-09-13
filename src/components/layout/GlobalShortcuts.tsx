'use client';

import { useEffect, useState } from 'react';
import { Command, FilePlus2, Search, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { QuickAdd } from './QuickAdd';
import { CommandPalette } from './CommandPalette';
import styles from './GlobalShortcuts.module.css';

type QuickAddMode = 'all' | 'note' | null;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable ||
    target.matches('input, textarea, select, [contenteditable="true"]') ||
    Boolean(target.closest('[contenteditable="true"]'));
}

export function GlobalShortcuts() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [quickAddMode, setQuickAddMode] = useState<QuickAddMode>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    function focusSearch() {
      const searchInput = document.getElementById('input-global-search') as HTMLInputElement | null;
      if (pathname === '/search' && searchInput) {
        searchInput.focus();
        searchInput.select();
        return;
      }
      router.push('/search');
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (helpOpen) {
          setHelpOpen(false);
          return;
        }
        if (commandPaletteOpen) {
          setCommandPaletteOpen(false);
          return;
        }
        if (quickAddMode) {
          setQuickAddMode(null);
          return;
        }
      }

      if (!user || isTypingTarget(event.target) || (!event.ctrlKey && !event.metaKey)) return;

      const key = event.key.toLowerCase();
      if (key === 'k') {
        event.preventDefault();
        setCommandPaletteOpen(prev => !prev);
      } else if (key === 'n') {
        event.preventDefault();
        setQuickAddMode('note');
      } else if (key === 'f') {
        event.preventDefault();
        focusSearch();
      } else if (event.key === '/' || event.key === '?') {
        event.preventDefault();
        setHelpOpen(true);
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commandPaletteOpen, helpOpen, pathname, quickAddMode, router, user]);

  return (
    <>
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onOpenQuickAdd={() => setQuickAddMode('all')}
      />

      {quickAddMode && (
        <QuickAdd
          initialType={quickAddMode === 'note' ? 'note' : undefined}
          onClose={() => setQuickAddMode(null)}
        />
      )}

      {helpOpen && (
        <div className="overlay" role="presentation" onMouseDown={() => setHelpOpen(false)}>
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="shortcuts-title"
            onMouseDown={event => event.stopPropagation()}
          >
            <div className={styles.header}>
              <div>
                <span className={styles.eyebrow}>Keyboard shortcuts</span>
                <h2 id="shortcuts-title">Move through TRACKR faster</h2>
              </div>
              <button className="btn btn-icon btn-ghost" onClick={() => setHelpOpen(false)} aria-label="Close shortcuts help">
                <X size={20} />
              </button>
            </div>
            <div className={styles.shortcuts}>
              <Shortcut keys="K" label="Command Palette & Quick Search" icon={<Command size={16} />} />
              <Shortcut keys="N" label="Create a new note" icon={<FilePlus2 size={16} />} />
              <Shortcut keys="F" label="Focus search" icon={<Search size={16} />} />
              <Shortcut keys="/" label="Show this help" icon={<Command size={16} />} />
            </div>
            <p className={styles.hint}>Use Ctrl on Windows/Linux or ⌘ on Mac. Shortcuts stay out of the way while you are typing.</p>
          </section>
        </div>
      )}
    </>
  );
}

function Shortcut({ keys, label, icon }: { keys: string; label: string; icon: React.ReactNode }) {
  return (
    <div className={styles.shortcut}>
      <span className={styles.shortcutIcon}>{icon}</span>
      <span>{label}</span>
      <kbd><span>Ctrl</span><span>⌘</span><b>{keys}</b></kbd>
    </div>
  );
}
