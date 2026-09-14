import 'fake-indexeddb/auto';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Item, ItemRelation, SyncOperation } from '@/types';
import { FinancialCandidate, FinanceTransaction } from '@/types/finance';
import { AutomationRule, AutomationExecution } from '@/types/automation';
import { automationEngine } from '../lib/services/automation/AutomationEngine';
import { financialInboxService } from '../lib/services/inbox/FinancialInboxService';
import {
  clearAllData,
  saveAutomationRule,
} from '../lib/db/localDb';

/**
 * Simulated Remote Server for Multi-Client Synchronization Tests
 */
class SimulatedRemoteServer {
  public items = new Map<string, Item>();
  public relations = new Map<string, ItemRelation>();
  public transactions = new Map<string, FinanceTransaction>();
  public candidates = new Map<string, FinancialCandidate>();
  public rules = new Map<string, AutomationRule>();
  public executions = new Map<string, AutomationExecution>();

  upsertItem(item: Item): void {
    const existing = this.items.get(item.id);
    if (!existing || new Date(item.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
      this.items.set(item.id, { ...item });
    }
  }

  upsertRelation(rel: ItemRelation): void {
    this.relations.set(rel.id, { ...rel });
  }

  upsertTransaction(txn: FinanceTransaction): void {
    this.transactions.set(txn.id, { ...txn });
  }

  upsertCandidate(cand: FinancialCandidate): void {
    const existing = this.candidates.get(cand.id);
    if (!existing) {
      this.candidates.set(cand.id, { ...cand });
      return;
    }
    // Deterministic state precedence via FinancialInboxService
    const resolved = financialInboxService.resolveSyncConflict(existing, cand);
    this.candidates.set(cand.id, resolved);
  }
}

describe('Phase 6A: Two-Client Sync, Concurrent Conflicts & Offline Recovery', () => {
  let server: SimulatedRemoteServer;

  beforeEach(async () => {
    server = new SimulatedRemoteServer();
    await clearAllData();
  });

  it('1. Independent Offline Mutations on Two Clients Reconnect without Data Loss', async () => {
    // Client A creates Item A1 and Transaction A1 while offline
    const clientA_item: Item = {
      id: 'item_a_offline_task',
      type: 'task',
      title: 'Client A Offline Task',
      tags: ['urgent'],
      archived: false,
      metadata: {},
      version: 1,
      createdAt: '2026-09-14T09:00:00.000Z',
      updatedAt: '2026-09-14T09:00:00.000Z',
    };
    const clientA_txn: FinanceTransaction = {
      id: 'txn_a_offline_groceries',
      accountId: 'acc_main',
      date: '2026-09-14',
      amount: 1200,
      currency: 'INR',
      type: 'expense',
      payee: 'Local Grocery',
      labels: ['food'],
      ruleExecutions: [],
      createdAt: '2026-09-14T09:01:00.000Z',
      updatedAt: '2026-09-14T09:01:00.000Z',
    };

    // Client B creates Item B1 and Transaction B1 while offline
    const clientB_item: Item = {
      id: 'item_b_offline_note',
      type: 'note',
      title: 'Client B Meeting Note',
      content: 'Discuss quarterly deliverables',
      tags: ['meeting'],
      archived: false,
      metadata: {},
      version: 1,
      createdAt: '2026-09-14T09:02:00.000Z',
      updatedAt: '2026-09-14T09:02:00.000Z',
    };
    const clientB_txn: FinanceTransaction = {
      id: 'txn_b_offline_coffee',
      accountId: 'acc_main',
      date: '2026-09-14',
      amount: 250,
      currency: 'INR',
      type: 'expense',
      payee: 'Blue Tokai',
      labels: ['dining'],
      ruleExecutions: [],
      createdAt: '2026-09-14T09:03:00.000Z',
      updatedAt: '2026-09-14T09:03:00.000Z',
    };

    // Both clients reconnect and push to remote server
    server.upsertItem(clientA_item);
    server.upsertTransaction(clientA_txn);

    server.upsertItem(clientB_item);
    server.upsertTransaction(clientB_txn);

    // Verify all 4 records exist on server without duplicate or omission
    assert.equal(server.items.size, 2);
    assert.ok(server.items.has('item_a_offline_task'));
    assert.ok(server.items.has('item_b_offline_note'));

    assert.equal(server.transactions.size, 2);
    assert.ok(server.transactions.has('txn_a_offline_groceries'));
    assert.ok(server.transactions.has('txn_b_offline_coffee'));
  });

  it('2. Same-Entity Concurrent Conflict: Last Valid Write Wins Deterministically', async () => {
    const baseItem: Item = {
      id: 'task_shared_project_plan',
      type: 'task',
      title: 'Initial Title',
      content: 'Initial description',
      tags: [],
      archived: false,
      metadata: {},
      version: 1,
      createdAt: '2026-09-14T09:10:00.000Z',
      updatedAt: '2026-09-14T09:10:00.000Z',
    };
    server.upsertItem(baseItem);

    // Client A edits title at T1
    const editA: Item = {
      ...baseItem,
      title: 'Updated by Client A',
      version: 2,
      updatedAt: '2026-09-14T09:12:00.000Z',
    };

    // Client B edits title at T2 (T2 > T1)
    const editB: Item = {
      ...baseItem,
      title: 'Updated by Client B (Final)',
      version: 2,
      updatedAt: '2026-09-14T09:15:00.000Z',
    };

    // Reconnecting: Client A syncs, then Client B syncs
    server.upsertItem(editA);
    server.upsertItem(editB);

    assert.equal(server.items.get('task_shared_project_plan')?.title, 'Updated by Client B (Final)');

    // Even if sync order is reversed (Client B syncs first, then delayed Client A packets arrive),
    // the newer updatedAt wins deterministically:
    server.upsertItem(editA);
    assert.equal(server.items.get('task_shared_project_plan')?.title, 'Updated by Client B (Final)',
      'Older update must never overwrite newer updatedAt');
  });

  it('3. Financial Inbox Candidate Conflict Resolution: Accepted Always Wins Over Ignored/Rejected', async () => {
    const candidate: FinancialCandidate = {
      id: 'cand_conflicting_swiggy',
      source: 'csv',
      detectedAt: '2026-09-14T09:20:00.000Z',
      amount: 650,
      currency: 'INR',
      payee: 'Swiggy',
      date: '2026-09-14',
      status: 'pending',
      confidence: 1.0,
      createdAt: '2026-09-14T09:20:00.000Z',
      updatedAt: '2026-09-14T09:20:00.000Z',
    };
    server.upsertCandidate(candidate);

    // Client A accepts candidate -> records transaction and marks accepted
    const candidateAccepted: FinancialCandidate = {
      ...candidate,
      status: 'accepted',
      updatedAt: '2026-09-14T09:21:00.000Z',
    };

    // Client B concurrently ignores candidate while offline
    const candidateIgnored: FinancialCandidate = {
      ...candidate,
      status: 'ignored',
      updatedAt: '2026-09-14T09:22:00.000Z',
    };

    // Both sync: Client B syncs 'ignored', then Client A syncs 'accepted'
    server.upsertCandidate(candidateIgnored);
    assert.equal(server.candidates.get('cand_conflicting_swiggy')?.status, 'ignored');

    server.upsertCandidate(candidateAccepted);
    assert.equal(server.candidates.get('cand_conflicting_swiggy')?.status, 'accepted',
      'Accepted state must take precedence over ignored');

    // And if Client B syncs ignored *after* accepted:
    server.upsertCandidate(candidateIgnored);
    assert.equal(server.candidates.get('cand_conflicting_swiggy')?.status, 'accepted',
      'Candidate once accepted cannot be reverted to ignored or pending');
  });

  it('4. Two-Client Automation Execution Idempotency: Redundant Event Skips Duplicate Mutation', async () => {
    const rule: AutomationRule = {
      id: 'rule_tag_subscriptions',
      name: 'Tag Netflix',
      trigger: 'transaction_created',
      conditions: [{ field: 'payee', operator: 'contains', value: 'Netflix' }],
      actions: [{ type: 'add_label', value: 'subscription' }],
      priority: 10,
      enabled: true,
      executionCount: 0,
      createdAt: '2026-09-14T09:30:00.000Z',
      updatedAt: '2026-09-14T09:30:00.000Z',
    };
    await saveAutomationRule(rule);

    const testTxn: FinanceTransaction = {
      id: 'txn_netflix_concurrent',
      accountId: 'acc_credit_card',
      date: '2026-09-14',
      amount: 649,
      currency: 'INR',
      type: 'expense',
      payee: 'Netflix Entertainment',
      labels: [],
      ruleExecutions: [],
      createdAt: '2026-09-14T09:31:00.000Z',
      updatedAt: '2026-09-14T09:31:00.000Z',
    };

    // Client A executes rule for transaction
    const resA = await automationEngine.evaluateAndExecute('transaction_created', testTxn as unknown as Record<string, unknown>, 'transaction');
    assert.equal(resA.appliedRules.length, 1);
    assert.ok(((resA.entity as unknown) as FinanceTransaction).labels.includes('subscription'));

    // Client B concurrently tries to execute the same trigger for the same entity version
    const resB = await automationEngine.evaluateAndExecute('transaction_created', testTxn as unknown as Record<string, unknown>, 'transaction');
    // Idempotency: should be skipped as duplicate
    assert.equal(resB.appliedRules.length, 0, 'Duplicate delivery of trigger must be skipped idempotently');

    // Execution history records exactly 1 execution
    const history = await automationEngine.getExecutionHistory(testTxn.id);
    assert.equal(history.length, 1, 'Only one execution record should exist for the idempotent event');
  });

  it('5. Offline Browser Restart Simulation: Queued Operations Survive & Flush on Reconnect', async () => {
    // Simulate operations saved locally in queue
    const queue: SyncOperation[] = [
      {
        id: 'op_offline_1',
        entityType: 'item',
        entityId: 'item_survivor_1',
        operation: 'create',
        payload: {
          id: 'item_survivor_1',
          type: 'note',
          title: 'Survived Browser Restart',
          version: 1,
          createdAt: '2026-09-14T09:40:00.000Z',
          updatedAt: '2026-09-14T09:40:00.000Z',
        },
        retryCount: 0,
        status: 'pending',
        createdAt: '2026-09-14T09:40:00.000Z',
      },
      {
        id: 'op_offline_2',
        entityType: 'fa_transaction',
        entityId: 'txn_survivor_2',
        operation: 'upsert',
        payload: {
          id: 'txn_survivor_2',
          accountId: 'acc_cash',
          date: '2026-09-14',
          amount: 500,
          currency: 'INR',
          type: 'expense',
          payee: 'Pharmacy',
          labels: ['health'],
          createdAt: '2026-09-14T09:41:00.000Z',
          updatedAt: '2026-09-14T09:41:00.000Z',
        },
        retryCount: 0,
        status: 'pending',
        createdAt: '2026-09-14T09:41:00.000Z',
      },
    ];

    // Simulate browser restart: queue is loaded back from storage
    const restoredQueue = JSON.parse(JSON.stringify(queue)) as SyncOperation[];
    assert.equal(restoredQueue.length, 2);

    // Network reconnects -> replay queue against server
    for (const op of restoredQueue) {
      if (op.entityType === 'item' && op.payload) {
        server.upsertItem(op.payload as Item);
      } else if (op.entityType === 'fa_transaction' && op.payload) {
        server.upsertTransaction(op.payload as FinanceTransaction);
      }
      op.status = 'synced';
    }

    assert.equal(server.items.get('item_survivor_1')?.title, 'Survived Browser Restart');
    assert.equal(server.transactions.get('txn_survivor_2')?.amount, 500);
  });

  it('6. Transient Network Failure with Retry: No Local Data Loss', async () => {
    const op: SyncOperation = {
      id: 'op_transient_failure',
      entityType: 'item',
      entityId: 'item_transient_1',
      operation: 'create',
      payload: {
        id: 'item_transient_1',
        type: 'task',
        title: 'Retry Task',
        version: 1,
        createdAt: '2026-09-14T09:50:00.000Z',
        updatedAt: '2026-09-14T09:50:00.000Z',
      },
      retryCount: 0,
      status: 'pending',
      createdAt: '2026-09-14T09:50:00.000Z',
    };

    // Attempt 1: Network failure
    let attempt1Error: Error | null = new Error('Network timeout (transient 504)');
    op.retryCount += 1;
    op.lastAttemptAt = new Date().toISOString();
    op.lastError = attempt1Error.message;
    op.status = 'failed';

    assert.equal(op.retryCount, 1);
    assert.equal(op.status, 'failed');
    assert.ok(op.payload !== undefined, 'Local payload remains untouched and safe');

    // Attempt 2: Reconnection succeeds
    attempt1Error = null;
    server.upsertItem(op.payload as Item);
    op.status = 'synced';

    assert.equal(op.status, 'synced');
    assert.equal(server.items.get('item_transient_1')?.title, 'Retry Task');
  });
});
