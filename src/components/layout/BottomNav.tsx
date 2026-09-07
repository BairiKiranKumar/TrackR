'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, FileText, Plus, DollarSign, Search } from 'lucide-react';
import styles from './BottomNav.module.css';
import { useState } from 'react';
import { QuickAdd } from './QuickAdd';

const NAV_ITEMS = [
  { href: '/',       icon: Home,       label: 'Home',   id: 'nav-home' },
  { href: '/notes',  icon: FileText,   label: 'Notes',  id: 'nav-notes' },
  { href: '/money',  icon: DollarSign, label: 'Money',  id: 'nav-money' },
  { href: '/search', icon: Search,     label: 'Search', id: 'nav-search' },
];

export function BottomNav() {
  const pathname = usePathname();
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  // Don't show nav on auth pages
  if (pathname.startsWith('/auth')) return null;

  return (
    <>
      <nav className={styles.nav} aria-label="Main navigation">
        {NAV_ITEMS.slice(0, 2).map(item => (
          <NavItem key={item.href} {...item} active={pathname === item.href} />
        ))}

        {/* Center FAB */}
        <button
          id="btn-quick-add"
          className={styles.fab}
          onClick={() => setQuickAddOpen(true)}
          aria-label="Quick add"
        >
          <Plus size={24} strokeWidth={2.5} />
        </button>

        {NAV_ITEMS.slice(2).map(item => (
          <NavItem key={item.href} {...item} active={pathname === item.href} />
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
}: {
  href: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  active: boolean;
  id: string;
}) {
  return (
    <Link href={href} className={`${styles.navItem} ${active ? styles.active : ''}`} id={id}>
      <span className={styles.iconWrap}>
        <Icon size={22} strokeWidth={active ? 2.5 : 2} />
        {active && <span className={styles.activeDot} />}
      </span>
      <span className={styles.label}>{label}</span>
    </Link>
  );
}
