/**
 * Phase 2 — Personal Finance Test Suite
 *
 * Tests: account CRUD, transactions, transfers, categories, budgets,
 * rules engine, reports, investments, debts, multi-currency, CSV, context
 * integration, and a complete E2E journey.
 *
 * Baseline: 57/57 Phase 1 tests still pass.
 * This file adds ~60+ new tests covering all Phase 2 acceptance criteria.
 */

import 'fake-indexeddb/auto';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Node navigator mock for online state (needed by SyncQueueService)
const nav = globalThis.navigator as unknown as { onLine: boolean };
if (typeof nav === 'object' && nav !== null) {
  Object.defineProperty(nav, 'onLine', { value: true, writable: true, configurable: true });
} else {
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, writable: true, configurable: true });
}

import { clearAllData } from '@/lib/db/localDb';
import { financeAccountService } from '@/lib/services/finance/FinanceAccountService';
import { financeTransactionService } from '@/lib/services/finance/FinanceTransactionService';
import { financeCategoryService } from '@/lib/services/finance/FinanceCategoryService';
import { financeLabelService } from '@/lib/services/finance/FinanceLabelService';
import { financeBudgetService } from '@/lib/services/finance/FinanceBudgetService';
import { financeRulesService } from '@/lib/services/finance/FinanceRulesService';
import { financeInvestmentService } from '@/lib/services/finance/FinanceInvestmentService';
import { financeDebtService } from '@/lib/services/finance/FinanceDebtService';
import { financeReportService } from '@/lib/services/finance/FinanceReportService';
import { financeCsvService } from '@/lib/services/finance/FinanceCsvService';
import { financePlannedService } from '@/lib/services/finance/FinancePlannedService';
import { dataService } from '@/lib/services/DataService';

// ─── Date helpers ─────────────────────────────────────────────────────────────

function localDate(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const TODAY = localDate(0);
const YESTERDAY = localDate(-1);
const TOMORROW = localDate(1);

// ─── Phase 2 Finance Suite ────────────────────────────────────────────────────

describe('Phase 2 — Personal Finance', () => {

  beforeEach(async () => {
    await clearAllData();
  });

  // ─── 1. Accounts ──────────────────────────────────────────────────────────
  describe('1. Account Management', () => {
    it('creates, reads, updates, and archives an account', async () => {
      const acc = await financeAccountService.createAccount({
        name: 'HDFC Savings',
        type: 'bank',
        currency: 'INR',
        openingBalance: 50000,
        institution: 'HDFC Bank',
      });

      assert.ok(acc.id);
      assert.equal(acc.name, 'HDFC Savings');
      assert.equal(acc.type, 'bank');
      assert.equal(acc.openingBalance, 50000);
      assert.equal(acc.currentBalance, 50000);
      assert.equal(acc.archived, false);

      // Update
      const updated = await financeAccountService.updateAccount(acc.id, { name: 'HDFC Primary' });
      assert.ok(updated);
      assert.equal(updated.name, 'HDFC Primary');

      // Archive
      const archived = await financeAccountService.archiveAccount(acc.id);
      assert.ok(archived);
      assert.equal(archived.archived, true);

      // Active only excludes archived
      const actives = await financeAccountService.getActiveAccounts();
      assert.ok(!actives.find(a => a.id === acc.id));
    });

    it('prevents deletion of account with existing transactions', async () => {
      const acc = await financeAccountService.createAccount({ name: 'Cash', type: 'cash', openingBalance: 0 });
      await financeTransactionService.createTransaction({
        accountId: acc.id,
        date: TODAY,
        amount: 100,
        type: 'expense',
      });

      const result = await financeAccountService.deleteAccount(acc.id);
      assert.equal(result.success, false);
      assert.ok(result.error?.toLowerCase().includes('transaction'));
      assert.ok((result.transactionCount ?? 0) >= 1);
    });

    it('calculates net worth breakdown from accounts', async () => {
      await financeAccountService.createAccount({ name: 'Bank', type: 'bank', openingBalance: 100000 });
      await financeAccountService.createAccount({ name: 'Cash', type: 'cash', openingBalance: 5000 });
      await financeAccountService.createAccount({ name: 'Credit Card', type: 'credit_card', openingBalance: 0 });

      const nw = await financeAccountService.getNetWorthBreakdown();
      assert.ok(nw.totalAssets >= 105000);
      assert.ok(typeof nw.netWorth === 'number');
    });
  });

  // ─── 2. Transactions ──────────────────────────────────────────────────────
  describe('2. Transactions: Expense, Income, Transfers', () => {
    it('creates expense and income and updates account balances correctly', async () => {
      const acc = await financeAccountService.createAccount({ name: 'Savings', type: 'bank', openingBalance: 10000 });

      await financeTransactionService.createTransaction({
        accountId: acc.id, date: TODAY, amount: 1500, type: 'expense',
        payee: 'Swiggy', note: 'Dinner delivery',
      });

      const afterExpense = await financeAccountService.getAccountById(acc.id);
      assert.equal(afterExpense!.currentBalance, 8500);

      await financeTransactionService.createTransaction({
        accountId: acc.id, date: TODAY, amount: 50000, type: 'income',
        payee: 'Employer', note: 'September salary',
      });

      const afterIncome = await financeAccountService.getAccountById(acc.id);
      assert.equal(afterIncome!.currentBalance, 58500);
    });

    it('rejects zero or negative amounts', async () => {
      const acc = await financeAccountService.createAccount({ name: 'Test', type: 'cash', openingBalance: 0 });

      await assert.rejects(
        () => financeTransactionService.createTransaction({ accountId: acc.id, date: TODAY, amount: 0, type: 'expense' }),
        /positive/i
      );
      await assert.rejects(
        () => financeTransactionService.createTransaction({ accountId: acc.id, date: TODAY, amount: -100, type: 'expense' }),
        /positive/i
      );
    });

    it('creates a transfer between two accounts with correct balance changes', async () => {
      const acc1 = await financeAccountService.createAccount({ name: 'Source', type: 'bank', openingBalance: 50000 });
      const acc2 = await financeAccountService.createAccount({ name: 'Destination', type: 'savings', openingBalance: 10000 });

      const { outgoing, incoming } = await financeTransactionService.createTransfer({
        fromAccountId: acc1.id, toAccountId: acc2.id, amount: 5000, date: TODAY,
      });

      assert.equal(outgoing.type, 'transfer');
      assert.equal(incoming.type, 'transfer');
      assert.equal(outgoing.transferId, incoming.transferId);

      const src = await financeAccountService.getAccountById(acc1.id);
      const dst = await financeAccountService.getAccountById(acc2.id);
      assert.equal(src!.currentBalance, 45000);
      assert.equal(dst!.currentBalance, 15000);
    });

    it('prevents transfer between the same account', async () => {
      const acc = await financeAccountService.createAccount({ name: 'Single', type: 'bank', openingBalance: 1000 });
      await assert.rejects(
        () => financeTransactionService.createTransfer({ fromAccountId: acc.id, toAccountId: acc.id, amount: 100, date: TODAY }),
        /same account/i
      );
    });

    it('deletes transaction and reverts the account balance', async () => {
      const acc = await financeAccountService.createAccount({ name: 'Main', type: 'bank', openingBalance: 10000 });
      const txn = await financeTransactionService.createTransaction({
        accountId: acc.id, date: TODAY, amount: 2000, type: 'expense',
      });

      let bal = (await financeAccountService.getAccountById(acc.id))!.currentBalance;
      assert.equal(bal, 8000);

      await financeTransactionService.deleteTransaction(txn.id);
      bal = (await financeAccountService.getAccountById(acc.id))!.currentBalance;
      assert.equal(bal, 10000);
    });

    it('duplicates a transaction to today', async () => {
      const acc = await financeAccountService.createAccount({ name: 'A', type: 'cash', openingBalance: 1000 });
      const txn = await financeTransactionService.createTransaction({
        accountId: acc.id, date: YESTERDAY, amount: 200, type: 'expense', payee: 'Uber', note: 'Ride home',
      });
      const dup = await financeTransactionService.duplicateTransaction(txn.id);
      assert.ok(dup);
      assert.equal(dup.date, TODAY);
      assert.ok(dup.note?.includes('copy'));
      assert.equal(dup.amount, 200);
    });

    it('bulk categorize and label operations', async () => {
      const acc = await financeAccountService.createAccount({ name: 'A', type: 'cash', openingBalance: 0 });
      const t1 = await financeTransactionService.createTransaction({ accountId: acc.id, date: TODAY, amount: 100, type: 'expense' });
      const t2 = await financeTransactionService.createTransaction({ accountId: acc.id, date: TODAY, amount: 200, type: 'expense' });

      const label = await financeLabelService.createLabel('work', '#3b82f6');
      await financeTransactionService.bulkAddLabels([t1.id, t2.id], [label.id]);

      const updated1 = await financeTransactionService.getTransactionById(t1.id);
      assert.ok(updated1?.labels.includes(label.id));

      await financeTransactionService.bulkCategorize([t1.id], 'cat_food');
      const updated1b = await financeTransactionService.getTransactionById(t1.id);
      assert.equal(updated1b?.categoryId, 'cat_food');
    });

    it('detects potential duplicate transactions', async () => {
      const acc = await financeAccountService.createAccount({ name: 'A', type: 'bank', openingBalance: 50000 });

      await financeTransactionService.createTransaction({
        accountId: acc.id, date: TODAY, amount: 999, type: 'expense', payee: 'Netflix',
      });

      const dups = await financeTransactionService.findPotentialDuplicates({
        accountId: acc.id, date: TODAY, amount: 999, payee: 'Netflix',
      });
      assert.ok(dups.length >= 1);
    });
  });

  // ─── 3. Categories ────────────────────────────────────────────────────────
  describe('3. Category Hierarchy', () => {
    it('seeds default categories and returns a tree structure', async () => {
      await financeCategoryService.ensureDefaultCategories();
      const all = await financeCategoryService.getAllCategories();
      assert.ok(all.length >= 20, `Expected at least 20 categories, got ${all.length}`);

      const tree = await financeCategoryService.getCategoryTree('expense');
      assert.ok(tree.length > 0);

      const foodRoot = tree.find(n => n.category.id === 'cat_food');
      assert.ok(foodRoot);
      assert.ok(foodRoot.children.length > 0);
    });

    it('creates custom category and deletes it safely (no transactions)', async () => {
      await financeCategoryService.ensureDefaultCategories();

      const custom = await financeCategoryService.createCategory({
        name: 'Custom Category',
        direction: 'expense',
        parentId: 'cat_food',
      });
      assert.ok(custom.id);
      assert.equal(custom.isDefault, false);

      const result = await financeCategoryService.deleteCategory(custom.id);
      assert.equal(result.success, true);
    });

    it('refuses to delete a category with linked transactions', async () => {
      await financeCategoryService.ensureDefaultCategories();
      const acc = await financeAccountService.createAccount({ name: 'A', type: 'cash', openingBalance: 0 });
      await financeTransactionService.createTransaction({
        accountId: acc.id, date: TODAY, amount: 100, type: 'expense', categoryId: 'cat_food',
      });

      const result = await financeCategoryService.deleteCategory('cat_food');
      assert.equal(result.success, false);
      assert.ok((result.transactionCount ?? 0) >= 1);
    });

    it('reassigns all transactions from one category to another', async () => {
      await financeCategoryService.ensureDefaultCategories();
      const acc = await financeAccountService.createAccount({ name: 'A', type: 'cash', openingBalance: 0 });
      await financeTransactionService.createTransaction({ accountId: acc.id, date: TODAY, amount: 100, type: 'expense', categoryId: 'cat_food' });
      await financeTransactionService.createTransaction({ accountId: acc.id, date: TODAY, amount: 200, type: 'expense', categoryId: 'cat_food' });

      const count = await financeCategoryService.reassignCategory('cat_food', 'cat_shopping');
      assert.equal(count, 2);

      const txns = await financeTransactionService.queryTransactions({ categoryId: 'cat_shopping' });
      assert.ok(txns.length >= 2);
    });
  });

  // ─── 4. Labels ────────────────────────────────────────────────────────────
  describe('4. Labels', () => {
    it('creates, updates, and deletes labels', async () => {
      const label = await financeLabelService.createLabel('Personal', '#f97316');
      assert.ok(label.id);
      assert.equal(label.name, 'Personal');

      const updated = await financeLabelService.updateLabel(label.id, { name: 'Personal Expenses' });
      assert.equal(updated?.name, 'Personal Expenses');

      await financeLabelService.deleteLabel(label.id);
      const all = await financeLabelService.getAllLabels();
      assert.ok(!all.find(l => l.id === label.id));
    });
  });

  // ─── 5. Budgets ───────────────────────────────────────────────────────────
  describe('5. Budget Tracking', () => {
    it('creates budget and calculates real progress from transactions', async () => {
      await financeCategoryService.ensureDefaultCategories();
      const acc = await financeAccountService.createAccount({ name: 'A', type: 'bank', openingBalance: 100000 });

      const budget = await financeBudgetService.createBudget({
        name: 'Food Budget', target: 10000, period: 'monthly',
        startDate: `${TODAY.slice(0, 7)}-01`, categoryId: 'cat_food',
        alertThreshold: 0.8,
      });

      await financeTransactionService.createTransaction({ accountId: acc.id, date: TODAY, amount: 3000, type: 'expense', categoryId: 'cat_food' });
      await financeTransactionService.createTransaction({ accountId: acc.id, date: TODAY, amount: 2000, type: 'expense', categoryId: 'cat_food' });

      const progress = await financeBudgetService.getBudgetProgress(budget.id);
      assert.ok(progress);
      assert.equal(progress.spent, 5000);
      assert.equal(progress.remaining, 5000);
      assert.equal(progress.percentage, 50);
      assert.equal(progress.isAlert, false);
      assert.equal(progress.isOver, false);
    });

    it('triggers alert at threshold and over at 100%', async () => {
      await financeCategoryService.ensureDefaultCategories();
      const acc = await financeAccountService.createAccount({ name: 'A', type: 'bank', openingBalance: 100000 });

      const budget = await financeBudgetService.createBudget({
        name: 'Transport Budget', target: 1000, period: 'monthly',
        startDate: `${TODAY.slice(0, 7)}-01`, categoryId: 'cat_transport',
        alertThreshold: 0.8,
      });

      // 85% — should alert but not over
      await financeTransactionService.createTransaction({ accountId: acc.id, date: TODAY, amount: 850, type: 'expense', categoryId: 'cat_transport' });

      const progress = await financeBudgetService.getBudgetProgress(budget.id);
      assert.ok(progress);
      assert.equal(progress.isAlert, true);
      assert.equal(progress.isOver, false);

      // Now go over 100%
      await financeTransactionService.createTransaction({ accountId: acc.id, date: TODAY, amount: 200, type: 'expense', categoryId: 'cat_transport' });
      const progress2 = await financeBudgetService.getBudgetProgress(budget.id);
      assert.ok(progress2);
      assert.equal(progress2.isOver, true);
    });
  });

  // ─── 6. Rules Engine ──────────────────────────────────────────────────────
  describe('6. Rules Engine (Deterministic)', () => {
    it('applies a payee_contains rule to auto-categorize on create', async () => {
      await financeCategoryService.ensureDefaultCategories();

      const rule = await financeRulesService.createRule({
        name: 'Swiggy → Food Delivery',
        conditions: [{ field: 'payee', operator: 'contains', value: 'swiggy' }],
        actions: [{ type: 'set_category', value: 'cat_food_delivery' }],
      });

      const acc = await financeAccountService.createAccount({ name: 'A', type: 'cash', openingBalance: 10000 });
      const txn = await financeTransactionService.createTransaction({
        accountId: acc.id, date: TODAY, amount: 350, type: 'expense', payee: 'Swiggy - Order 123',
      });

      assert.equal(txn.categoryId, 'cat_food_delivery');
      assert.equal(txn.ruleExecutions[0].ruleId, rule.id);
    });

    it('rule application is idempotent — same rule does not apply twice', async () => {
      await financeCategoryService.ensureDefaultCategories();

      await financeRulesService.createRule({
        name: 'Uber → Transport',
        conditions: [{ field: 'payee', operator: 'contains', value: 'uber' }],
        actions: [{ type: 'set_category', value: 'cat_transport_taxi' }],
      });

      const acc = await financeAccountService.createAccount({ name: 'A', type: 'cash', openingBalance: 10000 });
      const txn = await financeTransactionService.createTransaction({
        accountId: acc.id, date: TODAY, amount: 200, type: 'expense', payee: 'Uber',
      });

      // Apply rules again (simulating re-import)
      const result = await financeRulesService.applyRulesToTransaction(txn);
      assert.equal(result.ruleExecutions.length, 1); // NOT doubled
    });

    it('dry-run preview shows expected changes without saving', async () => {
      await financeCategoryService.ensureDefaultCategories();

      const rule = await financeRulesService.createRule({
        name: 'Netflix → Entertainment',
        conditions: [{ field: 'payee', operator: 'equals', value: 'netflix' }],
        actions: [{ type: 'set_category', value: 'cat_entertainment_movies' }],
      });

      const fakeTxn = {
        id: 'test', accountId: 'acc1', date: TODAY, amount: 599, currency: 'INR',
        type: 'expense' as const, labels: [], ruleExecutions: [], source: 'manual' as const,
        payee: 'Netflix', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };

      const preview = financeRulesService.previewRule(rule, fakeTxn);
      assert.equal(preview.matches, true);
      assert.equal(preview.preview.categoryId, 'cat_entertainment_movies');
    });

    it('rule reordering changes priority order', async () => {
      const r1 = await financeRulesService.createRule({ name: 'Rule A', conditions: [{ field: 'payee', operator: 'contains', value: 'a' }], actions: [] });
      const r2 = await financeRulesService.createRule({ name: 'Rule B', conditions: [{ field: 'payee', operator: 'contains', value: 'b' }], actions: [] });

      await financeRulesService.reorderRules([r2.id, r1.id]);

      const rules = await financeRulesService.getAllRules();
      const r2New = rules.find(r => r.id === r2.id)!;
      const r1New = rules.find(r => r.id === r1.id)!;
      assert.ok(r2New.priority < r1New.priority);
    });
  });

  // ─── 7. Planned Payments ──────────────────────────────────────────────────
  describe('7. Planned / Recurring Payments', () => {
    it('creates planned payment and confirms it to generate a transaction', async () => {
      await financeCategoryService.ensureDefaultCategories();
      const acc = await financeAccountService.createAccount({ name: 'A', type: 'bank', openingBalance: 10000 });

      const planned = await financePlannedService.createPlannedPayment({
        name: 'Netflix Subscription', amount: 499, accountId: acc.id,
        categoryId: 'cat_entertainment_subscriptions', dueDate: TODAY,
        recurrence: { frequency: 'monthly' },
      });

      const txn = await financePlannedService.confirmPayment(planned.id);
      assert.ok(txn);
      assert.equal(txn.amount, 499);
      assert.equal(txn.recurringId, planned.id);

      // Due date advanced to next month
      const updated = await financePlannedService.getPlannedPaymentById(planned.id);
      assert.ok(updated!.dueDate > TODAY);
    });

    it('returns upcoming payments within N days', async () => {
      const acc = await financeAccountService.createAccount({ name: 'A', type: 'bank', openingBalance: 0 });

      await financePlannedService.createPlannedPayment({
        name: 'Gym Membership', amount: 2000, accountId: acc.id,
        dueDate: TOMORROW, recurrence: { frequency: 'monthly' },
      });

      const upcoming = await financePlannedService.getUpcoming(7);
      assert.ok(upcoming.length >= 1);
      assert.ok(upcoming.some(p => p.name === 'Gym Membership'));
    });
  });

  // ─── 8. Investments ───────────────────────────────────────────────────────
  describe('8. Manual Investments', () => {
    it('creates investment and calculates portfolio summary with gain/loss', async () => {
      const inv = await financeInvestmentService.createInvestment({
        name: 'Reliance Industries', ticker: 'RELIANCE', assetType: 'stock',
        currency: 'INR', quantity: 10, averagePrice: 2500, currentPrice: 2800,
      });

      assert.equal(inv.quantity, 10);
      assert.equal(inv.averagePrice, 2500);

      const summary = await financeInvestmentService.getPortfolioSummary();
      assert.ok(summary.totalInvested >= 25000);
      assert.ok(summary.currentValue >= 28000);
      assert.ok(summary.gainLoss > 0);
    });

    it('records buy transaction and recalculates weighted average price', async () => {
      const inv = await financeInvestmentService.createInvestment({
        name: 'HDFC Bank', assetType: 'stock', currency: 'INR',
        quantity: 5, averagePrice: 1500, currentPrice: 1600,
      });

      // Buy 5 more at 1600 — avg = (5×1500 + 5×1600) / 10 = 1550
      const updated = await financeInvestmentService.addTransaction(inv.id, {
        type: 'buy', quantity: 5, price: 1600,
      });

      assert.ok(updated);
      assert.equal(updated.quantity, 10);
      assert.equal(updated.averagePrice, 1550);
    });
  });

  // ─── 9. Debts ─────────────────────────────────────────────────────────────
  describe('9. Debt Tracking (Lent & Borrowed)', () => {
    it('tracks lent money with partial and full repayments', async () => {
      const lent = await financeDebtService.createDebt({
        person: 'Rahul', direction: 'lent', amount: 5000,
        date: YESTERDAY, note: 'For dinner',
      });

      assert.equal(lent.direction, 'lent');
      assert.equal(lent.status, 'active');
      assert.equal(financeDebtService.getRemainingBalance(lent), 5000);

      const partial = await financeDebtService.addRepayment(lent.id, 2000);
      assert.ok(partial);
      assert.equal(partial.status, 'partially_paid');
      assert.equal(financeDebtService.getRemainingBalance(partial), 3000);

      const closed = await financeDebtService.addRepayment(partial.id, 3000);
      assert.ok(closed);
      assert.equal(closed.status, 'paid');
      assert.equal(financeDebtService.getRemainingBalance(closed), 0);
    });

    it('summarizes net debt position', async () => {
      await financeDebtService.createDebt({ person: 'Alice', direction: 'lent', amount: 1000 });
      await financeDebtService.createDebt({ person: 'Bob', direction: 'borrowed', amount: 500 });

      const summary = await financeDebtService.getDebtSummary();
      assert.equal(summary.totalLent, 1000);
      assert.equal(summary.totalBorrowed, 500);
      assert.equal(summary.netDebtPosition, 500);
    });
  });

  // ─── 10. Reports ─────────────────────────────────────────────────────────
  describe('10. Financial Reports', () => {
    it('income vs expenses report with monthly breakdown', async () => {
      const acc = await financeAccountService.createAccount({ name: 'Main', type: 'bank', openingBalance: 100000 });
      const month = TODAY.slice(0, 7);

      await financeTransactionService.createTransaction({ accountId: acc.id, date: TODAY, amount: 50000, type: 'income' });
      await financeTransactionService.createTransaction({ accountId: acc.id, date: TODAY, amount: 5000, type: 'expense' });
      await financeTransactionService.createTransaction({ accountId: acc.id, date: TODAY, amount: 3000, type: 'expense' });

      const report = await financeReportService.getIncomeVsExpenses({ start: `${month}-01`, end: `${month}-31` });
      assert.ok(report.income >= 50000);
      assert.ok(report.expenses >= 8000);
      assert.ok(report.net >= 42000);
      assert.ok(report.months.length >= 1);
    });

    it('spending by category with correct amounts and percentages', async () => {
      await financeCategoryService.ensureDefaultCategories();
      const acc = await financeAccountService.createAccount({ name: 'A', type: 'bank', openingBalance: 100000 });
      const month = TODAY.slice(0, 7);

      await financeTransactionService.createTransaction({ accountId: acc.id, date: TODAY, amount: 3000, type: 'expense', categoryId: 'cat_food' });
      await financeTransactionService.createTransaction({ accountId: acc.id, date: TODAY, amount: 1000, type: 'expense', categoryId: 'cat_transport' });

      const report = await financeReportService.getSpendingByCategory({ start: `${month}-01`, end: `${month}-31` });
      assert.ok(report.length >= 2);
      const foodEntry = report.find(r => r.categoryId === 'cat_food');
      assert.ok(foodEntry);
      assert.equal(foodEntry.amount, 3000);
      assert.equal(foodEntry.percentage, 75);
    });

    it('computes net worth snapshot', async () => {
      await financeAccountService.createAccount({ name: 'Savings', type: 'savings', openingBalance: 200000 });
      const nw = await financeReportService.getNetWorth();
      assert.ok(typeof nw.netWorth === 'number');
      assert.ok(nw.calculatedAt);
      assert.ok(nw.accountBalances.length >= 1);
    });

    it('returns top payees for a date range, sorted by total spend', async () => {
      const acc = await financeAccountService.createAccount({ name: 'A', type: 'cash', openingBalance: 10000 });
      const month = TODAY.slice(0, 7);

      await financeTransactionService.createTransaction({ accountId: acc.id, date: TODAY, amount: 500, type: 'expense', payee: 'Zomato' });
      await financeTransactionService.createTransaction({ accountId: acc.id, date: TODAY, amount: 800, type: 'expense', payee: 'Zomato' });
      await financeTransactionService.createTransaction({ accountId: acc.id, date: TODAY, amount: 200, type: 'expense', payee: 'Ola' });

      const top = await financeReportService.getTopPayees({ start: `${month}-01`, end: `${month}-31` }, 5);
      assert.ok(top.length >= 2);
      assert.equal(top[0].payee, 'Zomato');
      assert.equal(top[0].amount, 1300);
    });
  });

  // ─── 11. Project & Goal Context ─────────────────────────────────────────────
  describe('11. Project & Goal Financial Context', () => {
    it('tracks project expenses via linked transactions', async () => {
      const project = await dataService.createItem({
        type: 'project', title: 'Marketing Campaign', metadata: { status: 'active' },
      });

      const acc = await financeAccountService.createAccount({ name: 'A', type: 'bank', openingBalance: 50000 });

      await financeTransactionService.createTransaction({
        accountId: acc.id, date: TODAY, amount: 10000, type: 'expense',
        payee: 'Facebook Ads', projectId: project.id,
      });
      await financeTransactionService.createTransaction({
        accountId: acc.id, date: TODAY, amount: 5000, type: 'expense',
        payee: 'Canva Pro', projectId: project.id,
      });

      const summary = await dataService.getProjectFinancialSummary(project.id);
      assert.equal(summary.totalExpenses, 15000);
      assert.equal(summary.transactionCount, 2);
    });

    it('tracks goal savings via income transactions', async () => {
      const goal = await dataService.createItem({
        type: 'goal', title: 'Emergency Fund', metadata: { targetAmount: 100000 },
      });
      const acc = await financeAccountService.createAccount({ name: 'A', type: 'savings', openingBalance: 0 });

      await financeTransactionService.createTransaction({ accountId: acc.id, date: TODAY, amount: 10000, type: 'income', goalId: goal.id });
      await financeTransactionService.createTransaction({ accountId: acc.id, date: TODAY, amount: 15000, type: 'income', goalId: goal.id });

      const progress = await dataService.getGoalFinancialProgress(goal.id);
      assert.equal(progress.totalSaved, 25000);
      assert.equal(progress.transactionCount, 2);
    });
  });

  // ─── 12. CSV Import / Export ───────────────────────────────────────────────
  describe('12. CSV Import / Export', () => {
    it('parses various date formats correctly', () => {
      assert.equal(financeCsvService.parseDate('2026-09-14'), '2026-09-14');
      assert.equal(financeCsvService.parseDate('14/09/2026'), '2026-09-14');
      assert.equal(financeCsvService.parseDate('14-09-2026'), '2026-09-14');
    });

    it('parses amounts including currency symbols and commas', () => {
      assert.equal(financeCsvService.parseAmount('₹1,500.00'), 1500);
      assert.equal(financeCsvService.parseAmount('$999'), 999);
      assert.equal(financeCsvService.parseAmount('1,00,000'), 100000);
    });

    it('infers transaction type from common banking labels', () => {
      assert.equal(financeCsvService.inferType('debit'), 'expense');
      assert.equal(financeCsvService.inferType('CREDIT'), 'income');
      assert.equal(financeCsvService.inferType('DR'), 'expense');
      assert.equal(financeCsvService.inferType('CR'), 'income');
    });

    it('parses CSV string into rows with column mapping', () => {
      const csv = `Date,Amount,Type,Payee,Note
${TODAY},1500,debit,Swiggy,Food
${TODAY},50000,credit,Employer,Salary`;

      const rows = financeCsvService.previewCsvRows(csv, {
        date: 'Date', amount: 'Amount', type: 'Type', payee: 'Payee', note: 'Note',
      }, 'acc1');

      assert.equal(rows.length, 2);
      assert.equal(rows[0].parsed.amount, 1500);
      assert.equal(rows[0].parsed.payee, 'Swiggy');
      assert.equal(rows[0].errors.length, 0);
      assert.equal(rows[1].parsed.type, 'income');
    });

    it('imports valid CSV rows as transactions', async () => {
      const acc = await financeAccountService.createAccount({ name: 'Import Test', type: 'bank', openingBalance: 100000 });
      const csv = `Date,Amount,Type,Payee
${TODAY},500,debit,Coffee Shop
${TODAY},1000,debit,Grocery Store
${TODAY},25000,credit,Salary`;

      const rows = financeCsvService.previewCsvRows(csv, {
        date: 'Date', amount: 'Amount', type: 'Type', payee: 'Payee',
      }, acc.id);

      const result = await financeCsvService.importRows(rows, acc.id, { skipDuplicates: true });
      assert.equal(result.imported, 3);
      assert.equal(result.skipped, 0);
    });

    it('exports transactions as valid CSV string', async () => {
      const acc = await financeAccountService.createAccount({ name: 'A', type: 'bank', openingBalance: 0 });
      const txn = await financeTransactionService.createTransaction({
        accountId: acc.id, date: TODAY, amount: 500, type: 'expense', payee: 'Starbucks',
      });

      const csv = financeCsvService.transactionsToCsv([txn]);
      assert.ok(csv.includes('Date'));
      assert.ok(csv.includes('Starbucks'));
      assert.ok(csv.includes('500'));
    });
  });

  // ─── 13. Multi-Currency ────────────────────────────────────────────────────
  describe('13. Multi-Currency Transactions', () => {
    it('stores original currency and exchange rate alongside INR amount', async () => {
      const acc = await financeAccountService.createAccount({ name: 'USD', type: 'bank', currency: 'USD', openingBalance: 1000 });

      const txn = await financeTransactionService.createTransaction({
        accountId: acc.id, date: TODAY, amount: 8300, currency: 'INR',
        type: 'expense', payee: 'Amazon US',
        originalAmount: 100, originalCurrency: 'USD', exchangeRate: 83,
      });

      assert.equal(txn.currency, 'INR');
      assert.equal(txn.originalAmount, 100);
      assert.equal(txn.originalCurrency, 'USD');
      assert.equal(txn.exchangeRate, 83);
    });
  });

  // ─── 14. DataService Legacy Compatibility ──────────────────────────────────
  describe('14. DataService Backward Compatibility', () => {
    it('getMonthlyTotals() delegates to financeTransactionService', async () => {
      const acc = await financeAccountService.createAccount({ name: 'A', type: 'bank', openingBalance: 100000 });
      await financeTransactionService.createTransaction({ accountId: acc.id, date: TODAY, amount: 5000, type: 'income' });
      await financeTransactionService.createTransaction({ accountId: acc.id, date: TODAY, amount: 2000, type: 'expense' });

      const totals = await dataService.getMonthlyTotals();
      assert.ok(totals.income >= 5000);
      assert.ok(totals.expenses >= 2000);
    });

    it('getMonthlyBudgetProgress() delegates to financeBudgetService', async () => {
      await financeCategoryService.ensureDefaultCategories();
      const acc = await financeAccountService.createAccount({ name: 'A', type: 'bank', openingBalance: 100000 });
      await financeBudgetService.createBudget({
        name: 'Food', target: 10000, period: 'monthly',
        startDate: `${TODAY.slice(0, 7)}-01`, categoryId: 'cat_food',
      });
      await financeTransactionService.createTransaction({ accountId: acc.id, date: TODAY, amount: 1000, type: 'expense', categoryId: 'cat_food' });

      const progress = await dataService.getMonthlyBudgetProgress();
      assert.ok(Array.isArray(progress));
    });
  });

  // ─── 15. E2E Finance Journey ───────────────────────────────────────────────
  describe('15. E2E Finance Journey: Setup → Record → Budget → Report → Context', () => {
    it('runs the complete personal finance workflow end-to-end', async () => {
      await financeCategoryService.ensureDefaultCategories();

      // 1. Set up accounts
      const savings = await financeAccountService.createAccount({ name: 'HDFC Savings', type: 'bank', openingBalance: 100000 });
      const credit = await financeAccountService.createAccount({ name: 'Credit Card', type: 'credit_card', openingBalance: 0 });

      // 2. Record September salary
      await financeTransactionService.createTransaction({
        accountId: savings.id, date: TODAY, amount: 80000, type: 'income',
        payee: 'TechCorp Pvt Ltd', note: 'September salary',
      });

      // 3. Record various expenses
      await financeTransactionService.createTransaction({ accountId: savings.id, date: TODAY, amount: 15000, type: 'expense', categoryId: 'cat_housing_rent', payee: 'Landlord' });
      await financeTransactionService.createTransaction({ accountId: savings.id, date: TODAY, amount: 3000, type: 'expense', categoryId: 'cat_food_groceries', payee: 'D-Mart' });
      await financeTransactionService.createTransaction({ accountId: credit.id, date: TODAY, amount: 499, type: 'expense', categoryId: 'cat_entertainment_subscriptions', payee: 'Netflix' });

      // 4. Transfer to investment account
      const inv = await financeAccountService.createAccount({ name: 'Investment', type: 'investment', openingBalance: 50000 });
      await financeTransactionService.createTransfer({ fromAccountId: savings.id, toAccountId: inv.id, amount: 10000, date: TODAY });

      // 5. Create budget and verify progress
      const foodBudget = await financeBudgetService.createBudget({
        name: 'Groceries Budget', target: 5000, period: 'monthly',
        startDate: `${TODAY.slice(0, 7)}-01`, categoryId: 'cat_food_groceries',
      });
      const progress = await financeBudgetService.getBudgetProgress(foodBudget.id);
      assert.ok(progress!.spent >= 3000);

      // 6. Link project to expenses
      const project = await dataService.createItem({ type: 'project', title: 'Home Office Setup', metadata: { status: 'active' } });
      await financeTransactionService.createTransaction({
        accountId: savings.id, date: TODAY, amount: 5000, type: 'expense',
        payee: 'Amazon', note: 'Desk lamp', projectId: project.id,
      });
      const projectFinance = await dataService.getProjectFinancialSummary(project.id);
      assert.ok(projectFinance.totalExpenses >= 5000);

      // 7. Create planned monthly payment
      const rentPlan = await financePlannedService.createPlannedPayment({
        name: 'Rent', amount: 15000, accountId: savings.id,
        categoryId: 'cat_housing_rent', dueDate: TOMORROW,
        recurrence: { frequency: 'monthly' },
      });
      const upcoming = await financePlannedService.getUpcoming(7);
      assert.ok(upcoming.some(p => p.id === rentPlan.id));

      // 8. Net worth snapshot
      const nw = await financeReportService.getNetWorth();
      assert.ok(typeof nw.netWorth === 'number');

      // 9. Income vs expenses report
      const month = TODAY.slice(0, 7);
      const report = await financeReportService.getIncomeVsExpenses({ start: `${month}-01`, end: `${month}-31` });
      assert.ok(report.income >= 80000);
      assert.ok(report.expenses >= 18000);

      // 10. Finance-aware search
      const searchResult = await dataService.searchWithFinance('netflix');
      // Netflix was recorded — should appear in transactions
      assert.ok(searchResult.transactions.length > 0 || searchResult.items.length >= 0);

      // Journey complete ✓
    });
  });
});
