'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Inbox, Folder, Plus, Search } from 'lucide-react';
import styles from './BottomNav.module.css';
import { useState, useMemo } from 'react';
import { useAppContext } from '@/components/providers/AppProvider';
import { QuickAdd } from './QuickAdd';

const NAV_ITEMS = [
  { href: '/',         icon: Home,   label: 'Today',    id: 'nav-home' },
  { href: '/inbox',    icon: Inbox,  label: 'Inbox',    id: 'nav-inbox', hasBadge: true },
  { href: '/projects', icon: Folder, label: 'Projects', id: 'nav-projects' },
  { href: '/search',   icon: Search, label: 'Search',   id: 'nav-search' },
];

export function BottomNav() {
  const pathname = usePathname();
  const { items } = useAppContext();
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const inboxCount = useMemo(() => {
    return items.filter(i => {
      if (i.archived) return false;
      const meta = i.metadata as Record<string, unknown> | undefined;
      return meta?.inbox === true && !meta?.processed;
    }).length;
  }, [items]);

  // Don't show nav on auth pages
  if (pathname.startsWith('/auth')) return null;

  return (
    <>
      <nav className={styles.nav} aria-label="Main navigation">
        {NAV_ITEMS.slice(0, 2).map(item => (
          <NavItem
            key={item.href}
            {...item}
            active={item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)}
            badgeCount={item.hasBadge ? inboxCount : 0}
          />
        ))}

        {/* Center FAB */}
        <button
          id="btn-quick-add"
          className={styles.fab}
          onClick={() => setQuickAddOpen(true)}
          aria-label="Quick capture"
        >
          <Plus size={24} strokeWidth={2.5} />
        </button>

        {NAV_ITEMS.slice(2).map(item => (
          <NavItem
            key={item.href}
            {...item}
            active={pathname.startsWith(item.href)}
          />
        ))}
      </nav>

      {quickAddOpen && (
        <QuickAdd onClose={() => setQuickAddOpen(false)} />
      )}
    </>
  );
}

function NavItem({
  href,
  icon: Icon,
  label,
  active,
  id,
  badgeCount = 0,
}: {
  href: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  active: boolean;
  id: string;
  badgeCount?: number;
}) {
  return (
    <Link href={href} className={`${styles.navItem} ${active ? styles.active : ''}`} id={id}>
      <span className={styles.iconWrap}>
        <Icon size={22} strokeWidth={active ? 2.5 : 2} />
        {active && <span className={styles.activeDot} />}
        {badgeCount > 0 && <span className={styles.badgeDot}>{badgeCount}</span>}
      </span>
      <span className={styles.label}>{label}</span>
    </Link>
  );
}
