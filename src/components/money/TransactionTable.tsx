'use client';

import React, { useState, useMemo } from 'react';
import { FinanceTransaction, FinanceAccount, FinanceCategory } from '@/types/finance';
import { TransactionRow } from './TransactionRow';
import { TransactionDetailDrawer } from './TransactionDetailDrawer';
import styles from './TransactionTable.module.css';

interface TransactionTableProps {
  transactions: FinanceTransaction[];
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
  onBulkDelete?: (ids: string[]) => void;
  onBulkCategorize?: (ids: string[], categoryId: string) => void;
}

export function TransactionTable({
  transactions,
  accounts,
  categories,
  onDuplicate,
  onDelete,
  onBulkDelete,
  onBulkCategorize,
}: TransactionTableProps) {
  const [search, setSearch] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inspectingTxn, setInspectingTxn] = useState<FinanceTransaction | null>(null);

  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of accounts) map.set(a.id, a.name);
    return map;
  }, [accounts]);

  const categoryMap = useMemo(() => {
    const map = new Map<string, { name: string; icon?: string }>();
    for (const c of categories) map.set(c.id, { name: c.name, icon: c.icon });
    return map;
  }, [categories]);

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      if (selectedAccountId && t.accountId !== selectedAccountId) return false;
      if (selectedCategoryId && t.categoryId !== selectedCategoryId) return false;
      if (selectedType !== 'all' && t.type !== selectedType) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const payeeMatch = t.payee?.toLowerCase().includes(q);
        const noteMatch = t.note?.toLowerCase().includes(q);
        const cat = t.categoryId ? categoryMap.get(t.categoryId) : undefined;
        const catMatch = cat?.name.toLowerCase().includes(q);
        if (!payeeMatch && !noteMatch && !catMatch) return false;
      }
      return true;
    });
  }, [transactions, selectedAccountId, selectedCategoryId, selectedType, search, categoryMap]);

  function handleSelectRow(id: string, checked: boolean) {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    setSelectedIds(next);
  }

  function handleSelectAll(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.checked) {
      setSelectedIds(new Set(filtered.map(t => t.id)));
    } else {
      setSelectedIds(new Set());
    }
  }

  return (
    <div className={styles.container}>
      {/* Filters Bar */}
      <div className={styles.filterBar}>
        <input
          id="input-txn-table-search"
          type="text"
          placeholder="Search transactions…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className={styles.searchInput}
        />

        <select
          id="select-txn-table-account"
          value={selectedAccountId}
          onChange={e => setSelectedAccountId(e.target.value)}
          className={styles.select}
        >
          <option value="">All Accounts</option>
          {accounts.map(acc => (
            <option key={acc.id} value={acc.id}>
              {acc.name}
            </option>
          ))}
        </select>

        <select
          id="select-txn-table-type"
          value={selectedType}
          onChange={e => setSelectedType(e.target.value)}
          className={styles.select}
        >
          <option value="all">All Types</option>
          <option value="expense">Expenses</option>
          <option value="income">Income</option>
          <option value="transfer">Transfers</option>
        </select>

        <select
          id="select-txn-table-category"
          value={selectedCategoryId}
          onChange={e => setSelectedCategoryId(e.target.value)}
          className={styles.select}
        >
          <option value="">All Categories</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>
              {cat.icon ? `${cat.icon} ` : ''}{cat.name}
            </option>
          ))}
        </select>
      </div>

      {/* Bulk selection actions bar */}
      {selectedIds.size > 0 && (
        <div className={styles.bulkBar}>
          <span className={styles.bulkText}>{selectedIds.size} transactions selected</span>
          <div className={styles.bulkActions}>
            {onBulkCategorize && (
              <select
                id="select-bulk-categorize"
                className={styles.select}
                style={{ height: 32, fontSize: '0.82rem' }}
                onChange={e => {
                  if (e.target.value) {
                    onBulkCategorize(Array.from(selectedIds), e.target.value);
                    setSelectedIds(new Set());
                    e.target.value = '';
                  }
                }}
                defaultValue=""
              >
                <option value="" disabled>Categorize Selected…</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ''}{c.name}</option>
                ))}
              </select>
            )}
            {onBulkDelete && (
              <button
                id="btn-bulk-delete"
                onClick={() => {
                  onBulkDelete(Array.from(selectedIds));
                  setSelectedIds(new Set());
                }}
                className={`${styles.bulkBtn} ${styles.bulkDeleteBtn}`}
              >
                Delete Selected
              </button>
            )}
          </div>
        </div>
      )}

      {/* Select All Bar */}
      {filtered.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          <input
            type="checkbox"
            id="checkbox-select-all"
            checked={filtered.length > 0 && selectedIds.size === filtered.length}
            onChange={handleSelectAll}
          />
          <label htmlFor="checkbox-select-all" style={{ cursor: 'pointer' }}>Select all ({filtered.length})</label>
        </div>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <p>No transactions found.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {filtered.map(t => {
            const cat = t.categoryId ? categoryMap.get(t.categoryId) : undefined;
            return (
              <TransactionRow
                key={t.id}
                transaction={t}
                accountName={accountMap.get(t.accountId)}
                categoryName={cat?.name}
                categoryIcon={cat?.icon}
                selected={selectedIds.has(t.id)}
                onSelect={checked => handleSelectRow(t.id, checked)}
                onClick={() => setInspectingTxn(t)}
                onDuplicate={onDuplicate ? () => onDuplicate(t.id) : undefined}
                onDelete={onDelete ? () => onDelete(t.id) : undefined}
              />
            );
          })}
        </div>
      )}

      {/* Transaction Deep Context Drawer */}
      <TransactionDetailDrawer
        transaction={inspectingTxn}
        accountName={inspectingTxn ? accountMap.get(inspectingTxn.accountId) : undefined}
        categoryName={inspectingTxn?.categoryId ? categoryMap.get(inspectingTxn.categoryId)?.name : undefined}
        categoryIcon={inspectingTxn?.categoryId ? categoryMap.get(inspectingTxn.categoryId)?.icon : undefined}
        isOpen={Boolean(inspectingTxn)}
        onClose={() => setInspectingTxn(null)}
      />
    </div>
  );
}
