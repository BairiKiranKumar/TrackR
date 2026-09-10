'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Plus, TrendingUp, TrendingDown, Trash2, DollarSign, Target } from 'lucide-react';
import { useAppContext } from '@/components/providers/AppProvider';
import { useConfirm } from '@/components/providers/ConfirmDialogProvider';
import { BudgetProgress, Item, TransactionCategory, TransactionMetadata, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/types';
import { formatAmount } from '@/lib/services/MoneyDetectionService';
import { dataService } from '@/lib/services/DataService';
import { format } from 'date-fns';
import styles from './page.module.css';
import { TransactionForm } from '@/components/money/TransactionForm';

type Tab = 'overview' | 'transactions' | 'goals';

function MoneyContent() {
  const { items, refreshItems } = useAppContext();
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as Tab | null;
  const [userTab, setUserTab] = useState<Tab | null>(null);
  const activeTab: Tab = userTab ?? (tabParam && ['overview', 'transactions', 'goals'].includes(tabParam) ? tabParam : 'overview');
  const setActiveTab = setUserTab;
  const [totals, setTotals] = useState({ income: 0, expenses: 0, net: 0 });
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [budgetProgress, setBudgetProgress] = useState<BudgetProgress[]>([]);

  useEffect(() => {
    dataService.getMonthlyTotals().then(setTotals);
    dataService.getMonthlyBudgetProgress().then(setBudgetProgress);
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

  async function handleDeleteItem(e: React.MouseEvent, id: string, title: string) {
    e.preventDefault();
    e.stopPropagation();
    const confirmed = await confirm({
      title: `Delete "${title || 'this item'}"?`,
      message: 'This can’t be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await dataService.deleteItem(id);
      await refreshItems();
    } catch (err) {
      console.error('Failed to delete item:', err);
    }
  }

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
          <section className={styles.budgetSection}>
            <div className="section-header">
              <span className="section-title">Monthly Budgets</span>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowBudgetForm(true)} id="btn-set-budget">
                <Plus size={14} /> Set budget
              </button>
            </div>
            {budgetProgress.length === 0 ? (
              <div className={styles.budgetEmpty}>Set a category budget to see this month&apos;s spending progress.</div>
            ) : (
              <div className={styles.budgetList}>
                {budgetProgress.map(progress => (
                  <BudgetProgressCard
                    key={progress.budget.id}
                    progress={progress}
                    onDelete={(e) => handleDeleteItem(e, progress.budget.id, progress.budget.title || `${progress.budget.metadata.category} budget`)}
                  />
                ))}
              </div>
            )}
          </section>
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
              <span className="empty-state__icon"><DollarSign size={36} /></span>
              <span className="empty-state__title">No expenses yet</span>
              <span className="empty-state__subtitle">Start logging expenses to understand your spending.</span>
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <button
                  className="btn btn-primary"
                  onClick={() => setShowExpenseForm(true)}
                  id="btn-money-add-first-expense"
                >
                  <Plus size={16} /> Add expense
                </button>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                  You can also capture an expense from Quick Capture.
                </span>
              </div>
            </div>
          ) : (
            <div className={styles.txnList}>
              {allTxns.map(txn => (
                <TransactionCard
                  key={txn.id}
                  txn={txn}
                  onDelete={(e) => handleDeleteItem(e, txn.id, txn.title)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Goals tab */}
      {activeTab === 'goals' && (
        <div className={styles.content}>
          {goals.length === 0 ? (
            <div className="empty-state">
              <span className="empty-state__icon"><Target size={36} /></span>
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
                  <div key={goal.id} className={styles.goalCard} id={`money-goal-${goal.id}`}>
                    <div className={styles.goalHeader}>
                      <Link href={`/track/${goal.id}`} className={styles.goalLink} id={`link-money-goal-${goal.id}`}>
                        <span className={styles.goalName}>{goal.title}</span>
                        <span className={styles.goalPct}>{Math.round(pct)}%</span>
                      </Link>
                      <button
                        type="button"
                        className="btn btn-icon btn-ghost"
                        onClick={(e) => handleDeleteItem(e, goal.id, goal.title)}
                        id={`btn-delete-money-goal-${goal.id}`}
                        title="Delete goal"
                        style={{ color: 'var(--text-tertiary)', marginLeft: 'auto', padding: 4, flexShrink: 0 }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <Link href={`/track/${goal.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                      <div className="progress-track">
                        <div className="progress-fill" style={{ width: `${pct}%`, background: 'var(--color-goal)' }} />
                      </div>
                      <div className={styles.goalAmounts}>
                        <span style={{ color: 'var(--color-success)' }}>{formatAmount(current)}</span>
                        <span style={{ color: 'var(--text-tertiary)' }}> / {formatAmount(target)}</span>
                      </div>
                    </Link>
                  </div>
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
          <div
            className={styles.formSheet}
            role="dialog"
            aria-modal="true"
            aria-label="Add expense"
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setShowExpenseForm(false); } }}
          >
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
          <div
            className={styles.formSheet}
            role="dialog"
            aria-modal="true"
            aria-label="Add income"
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setShowIncomeForm(false); } }}
          >
            <div className={styles.handle} />
            <TransactionForm
              isIncome={true}
              onClose={() => setShowIncomeForm(false)}
              onSaved={async () => { await refreshItems(); setShowIncomeForm(false); }}
            />
          </div>
        </>
      )}
      {showBudgetForm && (
        <>
          <div className="overlay" onClick={() => setShowBudgetForm(false)} />
          <div
            className={styles.formSheet}
            role="dialog"
            aria-modal="true"
            aria-label="Set budget"
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setShowBudgetForm(false); } }}
          >
            <div className={styles.handle} />
            <BudgetForm onClose={() => setShowBudgetForm(false)} onSaved={async () => { await refreshItems(); setShowBudgetForm(false); }} />
          </div>
        </>
      )}
    </div>
  );
}

function BudgetProgressCard({ progress, onDelete }: { progress: BudgetProgress; onDelete?: (e: React.MouseEvent) => void }) {
  const metadata = progress.budget.metadata;
  const category = EXPENSE_CATEGORIES.find(item => item.value === metadata.category);
  const isOver = progress.percentage >= 100;
  const barColor = isOver ? 'var(--color-danger)' : progress.isAlert ? 'var(--color-warning)' : 'var(--accent-primary)';

  return (
    <div className={`${styles.budgetCard} ${progress.isAlert ? styles.budgetAlert : ''}`}>
      <div className={styles.budgetHeader}>
        <span>{category?.emoji ?? '💫'} {category?.label ?? metadata.category}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <span className={progress.isAlert ? styles.budgetWarning : styles.budgetAmount}>
            {progress.isAlert && <AlertTriangle size={14} />} {Math.round(progress.percentage)}%
          </span>
          {onDelete && (
            <button
              className="btn btn-icon btn-ghost"
              onClick={onDelete}
              title="Delete budget"
              style={{ color: 'var(--text-tertiary)', padding: 2 }}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${Math.min(progress.percentage, 100)}%`, background: barColor }} />
      </div>
      <div className={styles.budgetFooter}>
        <span>{formatAmount(progress.spent)} spent</span>
        <span>of {formatAmount(metadata.limit)}</span>
      </div>
    </div>
  );
}

function BudgetForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [category, setCategory] = useState<TransactionCategory>('food');
  const [limit, setLimit] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    const amount = Number(limit);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setSaving(true);
    try {
      await dataService.saveMonthlyBudget(category, amount);
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.budgetForm}>
      <div className={styles.budgetFormHeader}>
        <div>
          <span className={styles.budgetFormTitle}>Set monthly budget</span>
          <p>We&apos;ll alert you once spending reaches 80%.</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
      </div>
      <label className="input-label" htmlFor="select-budget-category">Category</label>
      <select id="select-budget-category" className="input" value={category} onChange={event => setCategory(event.target.value as TransactionCategory)}>
        {EXPENSE_CATEGORIES.map(item => <option key={item.value} value={item.value}>{item.emoji} {item.label}</option>)}
      </select>
      <label className="input-label" htmlFor="input-budget-limit">Monthly limit (₹)</label>
      <input id="input-budget-limit" className="input" inputMode="decimal" type="number" min="1" placeholder="0" value={limit} onChange={event => setLimit(event.target.value)} autoFocus />
      <button className="btn btn-primary" onClick={save} disabled={saving || !limit} id="btn-save-budget">
        {saving ? 'Saving…' : 'Save budget'}
      </button>
    </div>
  );
}

function TransactionCard({ txn, onDelete }: { txn: Item; onDelete?: (e: React.MouseEvent) => void }) {
  const meta = txn.metadata as TransactionMetadata;
  const isIncome = meta.isIncome;
  const cat = isIncome
    ? INCOME_CATEGORIES.find(c => c.value === meta.category)
    : EXPENSE_CATEGORIES.find(c => c.value === meta.category);

  return (
    <div className={styles.txnCard} id={`txn-card-${txn.id}`}>
      <Link href={`/track/${txn.id}`} className={styles.txnMainLink} id={`link-txn-${txn.id}`}>
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
      {onDelete && (
        <button
          type="button"
          className="btn btn-icon btn-ghost"
          onClick={onDelete}
          id={`btn-delete-txn-${txn.id}`}
          title="Delete transaction"
          style={{ color: 'var(--text-tertiary)', padding: 4, marginLeft: 8, flexShrink: 0 }}
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
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

export default function MoneyPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: 'var(--text-tertiary)' }}>Loading…</div>}>
      <MoneyContent />
    </Suspense>
  );
}
