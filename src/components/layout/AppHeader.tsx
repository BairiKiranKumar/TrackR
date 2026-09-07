'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Settings, LogOut, ChevronDown, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { dataService } from '@/lib/services/DataService';
import styles from './AppHeader.module.css';

type SyncDot = 'synced' | 'syncing' | 'offline' | 'idle';

const HIDE_HEADER_ROUTES = ['/auth', '/auth/callback', '/auth/setup'];

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, userConfig, signOut, isConfigured } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncDot>('idle');
  const menuRef = useRef<HTMLDivElement>(null);

  // Hooks must run unconditionally on every render (Rules of Hooks) — the
  // hide-on-auth-pages check below used to sit above these and `return null`
  // early, which skipped them whenever `user`/`hidden` changed and desynced
  // hook order across renders. Effects are declared first; the early return
  // for hidden/logged-out states comes after.

  // Subscribe to sync status
  useEffect(() => {
    const unsub = dataService.onSyncStatusChange(status => {
      setSyncStatus(status as SyncDot);
    });
    return unsub;
  }, []);

  // Close menu on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  // Hide on auth / setup pages, or when signed out
  const hidden = HIDE_HEADER_ROUTES.some(r => pathname.startsWith(r));
  if (hidden || !user) return null;

  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
  const initial = (user.user_metadata?.full_name as string || user.email || 'U')[0].toUpperCase();
  const displayName = (user.user_metadata?.full_name as string) ?? user.email?.split('@')[0] ?? 'User';

  const syncLabel = {
    synced: 'Synced',
    syncing: 'Syncing…',
    offline: 'Offline',
    idle: userConfig ? 'Connected' : 'Local only',
  }[syncStatus];

  const SyncIcon = syncStatus === 'syncing' ? RefreshCw : syncStatus === 'offline' ? WifiOff : Wifi;

  return (
    <header className={styles.header} id="app-header">
      {/* Left — Logo */}
      <button className={styles.logoBtn} onClick={() => router.push('/')} id="btn-header-logo">
        <span className={styles.logoMark}>T</span>
        <span className={styles.logoText}>TRACKR</span>
      </button>

      {/* Center — Sync status */}
      {isConfigured && (
        <div className={`${styles.syncBadge} ${styles[`sync_${syncStatus}`]}`}>
          <SyncIcon size={11} className={syncStatus === 'syncing' ? styles.spinning : undefined} />
          <span>{syncLabel}</span>
        </div>
      )}

      {/* Right — Avatar menu */}
      <div className={styles.avatarWrap} ref={menuRef}>
        <button
          className={styles.avatarBtn}
          onClick={() => setMenuOpen(v => !v)}
          id="btn-header-avatar"
          aria-label="Account menu"
        >
          {avatarUrl
            ? <img src={avatarUrl} alt={displayName} className={styles.avatarImg} />
            : <span className={styles.avatarInitial}>{initial}</span>
          }
          <ChevronDown size={12} className={`${styles.chevron} ${menuOpen ? styles.chevronOpen : ''}`} />
        </button>

        {menuOpen && (
          <div className={styles.menu} role="menu">
            <div className={styles.menuUser}>
              <span className={styles.menuName}>{displayName}</span>
              <span className={styles.menuEmail}>{user.email}</span>
            </div>
            <div className={styles.menuDivider} />
            <button
              className={styles.menuItem}
              onClick={() => { setMenuOpen(false); router.push('/settings'); }}
              id="btn-header-settings"
              role="menuitem"
            >
              <Settings size={15} /> Settings
            </button>
            <button
              className={`${styles.menuItem} ${styles.menuItemDanger}`}
              onClick={async () => { setMenuOpen(false); await signOut(); }}
              id="btn-header-signout"
              role="menuitem"
            >
              <LogOut size={15} /> Sign Out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
