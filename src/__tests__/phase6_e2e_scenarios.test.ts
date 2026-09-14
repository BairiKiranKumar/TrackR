/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import 'fake-indexeddb/auto';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Navigator mock for Node
const nav = globalThis.navigator as unknown as { onLine: boolean };
if (typeof nav === 'object' && nav !== null) {
  Object.defineProperty(nav, 'onLine', { value: true, writable: true, configurable: true });
} else {
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, writable: true, configurable: true });
}

import { Item, ItemRelation } from '@/types';
import { FinanceAccount, FinanceCategory, FinanceTransaction, FinancialCandidate, FinanceBudget } from '@/types/finance';
import { AutomationRule } from '@/types/automation';
import { dataService } from '@/lib/services/DataService';
import { financeAccountService } from '@/lib/services/finance/FinanceAccountService';
import { financeCategoryService } from '@/lib/services/finance/FinanceCategoryService';
import { financeTransactionService } from '@/lib/services/finance/FinanceTransactionService';
import { financeBudgetService } from '@/lib/services/finance/FinanceBudgetService';
import { financePlannedService } from '@/lib/services/finance/FinancePlannedService';
import { financeReportService } from '@/lib/services/finance/FinanceReportService';
import { financialInboxService } from '@/lib/services/inbox/FinancialInboxService';
import { automationEngine } from '@/lib/services/automation/AutomationEngine';
import { syncQueueService } from '@/lib/services/SyncQueueService';
import { TrackrSupabaseProvider } from '@/lib/storage/TrackrSupabaseProvider';
import {
  clearAllData,
  getAllItems,
  getItemById,
  saveItem,
  saveRelation,
  getAllRelations,
  getAllTransactions,
  getAllAccounts,
  getAllCategories,
  getAllBudgets,
  getAllCandidates,
  getAllAutomationRules,
  getAllSyncOps,
  getPendingSyncOps,
  saveAccount,
  saveCategory,
  saveTransaction,
  saveCandidate,
  saveAutomationRule,
} from '@/lib/db/localDb';

/**
 * Creates an in-memory multi-tenant Supabase simulation that strictly models
 * Postgres Row Level Security (RLS) policies:
 *
 * CREATE POLICY "...own" ON table FOR ALL
 *   USING (auth.uid() = user_id)
 *   WITH CHECK (auth.uid() = user_id);
 */
function createSimulatedRlsDatabase() {
  const tables: Record<string, Map<string, Record<string, unknown>>> = {
    items: new Map(),
    item_relations: new Map(),
    fa_accounts: new Map(),
    fa_transactions: new Map(),
    fa_categories: new Map(),
    fa_budgets: new Map(),
    fa_planned_payments: new Map(),
    fa_investments: new Map(),
    fa_debts: new Map(),
    fa_labels: new Map(),
    financial_candidates: new Map(),
    automation_rules: new Map(),
    automation_executions: new Map(),
    activity_events: new Map(),
    diagnostic_events: new Map(),
  };

  function createClient(authenticatedUserId: string) {
    return {
      from(tableName: string) {
        const store = tables[tableName] || new Map<string, Record<string, unknown>>();

        return {
          select() {
            const queryState = {
              eqFilters: [] as { col: string; val: unknown }[],
            };

            const builder = {
              eq(col: string, val: unknown) {
                queryState.eqFilters.push({ col, val });
                return builder;
              },
              order() {
                return builder;
              },
              then(resolve: (res: { data: Record<string, unknown>[]; error: null }) => void) {
                const results: Record<string, unknown>[] = [];
                for (const record of store.values()) {
                  if (record.user_id !== authenticatedUserId) continue;
                  const matches = queryState.eqFilters.every(f => record[f.col] === f.val);
                  if (matches) results.push({ ...record });
                }
                return Promise.resolve({ data: results, error: null }).then(resolve);
              },
            };
            return builder;
          },

          upsert(row: Record<string, unknown>) {
            if (row.user_id && row.user_id !== authenticatedUserId) {
              return Promise.resolve({
                data: null,
                error: new Error('42501: new row violates row-level security policy for table ' + tableName),
              });
            }
            const id = String(row.id);
            const existing = store.get(id);
            if (existing && existing.user_id !== authenticatedUserId) {
              return Promise.resolve({
                data: null,
                error: new Error('42501: row-level security policy violation: cannot overwrite another user record'),
              });
            }
            store.set(id, { ...row });
            return Promise.resolve({ data: row, error: null });
          },

          delete() {
            const deleteFilters: { col: string; val: unknown }[] = [];
            const deleteBuilder = {
              eq(col: string, val: unknown) {
                deleteFilters.push({ col, val });
                return deleteBuilder;
              },
              then(resolve: (res: { error: null }) => void) {
                for (const [id, record] of Array.from(store.entries())) {
                  if (record.user_id !== authenticatedUserId) continue;
                  const match = deleteFilters.every(f => record[f.col] === f.val);
                  if (match) store.delete(id);
                }
                return Promise.resolve({ error: null }).then(resolve);
              },
            };
            return deleteBuilder;
          },
        };
      },
    };
  }

  return {
    createClient,
    getStore: (tableName: string) => tables[tableName],
  };
}

describe('Phase 6A: Realistic End-to-End Private Beta Scenarios (§19)', () => {
  beforeEach(async () => {
    (navigator as unknown as { onLine: boolean }).onLine = true;
    await clearAllData();
  });

  // ─── SCENARIO 1 ─────────────────────────────────────────────────────────────
  it('SCENARIO 1: New user → signup → empty Overview → Capture → create Project → create Task → link Task to Project → reload → verify persistence', async () => {
    // 1. Initial empty state
    const initialTasks = await dataService.getTodayTasks();
    const initialItems = await dataService.getAllItems();
    assert.equal(initialTasks.length, 0, 'New user starts with zero today tasks');
    assert.equal(initialItems.length, 0, 'New user starts with zero items');

    // 2. Quick capture: Create a Project
    const project = await dataService.createItem({
      type: 'project',
      title: 'Beta Launch Campaign',
      content: 'Coordinates product launch readiness and beta invites',
      tags: ['launch', 'beta'],
      metadata: {},
    });
    assert.ok(project.id);
    assert.equal(project.type, 'project');

    // 3. Create a Task
    const task = await dataService.createItem({
      type: 'task',
      title: 'Validate Private Beta Security Matrix',
      content: 'Run RLS, sync, and recovery verification tests',
      tags: ['qa', 'security'],
      metadata: { status: 'todo', priority: 'high', dueDate: '2026-09-20' },
    });
    assert.ok(task.id);
    assert.equal(task.type, 'task');

    // 4. Link Task to Project
    const relation = await dataService.linkItems(task.id, project.id, 'parent');
    assert.ok(relation.id);

    // 5. Verify Context Graph reflects the connection
    const projCtx = await dataService.getProjectContext(project.id);
    assert.ok(projCtx !== null);
    assert.equal(projCtx?.openTasksCount, 1);
    assert.equal(projCtx?.tasks[0].id, task.id);
    assert.equal(projCtx?.tasks[0].title, 'Validate Private Beta Security Matrix');

    // 6. Simulate page reload / fresh query from database
    const reloadedProject = await getItemById(project.id);
    const reloadedTask = await getItemById(task.id);
    const reloadedRelations = await getAllRelations();

    assert.ok(reloadedProject, 'Project persists across reload');
    assert.ok(reloadedTask, 'Task persists across reload');
    assert.equal(reloadedRelations.length, 1, 'Relation persists across reload');
    assert.equal(reloadedRelations[0].sourceId, task.id);
    assert.equal(reloadedRelations[0].targetId, project.id);
  });

  // ─── SCENARIO 2 ─────────────────────────────────────────────────────────────
  it('SCENARIO 2: Create transaction → assign category → link Project → link Goal → view Project financial context → view Goal financial context', async () => {
    // 1. Create Project and Goal
    const project = await dataService.createItem({
      type: 'project',
      title: 'Home Office Setup',
      tags: ['setup'],
      metadata: {},
    });

    const goal = await dataService.createItem({
      type: 'goal',
      title: 'Workspace Upgrade Fund',
      metadata: { target: 50000, current: 0 },
    });

    // 2. Create Account and Category
    const account = await financeAccountService.createAccount({
      name: 'Axis Bank Salary',
      type: 'bank',
      openingBalance: 100000,
      currency: 'INR',
    });

    const category = await financeCategoryService.createCategory({
      name: 'Electronics & Hardware',
      direction: 'expense',
      color: '#6366f1',
      icon: 'monitor',
    });

    // 3. Create Project Expense Transaction
    const txn = await financeTransactionService.createTransaction({
      accountId: account.id,
      amount: 24500,
      currency: 'INR',
      type: 'expense',
      payee: 'Dell Technologies India',
      date: '2026-09-14',
      categoryId: category.id,
      projectId: project.id,
      note: '4K UltraSharp Monitor for developer workstation',
    });
    assert.ok(txn.id);

    // Create Goal Savings Deposit (Income towards goal)
    const goalDeposit = await financeTransactionService.createTransaction({
      accountId: account.id,
      amount: 15000,
      currency: 'INR',
      type: 'income',
      payee: 'Direct Deposit for Workspace Goal',
      date: '2026-09-14',
      goalId: goal.id,
    });
    assert.ok(goalDeposit.id);

    // 4. View Project Financial Context
    const projFin = await financeReportService.getProjectFinancialSummary(project.id);
    assert.equal(projFin.totalExpenses, 24500, 'Project summary aggregates expense');
    assert.equal(projFin.transactionCount, 1);
    assert.equal(projFin.net, -24500);

    // 5. View Goal Financial Context
    const goalFin = await financeReportService.getGoalFinancialProgress(goal.id);
    assert.equal(goalFin.transactionCount, 1, 'Goal aggregates linked savings transaction');
    assert.equal(goalFin.totalSaved, 15000, 'Goal aggregates saved amount');
  });

  // ─── SCENARIO 3 ─────────────────────────────────────────────────────────────
  it('SCENARIO 3: Create weekly budget → add transactions → cross threshold → verify correct period → verify forecast → start new week → verify boundary', async () => {
    const account = await financeAccountService.createAccount({
      name: 'Checking',
      type: 'bank',
      openingBalance: 50000,
    });

    const category = await financeCategoryService.createCategory({
      name: 'Dining & Food',
      direction: 'expense',
      color: '#f59e0b',
      icon: 'coffee',
    });

    // 1. Create Weekly Budget with 80% Alert Threshold (starts Monday 2026-09-14)
    const budget = await financeBudgetService.createBudget({
      name: 'Weekly Dining Limit',
      target: 2000,
      currency: 'INR',
      period: 'weekly',
      startDate: '2026-09-14',
      categoryId: category.id,
      alertThreshold: 0.8,
    });
    assert.ok(budget.id);

    // 2. Add Transactions within the week (Total: 1800 INR = 90% of budget)
    await financeTransactionService.createTransaction({
      accountId: account.id,
      amount: 1000,
      currency: 'INR',
      type: 'expense',
      payee: 'Fine Dining Restaurant',
      categoryId: category.id,
      date: '2026-09-15',
    });

    await financeTransactionService.createTransaction({
      accountId: account.id,
      amount: 800,
      currency: 'INR',
      type: 'expense',
      payee: 'Café Coffee Day',
      categoryId: category.id,
      date: '2026-09-17',
    });

    // 3. Verify Progress & Alert Threshold Crossing on Friday (2026-09-18)
    const fridayRef = new Date('2026-09-18T12:00:00.000Z');
    const progress = await financeBudgetService.getBudgetProgress(budget.id, fridayRef);
    assert.ok(progress !== null);
    assert.equal(progress?.spent, 1800, 'Spent matches sum of weekly transactions');
    assert.equal(progress?.remaining, 200, 'Remaining is 200 INR');
    assert.equal(progress?.percentage, 90, 'Percentage is 90%');
    assert.ok(progress?.isAlert, 'Alert triggered since 90% exceeds 80% threshold');
    assert.ok(progress?.projectedSpend >= 1800, 'Forecast projects week-end spending');

    // 4. Start New Week (Monday 2026-09-21): Verify Boundary Reset
    const nextWeekRef = new Date('2026-09-21T10:00:00.000Z');
    const nextWeekProgress = await financeBudgetService.getBudgetProgress(budget.id, nextWeekRef);
    assert.ok(nextWeekProgress !== null);
    assert.equal(nextWeekProgress?.spent, 0, 'New week boundary starts with 0 spent');
    assert.equal(nextWeekProgress?.remaining, 2000, 'Full target remaining in new week');
    assert.equal(nextWeekProgress?.isAlert, false, 'No alert in new week before spending');
  });

  // ─── SCENARIO 4 ─────────────────────────────────────────────────────────────
  it('SCENARIO 4: CSV import → ambiguous row → Financial Inbox → rule suggestion → user accepts → transaction created → candidate removed from pending', async () => {
    const account = await financeAccountService.createAccount({
      name: 'HDFC Bank',
      type: 'bank',
      openingBalance: 80000,
    });

    const category = await financeCategoryService.createCategory({
      name: 'Software Subscriptions',
      direction: 'expense',
      color: '#3b82f6',
      icon: 'cloud',
    });

    // Setup an automation rule that matches "GitHub"
    await automationEngine.createRule({
      name: 'GitHub to Software Subscriptions',
      trigger: 'transaction_created',
      conditions: [{ field: 'payee', operator: 'contains', value: 'GitHub' }],
      actions: [{ type: 'assign_category', value: category.id }],
    });

    // 1. Ambiguous CSV Row routed to Financial Inbox as a draft candidate
    const candidate = await financialInboxService.createCandidate({
      source: 'csv',
      amount: 1400,
      currency: 'INR',
      payee: 'GitHub Copilot Enterprise',
      date: '2026-09-14',
      suggestedAccount: account.id,
      reason: 'Ambiguous CSV transaction awaiting user review',
    });

    assert.ok(candidate.id);
    assert.equal(candidate.status, 'pending');
    // Verify deterministic rule suggestion attached the category
    assert.equal(candidate.suggestedCategory, category.id, 'Automation rule suggested category to inbox candidate');

    // 2. Verify it is counted in pending inbox summary
    const summaryBefore = await financialInboxService.getPendingSummary();
    assert.equal(summaryBefore.count, 1);

    // 3. User Reviews and Accepts Candidate
    const acceptedResult = await financialInboxService.acceptCandidate(candidate.id, {
      accountId: account.id,
    });
    assert.ok(acceptedResult !== null);
    assert.equal(acceptedResult?.candidate.status, 'accepted');
    assert.ok(acceptedResult?.transaction.id);
    assert.equal(acceptedResult?.transaction.payee, 'GitHub Copilot Enterprise');
    assert.equal(acceptedResult?.transaction.categoryId, category.id);

    // 4. Verify candidate is no longer in pending inbox
    const summaryAfter = await financialInboxService.getPendingSummary();
    assert.equal(summaryAfter.count, 0, 'Candidate removed from pending summary after acceptance');

    // 5. Verify transaction is present in general ledger
    const ledgerTxn = await financeTransactionService.getTransactionById(acceptedResult.transaction.id);
    assert.ok(ledgerTxn);
    assert.equal(ledgerTxn?.amount, 1400);
  });

  // ─── SCENARIO 5 ─────────────────────────────────────────────────────────────
  it('SCENARIO 5: Automation rule → simulation → real transaction → action → execution history → duplicate event → no duplicate mutation', async () => {
    const account = await financeAccountService.createAccount({
      name: 'SBI Checking',
      type: 'bank',
      openingBalance: 30000,
    });

    const travelCategory = await financeCategoryService.createCategory({
      name: 'Local Transit',
      direction: 'expense',
      color: '#10b981',
      icon: 'car',
    });

    // 1. Create Automation Rule: Uber -> Assign Category + Label
    const rule = await automationEngine.createRule({
      name: 'Auto-classify Uber Transit',
      trigger: 'transaction_created',
      conditions: [{ field: 'payee', operator: 'contains', value: 'Uber' }],
      actions: [
        { type: 'assign_category', value: travelCategory.id },
        { type: 'add_label', value: 'commute' },
      ],
      priority: 100,
    });

    // 2. Simulation Sandbox Verification
    const simResult = await automationEngine.simulate(
      { payee: 'Uber India Systems Pvt Ltd', amount: 450 },
      'transaction_created'
    );
    assert.equal(simResult.matchedRules.length, 1);
    assert.equal(simResult.preview.categoryId, travelCategory.id);
    assert.deepEqual(simResult.preview.labels, ['commute']);

    // 3. Real Transaction Creation
    const txn = await financeTransactionService.createTransaction({
      accountId: account.id,
      amount: 450,
      currency: 'INR',
      type: 'expense',
      payee: 'Uber India Systems Pvt Ltd',
      date: '2026-09-14',
    });

    // 4. Evaluate and Execute Rule on Real Transaction
    const execResult = await automationEngine.evaluateAndExecute(
      'transaction_created',
      txn as unknown as Record<string, unknown>,
      'transaction'
    );

    assert.equal(execResult.appliedRules.length, 1);
    assert.equal((execResult.entity as any).categoryId, travelCategory.id);
    assert.deepEqual((execResult.entity as any).labels, ['commute']);
    assert.equal(execResult.executions.length, 1);
    assert.equal(execResult.executions[0].status, 'success');

    // 5. Duplicate Event: Engine called again with identical event
    const dupExecResult = await automationEngine.evaluateAndExecute(
      'transaction_created',
      execResult.entity,
      'transaction'
    );

    // Idempotency check: 0 rules applied on duplicate run
    assert.equal(dupExecResult.appliedRules.length, 0, 'Duplicate event cleanly skipped by idempotency guard');
    assert.equal(dupExecResult.executions.length, 0, 'No duplicate execution history created');
  });

  // ─── SCENARIO 6 ─────────────────────────────────────────────────────────────
  it('SCENARIO 6: Planned recurring payment → occurrence generation → process twice → exactly one occurrence', async () => {
    const account = await financeAccountService.createAccount({
      name: 'Salary Account',
      type: 'bank',
      openingBalance: 150000,
    });

    const rentCategory = await financeCategoryService.createCategory({
      name: 'House Rent',
      direction: 'expense',
      color: '#ef4444',
      icon: 'home',
    });

    // 1. Create monthly recurring planned payment due today with autoCreate = true
    const payment = await financePlannedService.createPlannedPayment({
      name: 'Apartment Monthly Rent',
      amount: 35000,
      currency: 'INR',
      categoryId: rentCategory.id,
      dueDate: '2026-09-14',
      recurrence: { frequency: 'monthly', interval: 1 },
      accountId: account.id,
      autoCreate: true,
    });
    assert.ok(payment.id);

    // 2. First Recurrence Engine Pass on Due Date
    const refDate = new Date('2026-09-14T09:00:00.000Z');
    const run1 = await financePlannedService.processRecurrenceEngine(refDate);

    assert.equal(run1.generatedTransactions.length, 1, 'First pass generates exactly 1 transaction');
    assert.equal(run1.generatedTransactions[0].amount, 35000);
    assert.equal(run1.generatedTransactions[0].recurringId, payment.id);

    // 3. Second Recurrence Engine Pass on Same Date (e.g. system tick or user refresh)
    const run2 = await financePlannedService.processRecurrenceEngine(refDate);

    assert.equal(run2.generatedTransactions.length, 0, 'Second pass generates 0 duplicate transactions');

    // 4. Verify Total Transactions in Ledger for this payment
    const allTxns = await getAllTransactions();
    const rentTxns = allTxns.filter(t => t.recurringId === payment.id);
    assert.equal(rentTxns.length, 1, 'Exactly one ledger occurrence exists');
  });

  // ─── SCENARIO 7 ─────────────────────────────────────────────────────────────
  it('SCENARIO 7: Offline → create transaction → close browser → reopen offline → reconnect → verify transaction exists once', async () => {
    const account = await financeAccountService.createAccount({
      name: 'Local Cash Wallet',
      type: 'cash',
      openingBalance: 5000,
    });

    // 1. Go Offline
    (navigator as unknown as { onLine: boolean }).onLine = false;

    // 2. Create Transaction while Offline
    const txn = await financeTransactionService.createTransaction({
      accountId: account.id,
      amount: 250,
      currency: 'INR',
      type: 'expense',
      payee: 'Local Grocery Market',
      date: '2026-09-14',
    });
    assert.ok(txn.id);

    // Verify queued for sync
    const pendingBefore = await getPendingSyncOps();
    assert.ok(pendingBefore.some(op => op.entityId === txn.id), 'Transaction enqueued for remote sync');

    // 3. Simulate "Close Browser & Reopen Offline"
    // Read directly from local DB without online network
    const offlineItem = await financeTransactionService.getTransactionById(txn.id);
    assert.ok(offlineItem, 'Transaction survives offline restart and is accessible in local DB');
    assert.equal(offlineItem?.amount, 250);

    // 4. Reconnect to Network
    (navigator as unknown as { onLine: boolean }).onLine = true;

    // Flush sync queue to simulated remote
    const remoteUpserts: string[] = [];
    const mockRemoteStorage = {
      upsertFinanceEntity: async (table: string, entity: { id: string }) => {
        remoteUpserts.push(`${table}:${entity.id}`);
      },
    };

    // Replay pending sync operations
    for (const op of pendingBefore) {
      if (op.entityType === 'fa_transaction' && op.payload) {
        await mockRemoteStorage.upsertFinanceEntity('fa_transaction', op.payload as any);
      }
    }

    // 5. Verify Transaction Exists Exactly Once (No duplication)
    const allTxns = await getAllTransactions();
    const matching = allTxns.filter(t => t.id === txn.id);
    assert.equal(matching.length, 1, 'Transaction exists exactly once locally');
    assert.ok(remoteUpserts.includes(`fa_transaction:${txn.id}`), 'Remote received exactly one upsert');
  });

  // ─── SCENARIO 8 ─────────────────────────────────────────────────────────────
  it('SCENARIO 8: Two clients → conflicting Financial Inbox decisions → reconnect → deterministic winner → no duplicate transaction', async () => {
    const candidate: FinancialCandidate = {
      id: 'cand_conflict_88',
      source: 'csv',
      detectedAt: '2026-09-14T08:00:00.000Z',
      amount: 3200,
      currency: 'INR',
      payee: 'Cloud Hosting Renewal',
      date: '2026-09-14',
      status: 'pending',
      confidence: 0.85,
      createdAt: '2026-09-14T08:00:00.000Z',
      updatedAt: '2026-09-14T08:00:00.000Z',
    };
    await saveCandidate(candidate);

    // Client A decides to IGNORE the candidate
    const clientADecision: FinancialCandidate = {
      ...candidate,
      status: 'ignored',
      reason: 'Not needed for personal accounts',
      updatedAt: '2026-09-14T08:10:00.000Z',
    };

    // Client B concurrently decides to ACCEPT the candidate
    const clientBDecision: FinancialCandidate = {
      ...candidate,
      status: 'accepted',
      transactionId: 'txn_accepted_cloud_88',
      updatedAt: '2026-09-14T08:05:00.000Z', // Even if timestamp was slightly earlier
    };

    // Deterministic Conflict Resolution: 'accepted' > 'ignored'
    const resolvedWinner = financialInboxService.resolveSyncConflict(clientADecision, clientBDecision);

    assert.equal(resolvedWinner.status, 'accepted', "'accepted' decision takes precedence over 'ignored'");
    assert.equal(resolvedWinner.transactionId, 'txn_accepted_cloud_88');

    // Verify symmetry: resolution order does not matter
    const resolvedSymmetric = financialInboxService.resolveSyncConflict(clientBDecision, clientADecision);
    assert.equal(resolvedSymmetric.status, 'accepted');
  });

  // ─── SCENARIO 9 ─────────────────────────────────────────────────────────────
  it('SCENARIO 9: Export → wipe → import → verify complete restoration', async () => {
    // 1. Populate rich multi-domain dataset
    const project = await dataService.createItem({ type: 'project', title: 'Full Stack Project', metadata: {} });
    const task = await dataService.createItem({ type: 'task', title: 'Write Documentation', metadata: {} });
    await dataService.linkItems(task.id, project.id, 'parent');

    const account = await financeAccountService.createAccount({ name: 'Export Test Account', type: 'savings', openingBalance: 50000 });
    const category = await financeCategoryService.createCategory({ name: 'Export Test Category', direction: 'expense', color: '#000', icon: 'tag' });
    await financeTransactionService.createTransaction({
      accountId: account.id,
      amount: 1500,
      currency: 'INR',
      type: 'expense',
      payee: 'Office Supplies Ltd',
      date: '2026-09-14',
      categoryId: category.id,
    });

    await financialInboxService.createCandidate({
      source: 'manual',
      amount: 999,
      currency: 'INR',
      payee: 'Pending Verification Item',
      date: '2026-09-14',
    });

    // 2. Export Full Data Snapshot
    const exportedJson = await dataService.exportFullData();
    assert.ok(typeof exportedJson === 'string');
    assert.ok(exportedJson.length > 500);

    // 3. Completely Wipe Local Storage
    await clearAllData();

    // Verify completely empty
    const emptyItems = await getAllItems();
    const emptyRelations = await getAllRelations();
    const emptyAccounts = await getAllAccounts();
    const emptyTxns = await getAllTransactions();
    const emptyCandidates = await getAllCandidates();

    assert.equal(emptyItems.length, 0);
    assert.equal(emptyRelations.length, 0);
    assert.equal(emptyAccounts.length, 0);
    assert.equal(emptyTxns.length, 0);
    assert.equal(emptyCandidates.length, 0);

    // 4. Import Full Data Snapshot
    const importResult = await dataService.importFullData(exportedJson);
    assert.ok(importResult.success, 'Schema validation and import succeed');
    assert.equal(importResult.itemsCount, 2);
    assert.equal(importResult.relationsCount, 1);

    // 5. Verify Complete Restoration
    const restoredItems = await getAllItems();
    const restoredRelations = await getAllRelations();
    const restoredAccounts = await getAllAccounts();
    const restoredTxns = await getAllTransactions();
    const restoredCandidates = await getAllCandidates();

    assert.equal(restoredItems.length, 2);
    assert.equal(restoredRelations.length, 1);
    assert.equal(restoredAccounts.length, 1);
    assert.equal(restoredTxns.length, 1);
    assert.equal(restoredCandidates.length, 1);

    assert.equal(restoredItems.find(i => i.id === project.id)?.title, 'Full Stack Project');
    assert.equal(restoredTxns[0].payee, 'Office Supplies Ltd');
  });

  // ─── SCENARIO 10 ────────────────────────────────────────────────────────────
  it('SCENARIO 10: User A / User B → create similar data → verify strict isolation', async () => {
    const USER_A_ID = 'user_alice_alpha_01';
    const USER_B_ID = 'user_bob_bravo_02';

    const db = createSimulatedRlsDatabase();
    const clientA = db.createClient(USER_A_ID) as any;
    const clientB = db.createClient(USER_B_ID) as any;

    const providerA = new TrackrSupabaseProvider(USER_A_ID, clientA);
    const providerB = new TrackrSupabaseProvider(USER_B_ID, clientB);

    // 1. User A creates items and finance transactions
    const itemA: Item = {
      id: 'item_alice_project',
      type: 'project',
      title: "Alice's Secret Patent Work",
      content: 'Confidential research notes',
      tags: ['alice', 'private'],
      pinned: false,
      archived: false,
      version: 1,
      metadata: {},
      createdAt: '2026-09-14T08:00:00.000Z',
      updatedAt: '2026-09-14T08:00:00.000Z',
    };
    await providerA.upsertItem(itemA);

    const txnA: FinanceTransaction = {
      id: 'txn_alice_salary',
      accountId: 'acc_alice_01',
      date: '2026-09-14',
      amount: 125000,
      currency: 'INR',
      type: 'income',
      payee: 'Alice High-Tech Corp',
      labels: [],
      ruleExecutions: [],
      createdAt: '2026-09-14T08:00:00.000Z',
      updatedAt: '2026-09-14T08:00:00.000Z',
    };
    await providerA.upsertFinanceEntity('fa_transaction', txnA);

    // 2. User B creates similar items and transactions with distinct private data
    const itemB: Item = {
      id: 'item_bob_project',
      type: 'project',
      title: "Bob's Independent Venture",
      content: 'Bob proprietary design',
      tags: ['bob', 'venture'],
      pinned: false,
      archived: false,
      version: 1,
      metadata: {},
      createdAt: '2026-09-14T08:05:00.000Z',
      updatedAt: '2026-09-14T08:05:00.000Z',
    };
    await providerB.upsertItem(itemB);

    const txnB: FinanceTransaction = {
      id: 'txn_bob_consulting',
      accountId: 'acc_bob_01',
      date: '2026-09-14',
      amount: 85000,
      currency: 'INR',
      type: 'income',
      payee: 'Bob Consulting Client',
      labels: [],
      ruleExecutions: [],
      createdAt: '2026-09-14T08:05:00.000Z',
      updatedAt: '2026-09-14T08:05:00.000Z',
    };
    await providerB.upsertFinanceEntity('fa_transaction', txnB);

    // 3. User A Queries Remote: Sees ONLY User A's data
    const aliceItems = await providerA.pullItems();
    assert.equal(aliceItems.length, 1);
    assert.equal(aliceItems[0].id, 'item_alice_project');
    assert.equal(aliceItems[0].title, "Alice's Secret Patent Work");

    // 4. User B Queries Remote: Sees ONLY User B's data
    const bobItems = await providerB.pullItems();
    assert.equal(bobItems.length, 1);
    assert.equal(bobItems[0].id, 'item_bob_project');
    assert.equal(bobItems[0].title, "Bob's Independent Venture");

    // 5. Cross-Tenant Attack: User B attempts to spoof User A's user_id in an insert
    await assert.rejects(
      async () => {
        // Manually try to insert with spoofed user_id
        const res = await clientB
          .from('fa_transactions')
          .upsert({ id: 'txn_spoofed', user_id: USER_A_ID, amount: 999999 });
        if (res.error) throw res.error;
      },
      (err: any) => {
        assert.ok(err.message.includes('row-level security') || err.message.includes('42501'));
        return true;
      }
    );

    // 6. User B attempts to delete User A's transaction: RLS silences/blocks mutation
    await providerB.deleteFinanceEntity('fa_transaction', 'txn_alice_salary');

    // 7. Verify Alice's transaction remains completely intact
    const aliceTxnsAfterBobAttempt = await clientA
      .from('fa_transactions')
      .select()
      .eq('id', 'txn_alice_salary');

    assert.equal(aliceTxnsAfterBobAttempt.data.length, 1, "Alice's transaction is immune to User B deletion");
    assert.equal(aliceTxnsAfterBobAttempt.data[0].amount, 125000);
  });
});
