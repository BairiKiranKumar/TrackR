'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Search as SearchIcon, X, SlidersHorizontal, Layers, ChevronDown, ChevronUp } from 'lucide-react';
import { dataService } from '@/lib/services/DataService';
import { financeCategoryService } from '@/lib/services/finance/FinanceCategoryService';
import { Item, ITEM_TYPE_LABELS } from '@/types';
import { ItemTypeBadge } from '@/components/common/ItemTypeBadge';
import { formatAmount } from '@/lib/services/MoneyDetectionService';
import { ContextPanel } from '@/components/context/ContextPanel';
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
  const [transactions, setTransactions] = useState<
    {
      id: string;
      payee?: string;
      amount: number;
      date: string;
      type: string;
      categoryId?: string;
      accountId?: string;
      projectId?: string;
      goalId?: string;
    }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');

  // Filter drawer state
  const [showFilters, setShowFilters] = useState(false);
  const [projectsList, setProjectsList] = useState<Item[]>([]);
  const [goalsList, setGoalsList] = useState<Item[]>([]);
  const [categoriesList, setCategoriesList] = useState<Array<{ id: string; name: string }>>([]);

  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedGoalId, setSelectedGoalId] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [minAmount, setMinAmount] = useState<string>('');
  const [maxAmount, setMaxAmount] = useState<string>('');

  // Context view toggle state
  const [activeContextId, setActiveContextId] = useState<string | null>(null);

  // Load filter options on mount
  useEffect(() => {
    async function loadOptions() {
      const all = await dataService.getAllItems();
      setProjectsList(all.filter(i => i.type === 'project' && !i.archived));
      setGoalsList(all.filter(i => i.type === 'goal' && !i.archived));
      try {
        const cats = await financeCategoryService.getAllCategories();
        setCategoriesList(cats);
      } catch {
        // Finance may be empty or offline
      }
    }
    loadOptions();
  }, []);

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

  const activeFiltersCount = useMemo(() => {
    let c = 0;
    if (selectedProjectId) c++;
    if (selectedGoalId) c++;
    if (selectedStatus) c++;
    if (dateFrom) c++;
    if (dateTo) c++;
    if (categoryFilter) c++;
    if (minAmount) c++;
    if (maxAmount) c++;
    return c;
  }, [selectedProjectId, selectedGoalId, selectedStatus, dateFrom, dateTo, categoryFilter, minAmount, maxAmount]);

  function clearAllFilters() {
    setSelectedProjectId('');
    setSelectedGoalId('');
    setSelectedStatus('');
    setDateFrom('');
    setDateTo('');
    setCategoryFilter('');
    setMinAmount('');
    setMaxAmount('');
  }

  // Filter Items
  const filteredResults = useMemo(() => {
    return results.filter(item => {
      // Type filter
      if (typeFilter === 'project' && item.type !== 'project') return false;
      if (typeFilter === 'task' && item.type !== 'task') return false;
      if (typeFilter === 'note' && item.type !== 'note' && item.type !== 'journal') return false;
      if (typeFilter === 'tracker' && item.type !== 'tracker' && item.type !== 'habit') return false;
      if (typeFilter === 'goal' && item.type !== 'goal') return false;
      if (typeFilter === 'finance' && item.type !== 'expense' && item.type !== 'income' && item.type !== 'budget') return false;

      // Project filter
      if (selectedProjectId) {
        const meta = item.metadata as Record<string, unknown> | undefined;
        if (meta?.projectId !== selectedProjectId) return false;
      }

      // Goal filter
      if (selectedGoalId) {
        const meta = item.metadata as Record<string, unknown> | undefined;
        if (meta?.goalId !== selectedGoalId) return false;
      }

      // Status filter
      if (selectedStatus) {
        const meta = item.metadata as Record<string, unknown> | undefined;
        if (meta?.status !== selectedStatus) return false;
      }

      // Date range filter
      if (dateFrom && item.createdAt < dateFrom) return false;
      if (dateTo && item.createdAt > `${dateTo}T23:59:59.999Z`) return false;

      return true;
    });
  }, [results, typeFilter, selectedProjectId, selectedGoalId, selectedStatus, dateFrom, dateTo]);

  // Filter Transactions
  const filteredTransactions = useMemo(() => {
    if (typeFilter !== 'all' && typeFilter !== 'finance') return [];

    return transactions.filter(txn => {
      // Project filter
      if (selectedProjectId && txn.projectId !== selectedProjectId) return false;

      // Goal filter
      if (selectedGoalId && txn.goalId !== selectedGoalId) return false;

      // Category filter
      if (categoryFilter && txn.categoryId !== categoryFilter) return false;

      // Date range
      if (dateFrom && txn.date < dateFrom) return false;
      if (dateTo && txn.date > dateTo) return false;

      // Amount range
      if (minAmount && txn.amount < parseFloat(minAmount)) return false;
      if (maxAmount && txn.amount > parseFloat(maxAmount)) return false;

      return true;
    });
  }, [transactions, typeFilter, selectedProjectId, selectedGoalId, categoryFilter, dateFrom, dateTo, minAmount, maxAmount]);

  // Group results by type
  const grouped = groupByType(filteredResults);
  const GROUP_ORDER = ['project', 'task', 'note', 'tracker', 'goal', 'habit', 'journal', 'expense', 'income', 'budget'] as const;

  function getHref(item: Item): string {
    if (item.type === 'project') return `/projects/${item.id}`;
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
          placeholder="Search across all projects, tasks, notes, goals, trackers & transactions…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {query && (
          <button className={styles.clearBtn} onClick={() => setQuery('')} id="btn-search-clear">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Filter controls row */}
      <div className={styles.filterControlsRow}>
        {/* Type Filter Pills */}
        <div className={styles.filterRow} style={{ marginBottom: 0 }}>
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

        {/* Filters Toggle Button (Search -> Filters) */}
        <button
          className={`${styles.filterToggleBtn} ${showFilters ? styles.filterToggleBtnActive : ''}`}
          onClick={() => setShowFilters(prev => !prev)}
          id="btn-toggle-search-filters"
        >
          <SlidersHorizontal size={14} />
          <span>Filters</span>
          {activeFiltersCount > 0 && <span className="badge badge-primary">{activeFiltersCount}</span>}
          {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Advanced Filter Tray */}
      {showFilters && (
        <div className={styles.filterTray} id="search-filter-tray">
          <div className={styles.filterTrayGrid}>
            <div className={styles.filterGroup}>
              <label className={styles.filterGroupLabel}>Project</label>
              <select
                className={styles.filterSelect}
                value={selectedProjectId}
                onChange={e => setSelectedProjectId(e.target.value)}
                id="select-filter-project"
              >
                <option value="">All Projects</option>
                {projectsList.map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.filterGroupLabel}>Goal</label>
              <select
                className={styles.filterSelect}
                value={selectedGoalId}
                onChange={e => setSelectedGoalId(e.target.value)}
                id="select-filter-goal"
              >
                <option value="">All Goals</option>
                {goalsList.map(g => (
                  <option key={g.id} value={g.id}>{g.title}</option>
                ))}
              </select>
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.filterGroupLabel}>Status</label>
              <select
                className={styles.filterSelect}
                value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value)}
                id="select-filter-status"
              >
                <option value="">All Statuses</option>
                <option value="todo">Todo</option>
                <option value="in_progress">In Progress</option>
                <option value="done">Done</option>
                <option value="active">Active (Projects)</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.filterGroupLabel}>Finance Category</label>
              <select
                className={styles.filterSelect}
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                id="select-filter-category"
              >
                <option value="">All Categories</option>
                {categoriesList.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.filterGroupLabel}>From Date</label>
              <input
                type="date"
                className={styles.filterInput}
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                id="input-filter-date-from"
              />
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.filterGroupLabel}>To Date</label>
              <input
                type="date"
                className={styles.filterInput}
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                id="input-filter-date-to"
              />
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.filterGroupLabel}>Min Amount (₹)</label>
              <input
                type="number"
                className={styles.filterInput}
                placeholder="0"
                value={minAmount}
                onChange={e => setMinAmount(e.target.value)}
                id="input-filter-min-amount"
              />
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.filterGroupLabel}>Max Amount (₹)</label>
              <input
                type="number"
                className={styles.filterInput}
                placeholder="Unlimited"
                value={maxAmount}
                onChange={e => setMaxAmount(e.target.value)}
                id="input-filter-max-amount"
              />
            </div>
          </div>

          <div className={styles.filterTrayFooter}>
            {activeFiltersCount > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={clearAllFilters}
                id="btn-clear-search-filters"
              >
                Reset Filters
              </button>
            )}
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowFilters(false)}
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Recent queries hint */}
      {!query && !searched && (
        <div className={styles.hint}>
          <p className={styles.hintText}>Search across all your notes, tasks, trackers, and money.</p>
          <div className={styles.suggestions}>
            {['Goa', 'Car', 'Trip', 'JavaScript', 'food'].map(s => (
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
      {!loading && searched && filteredResults.length === 0 && filteredTransactions.length === 0 && (
        <div className="empty-state">
          <span className="empty-state__icon"><SearchIcon size={36} /></span>
          <span className="empty-state__title">No results for &ldquo;{query}&rdquo;</span>
          <span className="empty-state__subtitle">Try adjusting your keyword or clearing active filters.</span>
        </div>
      )}

      {/* Results grouped by type */}
      {!loading && (filteredResults.length > 0 || filteredTransactions.length > 0) && (
        <div className={styles.results}>
          <p className={styles.resultCount}>
            {filteredResults.length + filteredTransactions.length} result{filteredResults.length + filteredTransactions.length !== 1 ? 's' : ''}
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
                  <div key={txn.id} className={styles.resultCardWrapper}>
                    <div className={styles.resultTopRow}>
                      <Link
                        href={`/money/transactions?q=${encodeURIComponent(query)}`}
                        className={styles.resultMainLink}
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
                              {txn.type === 'income' ? '+' : '-'}₹{txn.amount.toLocaleString('en-IN')}
                            </span>
                          </div>
                          <span className={styles.resultSnippet}>
                            {txn.date}
                          </span>
                        </div>
                      </Link>

                      <button
                        type="button"
                        className={styles.viewContextBtn}
                        onClick={() => setActiveContextId(prev => prev === txn.id ? null : txn.id)}
                        id={`btn-context-txn-${txn.id}`}
                      >
                        <Layers size={12} style={{ display: 'inline', marginRight: 4 }} />
                        {activeContextId === txn.id ? 'Hide Context' : 'View Context'}
                      </button>
                    </div>

                    {activeContextId === txn.id && (
                      <div className={styles.inlineContextBox}>
                        <ContextPanel
                          entityId={txn.id}
                          entityType="transaction"
                          entityTitle={txn.payee || 'Transaction'}
                        />
                      </div>
                    )}
                  </div>
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
                    <div key={item.id} className={styles.resultCardWrapper}>
                      <div className={styles.resultTopRow}>
                        <Link
                          href={getHref(item)}
                          className={styles.resultMainLink}
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

                        <button
                          type="button"
                          className={styles.viewContextBtn}
                          onClick={() => setActiveContextId(prev => prev === item.id ? null : item.id)}
                          id={`btn-context-${item.id}`}
                        >
                          <Layers size={12} style={{ display: 'inline', marginRight: 4 }} />
                          {activeContextId === item.id ? 'Hide Context' : 'View Context'}
                        </button>
                      </div>

                      {activeContextId === item.id && (
                        <div className={styles.inlineContextBox}>
                          <ContextPanel
                            entityId={item.id}
                            entityType={item.type}
                            entityTitle={item.title}
                          />
                        </div>
                      )}
                    </div>
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
