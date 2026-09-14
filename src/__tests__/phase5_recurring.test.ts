/**
 * Phase 5 — Deterministic Recurring Finance & Tasks Test Suite
 *
 * Tests:
 * 1. Stable recurrence identities for occurrences
 * 2. Planned payment reminders without silent auto-debits
 * 3. End-to-End Scenario 44: Netflix monthly recurrence (September -> October without duplicates)
 * 4. Parity with task recurrence principles (no duplicate generation on re-execution)
 */

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

import { clearAllData } from '@/lib/db/localDb';
import { financeAccountService } from '@/lib/services/finance/FinanceAccountService';
import { financePlannedService } from '@/lib/services/finance/FinancePlannedService';
import { financeTransactionService } from '@/lib/services/finance/FinanceTransactionService';
import { dataService } from '@/lib/services/DataService';
import { TaskMetadata, TaskRecurrence } from '@/types';

describe('Phase 5 — Deterministic Recurring Engine', () => {

  beforeEach(async () => {
    await clearAllData();
  });

  describe('1. Stable Recurrence Identities & Reminders', () => {
    it('generates stable recurrence identity for planned occurrences', () => {
      const id = financePlannedService.generateOccurrenceId('rent_101', '2026-09-01T00:00:00.000Z');
      assert.equal(id, 'rec_rent_101_2026-09-01');

      const id2 = financePlannedService.generateOccurrenceId('rent_101', '2026-09-01');
      assert.equal(id, id2, 'Same payment and date must generate identical recurrence id');
    });

    it('generates upcoming reminder without silently creating transaction when autoCreate is false', async () => {
      const account = await financeAccountService.createAccount({
        name: 'Main Bank',
        type: 'bank',
        openingBalance: 50000,
      });

      // Planned payment due in 3 days
      const refDate = new Date(2026, 8, 14); // Sep 14, 2026
      const dueDateStr = '2026-09-17';

      const planned = await financePlannedService.createPlannedPayment({
        name: 'House Rent',
        amount: 25000,
        accountId: account.id,
        dueDate: dueDateStr,
        recurrence: { frequency: 'monthly' },
        autoCreate: false, // Default
        reminderDays: 5,
      });

      // Run recurrence engine on Sep 14
      const result = await financePlannedService.processRecurrenceEngine(refDate);

      // Should NOT create real transaction
      assert.equal(result.generatedTransactions.length, 0, 'Must NOT create transaction silently without autoCreate');
      assert.equal(result.upcomingReminders.length, 1);
      assert.equal(result.upcomingReminders[0].payment.id, planned.id);
      assert.equal(result.upcomingReminders[0].daysRemaining, 3);

      const allTxns = await financeTransactionService.getAllTransactions();
      assert.equal(allTxns.length, 0, 'No expense recorded until user confirms');
    });
  });

  describe('2. End-to-End Scenario 44: Recurring Netflix (Sep -> Oct without duplicates)', () => {
    it('generates September occurrence once, prevents duplicate on rerun, and advances to October', async () => {
      const account = await financeAccountService.createAccount({
        name: 'HDFC Bank',
        type: 'bank',
        openingBalance: 10000,
      });

      // Create recurring Netflix: ₹699 Monthly, due Sep 15, 2026, autoCreate: true
      const netflix = await financePlannedService.createPlannedPayment({
        name: 'Netflix Subscription',
        amount: 699,
        accountId: account.id,
        dueDate: '2026-09-15',
        recurrence: { frequency: 'monthly', interval: 1 },
        autoCreate: true,
      });

      // 1. Run recurrence engine on September 15, 2026
      const sep15 = new Date(2026, 8, 15);
      const run1 = await financePlannedService.processRecurrenceEngine(sep15);

      assert.equal(run1.generatedTransactions.length, 1, 'Should generate September occurrence');
      assert.equal(run1.generatedTransactions[0].amount, 699);
      assert.equal(run1.generatedTransactions[0].date, '2026-09-15');
      assert.equal(run1.generatedTransactions[0].sourceReference, 'rec_' + netflix.id + '_2026-09-15');

      // Verify payment due date advanced to October 15, 2026
      const updatedNetflix = await financePlannedService.getPlannedPaymentById(netflix.id);
      assert.ok(updatedNetflix);
      assert.equal(updatedNetflix.dueDate, '2026-10-15', 'Due date should advance to October 15');

      // 2. Run recurrence engine again on September 16, 2026 (same period)
      const sep16 = new Date(2026, 8, 16);
      const run2 = await financePlannedService.processRecurrenceEngine(sep16);

      // Verify: NO duplicate September occurrence
      assert.equal(run2.generatedTransactions.length, 0, 'Must NOT generate duplicate September occurrence');
      const allTxnsAfterRun2 = await financeTransactionService.getAllTransactions();
      assert.equal(allTxnsAfterRun2.length, 1, 'Total transactions must still be exactly 1');

      // 3. Advance to October 15, 2026
      const oct15 = new Date(2026, 9, 15);
      const run3 = await financePlannedService.processRecurrenceEngine(oct15);

      // Verify: October occurrence generated exactly once
      assert.equal(run3.generatedTransactions.length, 1, 'Should generate October occurrence');
      assert.equal(run3.generatedTransactions[0].date, '2026-10-15');
      assert.equal(run3.generatedTransactions[0].amount, 699);

      const allTxnsAfterRun3 = await financeTransactionService.getAllTransactions();
      assert.equal(allTxnsAfterRun3.length, 2, 'Total transactions should now be exactly 2 (Sep and Oct)');

      // Verify payment advanced to November
      const novNetflix = await financePlannedService.getPlannedPaymentById(netflix.id);
      assert.equal(novNetflix?.dueDate, '2026-11-15');
    });

    it('confirmPayment is idempotent and returns existing transaction if called twice for same occurrence', async () => {
      const account = await financeAccountService.createAccount({
        name: 'Manual Account',
        type: 'bank',
        openingBalance: 20000,
      });

      const payment = await financePlannedService.createPlannedPayment({
        name: 'Gym Membership',
        amount: 1500,
        accountId: account.id,
        dueDate: '2026-09-10',
        recurrence: { frequency: 'monthly' },
        autoCreate: false,
      });

      // First confirmation for September occurrence
      const txn1 = await financePlannedService.confirmPayment(payment.id, { date: '2026-09-10' });
      assert.ok(txn1);
      assert.equal(txn1.amount, 1500);

      // Second confirmation attempt for same September occurrence
      const txn2 = await financePlannedService.confirmPayment(payment.id, { date: '2026-09-10' });
      assert.ok(txn2);
      assert.equal(txn2.id, txn1.id, 'Must return same transaction');

      const allTxns = await financeTransactionService.getAllTransactions();
      assert.equal(allTxns.length, 1, 'Second confirmation must not create a duplicate transaction');
    });
  });

  describe('3. Task Recurrence Parity', () => {
    it('ensures recurring tasks follow the same duplicate-prevention principles', async () => {
      const task = await dataService.createItem({
        type: 'task',
        title: 'Weekly Team Review',
        metadata: {
          status: 'todo',
          dueDate: '2026-09-15T00:00:00.000Z',
          recurrence: { frequency: 'weekly', interval: 1 } as TaskRecurrence,
        } as TaskMetadata,
      });

      // Complete current occurrence
      await dataService.completeTask(task.id);

      // Next task should be created
      const allTasks = await dataService.getItemsByType('task');
      const nextTasks = allTasks.filter(t => t.title === 'Weekly Team Review' && (t.metadata as TaskMetadata).status === 'todo');
      assert.equal(nextTasks.length, 1);

      // Completing the already-completed task again does not create a 3rd task
      await dataService.completeTask(task.id);
      const afterSecondCall = await dataService.getItemsByType('task');
      const matchingTasks = afterSecondCall.filter(t => t.title === 'Weekly Team Review');
      assert.equal(matchingTasks.length, 2, 'Must not create duplicate occurrences');
    });
  });
});
