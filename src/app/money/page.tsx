'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useAppContext } from '@/components/providers/AppProvider';
import { Item, TransactionMetadata, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/types';
import { formatAmount } from '@/lib/services/MoneyParser';
import { dataService } from '@/lib/services/DataService';
import { format } from 'date-fns';
import styles from './page.module.css';
import { TransactionForm } from '@/components/money/TransactionForm';

type Tab = 'overview' | 'transactions' | 'goals';

export default function MoneyPage() {
  const { items, refreshItems } = useAppContext();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [totals, setTotals] = useState({ income: 0, expenses: 0, net: 0 });
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showIncomeForm, setShowIncomeForm] = useState(false);

  useEffect(() => {
    dataService.getMonthlyTotals().then(setTotals);
  }, [items]);

  const expenses = items.filter(i => i.type === 'expense');
  const income = items.filter(i => i.type === 'income');
  const goals = items.filter(i => i.type === 'goal');
  const allTxns = [...expenses, ...income].sort(
    (a, b) => {
      const aDate = (a.metadata as TransactionMetadata).date ?? a.createdAt;
      const bDate = (b.metadata as TransactionMetadata).date ?? b.createdAt;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    }
  );

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <h1 className={styles.title}>Money</h1>
        <div className={styles.headerActions}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowIncomeForm(true)}
            id="btn-add-income"
          >
            <Plus size={14} /> Income
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => setShowExpenseForm(true)}
            id="btn-add-expense"
          >
            <Plus size={14} /> Expense
          </button>
        </div>
      </div>

      {/* Summary hero */}
      <div className={styles.hero}>
        <div className={styles.heroNet}>
          <span className={styles.heroLabel}>Net this month</span>
          <span className={`${styles.heroAmount} ${totals.net >= 0 ? styles.positive : styles.negative}`}>
            {totals.net >= 0 ? '+' : ''}{formatAmount(totals.net)}
          </span>
        </div>
        <div className={styles.heroRow}>
          <div className={styles.heroStat}>
            <TrendingUp size={14} style={{ color: 'var(--color-success)' }} />
            <span className={styles.heroStatLabel}>Income</span>
            <span className={styles.heroStatValue} style={{ color: 'var(--color-success)' }}>
              {formatAmount(totals.income)}
            </span>
          </div>
          <div className={styles.heroDivider} />
          <div className={styles.heroStat}>
            <TrendingDown size={14} style={{ color: 'var(--color-danger)' }} />
            <span className={styles.heroStatLabel}>Expenses</span>
            <span className={styles.heroStatValue} style={{ color: 'var(--color-danger)' }}>
              {formatAmount(totals.expenses)}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {(['overview', 'transactions', 'goals'] as Tab[]).map(t => (
          <button
            key={t}
            id={`tab-money-${t}`}
            className={`tab-item ${activeTab === t ? 'tab-item--active' : ''}`}
            onClick={() => setActiveTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {activeTab === 'overview' && (
        <div className={styles.content}>
          <CategoryBreakdown transactions={expenses} type="expense" />
          <div style={{ height: 16 }} />
          {income.length > 0 && <CategoryBreakdown transactions={income} type="income" />}
        </div>
      )}

      {/* Transactions tab */}
      {activeTab === 'transactions' && (
        <div className={styles.content}>
          {allTxns.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state__icon">💰</span>
              <span className="empty-state__title">No transactions yet</span>
              <span className="empty-state__subtitle">Add expenses and income to track your money flow.</span>
            </div>
          ) : (
            <div className={styles.txnList}>
              {allTxns.map(txn => <TransactionCard key={txn.id} txn={txn} />)}
            </div>
          )}
        </div>
      )}

      {/* Goals tab */}
      {activeTab === 'goals' && (
        <div className={styles.content}>
          {goals.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state__icon">🎯</span>
              <span className="empty-state__title">No financial goals yet</span>
              <span className="empty-state__subtitle">Set a savings goal from the Track page.</span>
            </div>
          ) : (
            <div className={styles.goalsList}>
              {goals.map(goal => {
                const meta = goal.metadata as { targetAmount?: number; currentAmount?: number };
                const target = meta.targetAmount ?? 0;
                const current = meta.currentAmount ?? 0;
                const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
                return (
                  <Link key={goal.id} href={`/track/${goal.id}`} className={styles.goalCard} id={`link-money-goal-${goal.id}`}>
                    <div className={styles.goalHeader}>
                      <span className={styles.goalName}>⭐ {goal.title}</span>
                      <span className={styles.goalPct}>{Math.round(pct)}%</span>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${pct}%`, background: 'var(--color-goal)' }} />
                    </div>
                    <div className={styles.goalAmounts}>
                      <span style={{ color: 'var(--color-success)' }}>{formatAmount(current)}</span>
                      <span style={{ color: 'var(--text-tertiary)' }}> / {formatAmount(target)}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Transaction forms */}
      {showExpenseForm && (
        <>
          <div className="overlay" onClick={() => setShowExpenseForm(false)} />
          <div className={styles.formSheet}>
            <div className={styles.handle} />
            <TransactionForm
              isIncome={false}
              onClose={() => setShowExpenseForm(false)}
              onSaved={async () => { await refreshItems(); setShowExpenseForm(false); }}
            />
          </div>
        </>
      )}
      {showIncomeForm && (
        <>
          <div className="overlay" onClick={() => setShowIncomeForm(false)} />
          <div className={styles.formSheet}>
            <div className={styles.handle} />
            <TransactionForm
              isIncome={true}
              onClose={() => setShowIncomeForm(false)}
              onSaved={async () => { await refreshItems(); setShowIncomeForm(false); }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function TransactionCard({ txn }: { txn: Item }) {
  const meta = txn.metadata as TransactionMetadata;
  const isIncome = meta.isIncome;
  const cat = isIncome
    ? INCOME_CATEGORIES.find(c => c.value === meta.category)
    : EXPENSE_CATEGORIES.find(c => c.value === meta.category);

  return (
    <Link href={`/track/${txn.id}`} className={styles.txnCard} id={`link-txn-${txn.id}`}>
      <span className={styles.txnEmoji}>{cat?.emoji ?? '💫'}</span>
      <div className={styles.txnInfo}>
        <span className={styles.txnTitle}>{txn.title}</span>
        <span className={styles.txnDate}>
          {cat?.label} · {meta.date ? format(new Date(meta.date), 'MMM d') : ''}
        </span>
      </div>
      <span className={`${styles.txnAmount} ${isIncome ? styles.positive : styles.negative}`}>
        {isIncome ? '+' : '-'}{formatAmount(meta.amount)}
      </span>
    </Link>
  );
}

function CategoryBreakdown({ transactions, type }: { transactions: Item[]; type: 'expense' | 'income' }) {
  const categories = type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
  const total = transactions.reduce((s, t) => s + ((t.metadata as TransactionMetadata).amount ?? 0), 0);

  const byCategory: Record<string, number> = {};
  for (const txn of transactions) {
    const meta = txn.metadata as TransactionMetadata;
    const cat = meta.category as string;
    byCategory[cat] = (byCategory[cat] ?? 0) + (meta.amount ?? 0);
  }

  const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);

  if (!sorted.length) return null;

  return (
    <div>
      <div className="section-header">
        <span className="section-title">{type === 'expense' ? 'Expenses by Category' : 'Income Sources'}</span>
      </div>
      <div className={styles.catList}>
        {sorted.map(([catKey, amount]) => {
          const cat = categories.find(c => c.value === catKey);
          const pct = total > 0 ? (amount / total) * 100 : 0;
          return (
            <div key={catKey} className={styles.catRow}>
              <span className={styles.catEmoji}>{cat?.emoji ?? '💫'}</span>
              <div className={styles.catBar}>
                <div className={styles.catBarHeader}>
                  <span className={styles.catLabel}>{cat?.label ?? catKey}</span>
                  <span className={`${styles.catAmount} ${type === 'income' ? styles.positive : styles.negative}`}>
                    {formatAmount(amount)}
                  </span>
                </div>
                <div className="progress-track" style={{ height: 4 }}>
                  <div
                    className="progress-fill"
                    style={{
                      width: `${pct}%`,
                      background: type === 'income' ? 'var(--color-success)' : 'var(--accent-primary)',
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
