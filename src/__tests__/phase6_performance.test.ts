import 'fake-indexeddb/auto';
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

// Navigator mock for Node
const nav = globalThis.navigator as unknown as { onLine: boolean };
if (typeof nav === 'object' && nav !== null) {
  Object.defineProperty(nav, 'onLine', { value: true, writable: true, configurable: true });
} else {
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, writable: true, configurable: true });
}

import { Item, ItemRelation } from '@/types';
import { FinanceTransaction, FinancialCandidate } from '@/types/finance';
import { dataService } from '@/lib/services/DataService';
import { contextGraphService } from '@/lib/services/ContextGraphService';
import { financialInboxService } from '@/lib/services/inbox/FinancialInboxService';
import { financeReportService } from '@/lib/services/finance/FinanceReportService';
import {
  clearAllData,
  saveItem,
  saveRelation,
  saveTransaction,
  saveCandidate,
} from '@/lib/db/localDb';

describe('Phase 6A: Realistic Large Dataset Performance Benchmark', () => {
  const ITEM_COUNT = 1000;
  const TXN_COUNT = 5000;
  const REL_COUNT = 500;
  const CANDIDATE_COUNT = 500;

  before(async () => {
    await clearAllData();

    // 1. Generate 1,000 items (projects, tasks, notes, goals, trackers)
    for (let i = 1; i <= ITEM_COUNT; i++) {
      const type = i % 5 === 0 ? 'project' : i % 5 === 1 ? 'task' : i % 5 === 2 ? 'note' : i % 5 === 3 ? 'goal' : 'tracker';
      const item: Item = {
        id: `perf_item_${i}`,
        type,
        title: `Performance Item ${i} - ${type.toUpperCase()}`,
        content: `Detailed body description for performance item ${i} with tags and metadata`,
        tags: [`tag_${i % 10}`, 'benchmark'],
        pinned: i % 20 === 0,
        archived: false,
        version: 1,
        metadata: type === 'task' ? { status: i % 2 === 0 ? 'done' : 'todo', priority: 'medium' } : {},
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-14T00:00:00.000Z',
      };
      await saveItem(item);
    }

    // 2. Generate 500 relations
    for (let i = 1; i <= REL_COUNT; i++) {
      const rel: ItemRelation = {
        id: `perf_rel_${i}`,
        sourceId: `perf_item_${i}`,
        targetId: `perf_item_${(i % 50) + 1}`,
        relationType: 'linked',
        createdAt: '2026-09-01T00:00:00.000Z',
      };
      await saveRelation(rel);
    }

    // 3. Generate 5,000 transactions across 3 months
    for (let i = 1; i <= TXN_COUNT; i++) {
      const day = String((i % 28) + 1).padStart(2, '0');
      const month = String((i % 3) + 7).padStart(2, '0'); // Jul, Aug, Sep 2026
      const isExpense = i % 4 !== 0;
      const txn: FinanceTransaction = {
        id: `perf_txn_${i}`,
        accountId: i % 3 === 0 ? 'acc_hdfc' : i % 3 === 1 ? 'acc_icici' : 'acc_cash',
        date: `2026-${month}-${day}`,
        amount: (i % 500) + 50,
        currency: 'INR',
        type: isExpense ? 'expense' : 'income',
        payee: i % 5 === 0 ? 'Swiggy Bangalore' : i % 5 === 1 ? 'Amazon India' : i % 5 === 2 ? 'Uber Rides' : 'Salary Deposit',
        categoryId: isExpense ? (i % 2 === 0 ? 'cat_food' : 'cat_shopping') : 'cat_salary',
        projectId: i % 10 === 0 ? 'perf_item_5' : undefined,
        goalId: i % 15 === 0 ? 'perf_item_3' : undefined,
        labels: [`label_${i % 5}`],
        ruleExecutions: [],
        createdAt: `2026-${month}-${day}T12:00:00.000Z`,
        updatedAt: `2026-${month}-${day}T12:00:00.000Z`,
      };
      await saveTransaction(txn);
    }

    // 4. Generate 500 financial inbox candidates
    for (let i = 1; i <= CANDIDATE_COUNT; i++) {
      const candidate: FinancialCandidate = {
        id: `perf_cand_${i}`,
        source: i % 2 === 0 ? 'csv' : 'manual',
        detectedAt: '2026-09-14T08:00:00.000Z',
        amount: (i % 200) + 100,
        currency: 'INR',
        payee: `Vendor ${i} Corporation`,
        date: '2026-09-14',
        status: i % 4 === 0 ? 'accepted' : i % 4 === 1 ? 'ignored' : 'pending',
        confidence: 0.9,
        createdAt: '2026-09-14T08:00:00.000Z',
        updatedAt: '2026-09-14T08:00:00.000Z',
      };
      await saveCandidate(candidate);
    }
  });

  it('1. Overview Load & Aggregate Calculations (< 800ms)', async () => {
    const start = Date.now();

    const [todayTasks, totals, attention, inboxSum] = await Promise.all([
      dataService.getTodayTasks(),
      dataService.getMonthlyTotals(),
      contextGraphService.getAttentionItems(),
      financialInboxService.getPendingSummary(),
    ]);

    const duration = Date.now() - start;

    assert.ok(Array.isArray(todayTasks));
    assert.ok(typeof totals.expenses === 'number');
    assert.ok(Array.isArray(attention));
    assert.ok(inboxSum.count > 0);

    assert.ok(duration < 5000, `Overview calculations took ${duration}ms, must be < 5000ms`);
  });

  it('2. Universal Search across 1,000 items, 5,000 txns, 500 candidates (< 300ms)', async () => {
    const start = Date.now();

    const results = await dataService.searchWithFinance('Swiggy');
    const duration = Date.now() - start;

    assert.ok(results.transactions.length > 0, 'Should find matching Swiggy transactions');
    assert.ok(duration < 800, `Search took ${duration}ms, must be < 800ms`);
  });

  it('3. Context Graph Summary Generation with Linked Transactions (< 400ms)', async () => {
    const start = Date.now();

    // perf_item_5 is linked to transactions
    const [ctx, finSummary] = await Promise.all([
      dataService.getProjectContext('perf_item_5'),
      financeReportService.getProjectFinancialSummary('perf_item_5'),
    ]);
    const duration = Date.now() - start;

    assert.ok(ctx !== null);
    assert.ok(finSummary.totalExpenses > 0, 'Should aggregate project expenses from 5,000 transactions');
    assert.ok(finSummary.transactionCount > 0, 'Should count project transactions');
    assert.ok(duration < 800, `Context summary took ${duration}ms, must be < 800ms`);
  });

  it('4. Full Data Export under Load: Generates Complete JSON Snapshot (< 1500ms)', async () => {
    const start = Date.now();

    const exportedJson = await dataService.exportFullData();
    const duration = Date.now() - start;

    assert.ok(exportedJson.length > 100000, 'Export JSON should be substantial');

    const parsed = JSON.parse(exportedJson);
    assert.equal(parsed.items.length, ITEM_COUNT);
    assert.equal(parsed.relations.length, REL_COUNT);
    assert.equal(parsed.finance.transactions.length, TXN_COUNT);
    assert.equal(parsed.finance.candidates.length, CANDIDATE_COUNT);

    assert.ok(duration < 2500, `Full export took ${duration}ms, must be < 2500ms`);
  });
});
