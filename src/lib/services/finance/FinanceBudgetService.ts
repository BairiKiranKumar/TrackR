import {
  FinanceBudget, FinanceBudgetProgress, BudgetPeriod,
  getPeriodDateRange, DEFAULT_CURRENCY,
} from '@/types/finance';
import {
  getAllBudgets, getBudgetById, saveBudget, deleteBudget,
  queryTransactions, getAllCategories, genFinanceId,
} from '@/lib/db/localDb';

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
    return updated;
  }

  async deleteBudget(id: string): Promise<void> {
    await deleteBudget(id);
  }

  /**
   * Calculate real budget progress from actual transactions.
   * Never uses fake percentages — always derived from transaction data.
   */
  async getBudgetProgress(budgetId: string, referenceDate = new Date()): Promise<FinanceBudgetProgress | null> {
    const budget = await getBudgetById(budgetId);
    if (!budget) return null;

    const { start, end } = budget.period === 'custom'
      ? { start: budget.startDate, end: budget.endDate ?? budget.startDate }
      : getPeriodDateRange(budget.period, referenceDate);

    const filter: Parameters<typeof queryTransactions>[0] = {
      dateStart: start,
      dateEnd: end,
    };
    if (budget.categoryId) filter.categoryId = budget.categoryId;
    if (budget.accountId) filter.accountId = budget.accountId;
    if (budget.labelId) filter.labelId = budget.labelId;

    const transactions = await queryTransactions(filter);
    const expenses = transactions.filter(t => t.type === 'expense');

    const spent = expenses.reduce((sum, t) => sum + t.amount, 0);
    const remaining = Math.max(0, budget.target - spent);
    const percentage = budget.target > 0 ? (spent / budget.target) * 100 : 0;

    // Simple projected spend: extrapolate based on days elapsed
    const today = new Date();
    const periodStart = new Date(start);
    const periodEnd = new Date(end);
    const totalDays = Math.max(1, Math.ceil((periodEnd.getTime() - periodStart.getTime()) / 86400000));
    const elapsedDays = Math.max(1, Math.ceil((today.getTime() - periodStart.getTime()) / 86400000));
    const dailyRate = spent / elapsedDays;
    const projectedSpend = elapsedDays < totalDays ? dailyRate * totalDays : spent;

    // Category name for display
    const categories = await getAllCategories();
    const cat = budget.categoryId ? categories.find(c => c.id === budget.categoryId) : undefined;

    return {
      budget,
      categoryName: cat?.name,
      spent,
      remaining,
      percentage,
      projectedSpend,
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
