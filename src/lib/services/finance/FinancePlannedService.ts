import { FinancePlannedPayment, FinanceTransaction, Recurrence, DEFAULT_CURRENCY } from '@/types/finance';
import {
  getAllPlannedPayments, getPlannedPaymentById, savePlannedPayment, deletePlannedPayment,
  genFinanceId,
} from '@/lib/db/localDb';
import { financeTransactionService } from './FinanceTransactionService';

export class FinancePlannedService {

  async getAllPlannedPayments(): Promise<FinancePlannedPayment[]> {
    return getAllPlannedPayments();
  }

  async getActivePlannedPayments(): Promise<FinancePlannedPayment[]> {
    const all = await getAllPlannedPayments();
    return all.filter(p => p.status !== 'cancelled');
  }

  async getPlannedPaymentById(id: string): Promise<FinancePlannedPayment | undefined> {
    return getPlannedPaymentById(id);
  }

  async createPlannedPayment(partial: {
    name: string;
    amount: number;
    currency?: string;
    accountId?: string;
    categoryId?: string;
    payee?: string;
    note?: string;
    dueDate: string;
    recurrence: Recurrence;
    autoCreate?: boolean;
    reminderDays?: number;
  }): Promise<FinancePlannedPayment> {
    const now = new Date().toISOString();
    const payment: FinancePlannedPayment = {
      id: genFinanceId(),
      name: partial.name,
      amount: partial.amount,
      currency: partial.currency ?? DEFAULT_CURRENCY,
      accountId: partial.accountId,
      categoryId: partial.categoryId,
      payee: partial.payee,
      note: partial.note,
      dueDate: partial.dueDate,
      recurrence: partial.recurrence,
      autoCreate: partial.autoCreate ?? false,
      reminderDays: partial.reminderDays ?? 3,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    await savePlannedPayment(payment);
    return payment;
  }

  async updatePlannedPayment(id: string, updates: Partial<Omit<FinancePlannedPayment, 'id' | 'createdAt'>>): Promise<FinancePlannedPayment | null> {
    const existing = await getPlannedPaymentById(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
    await savePlannedPayment(updated);
    return updated;
  }

  async deletePlannedPayment(id: string): Promise<void> {
    await deletePlannedPayment(id);
  }

  /** Confirm a planned payment: creates an actual transaction */
  async confirmPayment(id: string, overrides?: Partial<Pick<FinancePlannedPayment, 'amount' | 'accountId' | 'categoryId' | 'note'>>): Promise<FinanceTransaction | null> {
    const payment = await getPlannedPaymentById(id);
    if (!payment || !payment.accountId) return null;

    const transaction = await financeTransactionService.createTransaction({
      accountId: overrides?.accountId ?? payment.accountId,
      date: payment.dueDate,
      amount: overrides?.amount ?? payment.amount,
      currency: payment.currency,
      type: 'expense',
      categoryId: overrides?.categoryId ?? payment.categoryId,
      payee: payment.payee,
      note: overrides?.note ?? payment.note,
      source: 'recurring',
      sourceReference: payment.id,
      recurringId: payment.id,
    });

    // Advance due date for recurring payments
    const nextDueDate = this.computeNextDueDate(payment.dueDate, payment.recurrence);
    const newStatus = payment.recurrence.frequency === 'once' ? 'paid' : 'pending';

    await savePlannedPayment({
      ...payment,
      dueDate: nextDueDate ?? payment.dueDate,
      status: newStatus,
      lastTransactionId: transaction.id,
      updatedAt: new Date().toISOString(),
    });

    return transaction;
  }

  /** Skip a planned payment occurrence */
  async skipPayment(id: string): Promise<void> {
    const payment = await getPlannedPaymentById(id);
    if (!payment) return;
    const nextDueDate = this.computeNextDueDate(payment.dueDate, payment.recurrence);
    await savePlannedPayment({
      ...payment,
      dueDate: nextDueDate ?? payment.dueDate,
      status: payment.recurrence.frequency === 'once' ? 'skipped' : 'pending',
      updatedAt: new Date().toISOString(),
    });
  }

  async getUpcoming(days = 30): Promise<FinancePlannedPayment[]> {
    const all = await this.getActivePlannedPayments();
    const today = new Date().toISOString().slice(0, 10);
    const limit = new Date();
    limit.setDate(limit.getDate() + days);
    const limitStr = limit.toISOString().slice(0, 10);
    return all
      .filter(p => p.dueDate >= today && p.dueDate <= limitStr)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }

  async getOverdue(): Promise<FinancePlannedPayment[]> {
    const all = await this.getActivePlannedPayments();
    const today = new Date().toISOString().slice(0, 10);
    return all.filter(p => p.dueDate < today && p.status === 'pending');
  }

  /** Generate cash flow forecast entries */
  async generateForecast(days = 60): Promise<{
    date: string;
    label: string;
    amount: number;
    type: 'planned' | 'projected';
    paymentId: string;
  }[]> {
    const upcoming = await this.getUpcoming(days);
    return upcoming.map(p => ({
      date: p.dueDate,
      label: p.name,
      amount: p.amount,
      type: 'planned' as const,
      paymentId: p.id,
    }));
  }

  private computeNextDueDate(currentDue: string, recurrence: Recurrence): string | null {
    if (recurrence.frequency === 'once') return null;

    const date = new Date(currentDue);
    const interval = recurrence.interval ?? 1;

    switch (recurrence.frequency) {
      case 'daily': date.setDate(date.getDate() + interval); break;
      case 'weekly': date.setDate(date.getDate() + interval * 7); break;
      case 'monthly': date.setMonth(date.getMonth() + interval); break;
      case 'yearly': date.setFullYear(date.getFullYear() + interval); break;
      case 'custom': date.setDate(date.getDate() + interval); break;
    }

    const next = date.toISOString().slice(0, 10);

    // Check if we've exceeded max occurrences / end date
    if (recurrence.endDate && next > recurrence.endDate) return null;

    return next;
  }
}

export const financePlannedService = new FinancePlannedService();
