'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Search as SearchIcon, X } from 'lucide-react';
import { dataService } from '@/lib/services/DataService';
import { Item, ITEM_TYPE_EMOJIS, ITEM_TYPE_LABELS } from '@/types';
import styles from './page.module.css';

function SearchContent() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [results, setResults] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setSearched(false); return; }
    setLoading(true);
    setSearched(true);
    const r = await dataService.search(q.trim());
    setResults(r);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 250);
    return () => clearTimeout(timer);
  }, [query, doSearch]);

  // Group results by type
  const grouped = groupByType(results);

  const GROUP_ORDER = ['tracker', 'habit', 'note', 'journal', 'task', 'expense', 'income', 'goal', 'project', 'budget'] as const;

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
      {!loading && searched && results.length === 0 && (
        <div className="empty-state">
          <span className="empty-state__icon">🔍</span>
          <span className="empty-state__title">No results for &ldquo;{query}&rdquo;</span>
          <span className="empty-state__subtitle">Try a different keyword or browse by section.</span>
        </div>
      )}

      {/* Results grouped by type */}
      {!loading && results.length > 0 && (
        <div className={styles.results}>
          <p className={styles.resultCount}>{results.length} result{results.length !== 1 ? 's' : ''}</p>
          {GROUP_ORDER.map(type => {
            const group = grouped[type];
            if (!group?.length) return null;
            return (
              <div key={type} className={styles.group}>
                <div className="section-header">
                  <span className="section-title">
                    {ITEM_TYPE_EMOJIS[type]} {ITEM_TYPE_LABELS[type]}s
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
                      <span className={styles.resultEmoji}>{ITEM_TYPE_EMOJIS[item.type]}</span>
                      <div className={styles.resultInfo}>
                        <span className={styles.resultTitle}>
                          <Highlight text={item.title} query={query} />
                        </span>
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
