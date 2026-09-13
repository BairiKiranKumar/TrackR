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
  ArrowRight,
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
import { Button, Modal, Badge } from '@/components/ui';
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
        <div>
          <h1 className={styles.title}>Finance</h1>
          <p className={styles.subtitle}>Net worth, cash flow, accounts, and disciplined budget limits.</p>
        </div>
        <div className={styles.headerActions}>
          <Button
            id="btn-open-transfer"
            variant="secondary"
            onClick={() => setShowTransferModal(true)}
            disabled={accounts.length < 2}
          >
            <ArrowRightLeft size={15} />
            <span>Transfer</span>
          </Button>
          <Button
            id="btn-open-add-account"
            variant="primary"
            onClick={() => setShowAddAccountModal(true)}
          >
            <Plus size={15} />
            <span>New Account</span>
          </Button>
        </div>
      </div>

      {/* Sub-nav quick links to deeper features */}
      <div className={styles.subnav}>
        <Link href="/money/reports" className={styles.subnavLink} id="link-finance-reports">
          <BarChart3 size={14} />
          <span>Reports</span>
        </Link>
        <Link href="/money/investments" className={styles.subnavLink} id="link-finance-investments">
          <TrendingUp size={14} />
          <span>Investments</span>
        </Link>
        <Link href="/money/debts" className={styles.subnavLink} id="link-finance-debts">
          <Wallet size={14} />
          <span>Debts</span>
        </Link>
        <Link href="/money/rules" className={styles.subnavLink} id="link-finance-rules">
          <Sliders size={14} />
          <span>Auto Rules</span>
        </Link>
        <Link href="/money/import" className={styles.subnavLink} id="link-finance-import">
          <UploadCloud size={14} />
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
          <Wallet size={15} />
          <span>Overview</span>
        </button>
        <button
          id="tab-btn-transactions"
          className={`${styles.tabBtn} ${activeTab === 'transactions' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('transactions')}
        >
          <FileText size={15} />
          <span>Transactions ({transactions.length})</span>
        </button>
        <button
          id="tab-btn-accounts"
          className={`${styles.tabBtn} ${activeTab === 'accounts' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('accounts')}
        >
          <Layers size={15} />
          <span>Accounts ({accounts.length})</span>
        </button>
        <button
          id="tab-btn-budgets"
          className={`${styles.tabBtn} ${activeTab === 'budgets' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('budgets')}
        >
          <PiggyBank size={15} />
          <span>Budgets ({budgets.length})</span>
        </button>
        <button
          id="tab-btn-planning"
          className={`${styles.tabBtn} ${activeTab === 'planning' ? styles.tabBtnActive : ''}`}
          onClick={() => setActiveTab('planning')}
        >
          <Calendar size={15} />
          <span>Planning & Forecast</span>
        </button>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
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
              <Badge variant="default" size="sm">{accounts.length}</Badge>
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
                <Badge variant="default" size="sm">{budgets.length}</Badge>
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
                className={styles.viewAllBtn}
                onClick={() => setActiveTab('transactions')}
              >
                <span>View all</span>
                <ArrowRight size={13} />
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-3)' }}>
            <Button
              variant="primary"
              onClick={() => setShowAddAccountModal(true)}
              id="btn-add-account-tab"
            >
              <Plus size={15} />
              <span>Add Account</span>
            </Button>
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-3)' }}>
            <Button
              variant="primary"
              onClick={() => setShowAddBudgetModal(true)}
              id="btn-add-budget-tab"
            >
              <Plus size={15} />
              <span>Add Budget</span>
            </Button>
          </div>
          {budgets.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
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
      <Modal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        title="Account Transfer"
        description="Transfer funds between two of your accounts."
      >
        <TransferForm
          accounts={accounts}
          onSuccess={() => {
            setShowTransferModal(false);
            loadData();
          }}
          onCancel={() => setShowTransferModal(false)}
        />
      </Modal>

      {/* Add Account Modal */}
      <Modal
        isOpen={showAddAccountModal}
        onClose={() => setShowAddAccountModal(false)}
        title="Create New Account"
        description="Add a bank account, credit card, cash wallet, or loan."
        footer={
          <div className={styles.modalFooter}>
            <Button
              variant="secondary"
              onClick={() => setShowAddAccountModal(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateAccount}
              id="btn-submit-new-account"
              disabled={!newAccName.trim()}
            >
              Create Account
            </Button>
          </div>
        }
      >
        <form onSubmit={handleCreateAccount} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="input-new-account-name">
              Account Name <span className={styles.requiredStar}>*</span>
            </label>
            <input
              id="input-new-account-name"
              type="text"
              placeholder="e.g. HDFC Salary, ICICI Savings, Cash Wallet"
              value={newAccName}
              onChange={e => setNewAccName(e.target.value)}
              className={styles.formInput}
              required
              autoFocus
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="input-new-account-institution">
              Institution (Optional)
            </label>
            <input
              id="input-new-account-institution"
              type="text"
              placeholder="e.g. HDFC Bank, SBI, Zerodha"
              value={newAccInstitution}
              onChange={e => setNewAccInstitution(e.target.value)}
              className={styles.formInput}
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="select-new-account-type">
                Account Type
              </label>
              <select
                id="select-new-account-type"
                value={newAccType}
                onChange={e => setNewAccType(e.target.value as AccountType)}
                className={styles.formSelect}
              >
                <option value="bank">Bank Account</option>
                <option value="cash">Cash</option>
                <option value="credit_card">Credit Card</option>
                <option value="investment">Investment</option>
                <option value="loan">Loan</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="input-new-account-balance">
                Opening Balance (₹)
              </label>
              <input
                id="input-new-account-balance"
                type="number"
                step="any"
                placeholder="0.00"
                value={newAccBalance}
                onChange={e => setNewAccBalance(e.target.value)}
                className={styles.formInput}
              />
            </div>
          </div>
        </form>
      </Modal>

      {/* Add Budget Modal */}
      <Modal
        isOpen={showAddBudgetModal}
        onClose={() => setShowAddBudgetModal(false)}
        title="New Budget"
        description="Establish a disciplined spending ceiling for categories or initiatives."
        footer={
          <div className={styles.modalFooter}>
            <Button
              variant="secondary"
              onClick={() => setShowAddBudgetModal(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateBudget}
              id="btn-submit-new-budget"
              disabled={!newBudgetName.trim() || !newBudgetTarget}
            >
              Save Budget
            </Button>
          </div>
        }
      >
        <form onSubmit={handleCreateBudget} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="input-new-budget-name">
              Budget Name <span className={styles.requiredStar}>*</span>
            </label>
            <input
              id="input-new-budget-name"
              type="text"
              placeholder="e.g. Dining Out, Monthly Groceries, Fuel"
              value={newBudgetName}
              onChange={e => setNewBudgetName(e.target.value)}
              className={styles.formInput}
              required
              autoFocus
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="input-new-budget-target">
                Spending Limit (₹) <span className={styles.requiredStar}>*</span>
              </label>
              <input
                id="input-new-budget-target"
                type="number"
                step="any"
                placeholder="10000"
                value={newBudgetTarget}
                onChange={e => setNewBudgetTarget(e.target.value)}
                className={styles.formInput}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="select-new-budget-period">
                Cycle Period
              </label>
              <select
                id="select-new-budget-period"
                value={newBudgetPeriod}
                onChange={e => setNewBudgetPeriod(e.target.value as BudgetPeriod)}
                className={styles.formSelect}
              >
                <option value="monthly">Monthly</option>
                <option value="weekly">Weekly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
          </div>

          {newBudgetPeriod !== 'monthly' && (
            <div className={styles.gapNotice}>
              <span>
                Note: Calculation engine actively evaluates against monthly transaction cycles.
                Multi-period custom cycles will automatically activate in Phase 5.
              </span>
            </div>
          )}

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="select-new-budget-category">
              Category Scope (Optional)
            </label>
            <CategorySelect
              id="select-new-budget-category"
              direction="expense"
              value={newBudgetCategory}
              onChange={setNewBudgetCategory}
              placeholder="Applies to all categories"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
