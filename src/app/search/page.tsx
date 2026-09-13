'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Search as SearchIcon, X } from 'lucide-react';
import { dataService } from '@/lib/services/DataService';
import { Item, ITEM_TYPE_LABELS } from '@/types';
import { ItemTypeBadge } from '@/components/common/ItemTypeBadge';
import { formatAmount } from '@/lib/services/MoneyDetectionService';
import styles from './page.module.css';

type FilterType = 'all' | 'project' | 'task' | 'note' | 'tracker' | 'goal' | 'finance';

const FILTER_TABS: { id: FilterType; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'project', label: 'Projects' },
  { id: 'task', label: 'Tasks' },
  { id: 'note', label: 'Notes' },
  { id: 'tracker', label: 'Trackers' },
  { id: 'goal', label: 'Goals' },
  { id: 'finance', label: 'Finance' },
];

function SearchContent() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [results, setResults] = useState<Item[]>([]);
  const [transactions, setTransactions] = useState<{ id: string; payee?: string; amount: number; date: string; type: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setTransactions([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    const r = await dataService.searchWithFinance(q.trim());
    setResults(r.items);
    setTransactions(r.transactions);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 250);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  const filteredResults = useMemo(() => {
    if (typeFilter === 'all') return results;
    if (typeFilter === 'note') return results.filter(r => r.type === 'note' || r.type === 'journal');
    if (typeFilter === 'tracker') return results.filter(r => r.type === 'tracker' || r.type === 'habit');
    if (typeFilter === 'finance') return results.filter(r => r.type === 'expense' || r.type === 'income' || r.type === 'budget');
    return results.filter(r => r.type === typeFilter);
  }, [results, typeFilter]);

  const filteredTransactions = useMemo(() => {
    if (typeFilter === 'all' || typeFilter === 'finance') return transactions;
    return [];
  }, [transactions, typeFilter]);

  // Group results by type
  const grouped = groupByType(filteredResults);

  const GROUP_ORDER = ['project', 'task', 'note', 'tracker', 'goal', 'habit', 'journal', 'expense', 'income', 'budget'] as const;

  function getHref(item: Item): string {
    if (item.type === 'note' || item.type === 'journal') return `/notes/${item.id}`;
    return `/track/${item.id}`;
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Search</h1>
      </div>

      {/* Search bar */}
      <div className={styles.searchWrap}>
        <SearchIcon size={18} className={styles.searchIcon} />
        <input
          autoFocus
          type="search"
          id="input-global-search"
          className={styles.searchInput}
          placeholder="Search everything…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {query && (
          <button className={styles.clearBtn} onClick={() => setQuery('')} id="btn-search-clear">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Type Filter Pills */}
      <div className={styles.filterRow}>
        {FILTER_TABS.map(tab => (
          <button
            key={tab.id}
            id={`filter-pill-${tab.id}`}
            className={`${styles.filterPill} ${typeFilter === tab.id ? styles.filterPillActive : ''}`}
            onClick={() => setTypeFilter(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Recent queries hint */}
      {!query && !searched && (
        <div className={styles.hint}>
          <p className={styles.hintText}>Search across all your notes, tasks, trackers, and money.</p>
          <div className={styles.suggestions}>
            {['BGMI', 'JavaScript', 'September', 'food', 'YouTube'].map(s => (
              <button
                key={s}
                className={styles.suggestionChip}
                onClick={() => setQuery(s)}
                id={`btn-suggestion-${s}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className={styles.loadingRow}>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 56, borderRadius: 12 }} />
          ))}
        </div>
      )}

      {/* No results */}
      {!loading && searched && results.length === 0 && filteredTransactions.length === 0 && (
        <div className="empty-state">
          <span className="empty-state__icon"><SearchIcon size={36} /></span>
          <span className="empty-state__title">No results for &ldquo;{query}&rdquo;</span>
          <span className="empty-state__subtitle">Try a different keyword or browse by section.</span>
        </div>
      )}

      {/* Results grouped by type */}
      {!loading && (results.length > 0 || filteredTransactions.length > 0) && (
        <div className={styles.results}>
          <p className={styles.resultCount}>
            {results.length + filteredTransactions.length} result{results.length + filteredTransactions.length !== 1 ? 's' : ''}
          </p>

          {/* Transactions Group */}
          {filteredTransactions.length > 0 && (
            <div className={styles.group}>
              <div className="section-header">
                <span className="section-title">TRANSACTIONS</span>
                <span className={styles.groupCount}>{filteredTransactions.length}</span>
              </div>
              <div className={styles.groupList}>
                {filteredTransactions.map(txn => (
                  <Link
                    key={txn.id}
                    href={`/money/transactions?q=${encodeURIComponent(query)}`}
                    className={styles.resultCard}
                    id={`link-result-txn-${txn.id}`}
                  >
                    <span className="badge badge--finance" style={{ textTransform: 'capitalize' }}>
                      {txn.type}
                    </span>
                    <div className={styles.resultInfo}>
                      <div className={styles.resultTitleRow}>
                        <span className={styles.resultTitle}>
                          <Highlight text={txn.payee || `${txn.type} transaction`} query={query} />
                        </span>
                        <span className={`financial-value ${txn.type === 'income' ? styles.incomeAmount : styles.expenseAmount}`}>
                          {txn.type === 'income' ? '+' : '-'}₹{txn.amount.toLocaleString()}
                        </span>
                      </div>
                      <span className={styles.resultSnippet}>
                        {txn.date}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {GROUP_ORDER.map(type => {
            const group = grouped[type];
            if (!group?.length) return null;
            return (
              <div key={type} className={styles.group}>
                <div className="section-header">
                  <span className="section-title">
                    {ITEM_TYPE_LABELS[type]?.toUpperCase() || type.toUpperCase()}
                  </span>
                  <span className={styles.groupCount}>{group.length}</span>
                </div>
                <div className={styles.groupList}>
                  {group.map(item => (
                    <Link
                      key={item.id}
                      href={getHref(item)}
                      className={styles.resultCard}
                      id={`link-result-${item.id}`}
                    >
                      <ItemTypeBadge type={item.type} size="sm" />
                      <div className={styles.resultInfo}>
                        <div className={styles.resultTitleRow}>
                          <span className={styles.resultTitle}>
                            <Highlight text={item.title} query={query} />
                          </span>
                          {(item.type === 'expense' || item.type === 'income') && (item.metadata as { amount?: number })?.amount != null && (
                            <span className={`financial-value ${item.type === 'income' ? styles.incomeAmount : styles.expenseAmount}`}>
                              {item.type === 'income' ? '+' : '-'}{formatAmount((item.metadata as { amount: number }).amount)}
                            </span>
                          )}
                        </div>
                        {item.content && (
                          <span className={styles.resultSnippet}>
                            <Highlight text={getSnippet(item.content, query)} query={query} />
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function groupByType(items: Item[]): Partial<Record<string, Item[]>> {
  const groups: Partial<Record<string, Item[]>> = {};
  for (const item of items) {
    if (!groups[item.type]) groups[item.type] = [];
    groups[item.type]!.push(item);
  }
  return groups;
}

function getSnippet(content: string, query: string): string {
  const idx = content.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return content.slice(0, 80);
  const start = Math.max(0, idx - 30);
  const end = Math.min(content.length, idx + query.length + 50);
  return (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '');
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={i} style={{ background: 'var(--accent-glow)', color: 'var(--accent-secondary)', borderRadius: 3, padding: '0 2px' }}>{part}</mark>
          : part
      )}
    </>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: 'var(--text-tertiary)', fontFamily: 'var(--font-family)' }}>Loading…</div>}>
      <SearchContent />
    </Suspense>
  );
}
