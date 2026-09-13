'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard,
  Inbox,
  Folder,
  FileText,
  Search,
  Calendar,
  CheckSquare,
  Target,
  Trophy,
  DollarSign,
  Wallet,
  ArrowLeftRight,
  PieChart,
  Clock,
  TrendingUp,
  BarChart3,
  Settings,
  Plus,
  X,
} from 'lucide-react';
import { useState, useMemo, useEffect, Suspense } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useAppContext } from '@/components/providers/AppProvider';
import { QuickAdd } from './QuickAdd';
import styles from './SideNav.module.css';

interface NavEntry {
  href: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  id: string;
  hasBadge?: boolean;
  exact?: boolean;
  tab?: string;
}

const TRACKR_ITEMS: NavEntry[] = [
  { href: '/',         icon: LayoutDashboard, label: 'Overview', id: 'sidenav-home', exact: true },
  { href: '/inbox',    icon: Inbox,           label: 'Inbox',    id: 'sidenav-inbox', hasBadge: true },
  { href: '/projects', icon: Folder,          label: 'Projects', id: 'sidenav-projects' },
  { href: '/notes',    icon: FileText,        label: 'Notes',    id: 'sidenav-notes' },
  { href: '/search',   icon: Search,          label: 'Search',   id: 'sidenav-search' },
];

const PLAN_ITEMS: NavEntry[] = [
  { href: '/today',              icon: Calendar,    label: 'Today',    id: 'sidenav-today' },
  { href: '/track?tab=tasks',    icon: CheckSquare, label: 'Tasks',    id: 'sidenav-tasks',    tab: 'tasks' },
  { href: '/track?tab=trackers', icon: Target,      label: 'Trackers', id: 'sidenav-trackers', tab: 'trackers' },
  { href: '/track?tab=goals',    icon: Trophy,      label: 'Goals',    id: 'sidenav-goals',    tab: 'goals' },
];

const MONEY_ITEMS: NavEntry[] = [
  { href: '/money',                  icon: DollarSign,     label: 'Overview',     id: 'sidenav-money-overview', exact: true },
  { href: '/money?tab=accounts',     icon: Wallet,         label: 'Accounts',     id: 'sidenav-money-accs',     tab: 'accounts' },
  { href: '/money?tab=transactions', icon: ArrowLeftRight, label: 'Transactions', id: 'sidenav-money-txns',     tab: 'transactions' },
  { href: '/money?tab=budgets',      icon: PieChart,       label: 'Budgets',      id: 'sidenav-money-budgets',  tab: 'budgets' },
  { href: '/money?tab=planning',     icon: Clock,          label: 'Planning',     id: 'sidenav-money-planning', tab: 'planning' },
  { href: '/money/investments',      icon: TrendingUp,     label: 'Investments',  id: 'sidenav-money-investments' },
  { href: '/money/reports',          icon: BarChart3,      label: 'Reports',      id: 'sidenav-money-reports' },
];

const FOOTER_ITEMS: NavEntry[] = [
  { href: '/settings', icon: Settings, label: 'Settings', id: 'sidenav-settings' },
];

function SideNavInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { items, mobileNavOpen, closeMobileNav } = useAppContext();
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const inboxCount = useMemo(() => {
    return items.filter(i => {
      if (i.archived) return false;
      const meta = i.metadata as Record<string, unknown> | undefined;
      return meta?.inbox === true && !meta?.processed;
    }).length;
  }, [items]);

  // Close the mobile drawer whenever the route (or its query, e.g. Track's
  // ?tab=) changes — navigating is the expected way to dismiss it.
  useEffect(() => {
    closeMobileNav();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams.toString()]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeMobileNav();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileNavOpen, closeMobileNav]);

  if (!user || pathname.startsWith('/auth')) return null;

  const currentTab = searchParams.get('tab');

  function isItemActive(entry: NavEntry): boolean {
    if (entry.tab) {
      if (entry.href.startsWith('/track') && pathname.startsWith('/track')) {
        return currentTab === entry.tab || (!currentTab && entry.tab === 'tasks');
      }
      if (entry.href.startsWith('/money') && pathname.startsWith('/money')) {
        return currentTab === entry.tab;
      }
    }
    if (entry.exact) {
      if (entry.href === '/money') {
        return pathname === '/money' && (!currentTab || currentTab === 'overview');
      }
      return pathname === entry.href;
    }
    if (entry.href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(entry.href);
  }

  function renderGroup(title: string, navItems: NavEntry[]) {
    return (
      <div className={styles.navGroup}>
        <span className={styles.navGroupLabel}>{title}</span>
        {navItems.map(item => {
          const Icon = item.icon;
          const active = isItemActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navItem} ${active ? styles.active : ''}`}
              id={item.id}
              onClick={closeMobileNav}
            >
              <Icon size={15} strokeWidth={active ? 2.2 : 1.8} />
              <span>{item.label}</span>
              {item.hasBadge && inboxCount > 0 && (
                <span className={styles.inboxBadge}>{inboxCount}</span>
              )}
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <>
      {mobileNavOpen && (
        <div className={`overlay ${styles.mobileOverlay}`} onClick={closeMobileNav} />
      )}
      <aside
        className={`${styles.sidebar} ${mobileNavOpen ? styles.mobileOpen : ''}`}
        id="side-nav"
        role={mobileNavOpen ? 'dialog' : undefined}
        aria-modal={mobileNavOpen ? true : undefined}
        aria-label={mobileNavOpen ? 'Navigation menu' : undefined}
      >
        {mobileNavOpen && (
          <div className={styles.drawerHeader}>
            <span className={styles.drawerHeaderTitle}>
              <span className={styles.drawerLogoMark}>T</span>
              TRACKR
            </span>
            <button
              className={styles.drawerCloseBtn}
              onClick={closeMobileNav}
              aria-label="Close menu"
              id="btn-sidenav-close"
            >
              <X size={18} />
            </button>
          </div>
        )}

        <button
          className={styles.quickAddBtn}
          onClick={() => { setQuickAddOpen(true); closeMobileNav(); }}
          id="btn-sidenav-quickadd"
          title="Quick Capture (Cmd/Ctrl + K)"
        >
          <Plus size={15} strokeWidth={2.5} />
          <span>Capture</span>
          <kbd className={styles.kbdHint}>⌘K</kbd>
        </button>

        <nav className={styles.nav}>
          {renderGroup('TRACKR', TRACKR_ITEMS)}
          <div className={styles.navDivider} />
          {renderGroup('PLAN', PLAN_ITEMS)}
          <div className={styles.navDivider} />
          {renderGroup('MONEY', MONEY_ITEMS)}
          <div className={styles.navDivider} />
          <div className={styles.navGroup}>
            {FOOTER_ITEMS.map(item => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.navItem} ${active ? styles.active : ''}`}
                  id={item.id}
                  onClick={closeMobileNav}
                >
                  <Icon size={15} strokeWidth={active ? 2.2 : 1.8} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </aside>

      {quickAddOpen && <QuickAdd onClose={() => setQuickAddOpen(false)} />}
    </>
  );
}

export function SideNav() {
  return (
    <Suspense fallback={null}>
      <SideNavInner />
    </Suspense>
  );
}
