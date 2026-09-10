'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Inbox,
  Folder,
  FileText,
  Target,
  DollarSign,
  Search,
  Settings,
  Plus,
} from 'lucide-react';
import { useState, useMemo } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useAppContext } from '@/components/providers/AppProvider';
import { QuickAdd } from './QuickAdd';
import styles from './SideNav.module.css';

const PRIMARY_ITEMS = [
  { href: '/',         icon: Home,       label: 'Today',    id: 'sidenav-home' },
  { href: '/inbox',    icon: Inbox,      label: 'Inbox',    id: 'sidenav-inbox', hasBadge: true },
  { href: '/projects', icon: Folder,     label: 'Projects', id: 'sidenav-projects' },
  { href: '/search',   icon: Search,     label: 'Search',   id: 'sidenav-search' },
];

const WORKSPACE_ITEMS = [
  { href: '/notes',    icon: FileText,   label: 'Notes',    id: 'sidenav-notes' },
  { href: '/track',    icon: Target,     label: 'Track',    id: 'sidenav-track' },
  { href: '/money',    icon: DollarSign, label: 'Money',    id: 'sidenav-money' },
];

const FOOTER_ITEMS = [
  { href: '/settings', icon: Settings,   label: 'Settings', id: 'sidenav-settings' },
];

export function SideNav() {
  const pathname = usePathname();
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

  // Only show when authenticated and not on auth pages
  if (!user || pathname.startsWith('/auth')) return null;

  return (
    <>
      <aside className={styles.sidebar} id="side-nav">
        <nav className={styles.nav}>
          <div className={styles.navGroup}>
            {PRIMARY_ITEMS.map(item => {
              const Icon = item.icon;
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.navItem} ${active ? styles.active : ''}`}
                  id={item.id}
                >
                  <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
                  <span>{item.label}</span>
                  {item.hasBadge && inboxCount > 0 && (
                    <span className={styles.inboxBadge}>{inboxCount}</span>
                  )}
                </Link>
              );
            })}
          </div>

          <div className={styles.navDivider} />

          <div className={styles.navGroup}>
            <span className={styles.navGroupLabel}>Workspace</span>
            {WORKSPACE_ITEMS.map(item => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.navItem} ${active ? styles.active : ''}`}
                  id={item.id}
                >
                  <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

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
                  <Icon size={16} strokeWidth={active ? 2.2 : 1.8} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        <button
          className={styles.quickAddBtn}
          onClick={() => setQuickAddOpen(true)}
          id="btn-sidenav-quickadd"
        >
          <Plus size={16} strokeWidth={2.5} />
          Capture
        </button>
      </aside>

      {quickAddOpen && <QuickAdd onClose={() => setQuickAddOpen(false)} />}
    </>
  );
}
