import { FinancePlannedPayment, FinanceTransaction, Recurrence, DEFAULT_CURRENCY } from '@/types/finance';
import {
  getAllPlannedPayments, getPlannedPaymentById, savePlannedPayment, deletePlannedPayment,
  queryTransactions, genFinanceId,
} from '@/lib/db/localDb';
import { financeTransactionService } from './FinanceTransactionService';

function toLocalDateString(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

  /** Stable recurrence identity for an occurrence */
  generateOccurrenceId(paymentId: string, dueDate: string): string {
    return `rec_${paymentId}_${dueDate.slice(0, 10)}`;
  }

  /** Check if an occurrence has already been generated as a transaction */
  async hasOccurrenceBeenGenerated(paymentId: string, dueDate: string): Promise<boolean> {
    const occId = this.generateOccurrenceId(paymentId, dueDate);
    const existing = await queryTransactions({ recurringId: paymentId });
    return existing.some(t => t.sourceReference === occId || t.date === dueDate.slice(0, 10));
  }

  /** Confirm a planned payment: creates an actual transaction with stable recurrence identity */
  async confirmPayment(
    id: string,
    overrides?: Partial<Pick<FinancePlannedPayment, 'amount' | 'accountId' | 'categoryId' | 'note'>> & { date?: string }
  ): Promise<FinanceTransaction | null> {
    const payment = await getPlannedPaymentById(id);
    if (!payment || !payment.accountId) return null;

    const targetDate = overrides?.date ?? payment.dueDate;
    const occId = this.generateOccurrenceId(payment.id, targetDate);
    const alreadyGenerated = await this.hasOccurrenceBeenGenerated(payment.id, targetDate);
    if (alreadyGenerated) {
      // Find and return existing transaction without creating duplicate
      const txns = await queryTransactions({ recurringId: payment.id });
      const existing = txns.find(t => t.sourceReference === occId || t.date === targetDate.slice(0, 10));
      if (existing) return existing;
    }

    const transaction = await financeTransactionService.createTransaction({
      accountId: overrides?.accountId ?? payment.accountId,
      date: targetDate,
      amount: overrides?.amount ?? payment.amount,
      currency: payment.currency,
      type: 'expense',
      categoryId: overrides?.categoryId ?? payment.categoryId,
      payee: payment.payee,
      note: overrides?.note ?? payment.note,
      source: 'recurring',
      sourceReference: occId,
      recurringId: payment.id,
    });

    // Advance due date for recurring payments
    const nextDueDate = this.computeNextDueDate(targetDate, payment.recurrence);
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

  /**
   * Deterministic recurrence engine:
   * 1. Evaluates all active planned payments.
   * 2. If autoCreate is true and payment is due on or before referenceDate:
   *    Checks if occurrence was already generated.
   *    If not, creates the transaction, logs occurrenceId, advances dueDate.
   * 3. If autoCreate is false (default):
   *    Generates an upcoming reminder (due in N days) for Attention/UI.
   *    Never silently debits or creates real transactions without user confirmation.
   */
  async processRecurrenceEngine(referenceDate = new Date()): Promise<{
    generatedTransactions: FinanceTransaction[];
    upcomingReminders: { payment: FinancePlannedPayment; daysRemaining: number }[];
  }> {
    const today = toLocalDateString(referenceDate);
    const payments = await this.getActivePlannedPayments();
    const generatedTransactions: FinanceTransaction[] = [];
    const upcomingReminders: { payment: FinancePlannedPayment; daysRemaining: number }[] = [];

    for (const payment of payments) {
      if (payment.status !== 'pending' || !payment.dueDate) continue;

      const dueDay = payment.dueDate.slice(0, 10);
      const diffDays = Math.ceil((new Date(dueDay).getTime() - new Date(today).getTime()) / 86400000);

      // Auto-create only when explicitly enabled and due on or before reference date
      if (payment.autoCreate && dueDay <= today) {
        const alreadyGenerated = await this.hasOccurrenceBeenGenerated(payment.id, dueDay);
        if (!alreadyGenerated && payment.accountId) {
          const occId = this.generateOccurrenceId(payment.id, dueDay);
          const txn = await financeTransactionService.createTransaction({
            accountId: payment.accountId,
            date: dueDay,
            amount: payment.amount,
            currency: payment.currency,
            type: 'expense',
            categoryId: payment.categoryId,
            payee: payment.payee,
            note: payment.note,
            source: 'recurring',
            sourceReference: occId,
            recurringId: payment.id,
          });

          generatedTransactions.push(txn);

          const nextDueDate = this.computeNextDueDate(payment.dueDate, payment.recurrence);
          const newStatus = payment.recurrence.frequency === 'once' ? 'paid' : 'pending';

          await savePlannedPayment({
            ...payment,
            dueDate: nextDueDate ?? payment.dueDate,
            status: newStatus,
            lastTransactionId: txn.id,
            updatedAt: new Date().toISOString(),
          });
        }
      } else if (diffDays >= 0 && diffDays <= (payment.reminderDays ?? 3)) {
        upcomingReminders.push({ payment, daysRemaining: diffDays });
      }
    }

    return { generatedTransactions, upcomingReminders };
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

    const [y, m, d] = currentDue.slice(0, 10).split('-').map(Number);
    const date = new Date(y, m - 1, d);
    const interval = recurrence.interval ?? 1;

    switch (recurrence.frequency) {
      case 'daily': date.setDate(date.getDate() + interval); break;
      case 'weekly': date.setDate(date.getDate() + interval * 7); break;
      case 'monthly': date.setMonth(date.getMonth() + interval); break;
      case 'yearly': date.setFullYear(date.getFullYear() + interval); break;
      case 'custom': date.setDate(date.getDate() + interval); break;
    }

    const next = toLocalDateString(date);

    // Check if we've exceeded max occurrences / end date
    if (recurrence.endDate && next > recurrence.endDate) return null;

    return next;
  }
}

export const financePlannedService = new FinancePlannedService();
