import { FinanceDebt, DebtDirection, DebtStatus, DebtRepayment, DEFAULT_CURRENCY } from '@/types/finance';
import { getAllDebts, getDebtById, saveDebt, deleteDebt, genFinanceId } from '@/lib/db/localDb';

export class FinanceDebtService {

  async getAllDebts(direction?: DebtDirection): Promise<FinanceDebt[]> {
    const all = await getAllDebts();
    const active = all.filter(d => !d.archived);
    if (direction) return active.filter(d => d.direction === direction);
    return active;
  }

  async getDebtById(id: string): Promise<FinanceDebt | undefined> {
    return getDebtById(id);
  }

  async createDebt(partial: {
    person: string;
    direction: DebtDirection;
    amount: number;
    currency?: string;
    date?: string;
    dueDate?: string;
    note?: string;
  }): Promise<FinanceDebt> {
    const now = new Date().toISOString();
    const debt: FinanceDebt = {
      id: genFinanceId(),
      person: partial.person,
      direction: partial.direction,
      amount: partial.amount,
      currency: partial.currency ?? DEFAULT_CURRENCY,
      date: partial.date ?? now.slice(0, 10),
      dueDate: partial.dueDate,
      note: partial.note,
      repayments: [],
      status: 'active',
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
    await saveDebt(debt);
    return debt;
  }

  async updateDebt(id: string, updates: Partial<Omit<FinanceDebt, 'id' | 'createdAt' | 'repayments'>>): Promise<FinanceDebt | null> {
    const existing = await getDebtById(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
    await saveDebt(updated);
    return updated;
  }

  async addRepayment(debtId: string, amount: number, date?: string, note?: string, transactionId?: string): Promise<FinanceDebt | null> {
    const debt = await getDebtById(debtId);
    if (!debt) return null;

    const now = new Date().toISOString();
    const repayment: DebtRepayment = {
      id: genFinanceId(),
      amount,
      date: date ?? now.slice(0, 10),
      note,
      transactionId,
      createdAt: now,
    };

    const updatedRepayments = [...debt.repayments, repayment];
    const remaining = this.computeRemaining(debt.amount, updatedRepayments);

    let status: DebtStatus = 'active';
    if (remaining <= 0) status = 'paid';
    else if (updatedRepayments.length > 0) status = 'partially_paid';

    const updated: FinanceDebt = {
      ...debt,
      repayments: updatedRepayments,
      status,
      updatedAt: now,
    };

    await saveDebt(updated);
    return updated;
  }

  async closeDebt(id: string, status: 'paid' | 'forgiven' | 'closed'): Promise<FinanceDebt | null> {
    return this.updateDebt(id, { status });
  }

  getRemainingBalance(debt: FinanceDebt): number {
    return this.computeRemaining(debt.amount, debt.repayments);
  }

  private computeRemaining(principal: number, repayments: DebtRepayment[]): number {
    const paid = repayments.reduce((sum, r) => sum + r.amount, 0);
    return Math.max(0, principal - paid);
  }

  async deleteDebt(id: string): Promise<void> {
    await deleteDebt(id);
  }

  async getDebtSummary(): Promise<{
    totalLent: number;
    totalBorrowed: number;
    netDebtPosition: number;
    activeDebts: FinanceDebt[];
  }> {
    const all = await this.getAllDebts();
    const active = all.filter(d => d.status === 'active' || d.status === 'partially_paid');

    let totalLent = 0;
    let totalBorrowed = 0;

    for (const debt of active) {
      const remaining = this.getRemainingBalance(debt);
      if (debt.direction === 'lent') totalLent += remaining;
      else totalBorrowed += remaining;
    }

    return {
      totalLent,
      totalBorrowed,
      netDebtPosition: totalLent - totalBorrowed,
      activeDebts: active,
    };
  }
}

export const financeDebtService = new FinanceDebtService();
