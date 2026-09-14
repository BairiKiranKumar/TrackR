import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TrackrSupabaseProvider } from '../lib/storage/TrackrSupabaseProvider';
import { Item, ItemRelation } from '@/types';
import { FinanceTransaction, FinanceAccount, FinanceBudget, FinancialCandidate } from '@/types/finance';
import { AutomationRule, AutomationExecution } from '@/types/automation';

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
          // SELECT with RLS: USING (auth.uid() = user_id)
          select() {
            const queryState = {
              eqFilters: [] as { col: string; val: unknown }[],
              orderCol: '',
              ascending: true,
            };

            const builder = {
              eq(col: string, val: unknown) {
                queryState.eqFilters.push({ col, val });
                return builder;
              },
              order(col: string, opts?: { ascending?: boolean }) {
                queryState.orderCol = col;
                queryState.ascending = opts?.ascending ?? true;
                return builder;
              },
              // Executes the query with RLS enforcement
              then(resolve: (res: { data: Record<string, unknown>[]; error: null }) => void) {
                // 1. RLS enforcement: only rows where row.user_id === authenticatedUserId
                let rows = Array.from(store.values()).filter(r => r.user_id === authenticatedUserId);

                // 2. Explicit filter matching
                for (const f of queryState.eqFilters) {
                  rows = rows.filter(r => r[f.col] === f.val);
                }

                return Promise.resolve({ data: rows, error: null }).then(resolve);
              },
            };

            return builder;
          },

          // UPSERT / INSERT with RLS: WITH CHECK (auth.uid() = user_id)
          async upsert(row: Record<string, unknown>) {
            // RLS check violation if user_id doesn't match authenticated session
            if (row.user_id !== authenticatedUserId) {
              return {
                data: null,
                error: new Error('42501: new row violates row-level security policy for table ' + tableName),
              };
            }
            const id = String(row.id);
            // If existing row belongs to another user, RLS prevents overwrite
            const existing = store.get(id);
            if (existing && existing.user_id !== authenticatedUserId) {
              return {
                data: null,
                error: new Error('42501: row-level security policy violation: cannot overwrite another user record'),
              };
            }
            store.set(id, { ...row });
            return { data: row, error: null };
          },

          // DELETE with RLS: USING (auth.uid() = user_id)
          delete() {
            const deleteFilters: { col: string; val: unknown }[] = [];
            let orCondition: string | null = null;
            let neqCondition: { col: string; val: unknown } | null = null;

            const deleteBuilder = {
              eq(col: string, val: unknown) {
                deleteFilters.push({ col, val });
                return deleteBuilder;
              },
              neq(col: string, val: unknown) {
                neqCondition = { col, val };
                return deleteBuilder;
              },
              or(expr: string) {
                orCondition = expr;
                return deleteBuilder;
              },
              then(resolve: (res: { error: null }) => void) {
                for (const [id, row] of Array.from(store.entries())) {
                  // RLS boundary: can only ever delete own rows
                  if (row.user_id !== authenticatedUserId) continue;

                  let match = true;
                  for (const f of deleteFilters) {
                    if (row[f.col] !== f.val) {
                      match = false;
                      break;
                    }
                  }
                  if (neqCondition && row[neqCondition.col] === neqCondition.val) {
                    match = false;
                  }
                  if (match || orCondition) {
                    store.delete(id);
                  }
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

describe('Phase 6A: Multi-User RLS Isolation & Data Boundary Security', () => {
  const db = createSimulatedRlsDatabase();

  const userAId = 'user_alpha_1111-aaaa';
  const userBId = 'user_bravo_2222-bbbb';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientA = db.createClient(userAId) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clientB = db.createClient(userBId) as any;

  const providerA = new TrackrSupabaseProvider(userAId, clientA);
  const providerB = new TrackrSupabaseProvider(userBId, clientB);

  it('1. Core Items Isolation: User B cannot read, modify, or delete User A items', async () => {
    const itemA: Item = {
      id: 'item_a_secret_project',
      type: 'project',
      title: 'User A Confidential Strategy',
      content: 'Secret roadmap details',
      tags: ['top-secret'],
      pinned: true,
      archived: false,
      metadata: {},
      version: 1,
      createdAt: '2026-09-14T08:00:00.000Z',
      updatedAt: '2026-09-14T08:00:00.000Z',
    };

    // User A creates item
    await providerA.upsertItem(itemA);

    // User A can read it
    const itemsA = await providerA.pullItems();
    assert.equal(itemsA.length, 1);
    assert.equal(itemsA[0].id, 'item_a_secret_project');

    // User B attempts to read items -> gets 0 rows (RLS blocks User A's row)
    const itemsB = await providerB.pullItems();
    assert.equal(itemsB.length, 0, 'User B must not see User A items');

    // User B attempts to delete User A's item
    await providerB.deleteItem('item_a_secret_project');

    // User A's item remains completely intact
    const verifyItemsA = await providerA.pullItems();
    assert.equal(verifyItemsA.length, 1, 'User A item must survive deletion attempt by User B');
  });

  it('2. Item Relations Isolation: User B cannot access or tamper with User A relations', async () => {
    const relA: ItemRelation = {
      id: 'rel_a_link_1',
      sourceId: 'item_a_secret_project',
      targetId: 'item_a_task_1',
      relationType: 'parent',
      createdAt: '2026-09-14T08:05:00.000Z',
    };

    await providerA.upsertRelation(relA);

    const relsA = await providerA.pullRelations();
    assert.equal(relsA.length, 1);
    assert.equal(relsA[0].id, 'rel_a_link_1');

    // User B pulls relations -> 0 relations returned
    const relsB = await providerB.pullRelations();
    assert.equal(relsB.length, 0, 'User B must not see User A relations');

    // User B attempts to delete User A's relation
    await providerB.deleteRelation('rel_a_link_1');

    const verifyRelsA = await providerA.pullRelations();
    assert.equal(verifyRelsA.length, 1, 'User A relation must survive deletion attempt by User B');
  });

  it('3. Finance Accounts & Transactions Isolation', async () => {
    const accountA: FinanceAccount = {
      id: 'acc_a_savings',
      name: 'Private Alpha Bank',
      type: 'savings',
      currency: 'INR',
      openingBalance: 150000,
      currentBalance: 150000,
      archived: false,
      createdAt: '2026-09-14T08:10:00.000Z',
      updatedAt: '2026-09-14T08:10:00.000Z',
    };

    const txnA: FinanceTransaction = {
      id: 'txn_a_salary',
      accountId: 'acc_a_savings',
      date: '2026-09-14',
      amount: 100000,
      currency: 'INR',
      type: 'income',
      payee: 'Acme Corp Salary',
      labels: ['private'],
      ruleExecutions: [],
      createdAt: '2026-09-14T08:11:00.000Z',
      updatedAt: '2026-09-14T08:11:00.000Z',
    };

    await providerA.upsertFinanceEntity('fa_account', accountA);
    await providerA.upsertFinanceEntity('fa_transaction', txnA);

    // Verify stored with user_id stamped as userAId
    const txnsStore = db.getStore('fa_transactions');
    const storedTxn = txnsStore.get('txn_a_salary');
    assert.equal(storedTxn?.user_id, userAId);

    // User B queries transactions table directly
    const { data: userBTxns } = await clientB.from('fa_transactions').select('*');
    assert.equal(userBTxns.length, 0, 'User B must not query User A transactions');

    // User B attempts to delete User A's transaction
    await providerB.deleteFinanceEntity('fa_transaction', 'txn_a_salary');

    const { data: userATxns } = await clientA.from('fa_transactions').select('*');
    assert.equal(userATxns.length, 1, 'User A transaction must remain intact after User B delete');
  });

  it('4. Financial Inbox Candidates Isolation', async () => {
    const candidateA: FinancialCandidate = {
      id: 'cand_a_swiggy',
      source: 'csv',
      detectedAt: '2026-09-14T08:15:00.000Z',
      amount: 450,
      currency: 'INR',
      payee: 'Swiggy Food',
      date: '2026-09-14',
      status: 'pending',
      confidence: 0.95,
      createdAt: '2026-09-14T08:15:00.000Z',
      updatedAt: '2026-09-14T08:15:00.000Z',
    };

    await providerA.upsertFinanceEntity('fa_candidate', candidateA);

    // User B cannot select candidate
    const { data: candidatesB } = await clientB.from('financial_candidates').select('*');
    assert.equal(candidatesB.length, 0);

    // User B cannot delete candidate
    await providerB.deleteFinanceEntity('fa_candidate', 'cand_a_swiggy');
    const { data: candidatesA } = await clientA.from('financial_candidates').select('*');
    assert.equal(candidatesA.length, 1);
  });

  it('5. Budgets & Automation Rules Isolation', async () => {
    const budgetA: FinanceBudget = {
      id: 'budget_a_monthly',
      name: 'Alpha Food Budget',
      target: 20000,
      currency: 'INR',
      period: 'monthly',
      startDate: '2026-09-01',
      rollover: false,
      alertThreshold: 0.8,
      archived: false,
      createdAt: '2026-09-14T08:20:00.000Z',
      updatedAt: '2026-09-14T08:20:00.000Z',
    };

    const ruleA: AutomationRule = {
      id: 'rule_a_auto_cat',
      name: 'Categorize Swiggy',
      trigger: 'transaction_created',
      conditions: [{ field: 'payee', operator: 'contains', value: 'Swiggy' }],
      actions: [{ type: 'assign_category', value: 'cat_food' }],
      priority: 10,
      enabled: true,
      executionCount: 2,
      createdAt: '2026-09-14T08:21:00.000Z',
      updatedAt: '2026-09-14T08:21:00.000Z',
    };

    const execA: AutomationExecution = {
      id: 'exec_a_1',
      ruleId: 'rule_a_auto_cat',
      ruleName: 'Categorize Swiggy',
      trigger: 'transaction_created',
      targetEntityId: 'txn_a_salary',
      targetEntityType: 'transaction',
      executedAt: '2026-09-14T08:22:00.000Z',
      status: 'success',
      changes: {},
      explanation: 'Assigned Food category',
    };

    await providerA.upsertFinanceEntity('fa_budget', budgetA);
    await providerA.upsertFinanceEntity('fa_automation', ruleA);
    await providerA.upsertFinanceEntity('fa_automation_history', execA);

    // Check User B cannot read any of them
    const { data: budgetsB } = await clientB.from('fa_budgets').select('*');
    const { data: rulesB } = await clientB.from('automation_rules').select('*');
    const { data: execsB } = await clientB.from('automation_executions').select('*');

    assert.equal(budgetsB.length, 0);
    assert.equal(rulesB.length, 0);
    assert.equal(execsB.length, 0);
  });

  it('6. Spoofing Prevention: User B cannot insert data pretending to belong to User A', async () => {
    // Malicious attempt: User B tries to inject a row with user_id = userAId directly
    const maliciousRow = {
      id: 'item_spoofed_by_b',
      user_id: userAId, // Attempt to write to User A's scope
      type: 'note',
      title: 'Malicious Injected Note',
      content: 'Injected into User A account',
    };

    const result = await clientB.from('items').upsert(maliciousRow);
    assert.ok(result.error !== null, 'RLS policy WITH CHECK must reject row with mismatched user_id');
    assert.match(result.error.message, /violates row-level security policy/);

    // Verify item was never added
    const { data: itemsA } = await clientA.from('items').select('*');
    const found = itemsA.find((i: Record<string, unknown>) => i.id === 'item_spoofed_by_b');
    assert.equal(found, undefined, 'Spoofed item must never exist in User A dataset');
  });

  it('7. clearAll() Isolation: User A purging all data leaves User B data completely untouched', async () => {
    // Set up distinct data for User B
    const itemB: Item = {
      id: 'item_b_important_doc',
      type: 'note',
      title: 'User B Critical Notes',
      content: 'Important thoughts',
      tags: ['work'],
      pinned: false,
      archived: false,
      metadata: {},
      version: 1,
      createdAt: '2026-09-14T08:30:00.000Z',
      updatedAt: '2026-09-14T08:30:00.000Z',
    };
    await providerB.upsertItem(itemB);

    const candidateB: FinancialCandidate = {
      id: 'cand_b_salary',
      source: 'manual',
      detectedAt: '2026-09-14T08:31:00.000Z',
      amount: 80000,
      currency: 'INR',
      payee: 'Employer Inc',
      date: '2026-09-14',
      status: 'pending',
      confidence: 1.0,
      createdAt: '2026-09-14T08:31:00.000Z',
      updatedAt: '2026-09-14T08:31:00.000Z',
    };
    await providerB.upsertFinanceEntity('fa_candidate', candidateB);

    // Verify User B has items before purge
    const itemsBBefore = await providerB.pullItems();
    assert.equal(itemsBBefore.length, 1);

    // User A executes clearAll()
    await providerA.clearAll();

    // Verify User A has 0 items and 0 transactions
    const itemsAAfter = await providerA.pullItems();
    assert.equal(itemsAAfter.length, 0, 'User A data must be completely wiped');

    const { data: txnsAAfter } = await clientA.from('fa_transactions').select('*');
    assert.equal(txnsAAfter.length, 0);

    // Verify User B data is 100% preserved
    const itemsBAfter = await providerB.pullItems();
    assert.equal(itemsBAfter.length, 1, 'User B items must be unaffected by User A clearAll');
    assert.equal(itemsBAfter[0].id, 'item_b_important_doc');

    const { data: candidatesBAfter } = await clientB.from('financial_candidates').select('*');
    assert.equal(candidatesBAfter.length, 1, 'User B candidates must be unaffected by User A clearAll');
    assert.equal(candidatesBAfter[0].id, 'cand_b_salary');
  });
});
