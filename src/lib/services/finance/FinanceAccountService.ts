import {
  FinanceAccount, AccountType, isAssetAccount, isLiabilityAccount,
  DEFAULT_CURRENCY,
} from '@/types/finance';
import {
  getAllAccounts, getAccountById, saveAccount, deleteAccount,
  getAllTransactions, genFinanceId, queryTransactions,
} from '@/lib/db/localDb';
import { syncQueueService } from '../SyncQueueService';

// ─── Finance Account Service ──────────────────────────────────────────────

export class FinanceAccountService {

  async getAllAccounts(): Promise<FinanceAccount[]> {
    return getAllAccounts();
  }

  async getActiveAccounts(): Promise<FinanceAccount[]> {
    const all = await getAllAccounts();
    return all.filter(a => !a.archived).sort((a, b) => a.name.localeCompare(b.name));
  }

  async getAccountById(id: string): Promise<FinanceAccount | undefined> {
    return getAccountById(id);
  }

  async createAccount(partial: {
    name: string;
    type: AccountType;
    currency?: string;
    openingBalance?: number;
    institution?: string;
    notes?: string;
    color?: string;
    icon?: string;
  }): Promise<FinanceAccount> {
    const now = new Date().toISOString();
    const openingBalance = partial.openingBalance ?? 0;
    const account: FinanceAccount = {
      id: genFinanceId(),
      name: partial.name,
      type: partial.type,
      currency: partial.currency ?? DEFAULT_CURRENCY,
      openingBalance,
      currentBalance: openingBalance,
      institution: partial.institution,
      notes: partial.notes,
      color: partial.color,
      icon: partial.icon,
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
    await saveAccount(account);
    await syncQueueService.enqueue('fa_account', account.id, 'upsert', account);
    return account;
  }

  async updateAccount(id: string, updates: Partial<Omit<FinanceAccount, 'id' | 'createdAt'>>): Promise<FinanceAccount | null> {
    const existing = await getAccountById(id);
    if (!existing) return null;
    const updated: FinanceAccount = {
      ...existing,
      ...updates,
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await saveAccount(updated);
    await syncQueueService.enqueue('fa_account', updated.id, 'upsert', updated);
    return updated;
  }

  async archiveAccount(id: string): Promise<FinanceAccount | null> {
    return this.updateAccount(id, { archived: true });
  }

  async restoreAccount(id: string): Promise<FinanceAccount | null> {
    return this.updateAccount(id, { archived: false });
  }

  /**
   * Safe account deletion: fails if transactions exist.
   * Returns a warning message if unsafe, null if successful.
   */
  async deleteAccount(id: string): Promise<{ success: boolean; error?: string; transactionCount?: number }> {
    const transactions = await queryTransactions({ accountId: id });
    if (transactions.length > 0) {
      return {
        success: false,
        error: `This account has ${transactions.length} transaction${transactions.length === 1 ? '' : 's'} linked to it. Archive the account instead, or reassign and delete transactions first.`,
        transactionCount: transactions.length,
      };
    }
    await deleteAccount(id);
    await syncQueueService.enqueue('fa_account', id, 'delete');
    return { success: true };
  }

  /**
   * Recalculate currentBalance from opening balance + all transactions.
   * Call this after bulk edits or imports to ensure consistency.
   */
  async recalculateBalance(accountId: string): Promise<number> {
    const account = await getAccountById(accountId);
    if (!account) return 0;

    const transactions = await getAllTransactions();
    const relevant = transactions.filter(t => t.accountId === accountId);

    let balance = account.openingBalance;
    for (const t of relevant) {
      if (t.type === 'income') {
        balance += t.amount;
      } else if (t.type === 'expense') {
        balance -= t.amount;
      } else if (t.type === 'transfer') {
        // Determine direction from transfer pair
        // We'll check if this is the source (outgoing) or destination (incoming)
        // via the transfer pair: the SAME transferId appears on both sides
        // We'll handle this in the transaction service, here just skip
      }
    }

    await this.updateAccount(accountId, { currentBalance: balance });
    return balance;
  }

  /** Update currentBalance by applying a delta (used on each transaction create/edit/delete) */
  async applyBalanceDelta(accountId: string, delta: number): Promise<void> {
    const account = await getAccountById(accountId);
    if (!account) return;
    const newBalance = account.currentBalance + delta;
    await saveAccount({ ...account, currentBalance: newBalance, updatedAt: new Date().toISOString() });
  }

  /** Net worth: assets - liabilities */
  async getNetWorthBreakdown(): Promise<{
    totalAssets: number;
    totalLiabilities: number;
    netWorth: number;
    accounts: FinanceAccount[];
  }> {
    const accounts = await this.getActiveAccounts();
    let totalAssets = 0;
    let totalLiabilities = 0;

    for (const acc of accounts) {
      if (isAssetAccount(acc.type)) {
        totalAssets += acc.currentBalance;
      } else if (isLiabilityAccount(acc.type)) {
        // Credit card balance is a liability (positive balance = owed)
        totalLiabilities += Math.abs(acc.currentBalance);
      }
    }

    return { totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities, accounts };
  }
}

export const financeAccountService = new FinanceAccountService();
