'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Wallet,
  ArrowRightLeft,
  PiggyBank,
  TrendingUp,
  Plus,
  BarChart3,
  Calendar,
  Layers,
  FileText,
  Sliders,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  FinanceAccount,
  FinanceTransaction,
  FinanceCategory,
  FinanceBudgetProgress,
  AccountType,
  BudgetPeriod,
} from '@/types/finance';
import { financeAccountService } from '@/lib/services/finance/FinanceAccountService';
import { financeTransactionService } from '@/lib/services/finance/FinanceTransactionService';
import { financeCategoryService } from '@/lib/services/finance/FinanceCategoryService';
import { financeBudgetService } from '@/lib/services/finance/FinanceBudgetService';
import { financePlannedService } from '@/lib/services/finance/FinancePlannedService';
import { NetWorthCard } from '@/components/money/NetWorthCard';
import { AccountCard } from '@/components/money/AccountCard';
import { BudgetCard } from '@/components/money/BudgetCard';
import { TransactionTable } from '@/components/money/TransactionTable';
import { CashFlowForecast } from '@/components/money/CashFlowForecast';
import { QuickExpense } from '@/components/money/QuickExpense';
import { TransferForm } from '@/components/money/TransferForm';
import { CategorySelect } from '@/components/money/CategorySelect';
import styles from './page.module.css';

type Tab = 'overview' | 'transactions' | 'accounts' | 'budgets' | 'planning';

export default function MoneyPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [budgets, setBudgets] = useState<FinanceBudgetProgress[]>([]);
  const [forecast, setForecast] = useState<
    { date: string; label: string; amount: number; type: 'planned' | 'projected'; paymentId: string }[]
  >([]);
  const [netWorthData, setNetWorthData] = useState({ totalAssets: 0, totalLiabilities: 0, netWorth: 0 });

  // Modals state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [showAddBudgetModal, setShowAddBudgetModal] = useState(false);

  // New account form state
  const [newAccName, setNewAccName] = useState('');
  const [newAccInstitution, setNewAccInstitution] = useState('');
  const [newAccType, setNewAccType] = useState<AccountType>('bank');
  const [newAccBalance, setNewAccBalance] = useState('');

  // New budget form state
  const [newBudgetName, setNewBudgetName] = useState('');
  const [newBudgetTarget, setNewBudgetTarget] = useState('');
  const [newBudgetPeriod, setNewBudgetPeriod] = useState<BudgetPeriod>('monthly');
  const [newBudgetCategory, setNewBudgetCategory] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [accs, txns, cats, bds, fc, nw] = await Promise.all([
        financeAccountService.getActiveAccounts(),
        financeTransactionService.getAllTransactions(),
        financeCategoryService.getAllCategories(),
        financeBudgetService.getAllBudgetProgress(),
        financePlannedService.generateForecast(60),
        financeAccountService.getNetWorthBreakdown(),
      ]);

      setAccounts(accs);
      setTransactions(txns);
      setCategories(cats);
      setBudgets(bds);
      setForecast(fc);
      setNetWorthData({
        totalAssets: nw.totalAssets,
        totalLiabilities: nw.totalLiabilities,
        netWorth: nw.netWorth,
      });
    } catch (err) {
      console.error('Failed to load finance data:', err);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    Promise.all([
      financeAccountService.getActiveAccounts(),
      financeTransactionService.getAllTransactions(),
      financeCategoryService.getAllCategories(),
      financeBudgetService.getAllBudgetProgress(),
      financePlannedService.generateForecast(60),
      financeAccountService.getNetWorthBreakdown(),
    ]).then(([accs, txns, cats, bds, fc, nw]) => {
      if (!ignore) {
        setAccounts(accs);
        setTransactions(txns);
        setCategories(cats);
        setBudgets(bds);
        setForecast(fc);
        setNetWorthData({
          totalAssets: nw.totalAssets,
          totalLiabilities: nw.totalLiabilities,
          netWorth: nw.netWorth,
        });
      }
    }).catch(err => {
      console.error('Failed to load finance data:', err);
    });
    return () => { ignore = true; };
  }, []);

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!newAccName.trim()) return;
    const initialBal = parseFloat(newAccBalance) || 0;
    await financeAccountService.createAccount({
      name: newAccName.trim(),
      institution: newAccInstitution.trim() || undefined,
      type: newAccType,
      openingBalance: initialBal,
    });
    setNewAccName('');
    setNewAccInstitution('');
    setNewAccBalance('');
    setShowAddAccountModal(false);
    await loadData();
  }

  async function handleCreateBudget(e: React.FormEvent) {
    e.preventDefault();
    const targetVal = parseFloat(newBudgetTarget);
    if (!newBudgetName.trim() || isNaN(targetVal) || targetVal <= 0) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    await financeBudgetService.createBudget({
      name: newBudgetName.trim(),
      target: targetVal,
      period: newBudgetPeriod,
      startDate: todayStr,
      categoryId: newBudgetCategory || undefined,
    });
    setNewBudgetName('');
    setNewBudgetTarget('');
    setNewBudgetCategory('');
    setShowAddBudgetModal(false);
    await loadData();
  }

  async function handleDeleteTransaction(id: string) {
    await financeTransactionService.deleteTransaction(id);
    await loadData();
  }

  async function handleDuplicateTransaction(id: string) {
    await financeTransactionService.duplicateTransaction(id);
    await loadData();
  }

  async function handleBulkDelete(ids: string[]) {
    await financeTransactionService.bulkDelete(ids);
    await loadData();
  }

  return (
    <div className={styles.page}>
      {/* Page Header */}
      <div className={styles.header}>
        <h1 className={styles.title}>Finance</h1>
        <div className={styles.headerActions}>
          <button
            id="btn-open-transfer"
            className="btn btn-secondary"
            onClick={() => setShowTransferModal(true)}
            disabled={accounts.length < 2}
          >
            <ArrowRightLeft size={16} />
            <span>Transfer</span>
          </button>
          <button
            id="btn-open-add-account"
            className="btn btn-primary"
            onClick={() => setShowAddAccountModal(true)}
          >
            <Plus size={16} />
            <span>New Account</span>
          </button>
        </div>
      </div>

      {/* Sub-nav quick links to deeper features */}
      <div className={styles.subnav}>
        <Link href="/money/reports" className={styles.subnavLink} id="link-finance-reports">
          <BarChart3 size={15} color="var(--accent-primary, #6366f1)" />
          <span>Reports (10)</span>
        </Link>
        <Link href="/money/investments" className={styles.subnavLink} id="link-finance-investments">
          <TrendingUp size={15} color="var(--color-success, #10b981)" />
          <span>Investments</span>
        </Link>
        <Link href="/money/debts" className={styles.subnavLink} id="link-finance-debts">
          <Wallet size={15} color="var(--color-warning, #f59e0b)" />
          <span>Debts</span>
        </Link>
        <Link href="/money/rules" className={styles.subnavLink} id="link-finance-rules">
          <Sliders size={15} color="var(--color-info, #3b82f6)" />
          <span>Auto Rules</span>
        </Link>
        <Link href="/money/import" className={styles.subnavLink} id="link-finance-import">
          <UploadCloud size={15} />
          <span>CSV Import/Export</span>
        </Link>
      </div>

      {/* Main Tabs */}
      <div className={styles.tabs}>
        <button
          id="tab-btn-overview"
          className={`${styles.tabBtn} ${activeTab === 'overview' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <Wallet size={17} />
          <span>Overview</span>
        </button>
        <button
          id="tab-btn-transactions"
          className={`${styles.tabBtn} ${activeTab === 'transactions' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('transactions')}
        >
          <FileText size={17} />
          <span>Transactions ({transactions.length})</span>
        </button>
        <button
          id="tab-btn-accounts"
          className={`${styles.tabBtn} ${activeTab === 'accounts' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('accounts')}
        >
          <Layers size={17} />
          <span>Accounts ({accounts.length})</span>
        </button>
        <button
          id="tab-btn-budgets"
          className={`${styles.tabBtn} ${activeTab === 'budgets' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('budgets')}
        >
          <PiggyBank size={17} />
          <span>Budgets ({budgets.length})</span>
        </button>
        <button
          id="tab-btn-planning"
          className={`${styles.tabBtn} ${activeTab === 'planning' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('planning')}
        >
          <Calendar size={17} />
          <span>Planning & Forecast</span>
        </button>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Net worth card */}
          <NetWorthCard
            totalAssets={netWorthData.totalAssets}
            totalLiabilities={netWorthData.totalLiabilities}
            netWorth={netWorthData.netWorth}
          />

          {/* Accounts Summary */}
          <div>
            <div className={styles.sectionTitle}>
              <span>Accounts</span>
              <span className={styles.sectionCount}>{accounts.length}</span>
            </div>
            <div className={styles.grid}>
              {accounts.map(acc => (
                <AccountCard key={acc.id} account={acc} />
              ))}
            </div>
          </div>

          {/* Budgets Alert / Active */}
          {budgets.length > 0 && (
            <div>
              <div className={styles.sectionTitle}>
                <span>Active Budgets</span>
                <span className={styles.sectionCount}>{budgets.length}</span>
              </div>
              <div className={styles.grid}>
                {budgets.slice(0, 4).map(b => (
                  <BudgetCard key={b.budget.id} progress={b} />
                ))}
              </div>
            </div>
          )}

          {/* Recent Transactions */}
          <div>
            <div className={styles.sectionTitle}>
              <span>Recent Transactions</span>
              <button
                className="btn btn-ghost"
                onClick={() => setActiveTab('transactions')}
                style={{ fontSize: '0.85rem' }}
              >
                View all →
              </button>
            </div>
            <TransactionTable
              transactions={transactions.slice(0, 10)}
              accounts={accounts}
              categories={categories}
              onDelete={handleDeleteTransaction}
              onDuplicate={handleDuplicateTransaction}
            />
          </div>
        </div>
      )}

      {/* Tab 2: Transactions */}
      {activeTab === 'transactions' && (
        <TransactionTable
          transactions={transactions}
          accounts={accounts}
          categories={categories}
          onDelete={handleDeleteTransaction}
          onDuplicate={handleDuplicateTransaction}
          onBulkDelete={handleBulkDelete}
        />
      )}

      {/* Tab 3: Accounts */}
      {activeTab === 'accounts' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button
              className="btn btn-primary"
              onClick={() => setShowAddAccountModal(true)}
              id="btn-add-account-tab"
            >
              <Plus size={16} />
              <span>Add Account</span>
            </button>
          </div>
          <div className={styles.grid}>
            {accounts.map(acc => (
              <AccountCard key={acc.id} account={acc} />
            ))}
          </div>
        </div>
      )}

      {/* Tab 4: Budgets */}
      {activeTab === 'budgets' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button
              className="btn btn-primary"
              onClick={() => setShowAddBudgetModal(true)}
              id="btn-add-budget-tab"
            >
              <Plus size={16} />
              <span>Add Budget</span>
            </button>
          </div>
          {budgets.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)' }}>
              <p>No budgets configured yet. Create a budget to track spending limits!</p>
            </div>
          ) : (
            <div className={styles.grid}>
              {budgets.map(b => (
                <BudgetCard key={b.budget.id} progress={b} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 5: Planning */}
      {activeTab === 'planning' && (
        <CashFlowForecast
          currentTotalBalance={netWorthData.totalAssets}
          forecastEntries={forecast}
        />
      )}

      {/* Floating Quick Expense Button */}
      <QuickExpense onSuccess={loadData} />

      {/* Transfer Modal */}
      {showTransferModal && (
        <div className={styles.modalOverlay} onClick={() => setShowTransferModal(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <TransferForm
              accounts={accounts}
              onSuccess={() => {
                setShowTransferModal(false);
                loadData();
              }}
              onCancel={() => setShowTransferModal(false)}
            />
          </div>
        </div>
      )}

      {/* Add Account Modal */}
      {showAddAccountModal && (
        <div className={styles.modalOverlay} onClick={() => setShowAddAccountModal(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <form
              onSubmit={handleCreateAccount}
              style={{
                background: 'var(--bg-card)',
                padding: 24,
                borderRadius: 16,
                border: '1px solid var(--border-default)',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>New Account</h3>
                <button
                  type="button"
                  className="btn btn-icon btn-ghost"
                  onClick={() => setShowAddAccountModal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                  Account Name
                </label>
                <input
                  id="input-new-account-name"
                  type="text"
                  placeholder="e.g. HDFC Salary, Cash in Wallet"
                  value={newAccName}
                  onChange={e => setNewAccName(e.target.value)}
                  className="input"
                  required
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                  Institution (Optional)
                </label>
                <input
                  id="input-new-account-institution"
                  type="text"
                  placeholder="e.g. HDFC Bank, ICICI"
                  value={newAccInstitution}
                  onChange={e => setNewAccInstitution(e.target.value)}
                  className="input"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                  Account Type
                </label>
                <select
                  id="select-new-account-type"
                  value={newAccType}
                  onChange={e => setNewAccType(e.target.value as AccountType)}
                  className="input"
                >
                  <option value="bank">Bank Account</option>
                  <option value="cash">Cash</option>
                  <option value="credit_card">Credit Card</option>
                  <option value="investment">Investment</option>
                  <option value="loan">Loan</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                  Opening Balance (₹)
                </label>
                <input
                  id="input-new-account-balance"
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={newAccBalance}
                  onChange={e => setNewAccBalance(e.target.value)}
                  className="input"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddAccountModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" id="btn-submit-new-account">
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Budget Modal */}
      {showAddBudgetModal && (
        <div className={styles.modalOverlay} onClick={() => setShowAddBudgetModal(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <form
              onSubmit={handleCreateBudget}
              style={{
                background: 'var(--bg-card)',
                padding: 24,
                borderRadius: 16,
                border: '1px solid var(--border-default)',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700 }}>New Budget</h3>
                <button
                  type="button"
                  className="btn btn-icon btn-ghost"
                  onClick={() => setShowAddBudgetModal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                  Budget Name
                </label>
                <input
                  id="input-new-budget-name"
                  type="text"
                  placeholder="e.g. Monthly Dining, Groceries"
                  value={newBudgetName}
                  onChange={e => setNewBudgetName(e.target.value)}
                  className="input"
                  required
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                  Spending Limit (₹)
                </label>
                <input
                  id="input-new-budget-target"
                  type="number"
                  step="any"
                  placeholder="10000"
                  value={newBudgetTarget}
                  onChange={e => setNewBudgetTarget(e.target.value)}
                  className="input"
                  required
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                  Period
                </label>
                <select
                  id="select-new-budget-period"
                  value={newBudgetPeriod}
                  onChange={e => setNewBudgetPeriod(e.target.value as BudgetPeriod)}
                  className="input"
                >
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>
                  Category (Optional)
                </label>
                <CategorySelect
                  id="select-new-budget-category"
                  direction="expense"
                  value={newBudgetCategory}
                  onChange={setNewBudgetCategory}
                  placeholder="Applies to all categories"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddBudgetModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" id="btn-submit-new-budget">
                  Save Budget
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
