'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, FileText, Target, DollarSign, Search, Settings, Plus } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { QuickAdd } from './QuickAdd';
import styles from './SideNav.module.css';

const NAV_ITEMS = [
  { href: '/',        icon: Home,       label: 'Home',     id: 'sidenav-home' },
  { href: '/notes',   icon: FileText,   label: 'Notes',    id: 'sidenav-notes' },
  { href: '/track',   icon: Target,     label: 'Track',    id: 'sidenav-track' },
  { href: '/money',   icon: DollarSign, label: 'Money',    id: 'sidenav-money' },
  { href: '/search',  icon: Search,     label: 'Search',   id: 'sidenav-search' },
  { href: '/settings',icon: Settings,   label: 'Settings', id: 'sidenav-settings' },
];

export function SideNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  // Only show when authenticated and not on auth pages
  if (!user || pathname.startsWith('/auth')) return null;

  return (
    <>
      <aside className={styles.sidebar} id="side-nav">
        <nav className={styles.nav}>
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${active ? styles.active : ''}`}
                id={item.id}
              >
                <Icon size={18} strokeWidth={active ? 2.5 : 1.8} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <button
          className={styles.quickAddBtn}
          onClick={() => setQuickAddOpen(true)}
          id="btn-sidenav-quickadd"
        >
          <Plus size={16} strokeWidth={2.5} />
          Quick Add
        </button>
      </aside>

      {quickAddOpen && <QuickAdd onClose={() => setQuickAddOpen(false)} />}
    </>
  );
}
