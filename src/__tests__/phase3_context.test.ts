/**
 * Phase 3 — The Context Graph + Unified Personal Operating System
 *
 * Tests:
 * 1. Relation Vocabulary & Enforced Semantics (valid, invalid, duplicate, unlink, delete cleanup)
 * 2. Universal Context Panel & Direct Context (Project, Goal, Task, Transaction, Note, Tracker)
 * 3. Graph Traversal & 2nd-Degree Context Discovery (cycle safety, traversal limits)
 * 4. Project Financial Context & Cockpit Aggregator (Next Actions, spend, income, net, budget)
 * 5. Goal Multi-Source Progress Engine (manual, financial, tasks, tracker)
 * 6. Smart Attention Engine (overdue tasks, budget warnings, planned payments, blocked projects)
 * 7. Universal Search 2.0 & Cross-Domain Filters
 * 8. Offline Graph Operations & Conflict Safety (independent relations preservation)
 * 9. Export / Import Graph Round-Trip Preservation
 * 10. Complete End-to-End Scenario (Step 30: Goal → Project → Tasks → Note → Account → Budget → Transaction → Cross-domain)
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
import { contextGraphService } from '@/lib/services/ContextGraphService';
import { dataService } from '@/lib/services/DataService';
import { financeAccountService } from '@/lib/services/finance/FinanceAccountService';
import { financeTransactionService } from '@/lib/services/finance/FinanceTransactionService';
import { financeBudgetService } from '@/lib/services/finance/FinanceBudgetService';
import { financeCategoryService } from '@/lib/services/finance/FinanceCategoryService';
import { financePlannedService } from '@/lib/services/finance/FinancePlannedService';
import { isValidRelation } from '@/types';

function localDate(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const TODAY = localDate(0);
const YESTERDAY = localDate(-1);
const TOMORROW = localDate(1);

describe('Phase 3 — The Context Graph + Unified Personal Operating System', () => {

  beforeEach(async () => {
    await clearAllData();
  });

  // ─── 1. Relation Vocabulary & Enforced Semantics ───────────────────────────
  describe('1. Relation Vocabulary & Enforced Semantics', () => {
    it('validates intentional relationship combinations', () => {
      // Valid relationships
      assert.equal(isValidRelation('task', 'belongs_to', 'project'), true);
      assert.equal(isValidRelation('note', 'belongs_to', 'project'), true);
      assert.equal(isValidRelation('transaction', 'belongs_to', 'project'), true);
      assert.equal(isValidRelation('task', 'supports', 'goal'), true);
      assert.equal(isValidRelation('tracker', 'supports', 'goal'), true);
      assert.equal(isValidRelation('transaction', 'supports', 'goal'), true);
      assert.equal(isValidRelation('transaction', 'funds', 'project'), true);
      assert.equal(isValidRelation('transaction', 'funds', 'goal'), true);
      assert.equal(isValidRelation('task', 'depends_on', 'task'), true);
      assert.equal(isValidRelation('task', 'blocks', 'task'), true);
      assert.equal(isValidRelation('item', 'related_to', 'item'), true);
      assert.equal(isValidRelation('note', 'references', 'project'), true);

      // Meaningless combinations MUST be rejected
      assert.equal(isValidRelation('transaction', 'depends_on', 'task'), false);
      assert.equal(isValidRelation('task', 'funds', 'note'), false);
      assert.equal(isValidRelation('project', 'funds', 'transaction'), false);
      assert.equal(isValidRelation('note', 'blocks', 'project'), false);
    });

    it('creates valid relation, rejects duplicate relation, and unlinks cleanly', async () => {
      const proj = await dataService.createItem({ type: 'project', title: 'Goa Trip', metadata: {} });
      const task = await dataService.createItem({ type: 'task', title: 'Book hotel', metadata: {} });

      // Create valid link
      const res = await contextGraphService.link(task.id, 'task', proj.id, 'project', 'belongs_to');
      assert.equal(res.success, true);
      assert.equal(res.relation?.relationType, 'belongs_to');
      assert.equal(res.relation?.sourceId, task.id);
      assert.equal(res.relation?.targetId, proj.id);

      // Duplicate link should return existing relation without creating duplicate records
      const res2 = await contextGraphService.link(task.id, 'task', proj.id, 'project', 'belongs_to');
      assert.equal(res2.success, true);
      assert.equal(res2.relation?.id, res.relation?.id);

      // Direct context check
      const ctx = await contextGraphService.getDirectContext(proj.id, 'project');
      assert.equal(ctx.tasks.length, 1);
      assert.equal(ctx.tasks[0].id, task.id);

      // Unlink
      const unlinked = await contextGraphService.unlink(task.id, proj.id);
      assert.equal(unlinked, true);

      const ctxAfter = await contextGraphService.getDirectContext(proj.id, 'project');
      assert.equal(ctxAfter.tasks.length, 0);
    });

    it('rejects invalid relation combinations at service layer', async () => {
      const task = await dataService.createItem({ type: 'task', title: 'Task A', metadata: {} });
      const note = await dataService.createItem({ type: 'note', title: 'Note B', metadata: {} });

      const res = await contextGraphService.link(task.id, 'task', note.id, 'note', 'funds');
      assert.equal(res.success, false);
      assert.match(res.error!, /Invalid relationship/);
    });

    it('cleans up relations when an entity is deleted', async () => {
      const proj = await dataService.createItem({ type: 'project', title: 'Home Project', metadata: {} });
      const task = await dataService.createItem({ type: 'task', title: 'Paint walls', metadata: {} });

      await contextGraphService.link(task.id, 'task', proj.id, 'project', 'belongs_to');

      let ctx = await contextGraphService.getDirectContext(proj.id, 'project');
      assert.equal(ctx.tasks.length, 1);

      // Delete task
      await dataService.deleteItem(task.id);

      // Relations should be pruned
      ctx = await contextGraphService.getDirectContext(proj.id, 'project');
      assert.equal(ctx.tasks.length, 0);
    });
  });

  // ─── 2. Universal Context Panel & Direct Context ───────────────────────────
  describe('2. Universal Context Panel & Direct Context', () => {
    it('aggregates direct context across projects, tasks, notes, goals, trackers, and transactions', async () => {
      const proj = await dataService.createItem({ type: 'project', title: 'Launch App', metadata: {} });
      const task = await dataService.createItem({ type: 'task', title: 'Deploy frontend', metadata: {} });
      const note = await dataService.createItem({ type: 'note', title: 'Deployment Guide', metadata: {} });
      const goal = await dataService.createItem({ type: 'goal', title: 'Q3 Goals', metadata: {} });
      const tracker = await dataService.createItem({ type: 'tracker', title: 'Daily Commits', metadata: {} });

      // Create an account & transaction linked to the project
      const acc = await financeAccountService.createAccount({ name: 'HDFC', type: 'bank', openingBalance: 50000 });
      const txn = await financeTransactionService.createTransaction({
        accountId: acc.id,
        amount: 2500,
        type: 'expense',
        date: TODAY,
        payee: 'Domain Registration',
        projectId: proj.id,
      });

      // Link items
      await contextGraphService.link(task.id, 'task', proj.id, 'project', 'belongs_to');
      await contextGraphService.link(note.id, 'note', proj.id, 'project', 'belongs_to');
      await contextGraphService.link(proj.id, 'project', goal.id, 'goal', 'supports');
      await contextGraphService.link(tracker.id, 'tracker', proj.id, 'project', 'supports');
      await contextGraphService.link(txn.id, 'transaction', proj.id, 'project', 'belongs_to');

      // Query context from Project point of view
      const pCtx = await contextGraphService.getDirectContext(proj.id, 'project');
      assert.equal(pCtx.tasks.length, 1);
      assert.equal(pCtx.notes.length, 1);
      assert.equal(pCtx.goals.length, 1);
      assert.equal(pCtx.trackers.length, 1);
      assert.equal(pCtx.transactions.length, 1);
      assert.equal(pCtx.totalCount, 5);

      // Query context from Task point of view
      const tCtx = await contextGraphService.getDirectContext(task.id, 'task');
      assert.equal(tCtx.projects.length, 1);
      assert.equal(tCtx.projects[0].id, proj.id);

      // Query context from Note point of view
      const nCtx = await contextGraphService.getDirectContext(note.id, 'note');
      assert.equal(nCtx.projects.length, 1);
      assert.equal(nCtx.projects[0].id, proj.id);

      // Query context from Transaction point of view
      const txCtx = await contextGraphService.getDirectContext(txn.id, 'transaction');
      assert.equal(txCtx.projects.length, 1);
      assert.equal(txCtx.projects[0].id, proj.id);
    });
  });

  // ─── 3. Graph Traversal & 2nd-Degree Context Discovery ───────────────────────
  describe('3. Graph Traversal & 2nd-Degree Context Discovery', () => {
    it('discovers 2nd-degree relations with cycle prevention and traversal limits', async () => {
      // Path: Transaction -> Project -> Note & Task
      const proj = await dataService.createItem({ type: 'project', title: 'Vacation Trip', metadata: {} });
      const task = await dataService.createItem({ type: 'task', title: 'Reserve Hotel', metadata: {} });
      const note = await dataService.createItem({ type: 'note', title: 'Hotel options', metadata: {} });

      const acc = await financeAccountService.createAccount({ name: 'Bank', type: 'bank', openingBalance: 100000 });
      const txn = await financeTransactionService.createTransaction({
        accountId: acc.id,
        amount: 15000,
        type: 'expense',
        date: TODAY,
        payee: 'Flight Tickets',
        projectId: proj.id,
      });

      await contextGraphService.link(task.id, 'task', proj.id, 'project', 'belongs_to');
      await contextGraphService.link(note.id, 'note', proj.id, 'project', 'belongs_to');
      await contextGraphService.link(txn.id, 'transaction', proj.id, 'project', 'belongs_to');

      // Create a cyclic link (Note -> Project)
      await contextGraphService.link(proj.id, 'project', note.id, 'note', 'references');

      // Query 2nd-degree related context from the Transaction perspective
      const related = await contextGraphService.getRelatedContext(txn.id, 5);

      // Should discover the Task and the Note via the Project!
      const discoveredIds = related.map(r => r.item.id);
      assert.ok(discoveredIds.includes(task.id), 'Should discover Task through Project');
      assert.ok(discoveredIds.includes(note.id), 'Should discover Note through Project');
      assert.ok(related.length <= 5, 'Should respect traversal limit');
    });
  });

  // ─── 4. Project Cockpit & Financial Context ────────────────────────────────
  describe('4. Project Cockpit & Financial Context', () => {
    it('aggregates project cockpit: only unblocked next actions and actual finances', async () => {
      const proj = await dataService.createItem({ type: 'project', title: 'Home Renovation', metadata: {} });

      // Task 1: Blocker task (in_progress)
      const task1 = await dataService.createItem({
        type: 'task',
        title: 'Order Tiles',
        metadata: { status: 'in_progress', priority: 'high', projectId: proj.id },
      });
      await contextGraphService.link(task1.id, 'task', proj.id, 'project', 'belongs_to');

      // Task 2: Blocked by Task 1
      const task2 = await dataService.createItem({
        type: 'task',
        title: 'Install Tiles',
        metadata: { status: 'todo', priority: 'medium', projectId: proj.id },
      });
      await contextGraphService.link(task2.id, 'task', proj.id, 'project', 'belongs_to');
      await dataService.addTaskDependency(task2.id, task1.id); // task2 depends on task1

      // Task 3: Unblocked task (todo)
      const task3 = await dataService.createItem({
        type: 'task',
        title: 'Select Paint Colors',
        metadata: { status: 'todo', priority: 'low', projectId: proj.id },
      });
      await contextGraphService.link(task3.id, 'task', proj.id, 'project', 'belongs_to');

      // Project Financial records
      const acc = await financeAccountService.createAccount({ name: 'Checking', type: 'bank', openingBalance: 200000 });
      await financeTransactionService.createTransaction({
        accountId: acc.id,
        amount: 45000,
        type: 'expense',
        date: TODAY,
        payee: 'Tiles Store',
        projectId: proj.id,
      });
      await financeTransactionService.createTransaction({
        accountId: acc.id,
        amount: 12000,
        type: 'expense',
        date: TODAY,
        payee: 'Labor Charges',
        projectId: proj.id,
      });

      // Create linked budget for the project
      const budget = await financeBudgetService.createBudget({
        name: 'Renovation Budget',
        target: 100000,
        period: 'monthly',
        startDate: TODAY,
      });
      await contextGraphService.link(budget.id, 'budget', proj.id, 'project', 'belongs_to');

      // Run Project Cockpit Summary
      const cockpit = await contextGraphService.getProjectCockpitSummary(proj.id);
      assert.ok(cockpit);

      // Next Actions: Task 1 and Task 3 are ready to act on; Task 2 is blocked!
      const nextActionIds = cockpit.nextActions.map(t => t.id);
      assert.ok(nextActionIds.includes(task1.id));
      assert.ok(nextActionIds.includes(task3.id));
      assert.equal(nextActionIds.includes(task2.id), false, 'Blocked task must not appear in Next Actions');

      // Financials: spent = 57,000, income = 0, net = -57,000
      assert.equal(cockpit.finSummary.totalExpenses, 57000);
      assert.equal(cockpit.finSummary.totalIncome, 0);
      assert.equal(cockpit.finSummary.net, -57000);

      // Linked Budget Progress: 57,000 of 100,000 = 57%
      assert.ok(cockpit.linkedBudgetProgress);
      assert.equal(cockpit.linkedBudgetProgress.spent, 57000);
      assert.equal(cockpit.linkedBudgetProgress.budget.target, 100000);
      assert.equal(cockpit.linkedBudgetProgress.remaining, 43000);
    });

    it('handles project with no financial records safely (empty state)', async () => {
      const proj = await dataService.createItem({ type: 'project', title: 'Empty Project', metadata: {} });
      const cockpit = await contextGraphService.getProjectCockpitSummary(proj.id);

      assert.ok(cockpit);
      assert.equal(cockpit.finSummary.transactionCount, 0);
      assert.equal(cockpit.finSummary.totalExpenses, 0);
      assert.equal(cockpit.linkedBudgetProgress, null);
    });
  });

  // ─── 5. Goal Context & Multi-Source Progress Engine ───────────────────────
  describe('5. Goal Context & Multi-Source Progress Engine', () => {
    it('calculates financial progress from linked transactions', async () => {
      const goal = await dataService.createItem({
        type: 'goal',
        title: 'Save ₹1,00,000 for Laptop',
        metadata: {
          targetAmount: 100000,
          progressSource: 'financial',
        },
      });

      const acc = await financeAccountService.createAccount({ name: 'Savings', type: 'bank', openingBalance: 50000 });
      const txn1 = await financeTransactionService.createTransaction({
        accountId: acc.id,
        amount: 25000,
        type: 'income',
        date: TODAY,
        payee: 'Savings Deposit',
        goalId: goal.id,
      });
      const txn2 = await financeTransactionService.createTransaction({
        accountId: acc.id,
        amount: 15000,
        type: 'income',
        date: TODAY,
        payee: 'Freelance Bonus',
        goalId: goal.id,
      });

      await contextGraphService.link(txn1.id, 'transaction', goal.id, 'goal', 'funds');
      await contextGraphService.link(txn2.id, 'transaction', goal.id, 'goal', 'funds');

      const prog = await contextGraphService.calculateGoalProgress(goal.id);
      assert.ok(prog);
      assert.equal(prog.source, 'financial');
      assert.equal(prog.current, 40000);
      assert.equal(prog.target, 100000);
      assert.equal(prog.percentage, 40);
      assert.match(prog.label, /₹40,000/);
    });

    it('calculates task completion progress from linked tasks', async () => {
      const goal = await dataService.createItem({
        type: 'goal',
        title: 'Launch Blog',
        metadata: {
          progressSource: 'tasks',
        },
      });

      const t1 = await dataService.createItem({ type: 'task', title: 'Write 1st post', metadata: { status: 'done' } });
      const t2 = await dataService.createItem({ type: 'task', title: 'Write 2nd post', metadata: { status: 'done' } });
      const t3 = await dataService.createItem({ type: 'task', title: 'Write 3rd post', metadata: { status: 'todo' } });
      const t4 = await dataService.createItem({ type: 'task', title: 'Setup newsletter', metadata: { status: 'todo' } });

      await contextGraphService.link(t1.id, 'task', goal.id, 'goal', 'supports');
      await contextGraphService.link(t2.id, 'task', goal.id, 'goal', 'supports');
      await contextGraphService.link(t3.id, 'task', goal.id, 'goal', 'supports');
      await contextGraphService.link(t4.id, 'task', goal.id, 'goal', 'supports');

      const prog = await contextGraphService.calculateGoalProgress(goal.id);
      assert.ok(prog);
      assert.equal(prog.source, 'tasks');
      assert.equal(prog.current, 2);
      assert.equal(prog.target, 4);
      assert.equal(prog.percentage, 50);
      assert.match(prog.label, /2 of 4 completed/);
    });

    it('calculates tracker progress from connected tracker entries', async () => {
      const tracker = await dataService.createItem({
        type: 'tracker',
        title: 'Weight Tracker',
        metadata: { trackerType: 'numeric', unit: 'kg' },
      });

      const goal = await dataService.createItem({
        type: 'goal',
        title: 'Target 70kg',
        metadata: {
          targetAmount: 70,
          progressSource: 'tracker',
          trackerId: tracker.id,
        },
      });

      await contextGraphService.link(tracker.id, 'tracker', goal.id, 'goal', 'supports');

      await dataService.addTrackerEntry(tracker.id, { date: TODAY, value: 72 });

      const prog = await contextGraphService.calculateGoalProgress(goal.id);
      assert.ok(prog);
      assert.equal(prog.source, 'tracker');
      assert.equal(prog.current, 72);
      assert.match(prog.label, /72/);
    });
  });

  // ─── 6. Smart Attention Engine ─────────────────────────────────────────────
  describe('6. Smart Attention Engine', () => {
    it('detects overdue tasks, budget thresholds, planned payments, and blocked projects', async () => {
      // 1. Overdue task
      await dataService.createItem({
        type: 'task',
        title: 'Pay Electricity Bill',
        metadata: { dueDate: YESTERDAY, status: 'todo' },
      });

      // 2. Budget threshold warning (spent >= 80%)
      const acc = await financeAccountService.createAccount({ name: 'Card', type: 'credit_card', openingBalance: 50000 });
      const cat = await financeCategoryService.createCategory({ name: 'Dining', direction: 'expense' });
      await financeBudgetService.createBudget({
        name: 'Dining Budget',
        target: 10000,
        categoryId: cat.id,
        period: 'monthly',
        startDate: TODAY,
        alertThreshold: 0.8,
      });
      await financeTransactionService.createTransaction({
        accountId: acc.id,
        categoryId: cat.id,
        amount: 8500,
        type: 'expense',
        date: TODAY,
        payee: 'Fancy Restaurant',
      });

      // 3. Planned payment due soon
      await financePlannedService.createPlannedPayment({
        accountId: acc.id,
        amount: 1500,
        name: 'Broadband Bill',
        dueDate: TOMORROW,
        recurrence: { frequency: 'monthly' },
      });

      // 4. Blocked project
      const proj = await dataService.createItem({ type: 'project', title: 'Stalled Project', metadata: { status: 'active' } });
      const bTask = await dataService.createItem({ type: 'task', title: 'Waiting for vendor quote', metadata: { status: 'in_progress', projectId: proj.id } });
      const blockedTask = await dataService.createItem({ type: 'task', title: 'Execute contract', metadata: { status: 'todo', projectId: proj.id } });
      await dataService.addTaskDependency(blockedTask.id, bTask.id);
      await contextGraphService.link(bTask.id, 'task', proj.id, 'project', 'belongs_to');
      await contextGraphService.link(blockedTask.id, 'task', proj.id, 'project', 'belongs_to');

      // Query Smart Attention items
      const attention = await contextGraphService.getAttentionItems();
      assert.ok(attention.length >= 4);

      const types = attention.map(a => a.type);
      assert.ok(types.includes('overdue_task'), 'Must include overdue task');
      assert.ok(types.includes('budget_warning'), 'Must include budget warning');
      assert.ok(types.includes('planned_payment'), 'Must include planned payment');
      assert.ok(types.includes('blocked_project'), 'Must include blocked project');

      // Must explain why
      const budgetAtt = attention.find(a => a.type === 'budget_warning');
      assert.match(budgetAtt!.message, /used/);

      const blockedAtt = attention.find(a => a.type === 'blocked_project');
      assert.match(blockedAtt!.message, /blocked by/);
    });
  });

  // ─── 7. Universal Search 2.0 & Cross-Domain Search ─────────────────────────
  describe('7. Universal Search 2.0 & Cross-Domain Search', () => {
    it('searches across all domains and supports link candidate querying', async () => {
      await dataService.createItem({ type: 'project', title: 'Goa Trip', metadata: {} });
      await dataService.createItem({ type: 'task', title: 'Goa hotel booking', metadata: {} });
      await dataService.createItem({ type: 'note', title: 'Goa packing checklist', metadata: {} });

      const acc = await financeAccountService.createAccount({ name: 'Trip Wallet', type: 'cash', openingBalance: 20000 });
      await financeTransactionService.createTransaction({
        accountId: acc.id,
        amount: 4500,
        type: 'expense',
        date: TODAY,
        payee: 'Goa Resort Advance',
      });

      const searchResult = await dataService.searchWithFinance('Goa');
      assert.equal(searchResult.items.length, 3);
      assert.equal(searchResult.transactions.length, 1);
      assert.equal(searchResult.transactions[0].payee, 'Goa Resort Advance');

      // Link candidate search
      const candidates = await contextGraphService.searchLinkableEntities('Goa');
      assert.ok(candidates.length >= 4);
    });
  });

  // ─── 8. Offline Graph Operations & Conflict Safety ─────────────────────────
  describe('8. Offline Graph Operations & Conflict Safety', () => {
    it('preserves independent relations under simulated client sync and unlinking safety', async () => {
      const proj = await dataService.createItem({ type: 'project', title: 'Shared Project', metadata: {} });
      const taskA = await dataService.createItem({ type: 'task', title: 'Task Client A', metadata: {} });
      const noteB = await dataService.createItem({ type: 'note', title: 'Note Client B', metadata: {} });

      // Client A creates relation: Task -> Project
      await contextGraphService.link(taskA.id, 'task', proj.id, 'project', 'belongs_to');

      // Client B creates relation: Note -> Project
      await contextGraphService.link(noteB.id, 'note', proj.id, 'project', 'belongs_to');

      // Both valid relationships must coexist
      const ctx = await contextGraphService.getDirectContext(proj.id, 'project');
      assert.equal(ctx.tasks.length, 1);
      assert.equal(ctx.notes.length, 1);
      assert.equal(ctx.tasks[0].id, taskA.id);
      assert.equal(ctx.notes[0].id, noteB.id);

      // Client A removes its relation
      await contextGraphService.unlink(taskA.id, proj.id);

      // Client B's relation must NOT disappear
      const ctxAfter = await contextGraphService.getDirectContext(proj.id, 'project');
      assert.equal(ctxAfter.tasks.length, 0);
      assert.equal(ctxAfter.notes.length, 1);
      assert.equal(ctxAfter.notes[0].id, noteB.id);
    });
  });

  // ─── 9. Export / Import Graph Round-Trip ───────────────────────────────────
  describe('9. Export / Import Graph Round-Trip', () => {
    it('preserves all items, finance records, and relationship graph across export and import', async () => {
      const proj = await dataService.createItem({ type: 'project', title: 'Renovation', metadata: {} });
      const task = await dataService.createItem({ type: 'task', title: 'Buy Tiles', metadata: {} });
      const goal = await dataService.createItem({ type: 'goal', title: 'Dream House', metadata: {} });

      const acc = await financeAccountService.createAccount({ name: 'SBI Bank', type: 'bank', openingBalance: 500000 });
      const txn = await financeTransactionService.createTransaction({
        accountId: acc.id,
        amount: 30000,
        type: 'expense',
        date: TODAY,
        payee: 'Tiles Emporium',
        projectId: proj.id,
        goalId: goal.id,
      });

      await contextGraphService.link(task.id, 'task', proj.id, 'project', 'belongs_to');
      await contextGraphService.link(proj.id, 'project', goal.id, 'goal', 'supports');
      await contextGraphService.link(txn.id, 'transaction', goal.id, 'goal', 'funds');

      // Export full data
      const exportedJson = await dataService.exportFullData();
      assert.ok(exportedJson.length > 50);

      // Wipe local data
      await clearAllData();

      // Verify wiped
      const wipedItems = await dataService.getAllItems();
      assert.equal(wipedItems.length, 0);

      // Import full data
      const res = await dataService.importFullData(exportedJson);
      assert.equal(res.success, true);

      // Verify items and relations survive
      const restoredProj = await dataService.getItemById(proj.id);
      assert.ok(restoredProj);
      assert.equal(restoredProj.title, 'Renovation');

      const restoredCtx = await contextGraphService.getDirectContext(proj.id, 'project');
      assert.equal(restoredCtx.tasks.length, 1);
      assert.equal(restoredCtx.tasks[0].id, task.id);
      assert.equal(restoredCtx.goals.length, 1);
      assert.equal(restoredCtx.goals[0].id, goal.id);

      // Verify finance records survive
      const restoredAcc = await financeAccountService.getAccountById(acc.id);
      assert.ok(restoredAcc);
      assert.equal(restoredAcc.name, 'SBI Bank');
    });
  });

  // ─── 10. Complete End-to-End Scenario (Step 30) ───────────────────────────
  describe('10. End-to-End Scenario (Step 30)', () => {
    it('executes full scenario: Goal → Project → Tasks → Note → Account → Budget → Transaction → Connected Context', async () => {
      // 1. Create Goal: "Save ₹5,00,000 for Car"
      const goal = await dataService.createItem({
        type: 'goal',
        title: 'Save ₹5,00,000 for Car',
        metadata: {
          targetAmount: 500000,
          progressSource: 'financial',
        },
      });

      // 2. Create Project: "Buy Car"
      const project = await dataService.createItem({
        type: 'project',
        title: 'Buy Car',
        metadata: { status: 'active' },
      });

      // 3. Create Tasks
      const task1 = await dataService.createItem({
        type: 'task',
        title: 'Research cars',
        metadata: { status: 'done', projectId: project.id },
      });
      const task2 = await dataService.createItem({
        type: 'task',
        title: 'Compare loans',
        metadata: { status: 'in_progress', projectId: project.id },
      });
      const task3 = await dataService.createItem({
        type: 'task',
        title: 'Visit dealership',
        metadata: { status: 'todo', projectId: project.id },
      });

      // 4. Create Note: "Car comparison"
      const note = await dataService.createItem({
        type: 'note',
        title: 'Car comparison',
        content: 'Comparing electric and petrol sedans.',
        metadata: {},
      });

      // 5. Create Savings Account
      const account = await financeAccountService.createAccount({
        name: 'HDFC Savings',
        type: 'bank',
        openingBalance: 150000,
      });

      // 6. Create Budget: "Car Fund"
      const budget = await financeBudgetService.createBudget({
        name: 'Car Fund',
        target: 500000,
        period: 'monthly',
        startDate: TODAY,
      });
      await contextGraphService.link(budget.id, 'budget', project.id, 'project', 'belongs_to');

      // 7. Create Transaction: ₹50,000 savings contribution
      const transaction = await financeTransactionService.createTransaction({
        accountId: account.id,
        amount: 50000,
        type: 'income',
        date: TODAY,
        payee: 'Car Savings Contribution',
        projectId: project.id,
        goalId: goal.id,
      });

      // 8. Link transaction → goal
      await contextGraphService.link(transaction.id, 'transaction', goal.id, 'goal', 'funds');

      // 9. Link transaction → project
      await contextGraphService.link(transaction.id, 'transaction', project.id, 'project', 'belongs_to');

      // 10. Link tasks → project
      await contextGraphService.link(task1.id, 'task', project.id, 'project', 'belongs_to');
      await contextGraphService.link(task2.id, 'task', project.id, 'project', 'belongs_to');
      await contextGraphService.link(task3.id, 'task', project.id, 'project', 'belongs_to');

      // 11. Link project → goal
      await contextGraphService.link(project.id, 'project', goal.id, 'goal', 'supports');

      // 12. Link note → project
      await contextGraphService.link(note.id, 'note', project.id, 'project', 'belongs_to');

      // 13. Search: "car" returns Goal, Project, Tasks, Note, and Transaction
      const searchResult = await dataService.searchWithFinance('car');
      const itemTitles = searchResult.items.map(i => i.title);
      assert.ok(itemTitles.includes('Save ₹5,00,000 for Car'), 'Search returns Goal');
      assert.ok(itemTitles.includes('Buy Car'), 'Search returns Project');
      assert.ok(itemTitles.includes('Research cars'), 'Search returns Task');
      assert.ok(itemTitles.includes('Car comparison'), 'Search returns Note');
      assert.equal(searchResult.transactions.length, 1);
      assert.equal(searchResult.transactions[0].payee, 'Car Savings Contribution');

      // 14. Open Goal: Goal shows Project, Financial progress
      const goalProg = await contextGraphService.calculateGoalProgress(goal.id);
      assert.ok(goalProg);
      assert.equal(goalProg.current, 50000);
      assert.equal(goalProg.target, 500000);
      assert.equal(goalProg.percentage, 10);

      const goalCtx = await contextGraphService.getDirectContext(goal.id, 'goal');
      assert.equal(goalCtx.projects.length, 1);
      assert.equal(goalCtx.projects[0].id, project.id);
      assert.equal(goalCtx.transactions.length, 1);
      assert.equal(goalCtx.transactions[0].id, transaction.id);

      // 15. Open Project: Project Cockpit shows Tasks, Goal, Note, Money, and Next Actions
      const cockpit = await contextGraphService.getProjectCockpitSummary(project.id);
      assert.ok(cockpit);
      assert.equal(cockpit.tasks.length, 3);
      assert.equal(cockpit.goals.length, 1);
      assert.equal(cockpit.notes.length, 1);
      assert.equal(cockpit.transactions.length, 1);

      // Next Actions (actionable unblocked tasks)
      const nextActions = cockpit.nextActions.map(t => t.id);
      assert.ok(nextActions.includes(task2.id));
      assert.ok(nextActions.includes(task3.id));
      assert.equal(nextActions.includes(task1.id), false, 'Completed task 1 is not a next action');
    });
  });
});
