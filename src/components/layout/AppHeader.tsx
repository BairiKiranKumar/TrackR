'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bell, CheckCircle2, CircleAlert, ChevronDown, Flame, LogOut, Menu, RefreshCw, Settings, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useAppContext } from '@/components/providers/AppProvider';
import { dataService } from '@/lib/services/DataService';
import { FinanceBudgetProgress, InAppNotification, TaskMetadata } from '@/types';
import styles from './AppHeader.module.css';

type SyncDot = 'synced' | 'syncing' | 'pending' | 'failed' | 'offline' | 'idle' | 'needs_attention';

const HIDE_HEADER_ROUTES = ['/auth', '/auth/callback', '/auth/setup'];

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, userConfig, signOut, isConfigured } = useAuth();
  const { dailyStreak, items, toggleMobileNav } = useAppContext();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncDot>('idle');
  const [pendingCount, setPendingCount] = useState(0);
  const [budgetAlerts, setBudgetAlerts] = useState<FinanceBudgetProgress[]>([]);
  const menuRef = useRef<HTMLDivElement>(null);

  // All hooks run before the authentication/page early return so their order
  // remains stable as the auth state changes.
  useEffect(() => {
    const unsubscribe = dataService.onSyncStatusChange((status, state) => {
      setSyncStatus(status as SyncDot);
      if (state) {
        setPendingCount(state.pendingCount);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    function handler(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
        setNotificationsOpen(false);
      }
    }
    if (menuOpen || notificationsOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen, notificationsOpen]);

  useEffect(() => {
    if (!user) return;
    dataService.getMonthlyBudgetProgress()
      .then(progress => setBudgetAlerts(progress.filter(item => item.isAlert)))
      .catch(() => setBudgetAlerts([]));
  }, [items, user]);

  const notifications = useMemo<InAppNotification[]>(() => {
    const today = new Date().toISOString().slice(0, 10);
    const overdueTasks = items
      .filter(item => {
        if (item.type !== 'task') return false;
        const metadata = item.metadata as TaskMetadata;
        return metadata.status !== 'done' && metadata.status !== 'cancelled' && Boolean(metadata.dueDate && metadata.dueDate < today);
      })
      .map(item => ({
        id: `overdue-${item.id}`,
        kind: 'overdue_task' as const,
        title: 'Task overdue',
        description: item.title,
        href: `/track/${item.id}`,
      }));
    const budgetNotifications = budgetAlerts.map(progress => ({
      id: `budget-${progress.budget.id}`,
      kind: 'budget_alert' as const,
      title: `${Math.round(progress.percentage)}% of budget used`,
      description: `${progress.categoryName || progress.budget.name} has reached ${Math.round(progress.percentage)}% this month.`,
      href: '/money',
    }));
    const milestone = dailyStreak && dailyStreak.milestoneReachedOn === dailyStreak.lastOpenedDate && dailyStreak.milestoneReached
      ? [{
          id: `streak-${dailyStreak.lastOpenedDate}-${dailyStreak.milestoneReached}`,
          kind: 'streak_milestone' as const,
          title: `${dailyStreak.milestoneReached}-day app streak`,
          description: 'A new streak milestone—keep the momentum going!',
          href: '/',
        }]
      : [];
    return [...overdueTasks, ...milestone, ...budgetNotifications];
  }, [budgetAlerts, dailyStreak, items]);

  const hidden = HIDE_HEADER_ROUTES.some(route => pathname.startsWith(route));
  if (hidden || !user) return null;

  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;
  const initial = (user.user_metadata?.full_name as string || user.email || 'U')[0].toUpperCase();
  const displayName = (user.user_metadata?.full_name as string) ?? user.email?.split('@')[0] ?? 'User';
  const syncLabel = {
    synced: 'Synced',
    syncing: 'Syncing…',
    pending: pendingCount > 0 ? `Pending (${pendingCount})` : 'Pending',
    failed: 'Sync issue — retrying',
    needs_attention: 'Sync needs attention',
    offline: 'Offline',
    idle: userConfig ? 'Connected' : 'Local only',
  }[syncStatus] || 'Local only';
  const SyncIcon =
    syncStatus === 'syncing' || syncStatus === 'pending'
      ? RefreshCw
      : syncStatus === 'failed' || syncStatus === 'needs_attention'
      ? CircleAlert
      : syncStatus === 'offline'
      ? WifiOff
      : Wifi;

  return (
    <header className={styles.header} id="app-header">
      <div className={styles.brandGroup}>
        <button
          className={styles.menuBtn}
          onClick={toggleMobileNav}
          id="btn-header-menu"
          aria-label="Open menu"
          aria-controls="side-nav"
        >
          <Menu size={20} />
        </button>

        <button className={styles.logoBtn} onClick={() => router.push('/')} id="btn-header-logo">
          <span className={styles.logoMark}>T</span>
          <span className={styles.logoText}>TRACKR</span>
        </button>

        {isConfigured && (
          <div className={`${styles.syncBadge} ${styles[`sync_${syncStatus}`]}`}>
            <SyncIcon size={11} className={syncStatus === 'syncing' ? styles.spinning : undefined} />
            <span>{syncLabel}</span>
          </div>
        )}
      </div>

      <div className={styles.rightActions} ref={menuRef}>
        {dailyStreak && (
          <div className={styles.streakBadge} aria-label={`${dailyStreak.currentStreak}-day app streak`}>
            <Flame size={13} aria-hidden="true" />
            <span>{dailyStreak.currentStreak}</span>
          </div>
        )}

        <div className={styles.notificationsWrap}>
          <button
            className={styles.bellBtn}
            onClick={() => { setNotificationsOpen(open => !open); setMenuOpen(false); }}
            aria-label={`Notifications${notifications.length ? ` (${notifications.length})` : ''}`}
            aria-expanded={notificationsOpen}
            id="btn-header-notifications"
          >
            <Bell size={18} />
            {notifications.length > 0 && <span className={styles.notificationCount}>{notifications.length > 9 ? '9+' : notifications.length}</span>}
          </button>
          {notificationsOpen && (
            <div className={styles.notificationsPanel} role="status" aria-live="polite">
              <div className={styles.notificationsHeader}><span>Notifications</span><span>{notifications.length}</span></div>
              {notifications.length === 0 ? (
                <div className={styles.notificationsEmpty}><CheckCircle2 size={18} /> You&apos;re all caught up.</div>
              ) : (
                <div className={styles.notificationsList}>
                  {notifications.map(notification => (
                    <button key={notification.id} className={styles.notificationItem} onClick={() => { setNotificationsOpen(false); if (notification.href) router.push(notification.href); }}>
                      {notification.kind === 'streak_milestone' ? <Flame size={17} className={styles.milestoneIcon} /> : <CircleAlert size={17} className={styles.alertIcon} />}
                      <span><strong>{notification.title}</strong><small>{notification.description}</small></span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className={styles.avatarWrap}>
          <button className={styles.avatarBtn} onClick={() => { setMenuOpen(open => !open); setNotificationsOpen(false); }} id="btn-header-avatar" aria-label="Account menu">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt={displayName} className={styles.avatarImg} />
            ) : (
              <span className={styles.avatarInitial}>{initial}</span>
            )}
            <ChevronDown size={12} className={`${styles.chevron} ${menuOpen ? styles.chevronOpen : ''}`} />
          </button>
          {menuOpen && (
            <div className={styles.menu} role="menu">
              <div className={styles.menuUser}><span className={styles.menuName}>{displayName}</span><span className={styles.menuEmail}>{user.email}</span></div>
              <div className={styles.menuDivider} />
              <button className={styles.menuItem} onClick={() => { setMenuOpen(false); router.push('/settings'); }} id="btn-header-settings" role="menuitem"><Settings size={15} /> Settings</button>
              <button className={`${styles.menuItem} ${styles.menuItemDanger}`} onClick={async () => { setMenuOpen(false); await signOut(); }} id="btn-header-signout" role="menuitem"><LogOut size={15} /> Sign Out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
