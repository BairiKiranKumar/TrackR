'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download } from 'lucide-react';
import { FinanceTransaction, FinanceAccount, FinanceCategory } from '@/types/finance';
import { financeTransactionService } from '@/lib/services/finance/FinanceTransactionService';
import { financeAccountService } from '@/lib/services/finance/FinanceAccountService';
import { financeCategoryService } from '@/lib/services/finance/FinanceCategoryService';
import { financeCsvService } from '@/lib/services/finance/FinanceCsvService';
import { TransactionTable } from '@/components/money/TransactionTable';
import { QuickExpense } from '@/components/money/QuickExpense';

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [txns, accs, cats] = await Promise.all([
        financeTransactionService.getAllTransactions(),
        financeAccountService.getActiveAccounts(),
        financeCategoryService.getAllCategories(),
      ]);
      setTransactions(txns);
      setAccounts(accs);
      setCategories(cats);
    } catch (err) {
      console.error('Failed to load transactions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    Promise.all([
      financeTransactionService.getAllTransactions(),
      financeAccountService.getActiveAccounts(),
      financeCategoryService.getAllCategories(),
    ]).then(([txns, accs, cats]) => {
      if (!ignore) {
        setTransactions(txns);
        setAccounts(accs);
        setCategories(cats);
        setLoading(false);
      }
    }).catch(err => {
      console.error('Failed to load transactions:', err);
      if (!ignore) setLoading(false);
    });
    return () => { ignore = true; };
  }, []);

  async function handleExportCsv() {
    const csv = await financeCsvService.exportTransactionsCsv();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trackr-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDelete(id: string) {
    await financeTransactionService.deleteTransaction(id);
    await loadData();
  }

  async function handleDuplicate(id: string) {
    await financeTransactionService.duplicateTransaction(id);
    await loadData();
  }

  async function handleBulkDelete(ids: string[]) {
    await financeTransactionService.bulkDelete(ids);
    await loadData();
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link
            href="/money"
            style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-secondary)', textDecoration: 'none' }}
          >
            <ArrowLeft size={18} />
          </Link>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            All Transactions
          </h1>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 9999,
              background: 'var(--bg-elevated)',
              fontSize: '0.85rem',
              color: 'var(--text-secondary)',
            }}
          >
            {transactions.length}
          </span>
        </div>

        <button
          onClick={handleExportCsv}
          className="btn btn-secondary"
          id="btn-export-transactions-csv"
        >
          <Download size={16} />
          <span>Export CSV</span>
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, color: 'var(--text-secondary)' }}>Loading transactions…</div>
      ) : (
        <TransactionTable
          transactions={transactions}
          accounts={accounts}
          categories={categories}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
          onBulkDelete={handleBulkDelete}
        />
      )}

      <QuickExpense onSuccess={loadData} />
    </div>
  );
}
