import {
  FinanceTransaction, FinanceCategory, TransactionType, DEFAULT_CURRENCY,
} from '@/types/finance';
import {
  getAllTransactions, getTransactionById, saveTransaction, deleteTransaction,
  queryTransactions, TransactionFilter, saveAccount,
  getAccountById, genFinanceId, getAllCategories,
} from '@/lib/db/localDb';
import { financeRulesService } from './FinanceRulesService';

// ─── Finance Transaction Service ───────────────────────────────────────────

function toLocalDateString(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export class FinanceTransactionService {

  // ── Read ──────────────────────────────────────────────────────────────

  async getAllTransactions(): Promise<FinanceTransaction[]> {
    const all = await getAllTransactions();
    return all.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }

  async getTransactionById(id: string): Promise<FinanceTransaction | undefined> {
    return getTransactionById(id);
  }

  async queryTransactions(filter: TransactionFilter): Promise<FinanceTransaction[]> {
    const results = await queryTransactions(filter);
    return results.sort((a, b) => b.date.localeCompare(a.date));
  }

  async getTransactionsThisMonth(): Promise<FinanceTransaction[]> {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const monthEnd = toLocalDateString(lastDay);
    return this.queryTransactions({ dateStart: monthStart, dateEnd: monthEnd });
  }

  async getMonthlyTotals(dateStart?: string, dateEnd?: string): Promise<{ income: number; expenses: number; net: number }> {
    let txns: FinanceTransaction[];
    if (dateStart && dateEnd) {
      txns = await this.queryTransactions({ dateStart, dateEnd });
    } else {
      txns = await this.getTransactionsThisMonth();
    }
    let income = 0;
    let expenses = 0;
    for (const t of txns) {
      if (t.type === 'income') income += t.amount;
      else if (t.type === 'expense') expenses += t.amount;
      // transfers excluded from income/expense
    }
    return { income, expenses, net: income - expenses };
  }

  // ── Create ──────────────────────────────────────────────────────────

  async createTransaction(partial: {
    accountId: string;
    date: string;
    amount: number;
    currency?: string;
    type: TransactionType;
    categoryId?: string;
    payee?: string;
    note?: string;
    labels?: string[];
    projectId?: string;
    goalId?: string;
    source?: FinanceTransaction['source'];
    sourceReference?: string;
    recurringId?: string;
    originalAmount?: number;
    originalCurrency?: string;
    exchangeRate?: number;
  }): Promise<FinanceTransaction> {
    if (partial.amount <= 0) throw new Error('Transaction amount must be positive');
    if (partial.type === 'transfer') throw new Error('Use createTransfer() for transfer transactions');

    const now = new Date().toISOString();
    const transaction: FinanceTransaction = {
      id: genFinanceId(),
      accountId: partial.accountId,
      date: partial.date,
      amount: partial.amount,
      currency: partial.currency ?? DEFAULT_CURRENCY,
      type: partial.type,
      categoryId: partial.categoryId,
      payee: partial.payee,
      note: partial.note,
      labels: partial.labels ?? [],
      projectId: partial.projectId,
      goalId: partial.goalId,
      source: partial.source ?? 'manual',
      sourceReference: partial.sourceReference,
      recurringId: partial.recurringId,
      transferId: undefined,
      ruleExecutions: [],
      originalAmount: partial.originalAmount,
      originalCurrency: partial.originalCurrency,
      exchangeRate: partial.exchangeRate,
      createdAt: now,
      updatedAt: now,
    };

    // Apply rules before saving
    const withRules = await financeRulesService.applyRulesToTransaction(transaction);

    await saveTransaction(withRules);
    await this.updateAccountBalance(withRules.accountId, withRules.type, withRules.amount, 1);

    return withRules;
  }

  /** Create a linked transfer pair between two accounts */
  async createTransfer(params: {
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    currency?: string;
    date: string;
    note?: string;
  }): Promise<{ outgoing: FinanceTransaction; incoming: FinanceTransaction }> {
    if (params.fromAccountId === params.toAccountId) {
      throw new Error('Cannot transfer between the same account');
    }
    if (params.amount <= 0) {
      throw new Error('Transfer amount must be positive');
    }

    const now = new Date().toISOString();
    const transferId = genFinanceId();
    const currency = params.currency ?? DEFAULT_CURRENCY;

    const outgoing: FinanceTransaction = {
      id: genFinanceId(),
      accountId: params.fromAccountId,
      date: params.date,
      amount: params.amount,
      currency,
      type: 'transfer',
      labels: [],
      note: params.note,
      transferId,
      ruleExecutions: [],
      source: 'manual',
      createdAt: now,
      updatedAt: now,
    };

    const incoming: FinanceTransaction = {
      id: genFinanceId(),
      accountId: params.toAccountId,
      date: params.date,
      amount: params.amount,
      currency,
      type: 'transfer',
      labels: [],
      note: params.note,
      transferId,
      ruleExecutions: [],
      source: 'manual',
      createdAt: now,
      updatedAt: now,
    };

    await saveTransaction(outgoing);
    await saveTransaction(incoming);

    // Outgoing: decrease source balance
    await this.applyBalanceDelta(params.fromAccountId, -params.amount);
    // Incoming: increase destination balance
    await this.applyBalanceDelta(params.toAccountId, params.amount);

    return { outgoing, incoming };
  }

  // ── Update ──────────────────────────────────────────────────────────

  async updateTransaction(id: string, updates: Partial<Omit<FinanceTransaction, 'id' | 'createdAt' | 'ruleExecutions'>>): Promise<FinanceTransaction | null> {
    const existing = await getTransactionById(id);
    if (!existing) return null;

    // Revert old balance effect
    await this.updateAccountBalance(existing.accountId, existing.type, existing.amount, -1);

    const updated: FinanceTransaction = {
      ...existing,
      ...updates,
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    await saveTransaction(updated);

    // Apply new balance effect
    await this.updateAccountBalance(updated.accountId, updated.type, updated.amount, 1);

    return updated;
  }

  // ── Delete ──────────────────────────────────────────────────────────

  async deleteTransaction(id: string): Promise<void> {
    const existing = await getTransactionById(id);
    if (!existing) return;

    // Revert balance
    await this.updateAccountBalance(existing.accountId, existing.type, existing.amount, -1);

    // For transfers, also revert the paired transaction
    if (existing.transferId) {
      const all = await getAllTransactions();
      const pair = all.find(t => t.transferId === existing.transferId && t.id !== id);
      if (pair) {
        await this.applyBalanceDelta(pair.accountId, pair.type === 'transfer' && pair.accountId !== existing.accountId
          ? -pair.amount : pair.amount);
        await deleteTransaction(pair.id);
      }
    }

    await deleteTransaction(id);
  }

  // ── Duplicate ───────────────────────────────────────────────────────

  async duplicateTransaction(id: string): Promise<FinanceTransaction | null> {
    const existing = await getTransactionById(id);
    if (!existing) return null;
    if (existing.type === 'transfer') {
      throw new Error('Cannot duplicate a transfer transaction directly. Create a new transfer instead.');
    }
    return this.createTransaction({
      ...existing,
      date: toLocalDateString(),
      note: existing.note ? `${existing.note} (copy)` : '(copy)',
    });
  }

  // ── Bulk operations ──────────────────────────────────────────────────

  async bulkCategorize(ids: string[], categoryId: string): Promise<void> {
    for (const id of ids) {
      const t = await getTransactionById(id);
      if (!t || t.type === 'transfer') continue;
      await saveTransaction({ ...t, categoryId, updatedAt: new Date().toISOString() });
    }
  }

  async bulkAddLabels(ids: string[], labelIds: string[]): Promise<void> {
    for (const id of ids) {
      const t = await getTransactionById(id);
      if (!t) continue;
      const merged = Array.from(new Set([...t.labels, ...labelIds]));
      await saveTransaction({ ...t, labels: merged, updatedAt: new Date().toISOString() });
    }
  }

  async bulkRemoveLabels(ids: string[], labelIds: string[]): Promise<void> {
    for (const id of ids) {
      const t = await getTransactionById(id);
      if (!t) continue;
      await saveTransaction({ ...t, labels: t.labels.filter(l => !labelIds.includes(l)), updatedAt: new Date().toISOString() });
    }
  }

  async bulkAssignProject(ids: string[], projectId: string): Promise<void> {
    for (const id of ids) {
      const t = await getTransactionById(id);
      if (!t || t.type === 'transfer') continue;
      await saveTransaction({ ...t, projectId, updatedAt: new Date().toISOString() });
    }
  }

  async bulkDelete(ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.deleteTransaction(id);
    }
  }

  // ── Duplicate detection ──────────────────────────────────────────────

  async findPotentialDuplicates(transaction: {
    accountId: string;
    date: string;
    amount: number;
    payee?: string;
  }): Promise<FinanceTransaction[]> {
    // Look ±2 days for same account, same amount, same/similar payee
    const d = new Date(transaction.date);
    const startDate = new Date(d);
    startDate.setDate(startDate.getDate() - 2);
    const endDate = new Date(d);
    endDate.setDate(endDate.getDate() + 2);

    const candidates = await queryTransactions({
      accountId: transaction.accountId,
      dateStart: toLocalDateString(startDate),
      dateEnd: toLocalDateString(endDate),
    });

    return candidates.filter(t => {
      if (Math.abs(t.amount - transaction.amount) > 0.01) return false;
      // If payee provided, require payee match (or close match)
      if (transaction.payee && t.payee) {
        const similarity = transaction.payee.toLowerCase() === t.payee.toLowerCase();
        if (!similarity) return false;
      }
      return true;
    });
  }

  // ── Balance helpers ──────────────────────────────────────────────────

  private async updateAccountBalance(accountId: string, type: TransactionType, amount: number, direction: 1 | -1): Promise<void> {
    if (type === 'transfer') return; // transfers handled separately in createTransfer
    const delta = type === 'income' ? amount * direction : -amount * direction;
    await this.applyBalanceDelta(accountId, delta);
  }

  private async applyBalanceDelta(accountId: string, delta: number): Promise<void> {
    const account = await getAccountById(accountId);
    if (!account) return;
    await saveAccount({
      ...account,
      currentBalance: account.currentBalance + delta,
      updatedAt: new Date().toISOString(),
    });
  }

  // ── Category lookups for display ─────────────────────────────────────

  async getCategoryPath(categoryId: string): Promise<FinanceCategory[]> {
    const categories = await getAllCategories();
    const catMap = new Map(categories.map(c => [c.id, c]));
    const path: FinanceCategory[] = [];
    let current = catMap.get(categoryId);
    while (current) {
      path.unshift(current);
      current = current.parentId ? catMap.get(current.parentId) : undefined;
    }
    return path;
  }

  async getCategoryName(categoryId: string): Promise<string> {
    const path = await this.getCategoryPath(categoryId);
    return path.map(c => c.name).join(' › ');
  }
}

export const financeTransactionService = new FinanceTransactionService();
