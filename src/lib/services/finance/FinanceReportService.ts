import {
  DateRange, CategoryTotal, MonthlyTotal, NetWorthSnapshot, CashFlowEntry,
  AccountBalance, isAssetAccount, isLiabilityAccount,
} from '@/types/finance';
import {
  getAllTransactions, getAllAccounts, getAllCategories,
  queryTransactions, TransactionFilter,
} from '@/lib/db/localDb';
import { financeAccountService } from './FinanceAccountService';
import { financeBudgetService } from './FinanceBudgetService';
import { financeInvestmentService } from './FinanceInvestmentService';
import { financeDebtService } from './FinanceDebtService';
import { financePlannedService } from './FinancePlannedService';

export class FinanceReportService {

  // ── 1. Income vs Expenses ─────────────────────────────────────────────────

  async getIncomeVsExpenses(dateRange: DateRange, filter?: TransactionFilter): Promise<{
    income: number;
    expenses: number;
    net: number;
    months: MonthlyTotal[];
  }> {
    const txns = await queryTransactions({ ...filter, dateStart: dateRange.start, dateEnd: dateRange.end });
    const nonTransfers = txns.filter(t => t.type !== 'transfer');

    let income = 0;
    let expenses = 0;
    const byMonth: Record<string, { income: number; expenses: number }> = {};

    for (const t of nonTransfers) {
      const month = t.date.slice(0, 7); // YYYY-MM
      if (!byMonth[month]) byMonth[month] = { income: 0, expenses: 0 };
      if (t.type === 'income') {
        income += t.amount;
        byMonth[month].income += t.amount;
      } else {
        expenses += t.amount;
        byMonth[month].expenses += t.amount;
      }
    }

    const months: MonthlyTotal[] = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, vals]) => ({
        month,
        income: vals.income,
        expenses: vals.expenses,
        net: vals.income - vals.expenses,
      }));

    return { income, expenses, net: income - expenses, months };
  }

  // ── 2. Spending by Category ────────────────────────────────────────────────

  async getSpendingByCategory(dateRange: DateRange, filter?: TransactionFilter): Promise<CategoryTotal[]> {
    const txns = await queryTransactions({ ...filter, dateStart: dateRange.start, dateEnd: dateRange.end });
    const expenses = txns.filter(t => t.type === 'expense');
    const categories = await getAllCategories();
    const catMap = new Map(categories.map(c => [c.id, c]));

    const totals: Record<string, { amount: number; count: number }> = {};
    let grandTotal = 0;

    for (const t of expenses) {
      const catId = t.categoryId ?? '__uncategorized__';
      if (!totals[catId]) totals[catId] = { amount: 0, count: 0 };
      totals[catId].amount += t.amount;
      totals[catId].count++;
      grandTotal += t.amount;
    }

    return Object.entries(totals)
      .map(([catId, vals]) => {
        const cat = catMap.get(catId);
        return {
          categoryId: catId,
          categoryName: cat?.name ?? 'Uncategorized',
          parentId: cat?.parentId,
          amount: vals.amount,
          count: vals.count,
          percentage: grandTotal > 0 ? (vals.amount / grandTotal) * 100 : 0,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }

  // ── 3. Spending by Account ─────────────────────────────────────────────────

  async getSpendingByAccount(dateRange: DateRange): Promise<{ accountId: string; accountName: string; expenses: number; income: number; net: number }[]> {
    const txns = await queryTransactions({ dateStart: dateRange.start, dateEnd: dateRange.end });
    const accounts = await getAllAccounts();
    const accMap = new Map(accounts.map(a => [a.id, a]));

    const byAccount: Record<string, { expenses: number; income: number }> = {};
    for (const t of txns) {
      if (t.type === 'transfer') continue;
      if (!byAccount[t.accountId]) byAccount[t.accountId] = { expenses: 0, income: 0 };
      if (t.type === 'expense') byAccount[t.accountId].expenses += t.amount;
      else byAccount[t.accountId].income += t.amount;
    }

    return Object.entries(byAccount).map(([accountId, vals]) => ({
      accountId,
      accountName: accMap.get(accountId)?.name ?? 'Unknown Account',
      expenses: vals.expenses,
      income: vals.income,
      net: vals.income - vals.expenses,
    })).sort((a, b) => b.expenses - a.expenses);
  }

  // ── 4. Spending by Label ───────────────────────────────────────────────────

  async getSpendingByLabel(dateRange: DateRange): Promise<{ labelId: string; amount: number; count: number }[]> {
    const txns = await queryTransactions({ dateStart: dateRange.start, dateEnd: dateRange.end });
    const expenses = txns.filter(t => t.type === 'expense');

    const byLabel: Record<string, { amount: number; count: number }> = {};
    for (const t of expenses) {
      for (const labelId of t.labels) {
        if (!byLabel[labelId]) byLabel[labelId] = { amount: 0, count: 0 };
        byLabel[labelId].amount += t.amount;
        byLabel[labelId].count++;
      }
    }

    return Object.entries(byLabel).map(([labelId, vals]) => ({ labelId, ...vals })).sort((a, b) => b.amount - a.amount);
  }

  // ── 5. Monthly Spending Trend ──────────────────────────────────────────────

  async getMonthlyTrend(months = 12): Promise<MonthlyTotal[]> {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months + 1);
    startDate.setDate(1);

    const dateRange: DateRange = {
      start: startDate.toISOString().slice(0, 10),
      end: endDate.toISOString().slice(0, 10),
    };

    const result = await this.getIncomeVsExpenses(dateRange);
    return result.months;
  }

  // ── 6. Cash Flow ──────────────────────────────────────────────────────────

  async getCashFlow(dateRange: DateRange): Promise<{
    totalIncome: number;
    totalExpenses: number;
    netCashFlow: number;
    byMonth: MonthlyTotal[];
  }> {
    const res = await this.getIncomeVsExpenses(dateRange);
    return {
      totalIncome: res.income,
      totalExpenses: res.expenses,
      netCashFlow: res.net,
      byMonth: res.months,
    };
  }

  // ── 7. Budget Performance ─────────────────────────────────────────────────

  async getBudgetPerformance(): Promise<Awaited<ReturnType<typeof financeBudgetService.getAllBudgetProgress>>> {
    return financeBudgetService.getAllBudgetProgress();
  }

  // ── 8. Recurring Expenses ─────────────────────────────────────────────────

  async getRecurringExpenses(): Promise<{ recurringId: string; name: string; totalSpent: number; count: number; lastDate: string }[]> {
    const all = await getAllTransactions();
    const recurring = all.filter(t => t.recurringId && t.type === 'expense');

    const byRecurring: Record<string, { totalSpent: number; count: number; lastDate: string; name: string }> = {};
    for (const t of recurring) {
      const key = t.recurringId!;
      if (!byRecurring[key]) byRecurring[key] = { totalSpent: 0, count: 0, lastDate: '', name: t.payee ?? key };
      byRecurring[key].totalSpent += t.amount;
      byRecurring[key].count++;
      if (t.date > byRecurring[key].lastDate) byRecurring[key].lastDate = t.date;
    }

    return Object.entries(byRecurring).map(([recurringId, vals]) => ({ recurringId, ...vals })).sort((a, b) => b.totalSpent - a.totalSpent);
  }

  // ── 9. Top Payees ─────────────────────────────────────────────────────────

  async getTopPayees(dateRange: DateRange, limit = 10): Promise<{ payee: string; amount: number; count: number }[]> {
    const txns = await queryTransactions({ dateStart: dateRange.start, dateEnd: dateRange.end });
    const expenses = txns.filter(t => t.type === 'expense' && t.payee);

    const byPayee: Record<string, { amount: number; count: number }> = {};
    for (const t of expenses) {
      const payee = t.payee!;
      if (!byPayee[payee]) byPayee[payee] = { amount: 0, count: 0 };
      byPayee[payee].amount += t.amount;
      byPayee[payee].count++;
    }

    return Object.entries(byPayee)
      .map(([payee, vals]) => ({ payee, ...vals }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, limit);
  }

  // ── 10. Net Worth ─────────────────────────────────────────────────────────

  async getNetWorth(): Promise<NetWorthSnapshot> {
    const { totalAssets, totalLiabilities, netWorth, accounts } = await financeAccountService.getNetWorthBreakdown();
    const { currentValue: investmentValue } = await financeInvestmentService.getPortfolioSummary();
    const { totalBorrowed: debtOutstanding } = await financeDebtService.getDebtSummary();

    const accountBalances: AccountBalance[] = accounts.map(acc => ({
      account: acc,
      balance: acc.currentBalance,
      isAsset: isAssetAccount(acc.type),
      isLiability: isLiabilityAccount(acc.type),
    }));

    return {
      totalAssets: totalAssets + investmentValue,
      totalLiabilities: totalLiabilities + debtOutstanding,
      netWorth: netWorth + investmentValue - debtOutstanding,
      accountBalances,
      investmentValue,
      debtOutstanding,
      calculatedAt: new Date().toISOString(),
    };
  }

  // ── Cash Flow Forecast ────────────────────────────────────────────────────

  async getCashFlowForecast(days = 60): Promise<CashFlowEntry[]> {
    const accounts = await financeAccountService.getActiveAccounts();
    const totalBalance = accounts.reduce((sum, a) => sum + a.currentBalance, 0);

    const forecast = await financePlannedService.generateForecast(days);
    const entries: CashFlowEntry[] = [];

    let runningBalance = totalBalance;

    // Sort by date
    const sorted = forecast.sort((a, b) => a.date.localeCompare(b.date));

    for (const item of sorted) {
      runningBalance -= item.amount; // planned payments are expenses
      entries.push({
        date: item.date,
        label: item.label,
        type: 'planned',
        amount: -item.amount,
        runningBalance,
      });
    }

    return entries;
  }

  // ── Project financial summary ──────────────────────────────────────────────

  async getProjectFinancialSummary(projectId: string): Promise<{
    totalExpenses: number;
    totalIncome: number;
    net: number;
    transactionCount: number;
  }> {
    const txns = await queryTransactions({ projectId });
    const nonTransfers = txns.filter(t => t.type !== 'transfer');
    let totalExpenses = 0;
    let totalIncome = 0;
    for (const t of nonTransfers) {
      if (t.type === 'expense') totalExpenses += t.amount;
      else totalIncome += t.amount;
    }
    return { totalExpenses, totalIncome, net: totalIncome - totalExpenses, transactionCount: nonTransfers.length };
  }

  // ── Goal financial progress ────────────────────────────────────────────────

  async getGoalFinancialProgress(goalId: string): Promise<{
    totalSaved: number;
    transactionCount: number;
  }> {
    const txns = await queryTransactions({ goalId });
    const income = txns.filter(t => t.type === 'income');
    const totalSaved = income.reduce((sum, t) => sum + t.amount, 0);
    return { totalSaved, transactionCount: income.length };
  }
}

export const financeReportService = new FinanceReportService();
