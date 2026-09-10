'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard,
  Inbox,
  Folder,
  FileText,
  Search,
  CheckSquare,
  Target,
  Trophy,
  DollarSign,
  ArrowLeftRight,
  Settings,
  Plus,
} from 'lucide-react';
import { useState, useMemo, Suspense } from 'react';
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
  { href: '/track?tab=tasks',    icon: CheckSquare, label: 'Tasks',    id: 'sidenav-tasks',    tab: 'tasks' },
  { href: '/track?tab=trackers', icon: Target,      label: 'Trackers', id: 'sidenav-trackers', tab: 'trackers' },
  { href: '/track?tab=goals',    icon: Trophy,      label: 'Goals',    id: 'sidenav-goals',    tab: 'goals' },
];

const MONEY_ITEMS: NavEntry[] = [
  { href: '/money',                   icon: DollarSign,     label: 'Overview',     id: 'sidenav-money-overview', exact: true },
  { href: '/money?tab=transactions',  icon: ArrowLeftRight, label: 'Transactions', id: 'sidenav-money-txns',     tab: 'transactions' },
];

const FOOTER_ITEMS: NavEntry[] = [
  { href: '/settings', icon: Settings, label: 'Settings', id: 'sidenav-settings' },
];

function SideNavInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { items } = useAppContext();
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const inboxCount = useMemo(() => {
    return items.filter(i => {
      if (i.archived) return false;
      const meta = i.metadata as Record<string, unknown> | undefined;
      return meta?.inbox === true && !meta?.processed;
    }).length;
  }, [items]);

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
      <aside className={styles.sidebar} id="side-nav">
        <button
          className={styles.quickAddBtn}
          onClick={() => setQuickAddOpen(true)}
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
