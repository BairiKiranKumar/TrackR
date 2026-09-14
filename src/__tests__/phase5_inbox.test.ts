/**
 * Phase 5 — Financial Inbox Test Suite
 *
 * Tests:
 * 1. Candidate lifecycle (pending -> accepted/rejected/ignored)
 * 2. Rule suggestions with explainability
 * 3. Duplicate detection and resolution
 * 4. Batch acceptance
 * 5. CSV import routing ambiguous rows to inbox
 * 6. Offline sync conflict resolution (accepted > ignored > rejected > pending)
 * 7. End-to-End Scenario 42: Account -> Budget -> Rule -> Candidate -> Accept -> Update -> Search -> Export/Wipe/Import
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
import { financeTransactionService } from '@/lib/services/finance/FinanceTransactionService';
import { financeBudgetService } from '@/lib/services/finance/FinanceBudgetService';
import { financeCsvService } from '@/lib/services/finance/FinanceCsvService';
import { automationEngine } from '@/lib/services/automation/AutomationEngine';
import { financialInboxService } from '@/lib/services/inbox/FinancialInboxService';
import { dataService } from '@/lib/services/DataService';

describe('Phase 5 — Financial Inbox Architecture & Review Queue', () => {

  beforeEach(async () => {
    await clearAllData();
  });

  describe('1. Candidate Lifecycle & Rule Suggestions', () => {
    it('creates a candidate and applies deterministic rule suggestion with explanation', async () => {
      const account = await financeAccountService.createAccount({
        name: 'Checking Account',
        type: 'bank',
        openingBalance: 20000,
      });

      // Create a deterministic categorization rule
      await automationEngine.createRule({
        name: 'Swiggy -> Food Delivery',
        trigger: 'transaction_created',
        priority: 20,
        conditions: [{ field: 'payee', operator: 'contains', value: 'swiggy' }],
        actions: [
          { type: 'assign_category', value: 'cat_food_delivery' },
          { type: 'add_label', value: 'food' },
        ],
      });

      // Create a candidate from external source (e.g. Swiggy order)
      const candidate = await financialInboxService.createCandidate({
        source: 'manual',
        amount: 545,
        currency: 'INR',
        payee: 'SWIGGY ORDER #891',
        date: '2026-09-14',
        suggestedAccount: account.id,
      });

      assert.equal(candidate.status, 'pending');
      assert.equal(candidate.suggestedCategory, 'cat_food_delivery', 'Rule should suggest Food Delivery category');
      assert.ok(candidate.suggestedLabels?.includes('food'));
      assert.ok(candidate.reason?.includes('Swiggy -> Food Delivery'), 'Reason must explain rule match');
    });

    it('accepts candidate, creates real transaction, and updates candidate status to accepted', async () => {
      const account = await financeAccountService.createAccount({
        name: 'HDFC Bank',
        type: 'bank',
        openingBalance: 15000,
      });

      const candidate = await financialInboxService.createCandidate({
        source: 'manual',
        amount: 1299,
        currency: 'INR',
        payee: 'Amazon India',
        date: '2026-09-14',
        suggestedAccount: account.id,
        suggestedCategory: 'cat_shopping',
      });

      const res = await financialInboxService.acceptCandidate(candidate.id);
      assert.ok(res);
      assert.equal(res.candidate.status, 'accepted');
      assert.ok(res.candidate.transactionId);

      // Verify real transaction was created
      const txn = await financeTransactionService.getTransactionById(res.candidate.transactionId);
      assert.ok(txn);
      assert.equal(txn.amount, 1299);
      assert.equal(txn.payee, 'Amazon India');
      assert.equal(txn.source, 'financial_inbox');
      assert.equal(txn.sourceReference, candidate.id);
    });

    it('rejects or ignores candidate cleanly without creating transaction', async () => {
      const candidate = await financialInboxService.createCandidate({
        source: 'manual',
        amount: 150,
        currency: 'INR',
        payee: 'Spam / Promo',
        date: '2026-09-14',
      });

      const rejected = await financialInboxService.rejectCandidate(candidate.id, 'Spam');
      assert.equal(rejected?.status, 'rejected');

      const allTxns = await financeTransactionService.getAllTransactions();
      assert.equal(allTxns.length, 0);

      // Verify it no longer appears in pending candidates
      const pending = await financialInboxService.getPendingCandidates();
      assert.equal(pending.length, 0);
    });
  });

  describe('2. Batch Review & Duplicate Detection', () => {
    it('detects duplicate against existing transaction and allows resolution', async () => {
      const account = await financeAccountService.createAccount({
        name: 'Card Account',
        type: 'credit_card',
        openingBalance: 0,
      });

      // Existing transaction
      const existingTxn = await financeTransactionService.createTransaction({
        accountId: account.id,
        date: '2026-09-12',
        amount: 2500,
        payee: 'Amazon',
        type: 'expense',
      });

      // New candidate arrives with same account, amount, and date
      const candidate = await financialInboxService.createCandidate({
        source: 'csv',
        amount: 2500,
        currency: 'INR',
        payee: 'AMAZON INDIA',
        date: '2026-09-12',
        suggestedAccount: account.id,
      });

      assert.equal(candidate.duplicateOf, existingTxn.id);
      assert.ok(candidate.reason?.includes('duplicate'));

      // User chooses to keep both
      const resolveRes = await financialInboxService.resolveDuplicate(candidate.id, 'keep_both');
      assert.equal(resolveRes.status, 'accepted');

      const allTxns = await financeTransactionService.getAllTransactions();
      assert.equal(allTxns.length, 2, 'Both transactions should now exist');
    });

    it('batch accepts multiple candidates and returns total summary', async () => {
      const account = await financeAccountService.createAccount({
        name: 'Batch Account',
        type: 'bank',
        openingBalance: 50000,
      });

      const c1 = await financialInboxService.createCandidate({
        source: 'manual',
        amount: 500,
        currency: 'INR',
        payee: 'Vendor A',
        date: '2026-09-14',
        suggestedAccount: account.id,
      });
      const c2 = await financialInboxService.createCandidate({
        source: 'manual',
        amount: 1500,
        currency: 'INR',
        payee: 'Vendor B',
        date: '2026-09-14',
        suggestedAccount: account.id,
      });

      const batchRes = await financialInboxService.batchAccept([c1.id, c2.id]);
      assert.equal(batchRes.acceptedCount, 2);
      assert.equal(batchRes.totalAmount, 2000);

      const pending = await financialInboxService.getPendingCandidates();
      assert.equal(pending.length, 0);
    });

    it('routes ambiguous CSV rows to Financial Inbox when option enabled', async () => {
      const account = await financeAccountService.createAccount({
        name: 'CSV Account',
        type: 'bank',
        openingBalance: 10000,
      });

      // Existing transaction
      await financeTransactionService.createTransaction({
        accountId: account.id,
        date: '2026-09-10',
        amount: 1000,
        payee: 'Utility Bill',
        type: 'expense',
      });

      // CSV with 2 rows: 1 fresh row, 1 duplicate row
      const csv = `Date,Payee,Amount
2026-09-10,Utility Bill,1000
2026-09-11,Fresh Purchase,450`;

      const parsed = financeCsvService.previewCsvRows(csv, {
        date: 'Date',
        payee: 'Payee',
        amount: 'Amount',
      });
      const withDupes = await financeCsvService.checkDuplicates(parsed, account.id);

      const result = await financeCsvService.importRows(withDupes, account.id, {
        skipDuplicates: true,
        routeAmbiguousToInbox: true,
      });

      assert.equal(result.imported, 1, '1 fresh row imported directly');
      assert.equal(result.duplicatesFound, 1, '1 duplicate detected');

      // Verify the duplicate row entered the Financial Inbox
      const inboxItems = await financialInboxService.getPendingCandidates();
      assert.equal(inboxItems.length, 1);
      assert.equal(inboxItems[0].payee, 'Utility Bill');
      assert.equal(inboxItems[0].amount, 1000);
      assert.equal(inboxItems[0].source, 'csv');
    });
  });

  describe('3. Offline Sync Conflict Resolution', () => {
    it('enforces deterministic state precedence: accepted > ignored > rejected > pending', () => {
      const base = {
        id: 'cand_sync_1',
        source: 'manual' as const,
        detectedAt: '2026-09-14T00:00:00.000Z',
        amount: 500,
        currency: 'INR',
        payee: 'Sync Test',
        date: '2026-09-14',
        status: 'pending' as const,
        createdAt: '2026-09-14T00:00:00.000Z',
        updatedAt: '2026-09-14T00:00:00.000Z',
      };

      const accepted = { ...base, status: 'accepted' as const, updatedAt: '2026-09-14T01:00:00.000Z' };
      const ignored = { ...base, status: 'ignored' as const, updatedAt: '2026-09-14T02:00:00.000Z' };

      // Client A accepted, Client B ignored: accepted must win even if ignored has later timestamp
      const winner1 = financialInboxService.resolveSyncConflict(accepted, ignored);
      assert.equal(winner1.status, 'accepted');

      const winner2 = financialInboxService.resolveSyncConflict(ignored, accepted);
      assert.equal(winner2.status, 'accepted');
    });
  });

  describe('4. End-to-End Scenario 42', () => {
    it('executes full Scenario 42: Account -> Budget -> Rule -> Candidate -> Accept -> Budget Update -> Search -> Export/Wipe/Import', async () => {
      // 1. Create Account
      const account = await financeAccountService.createAccount({
        name: 'Primary Account',
        type: 'bank',
        openingBalance: 50000,
      });

      // 2. Create Food budget: ₹15,000 monthly
      const budget = await financeBudgetService.createBudget({
        name: 'Food & Dining',
        target: 15000,
        period: 'monthly',
        startDate: '2026-09-01',
        categoryId: 'cat_food_delivery',
      });

      // 3. Create rule: Swiggy -> Food / Delivery
      await automationEngine.createRule({
        name: 'Swiggy -> Food',
        trigger: 'transaction_created',
        priority: 25,
        conditions: [{ field: 'payee', operator: 'contains', value: 'swiggy' }],
        actions: [
          { type: 'assign_category', value: 'cat_food_delivery' },
          { type: 'add_label', value: 'food' },
        ],
      });

      // 4. Create Financial Inbox candidate: ₹545 Swiggy
      const candidate = await financialInboxService.createCandidate({
        source: 'manual',
        amount: 545,
        currency: 'INR',
        payee: 'SWIGGY ORDER #9081',
        date: '2026-09-14',
        suggestedAccount: account.id,
      });

      // 5. Rule suggests Food / Delivery
      assert.equal(candidate.suggestedCategory, 'cat_food_delivery');
      assert.ok(candidate.reason?.includes('Swiggy -> Food'));

      // 6. User accepts candidate
      const acceptRes = await financialInboxService.acceptCandidate(candidate.id);
      assert.ok(acceptRes);
      assert.equal(acceptRes.candidate.status, 'accepted');

      // 7. Transaction created
      const txn = acceptRes.transaction;
      assert.equal(txn.amount, 545);
      assert.equal(txn.categoryId, 'cat_food_delivery');

      // 8. Budget updates
      const budgetProg = await financeBudgetService.getBudgetProgress(budget.id, new Date(2026, 8, 14));
      assert.ok(budgetProg);
      assert.equal(budgetProg.spent, 545);
      assert.equal(budgetProg.remaining, 14455);

      // 9. Search "Swiggy" finds transaction
      const searchRes = await dataService.searchWithFinance('Swiggy');
      const foundTxn = searchRes.transactions.find(t => t.payee?.includes('SWIGGY'));
      assert.ok(foundTxn);

      // 10. Export, Wipe, and Import roundtrip
      const exportedJson = await dataService.exportFullData();
      assert.ok(exportedJson.length > 50);

      // Wipe all data
      await clearAllData();

      // Verify empty after wipe
      const emptyTxns = await financeTransactionService.getAllTransactions();
      assert.equal(emptyTxns.length, 0);

      // Import restored data
      const importRes = await dataService.importFullData(exportedJson);
      assert.ok(importRes.success);

      // Verify transaction restored
      const restoredTxns = await financeTransactionService.getAllTransactions();
      assert.equal(restoredTxns.length, 1);
      assert.equal(restoredTxns[0].amount, 545);
      assert.equal(restoredTxns[0].categoryId, 'cat_food_delivery');
    });
  });
});
