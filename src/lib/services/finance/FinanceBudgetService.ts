import {
  FinanceBudget, FinanceBudgetProgress, BudgetPeriod, DEFAULT_CURRENCY,
} from '@/types/finance';
import {
  getAllBudgets, getBudgetById, saveBudget, deleteBudget,
  queryTransactions, getAllCategories, genFinanceId,
} from '@/lib/db/localDb';
import { BudgetPeriodEngine } from './BudgetPeriodEngine';
import { syncQueueService } from '../SyncQueueService';

export class FinanceBudgetService {

  async getAllBudgets(): Promise<FinanceBudget[]> {
    return getAllBudgets();
  }

  async getActiveBudgets(): Promise<FinanceBudget[]> {
    const all = await getAllBudgets();
    return all.filter(b => !b.archived);
  }

  async getBudgetById(id: string): Promise<FinanceBudget | undefined> {
    return getBudgetById(id);
  }

  async createBudget(partial: {
    name: string;
    target: number;
    currency?: string;
    period: BudgetPeriod;
    startDate: string;
    endDate?: string;
    categoryId?: string;
    accountId?: string;
    labelId?: string;
    rollover?: boolean;
    alertThreshold?: number;
  }): Promise<FinanceBudget> {
    const now = new Date().toISOString();
    const budget: FinanceBudget = {
      id: genFinanceId(),
      name: partial.name,
      target: partial.target,
      currency: partial.currency ?? DEFAULT_CURRENCY,
      period: partial.period,
      startDate: partial.startDate,
      endDate: partial.endDate,
      categoryId: partial.categoryId,
      accountId: partial.accountId,
      labelId: partial.labelId,
      rollover: partial.rollover ?? false,
      alertThreshold: partial.alertThreshold ?? 0.8,
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
    await saveBudget(budget);
    await syncQueueService.enqueue('fa_budget', budget.id, 'upsert', budget);
    return budget;
  }

  async updateBudget(id: string, updates: Partial<Omit<FinanceBudget, 'id' | 'createdAt'>>): Promise<FinanceBudget | null> {
    const existing = await getBudgetById(id);
    if (!existing) return null;
    const updated: FinanceBudget = {
      ...existing,
      ...updates,
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await saveBudget(updated);
    await syncQueueService.enqueue('fa_budget', updated.id, 'upsert', updated);
    return updated;
  }

  async deleteBudget(id: string): Promise<void> {
    await deleteBudget(id);
    await syncQueueService.enqueue('fa_budget', id, 'delete');
  }

  /**
   * Calculate real budget progress from actual transactions.
   * Uses deterministic multi-period bounds, rollover where enabled, and spending forecast.
   * Never uses fake percentages — always derived from transaction data.
   */
  async getBudgetProgress(budgetId: string, referenceDate = new Date()): Promise<FinanceBudgetProgress | null> {
    const budget = await getBudgetById(budgetId);
    if (!budget) return null;

    const bounds = BudgetPeriodEngine.getPeriodBounds(
      budget.period,
      referenceDate,
      budget.startDate,
      budget.endDate
    );

    const filter: Parameters<typeof queryTransactions>[0] = {
      dateStart: bounds.start,
      dateEnd: bounds.end,
    };
    if (budget.categoryId) filter.categoryId = budget.categoryId;
    if (budget.accountId) filter.accountId = budget.accountId;
    if (budget.labelId) filter.labelId = budget.labelId;

    const transactions = await queryTransactions(filter);
    const expenses = transactions.filter(t => t.type === 'expense');
    const spent = expenses.reduce((sum, t) => sum + t.amount, 0);

    // Calculate rollover if enabled
    let rolloverAmount = 0;
    let effectiveTarget = budget.target;

    if (budget.rollover) {
      const prevBounds = BudgetPeriodEngine.getPreviousPeriodBounds(
        budget.period,
        referenceDate,
        budget.startDate,
        budget.endDate
      );

      const prevFilter: Parameters<typeof queryTransactions>[0] = {
        dateStart: prevBounds.start,
        dateEnd: prevBounds.end,
      };
      if (budget.categoryId) prevFilter.categoryId = budget.categoryId;
      if (budget.accountId) prevFilter.accountId = budget.accountId;
      if (budget.labelId) prevFilter.labelId = budget.labelId;

      const prevTxns = await queryTransactions(prevFilter);
      const prevExpenses = prevTxns.filter(t => t.type === 'expense');
      const prevSpent = prevExpenses.reduce((sum, t) => sum + t.amount, 0);

      const rolloverRes = BudgetPeriodEngine.calculateRollover(budget, prevSpent, budget.target);
      rolloverAmount = rolloverRes.rolloverAmount;
      effectiveTarget = rolloverRes.effectiveTarget;
    }

    const remaining = Math.max(0, effectiveTarget - spent);
    const percentage = effectiveTarget > 0 ? (spent / effectiveTarget) * 100 : 0;

    // Spending forecast
    const forecast = BudgetPeriodEngine.calculateForecast(
      spent,
      bounds.daysElapsed,
      bounds.daysTotal,
      effectiveTarget
    );

    // Category name for display
    const categories = await getAllCategories();
    const cat = budget.categoryId ? categories.find(c => c.id === budget.categoryId) : undefined;

    return {
      budget,
      categoryName: cat?.name,
      spent,
      remaining,
      percentage,
      projectedSpend: forecast.projectedSpend,
      potentialOverspend: forecast.potentialOverspend,
      daysRemaining: bounds.daysRemaining,
      daysTotal: bounds.daysTotal,
      daysElapsed: bounds.daysElapsed,
      dailyRate: forecast.dailyRate,
      rolloverAmount,
      effectiveTarget,
      periodStart: bounds.start,
      periodEnd: bounds.end,
      isAlert: percentage >= budget.alertThreshold * 100,
      isOver: percentage >= 100,
    };
  }

  async getAllBudgetProgress(referenceDate = new Date()): Promise<FinanceBudgetProgress[]> {
    const budgets = await this.getActiveBudgets();
    const progresses = await Promise.all(budgets.map(b => this.getBudgetProgress(b.id, referenceDate)));
    return progresses
      .filter((p): p is FinanceBudgetProgress => p !== null)
      .sort((a, b) => b.percentage - a.percentage);
  }

  async getBudgetAlerts(referenceDate = new Date()): Promise<FinanceBudgetProgress[]> {
    const all = await this.getAllBudgetProgress(referenceDate);
    return all.filter(p => p.isAlert);
  }
}

export const financeBudgetService = new FinanceBudgetService();
