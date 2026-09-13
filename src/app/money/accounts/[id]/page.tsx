'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trash2, Archive } from 'lucide-react';
import { FinanceAccount, FinanceTransaction, FinanceCategory } from '@/types/finance';
import { financeAccountService } from '@/lib/services/finance/FinanceAccountService';
import { financeTransactionService } from '@/lib/services/finance/FinanceTransactionService';
import { financeCategoryService } from '@/lib/services/finance/FinanceCategoryService';
import { TransactionTable } from '@/components/money/TransactionTable';

export default function AccountDetailPage() {
  const params = useParams();
  const router = useRouter();
  const accountId = params?.id as string;

  const [account, setAccount] = useState<FinanceAccount | null>(null);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!accountId) return;
    try {
      const [acc, txns, cats] = await Promise.all([
        financeAccountService.getAccountById(accountId),
        financeTransactionService.queryTransactions({ accountId }),
        financeCategoryService.getAllCategories(),
      ]);
      setAccount(acc || null);
      setTransactions(txns);
      setCategories(cats);
    } catch (err) {
      console.error('Failed to load account details:', err);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    if (!accountId) return;
    let ignore = false;
    Promise.all([
      financeAccountService.getAccountById(accountId),
      financeTransactionService.queryTransactions({ accountId }),
      financeCategoryService.getAllCategories(),
    ]).then(([acc, txns, cats]) => {
      if (!ignore) {
        setAccount(acc || null);
        setTransactions(txns);
        setCategories(cats);
        setLoading(false);
      }
    }).catch(err => {
      console.error('Failed to load account details:', err);
      if (!ignore) setLoading(false);
    });
    return () => { ignore = true; };
  }, [accountId]);

  async function handleArchive() {
    if (!account) return;
    await financeAccountService.archiveAccount(account.id);
    router.push('/money');
  }

  async function handleDelete() {
    if (!account) return;
    if (transactions.length > 0) {
      alert('Cannot delete an account that contains transactions. You can archive it instead.');
      return;
    }
    if (confirm(`Are you sure you want to permanently delete "${account.name}"?`)) {
      await financeAccountService.deleteAccount(account.id);
      router.push('/money');
    }
  }

  async function handleDuplicate(id: string) {
    await financeTransactionService.duplicateTransaction(id);
    await loadData();
  }

  async function handleDeleteTxn(id: string) {
    await financeTransactionService.deleteTransaction(id);
    await loadData();
  }

  if (loading) {
    return (
      <div style={{ padding: 40, color: 'var(--text-secondary)' }}>
        Loading account details…
      </div>
    );
  }

  if (!account) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <h2>Account not found</h2>
        <Link href="/money" className="btn btn-secondary" style={{ marginTop: 16 }}>
          Back to Money
        </Link>
      </div>
    );
  }

  const isNegative = account.currentBalance < 0;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Back button & header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link
          href="/money"
          style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', textDecoration: 'none' }}
          id="link-back-to-money"
        >
          <ArrowLeft size={18} />
          <span>Back to Finance</span>
        </Link>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btn btn-secondary"
            onClick={handleArchive}
            title="Archive this account"
            id="btn-archive-account"
          >
            <Archive size={16} />
            <span>Archive</span>
          </button>
          {transactions.length === 0 && (
            <button
              className="btn btn-danger"
              onClick={handleDelete}
              title="Delete empty account"
              id="btn-delete-account"
            >
              <Trash2 size={16} />
              <span>Delete</span>
            </button>
          )}
        </div>
      </div>

      {/* Account Hero Card */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          borderRadius: 20,
          padding: 28,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 20,
        }}
      >
        <div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {account.type.replace('_', ' ')} {account.institution ? `• ${account.institution}` : ''}
          </span>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: '4px 0 0 0', color: 'var(--text-primary)' }}>
            {account.name}
          </h1>
        </div>

        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
            Current Balance
          </span>
          <div
            style={{
              fontSize: '2.2rem',
              fontWeight: 800,
              color: isNegative ? 'var(--color-danger, #ef4444)' : 'var(--text-primary, #f4f4f6)',
            }}
          >
            {account.currency === 'INR' ? '₹' : `${account.currency} `}
            {account.currentBalance.toLocaleString('en-IN', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </div>
        </div>
      </div>

      {/* Transaction History for this Account */}
      <div>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 14, color: 'var(--text-primary)' }}>
          Account Transactions ({transactions.length})
        </h3>
        <TransactionTable
          transactions={transactions}
          accounts={[account]}
          categories={categories}
          onDelete={handleDeleteTxn}
          onDuplicate={handleDuplicate}
        />
      </div>
    </div>
  );
}
