import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Item, ItemRelation, ActivityEvent, SyncOperation, DiagnosticEvent } from '@/types';
import {
  FinanceAccount, FinanceTransaction, FinanceCategory, FinanceLabel,
  FinanceBudget, FinanceRule, FinancePlannedPayment, FinanceInvestment,
  FinanceDebt, CurrencyRate, DEFAULT_CATEGORIES, DEFAULT_CURRENCY,
} from '@/types/finance';

// ─── DB Schema ─────────────────────────────────────────────────────────────

interface TrackrDB extends DBSchema {
  items: {
    key: string;
    value: Item;
    indexes: {
      'by-type': string;
      'by-createdAt': string;
      'by-updatedAt': string;
      'by-archived': number;
    };
  };
  item_relations: {
    key: string;
    value: ItemRelation;
    indexes: {
      'by-source': string;
      'by-target': string;
    };
  };
  activity_events: {
    key: string;
    value: ActivityEvent;
    indexes: {
      'by-createdAt': string;
      'by-itemId': string;
    };
  };
  settings: {
    key: string;
    value: { key: string; value: unknown };
  };
  sync_queue: {
    key: string;
    value: SyncOperation;
    indexes: {
      'by-status': string;
      'by-createdAt': string;
    };
  };
  diagnostic_events: {
    key: string;
    value: DiagnosticEvent;
    indexes: {
      'by-timestamp': string;
      'by-category': string;
    };
  };
  // ─── Finance stores (v5) ─────────────────────────────────────────────
  fa_accounts: {
    key: string;
    value: FinanceAccount;
    indexes: {
      'by-type': string;
      'by-archived': number;
    };
  };
  fa_transactions: {
    key: string;
    value: FinanceTransaction;
    indexes: {
      'by-accountId': string;
      'by-date': string;
      'by-categoryId': string;
      'by-type': string;
      'by-projectId': string;
      'by-goalId': string;
      'by-recurringId': string;
      'by-transferId': string;
    };
  };
  fa_categories: {
    key: string;
    value: FinanceCategory;
    indexes: {
      'by-parentId': string;
      'by-direction': string;
      'by-sortOrder': number;
    };
  };
  fa_labels: {
    key: string;
    value: FinanceLabel;
  };
  fa_budgets: {
    key: string;
    value: FinanceBudget;
    indexes: {
      'by-period': string;
      'by-categoryId': string;
    };
  };
  fa_rules: {
    key: string;
    value: FinanceRule;
    indexes: {
      'by-priority': number;
    };
  };
  fa_planned: {
    key: string;
    value: FinancePlannedPayment;
    indexes: {
      'by-dueDate': string;
      'by-accountId': string;
      'by-status': string;
    };
  };
  fa_investments: {
    key: string;
    value: FinanceInvestment;
    indexes: {
      'by-accountId': string;
      'by-assetType': string;
    };
  };
  fa_debts: {
    key: string;
    value: FinanceDebt;
    indexes: {
      'by-status': string;
      'by-direction': string;
    };
  };
  fa_currency_rates: {
    key: string;
    value: CurrencyRate;
    indexes: {
      'by-from': string;
    };
  };
}

// ─── DB Instance ───────────────────────────────────────────────────────────

const DB_NAME = 'trackr-db';
const DB_VERSION = 5;

let dbPromise: Promise<IDBPDatabase<TrackrDB>> | null = null;

function seedDefaultCategories(db: IDBPDatabase<TrackrDB>): Promise<void> {
  const now = new Date().toISOString();
  const tx = db.transaction('fa_categories', 'readwrite');
  const store = tx.store;
  const puts = DEFAULT_CATEGORIES.map(cat =>
    store.put({ ...cat, createdAt: now, updatedAt: now } as FinanceCategory)
  );
  return Promise.all(puts).then(() => tx.done);
}

export function resetDbPromise(): void {
  dbPromise = null;
}

export function getDb(): Promise<IDBPDatabase<TrackrDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TrackrDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // ── v1-v4 stores (unchanged) ──────────────────────────────────────
        if (!db.objectStoreNames.contains('items')) {
          const itemStore = db.createObjectStore('items', { keyPath: 'id' });
          itemStore.createIndex('by-type', 'type');
          itemStore.createIndex('by-createdAt', 'createdAt');
          itemStore.createIndex('by-updatedAt', 'updatedAt');
          itemStore.createIndex('by-archived', 'archived');
        }
        if (!db.objectStoreNames.contains('item_relations')) {
          const relStore = db.createObjectStore('item_relations', { keyPath: 'id' });
          relStore.createIndex('by-source', 'sourceId');
          relStore.createIndex('by-target', 'targetId');
        }
        if (!db.objectStoreNames.contains('activity_events')) {
          const actStore = db.createObjectStore('activity_events', { keyPath: 'id' });
          actStore.createIndex('by-createdAt', 'createdAt');
          actStore.createIndex('by-itemId', 'itemId');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('sync_queue')) {
          const queueStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
          queueStore.createIndex('by-status', 'status');
          queueStore.createIndex('by-createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains('diagnostic_events')) {
          const diagStore = db.createObjectStore('diagnostic_events', { keyPath: 'id' });
          diagStore.createIndex('by-timestamp', 'timestamp');
          diagStore.createIndex('by-category', 'category');
        }

        // ── v5 finance stores ─────────────────────────────────────────────
        if (oldVersion < 5) {
          // Accounts
          const accStore = db.createObjectStore('fa_accounts', { keyPath: 'id' });
          accStore.createIndex('by-type', 'type');
          accStore.createIndex('by-archived', 'archived');

          // Transactions — most queries go through these indexes
          const txnStore = db.createObjectStore('fa_transactions', { keyPath: 'id' });
          txnStore.createIndex('by-accountId', 'accountId');
          txnStore.createIndex('by-date', 'date');
          txnStore.createIndex('by-categoryId', 'categoryId');
          txnStore.createIndex('by-type', 'type');
          txnStore.createIndex('by-projectId', 'projectId');
          txnStore.createIndex('by-goalId', 'goalId');
          txnStore.createIndex('by-recurringId', 'recurringId');
          txnStore.createIndex('by-transferId', 'transferId');

          // Categories
          const catStore = db.createObjectStore('fa_categories', { keyPath: 'id' });
          catStore.createIndex('by-parentId', 'parentId');
          catStore.createIndex('by-direction', 'direction');
          catStore.createIndex('by-sortOrder', 'sortOrder');

          // Labels
          db.createObjectStore('fa_labels', { keyPath: 'id' });

          // Budgets
          const budgetStore = db.createObjectStore('fa_budgets', { keyPath: 'id' });
          budgetStore.createIndex('by-period', 'period');
          budgetStore.createIndex('by-categoryId', 'categoryId');

          // Rules
          const ruleStore = db.createObjectStore('fa_rules', { keyPath: 'id' });
          ruleStore.createIndex('by-priority', 'priority');

          // Planned payments
          const plannedStore = db.createObjectStore('fa_planned', { keyPath: 'id' });
          plannedStore.createIndex('by-dueDate', 'dueDate');
          plannedStore.createIndex('by-accountId', 'accountId');
          plannedStore.createIndex('by-status', 'status');

          // Investments
          const invStore = db.createObjectStore('fa_investments', { keyPath: 'id' });
          invStore.createIndex('by-accountId', 'accountId');
          invStore.createIndex('by-assetType', 'assetType');

          // Debts
          const debtStore = db.createObjectStore('fa_debts', { keyPath: 'id' });
          debtStore.createIndex('by-status', 'status');
          debtStore.createIndex('by-direction', 'direction');

          // Currency rates
          const ratesStore = db.createObjectStore('fa_currency_rates', { keyPath: 'id' });
          ratesStore.createIndex('by-from', 'from');
        }
      },

      async blocked() {
        console.warn('TrackrDB upgrade blocked — another tab is holding a connection.');
      },

      async blocking() {
        // If this tab is blocking an upgrade in another tab, close our connection
        // so the upgrade can proceed.
        const db = await dbPromise;
        db?.close();
        dbPromise = null;
      },
    });

    // After opening, seed default categories if not already seeded
    dbPromise = dbPromise.then(async db => {
      const existing = await db.count('fa_categories');
      if (existing === 0) {
        await seedDefaultCategories(db);
      }
      return db;
    });
  }
  return dbPromise;
}

// ─── Generic CRUD helpers (Universal Items) ────────────────────────────────

export async function getAllItems(): Promise<Item[]> {
  const db = await getDb();
  const all = await db.getAll('items');
  return all.filter(i => !i.archived).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function getItemById(id: string): Promise<Item | undefined> {
  const db = await getDb();
  return db.get('items', id);
}

export async function getItemsByType(type: Item['type']): Promise<Item[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('items', 'by-type', type);
  return all.filter(i => !i.archived).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function saveItem(item: Item): Promise<void> {
  const db = await getDb();
  await db.put('items', item);
}

export async function deleteItem(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('items', id);
}

export async function archiveItem(id: string): Promise<void> {
  const db = await getDb();
  const item = await db.get('items', id);
  if (item) {
    item.archived = true;
    item.updatedAt = new Date().toISOString();
    await db.put('items', item);
  }
}

// ─── Relations ─────────────────────────────────────────────────────────────

export async function getRelationsForSource(sourceId: string): Promise<ItemRelation[]> {
  const db = await getDb();
  return db.getAllFromIndex('item_relations', 'by-source', sourceId);
}

export async function getRelationsForTarget(targetId: string): Promise<ItemRelation[]> {
  const db = await getDb();
  return db.getAllFromIndex('item_relations', 'by-target', targetId);
}

export async function getAllRelations(): Promise<ItemRelation[]> {
  const db = await getDb();
  return db.getAll('item_relations');
}

export async function saveRelation(relation: ItemRelation): Promise<void> {
  const db = await getDb();
  // Deduplication check: do not insert duplicate relation between same source & target
  const existing = await db.getAllFromIndex('item_relations', 'by-source', relation.sourceId);
  const isDuplicate = existing.some(r => r.targetId === relation.targetId && r.relationType === relation.relationType);
  if (isDuplicate) return;
  await db.put('item_relations', relation);
}

export async function deleteRelationsForSource(sourceId: string): Promise<void> {
  const db = await getDb();
  const relations = await db.getAllFromIndex('item_relations', 'by-source', sourceId);
  const tx = db.transaction('item_relations', 'readwrite');
  await Promise.all(relations.map(r => tx.store.delete(r.id)));
  await tx.done;
}

export async function deleteRelation(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('item_relations', id);
}

export async function deleteRelationByPair(sourceId: string, targetId: string): Promise<void> {
  const db = await getDb();
  const rels = await db.getAllFromIndex('item_relations', 'by-source', sourceId);
  const match = rels.find(r => r.targetId === targetId);
  if (match) {
    await db.delete('item_relations', match.id);
  }
}

export async function deleteRelationsForItem(itemId: string): Promise<void> {
  const db = await getDb();
  const [sourceRels, targetRels] = await Promise.all([
    db.getAllFromIndex('item_relations', 'by-source', itemId),
    db.getAllFromIndex('item_relations', 'by-target', itemId),
  ]);
  const allIds = Array.from(new Set([...sourceRels.map(r => r.id), ...targetRels.map(r => r.id)]));
  if (!allIds.length) return;
  const tx = db.transaction('item_relations', 'readwrite');
  await Promise.all(allIds.map(id => tx.store.delete(id)));
  await tx.done;
}

export async function clearAllData(): Promise<void> {
  const db = await getDb();
  const storesToClear: (keyof TrackrDB)[] = [
    'items', 'item_relations', 'activity_events', 'sync_queue',
    'fa_accounts', 'fa_transactions', 'fa_categories', 'fa_labels',
    'fa_budgets', 'fa_rules', 'fa_planned', 'fa_investments',
    'fa_debts', 'fa_currency_rates',
  ];
  if (db.objectStoreNames.contains('diagnostic_events')) {
    storesToClear.push('diagnostic_events');
  }
  await Promise.all(storesToClear.map(s => db.clear(s as 'items')));
}

// ─── Finance Account CRUD ──────────────────────────────────────────────────

export async function getAllAccounts(): Promise<FinanceAccount[]> {
  const db = await getDb();
  return db.getAll('fa_accounts');
}

export async function getAccountById(id: string): Promise<FinanceAccount | undefined> {
  const db = await getDb();
  return db.get('fa_accounts', id);
}

export async function saveAccount(account: FinanceAccount): Promise<void> {
  const db = await getDb();
  await db.put('fa_accounts', account);
}

export async function deleteAccount(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('fa_accounts', id);
}

// ─── Finance Transaction CRUD ──────────────────────────────────────────────

export async function getAllTransactions(): Promise<FinanceTransaction[]> {
  const db = await getDb();
  return db.getAll('fa_transactions');
}

export async function getTransactionById(id: string): Promise<FinanceTransaction | undefined> {
  const db = await getDb();
  return db.get('fa_transactions', id);
}

export async function getTransactionsByAccount(accountId: string): Promise<FinanceTransaction[]> {
  const db = await getDb();
  return db.getAllFromIndex('fa_transactions', 'by-accountId', accountId);
}

export async function getTransactionsByDateRange(start: string, end: string): Promise<FinanceTransaction[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('fa_transactions', 'by-date');
  return all.filter(t => t.date >= start && t.date <= end);
}

export async function getTransactionsByCategory(categoryId: string): Promise<FinanceTransaction[]> {
  const db = await getDb();
  return db.getAllFromIndex('fa_transactions', 'by-categoryId', categoryId);
}

export async function getTransactionsByProject(projectId: string): Promise<FinanceTransaction[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('fa_transactions', 'by-projectId', projectId);
  return all.filter(t => t.projectId === projectId);
}

export async function getTransactionsByGoal(goalId: string): Promise<FinanceTransaction[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('fa_transactions', 'by-goalId', goalId);
  return all.filter(t => t.goalId === goalId);
}

export async function saveTransaction(transaction: FinanceTransaction): Promise<void> {
  const db = await getDb();
  await db.put('fa_transactions', transaction);
}

export async function deleteTransaction(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('fa_transactions', id);
}

/** Efficient filtered transaction query with indexes */
export interface TransactionFilter {
  accountId?: string;
  categoryId?: string;
  type?: FinanceTransaction['type'];
  projectId?: string;
  goalId?: string;
  labelId?: string;
  payeeContains?: string;
  noteContains?: string;
  dateStart?: string;
  dateEnd?: string;
  amountMin?: number;
  amountMax?: number;
}

export async function queryTransactions(filter: TransactionFilter): Promise<FinanceTransaction[]> {
  const db = await getDb();
  let results: FinanceTransaction[];

  // Use the most selective index available
  if (filter.accountId) {
    results = await db.getAllFromIndex('fa_transactions', 'by-accountId', filter.accountId);
  } else if (filter.type) {
    results = await db.getAllFromIndex('fa_transactions', 'by-type', filter.type);
  } else if (filter.categoryId) {
    results = await db.getAllFromIndex('fa_transactions', 'by-categoryId', filter.categoryId);
  } else if (filter.projectId) {
    results = await db.getAllFromIndex('fa_transactions', 'by-projectId', filter.projectId);
  } else if (filter.goalId) {
    results = await db.getAllFromIndex('fa_transactions', 'by-goalId', filter.goalId);
  } else {
    results = await db.getAll('fa_transactions');
  }

  // Apply remaining filters in-memory
  return results.filter(t => {
    if (filter.accountId && t.accountId !== filter.accountId) return false;
    if (filter.categoryId && t.categoryId !== filter.categoryId) return false;
    if (filter.type && t.type !== filter.type) return false;
    if (filter.projectId && t.projectId !== filter.projectId) return false;
    if (filter.goalId && t.goalId !== filter.goalId) return false;
    if (filter.labelId && !t.labels.includes(filter.labelId)) return false;
    if (filter.dateStart && t.date < filter.dateStart) return false;
    if (filter.dateEnd && t.date > filter.dateEnd) return false;
    if (filter.amountMin !== undefined && t.amount < filter.amountMin) return false;
    if (filter.amountMax !== undefined && t.amount > filter.amountMax) return false;
    if (filter.payeeContains && !t.payee?.toLowerCase().includes(filter.payeeContains.toLowerCase())) return false;
    if (filter.noteContains && !t.note?.toLowerCase().includes(filter.noteContains.toLowerCase())) return false;
    return true;
  });
}

// ─── Finance Category CRUD ─────────────────────────────────────────────────

export async function getAllCategories(): Promise<FinanceCategory[]> {
  const db = await getDb();
  return db.getAll('fa_categories');
}

export async function getCategoryById(id: string): Promise<FinanceCategory | undefined> {
  const db = await getDb();
  return db.get('fa_categories', id);
}

export async function saveCategory(category: FinanceCategory): Promise<void> {
  const db = await getDb();
  await db.put('fa_categories', category);
}

export async function deleteCategory(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('fa_categories', id);
}

// ─── Finance Label CRUD ────────────────────────────────────────────────────

export async function getAllLabels(): Promise<FinanceLabel[]> {
  const db = await getDb();
  return db.getAll('fa_labels');
}

export async function getLabelById(id: string): Promise<FinanceLabel | undefined> {
  const db = await getDb();
  return db.get('fa_labels', id);
}

export async function saveLabel(label: FinanceLabel): Promise<void> {
  const db = await getDb();
  await db.put('fa_labels', label);
}

export async function deleteLabel(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('fa_labels', id);
}

// ─── Finance Budget CRUD ───────────────────────────────────────────────────

export async function getAllBudgets(): Promise<FinanceBudget[]> {
  const db = await getDb();
  return db.getAll('fa_budgets');
}

export async function getBudgetById(id: string): Promise<FinanceBudget | undefined> {
  const db = await getDb();
  return db.get('fa_budgets', id);
}

export async function saveBudget(budget: FinanceBudget): Promise<void> {
  const db = await getDb();
  await db.put('fa_budgets', budget);
}

export async function deleteBudget(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('fa_budgets', id);
}

// ─── Finance Rule CRUD ─────────────────────────────────────────────────────

export async function getAllRules(): Promise<FinanceRule[]> {
  const db = await getDb();
  const rules = await db.getAll('fa_rules');
  return rules.sort((a, b) => a.priority - b.priority);
}

export async function getRuleById(id: string): Promise<FinanceRule | undefined> {
  const db = await getDb();
  return db.get('fa_rules', id);
}

export async function saveRule(rule: FinanceRule): Promise<void> {
  const db = await getDb();
  await db.put('fa_rules', rule);
}

export async function deleteRule(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('fa_rules', id);
}

// ─── Finance Planned Payments CRUD ────────────────────────────────────────

export async function getAllPlannedPayments(): Promise<FinancePlannedPayment[]> {
  const db = await getDb();
  return db.getAll('fa_planned');
}

export async function getPlannedPaymentById(id: string): Promise<FinancePlannedPayment | undefined> {
  const db = await getDb();
  return db.get('fa_planned', id);
}

export async function savePlannedPayment(payment: FinancePlannedPayment): Promise<void> {
  const db = await getDb();
  await db.put('fa_planned', payment);
}

export async function deletePlannedPayment(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('fa_planned', id);
}

// ─── Finance Investment CRUD ───────────────────────────────────────────────

export async function getAllInvestments(): Promise<FinanceInvestment[]> {
  const db = await getDb();
  return db.getAll('fa_investments');
}

export async function getInvestmentById(id: string): Promise<FinanceInvestment | undefined> {
  const db = await getDb();
  return db.get('fa_investments', id);
}

export async function saveInvestment(investment: FinanceInvestment): Promise<void> {
  const db = await getDb();
  await db.put('fa_investments', investment);
}

export async function deleteInvestment(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('fa_investments', id);
}

// ─── Finance Debt CRUD ─────────────────────────────────────────────────────

export async function getAllDebts(): Promise<FinanceDebt[]> {
  const db = await getDb();
  return db.getAll('fa_debts');
}

export async function getDebtById(id: string): Promise<FinanceDebt | undefined> {
  const db = await getDb();
  return db.get('fa_debts', id);
}

export async function saveDebt(debt: FinanceDebt): Promise<void> {
  const db = await getDb();
  await db.put('fa_debts', debt);
}

export async function deleteDebt(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('fa_debts', id);
}

// ─── Currency Rate CRUD ────────────────────────────────────────────────────

export async function getAllCurrencyRates(): Promise<CurrencyRate[]> {
  const db = await getDb();
  return db.getAll('fa_currency_rates');
}

export async function saveCurrencyRate(rate: CurrencyRate): Promise<void> {
  const db = await getDb();
  await db.put('fa_currency_rates', rate);
}

export async function getLatestRate(from: string, to: string): Promise<CurrencyRate | undefined> {
  if (from === to) return { id: `${from}_${to}_same`, from, to, rate: 1, date: new Date().toISOString().slice(0, 10), source: 'manual', createdAt: new Date().toISOString() };
  const db = await getDb();
  const all = await db.getAllFromIndex('fa_currency_rates', 'by-from', from);
  const matching = all.filter(r => r.to === to).sort((a, b) => b.date.localeCompare(a.date));
  return matching[0];
}

// ─── Finance full-data clear/export helpers ────────────────────────────────

export async function getAllFinanceData() {
  const db = await getDb();
  const [accounts, transactions, categories, labels, budgets, rules, planned, investments, debts, currencyRates] = await Promise.all([
    db.getAll('fa_accounts'),
    db.getAll('fa_transactions'),
    db.getAll('fa_categories'),
    db.getAll('fa_labels'),
    db.getAll('fa_budgets'),
    db.getAll('fa_rules'),
    db.getAll('fa_planned'),
    db.getAll('fa_investments'),
    db.getAll('fa_debts'),
    db.getAll('fa_currency_rates'),
  ]);
  return { accounts, transactions, categories, labels, budgets, rules, plannedPayments: planned, investments, debts, currencyRates };
}

export async function importFinanceData(data: {
  accounts?: FinanceAccount[];
  transactions?: FinanceTransaction[];
  categories?: FinanceCategory[];
  labels?: FinanceLabel[];
  budgets?: FinanceBudget[];
  rules?: FinanceRule[];
  plannedPayments?: FinancePlannedPayment[];
  investments?: FinanceInvestment[];
  debts?: FinanceDebt[];
  currencyRates?: CurrencyRate[];
}): Promise<void> {
  const db = await getDb();
  const stores = [
    ['fa_accounts', data.accounts ?? []],
    ['fa_transactions', data.transactions ?? []],
    ['fa_categories', data.categories ?? []],
    ['fa_labels', data.labels ?? []],
    ['fa_budgets', data.budgets ?? []],
    ['fa_rules', data.rules ?? []],
    ['fa_planned', data.plannedPayments ?? []],
    ['fa_investments', data.investments ?? []],
    ['fa_debts', data.debts ?? []],
    ['fa_currency_rates', data.currencyRates ?? []],
  ] as const;

  for (const [storeName, items] of stores) {
    for (const item of items) {
      await db.put(storeName as 'fa_accounts', item as FinanceAccount);
    }
  }
}

// ─── Finance-aware search ──────────────────────────────────────────────────

export async function searchFinanceTransactions(query: string): Promise<FinanceTransaction[]> {
  if (!query.trim()) return [];
  const db = await getDb();
  const all = await db.getAll('fa_transactions');
  const q = query.toLowerCase();
  return all.filter(t => {
    if (t.payee?.toLowerCase().includes(q)) return true;
    if (t.note?.toLowerCase().includes(q)) return true;
    return false;
  }).slice(0, 50);
}

// ─── Sync Queue Helpers ───────────────────────────────────────────────────

export async function enqueueSyncOp(op: SyncOperation): Promise<void> {
  const db = await getDb();
  if (!db.objectStoreNames.contains('sync_queue')) return;
  await db.put('sync_queue', op);
}

export async function getPendingSyncOps(limit = 50): Promise<SyncOperation[]> {
  const db = await getDb();
  if (!db.objectStoreNames.contains('sync_queue')) return [];
  const all = await db.getAll('sync_queue');
  return all
    .filter(op => op.status === 'pending' || op.status === 'failed')
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(0, limit);
}

export async function getAllSyncOps(): Promise<SyncOperation[]> {
  const db = await getDb();
  if (!db.objectStoreNames.contains('sync_queue')) return [];
  return db.getAll('sync_queue');
}

export async function updateSyncOp(op: SyncOperation): Promise<void> {
  const db = await getDb();
  if (!db.objectStoreNames.contains('sync_queue')) return;
  await db.put('sync_queue', op);
}

export async function deleteSyncOp(id: string): Promise<void> {
  const db = await getDb();
  if (!db.objectStoreNames.contains('sync_queue')) return;
  await db.delete('sync_queue', id);
}

export async function clearSyncQueue(): Promise<void> {
  const db = await getDb();
  if (!db.objectStoreNames.contains('sync_queue')) return;
  await db.clear('sync_queue');
}

// ─── Tags ──────────────────────────────────────────────────────────────────

export async function getItemsByTag(tag: string): Promise<Item[]> {
  const normalized = tag.toLowerCase().replace(/^#/, '');
  const db = await getDb();
  const all = await db.getAll('items');
  return all
    .filter(item => !item.archived)
    .filter(item => item.tags.some(t => t.toLowerCase() === normalized))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

// ─── Activity ──────────────────────────────────────────────────────────────

export async function getRecentActivity(limit = 50): Promise<ActivityEvent[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('activity_events', 'by-createdAt');
  return all.reverse().slice(0, limit);
}

export async function saveActivityEvent(event: ActivityEvent): Promise<void> {
  const db = await getDb();
  await db.put('activity_events', event);
}

export async function getAllActivityEvents(): Promise<ActivityEvent[]> {
  const db = await getDb();
  return db.getAll('activity_events');
}

// ─── Settings ──────────────────────────────────────────────────────────────

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  const record = await db.get('settings', key);
  return record?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.put('settings', { key, value });
}

// ─── Search (basic full-text + finance) ────────────────────────────────────

export async function searchItems(query: string): Promise<Item[]> {
  if (!query.trim()) return [];
  const db = await getDb();
  const all = await db.getAll('items');
  const q = query.toLowerCase();
  return all
    .filter(item => !item.archived)
    .filter(item => {
      if (item.title.toLowerCase().includes(q)) return true;
      if (item.content?.toLowerCase().includes(q)) return true;
      if (item.tags.some(t => t.toLowerCase().includes(q))) return true;
      if (item.metadata && typeof item.metadata === 'object') {
        for (const val of Object.values(item.metadata)) {
          if (typeof val === 'string' && val.toLowerCase().includes(q)) return true;
          if (Array.isArray(val) && val.some(v => typeof v === 'string' && v.toLowerCase().includes(q))) return true;
        }
      }
      return false;
    })
    .sort((a, b) => {
      const aTitle = a.title.toLowerCase().includes(q) ? 2 : 0;
      const bTitle = b.title.toLowerCase().includes(q) ? 2 : 0;
      return (bTitle - aTitle) ||
        (new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    });
}

// ─── Seed check ────────────────────────────────────────────────────────────

export async function isSeeded(): Promise<boolean> {
  const val = await getSetting<boolean>('seeded');
  return val === true;
}

export async function markSeeded(): Promise<void> {
  await setSetting('seeded', true);
}

// ─── Diagnostic Events (Observability) ─────────────────────────────────────

export async function saveDiagnosticEvent(event: DiagnosticEvent): Promise<void> {
  const db = await getDb();
  if (!db.objectStoreNames.contains('diagnostic_events')) return;
  await db.put('diagnostic_events', event);
}

export async function getRecentDiagnosticEvents(limit = 50): Promise<DiagnosticEvent[]> {
  const db = await getDb();
  if (!db.objectStoreNames.contains('diagnostic_events')) return [];
  const all = await db.getAllFromIndex('diagnostic_events', 'by-timestamp');
  return all.reverse().slice(0, limit);
}

export async function getAllDiagnosticEvents(): Promise<DiagnosticEvent[]> {
  const db = await getDb();
  if (!db.objectStoreNames.contains('diagnostic_events')) return [];
  return db.getAll('diagnostic_events');
}

export async function clearDiagnosticEvents(): Promise<void> {
  const db = await getDb();
  if (!db.objectStoreNames.contains('diagnostic_events')) return;
  await db.clear('diagnostic_events');
}

// ─── Finance-specific currency conversion ─────────────────────────────────

export function convertAmount(amount: number, fromCurrency: string, toCurrency: string, rate: number): number {
  if (fromCurrency === toCurrency) return amount;
  return amount * rate;
}

// ─── Finance transaction ID generation ────────────────────────────────────

export function genFinanceId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ─── Legacy compatibility: export DEFAULT_CURRENCY ─────────────────────────
export { DEFAULT_CURRENCY };
