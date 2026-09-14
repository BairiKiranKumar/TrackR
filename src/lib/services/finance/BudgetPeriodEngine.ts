import { BudgetPeriod, FinanceBudget } from '@/types/finance';

export interface PeriodBounds {
  start: string;          // YYYY-MM-DD
  end: string;            // YYYY-MM-DD
  daysTotal: number;
  daysElapsed: number;
  daysRemaining: number;
}

export interface RolloverResult {
  rolloverAmount: number;
  effectiveTarget: number;
  previousSpent: number;
  previousTarget: number;
}

export interface ForecastResult {
  projectedSpend: number;
  potentialOverspend: number;
  dailyRate: number;
  isProjectedOver: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function formatDateStr(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDateStr(str: string): Date {
  const [y, m, d] = str.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * BudgetPeriodEngine: Deterministic multi-period calculation engine.
 * Never hardcodes monthly calculations.
 * Supports weekly (Monday → Sunday), monthly, yearly, and custom.
 */
export class BudgetPeriodEngine {

  /**
   * Calculate current period bounds (start, end, daysTotal, daysElapsed, daysRemaining)
   * Weekly strictly runs Monday -> Sunday (ISO week).
   */
  static getPeriodBounds(
    period: BudgetPeriod,
    referenceDate: Date = new Date(),
    customStart?: string,
    customEnd?: string
  ): PeriodBounds {
    const y = referenceDate.getFullYear();
    const m = referenceDate.getMonth();
    const d = referenceDate.getDate();

    let startDate: Date;
    let endDate: Date;

    switch (period) {
      case 'weekly': {
        // ISO 8601 week: Monday (1) to Sunday (7 / 0 in JS Date)
        const dayOfWeek = referenceDate.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
        const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
        startDate = new Date(y, m, d + diffToMonday);
        endDate = new Date(y, m, d + diffToMonday + 6);
        break;
      }
      case 'monthly': {
        startDate = new Date(y, m, 1);
        endDate = new Date(y, m + 1, 0); // Last day of month
        break;
      }
      case 'yearly': {
        startDate = new Date(y, 0, 1);
        endDate = new Date(y, 11, 31);
        break;
      }
      case 'custom': {
        if (customStart && customEnd) {
          startDate = parseDateStr(customStart);
          endDate = parseDateStr(customEnd);
        } else if (customStart) {
          startDate = parseDateStr(customStart);
          endDate = parseDateStr(customStart);
        } else {
          startDate = new Date(y, m, d);
          endDate = new Date(y, m, d);
        }
        break;
      }
    }

    const startStr = formatDateStr(startDate);
    const endStr = formatDateStr(endDate);

    const msPerDay = 86400000;
    const totalDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / msPerDay) + 1);

    const refDateOnly = new Date(y, m, d);
    let elapsedDays = Math.round((refDateOnly.getTime() - startDate.getTime()) / msPerDay) + 1;
    elapsedDays = Math.max(1, Math.min(elapsedDays, totalDays));

    const remainingDays = Math.max(0, totalDays - elapsedDays);

    return {
      start: startStr,
      end: endStr,
      daysTotal: totalDays,
      daysElapsed: elapsedDays,
      daysRemaining: remainingDays,
    };
  }

  /**
   * Calculate previous period bounds for rollover calculations.
   */
  static getPreviousPeriodBounds(
    period: BudgetPeriod,
    referenceDate: Date = new Date(),
    customStart?: string,
    customEnd?: string
  ): PeriodBounds {
    const y = referenceDate.getFullYear();
    const m = referenceDate.getMonth();
    const d = referenceDate.getDate();

    let prevRefDate: Date;

    switch (period) {
      case 'weekly': {
        prevRefDate = new Date(y, m, d - 7);
        return this.getPeriodBounds('weekly', prevRefDate);
      }
      case 'monthly': {
        // Last month: 15th of previous month to avoid edge-of-month quirks
        prevRefDate = new Date(y, m - 1, 15);
        return this.getPeriodBounds('monthly', prevRefDate);
      }
      case 'yearly': {
        prevRefDate = new Date(y - 1, 5, 1);
        return this.getPeriodBounds('yearly', prevRefDate);
      }
      case 'custom': {
        if (customStart && customEnd) {
          const curStart = parseDateStr(customStart);
          const curEnd = parseDateStr(customEnd);
          const msPerDay = 86400000;
          const durationDays = Math.max(1, Math.round((curEnd.getTime() - curStart.getTime()) / msPerDay) + 1);
          const prevEnd = new Date(curStart.getTime() - msPerDay);
          const prevStart = new Date(prevEnd.getTime() - (durationDays - 1) * msPerDay);
          return {
            start: formatDateStr(prevStart),
            end: formatDateStr(prevEnd),
            daysTotal: durationDays,
            daysElapsed: durationDays,
            daysRemaining: 0,
          };
        }
        prevRefDate = new Date(y, m, d - 1);
        return this.getPeriodBounds('custom', prevRefDate);
      }
    }
  }

  /**
   * Calculate rollover amount and effective target.
   * If rollover is disabled, returns 0 rollover.
   * If rollover is enabled:
   *   rollover = previousTarget - previousSpent
   *   effectiveTarget = Math.max(0, baseTarget + rollover)
   */
  static calculateRollover(
    budget: Pick<FinanceBudget, 'target' | 'rollover'>,
    previousPeriodSpent: number,
    previousPeriodTarget?: number
  ): RolloverResult {
    const baseTarget = budget.target;
    if (!budget.rollover) {
      return {
        rolloverAmount: 0,
        effectiveTarget: baseTarget,
        previousSpent: previousPeriodSpent,
        previousTarget: previousPeriodTarget ?? baseTarget,
      };
    }

    const prevTarget = previousPeriodTarget ?? baseTarget;
    const unused = prevTarget - previousPeriodSpent;
    const effectiveTarget = Math.max(0, baseTarget + unused);

    return {
      rolloverAmount: unused,
      effectiveTarget,
      previousSpent: previousPeriodSpent,
      previousTarget: prevTarget,
    };
  }

  /**
   * Deterministic spend projection based on actual spending and elapsed days.
   * Never presents projection as actual spending.
   */
  static calculateForecast(
    spent: number,
    daysElapsed: number,
    daysTotal: number,
    effectiveTarget: number
  ): ForecastResult {
    const safeDaysElapsed = Math.max(1, daysElapsed);
    const dailyRate = Math.round((spent / safeDaysElapsed) * 100) / 100;
    const projectedSpend = daysElapsed < daysTotal
      ? Math.round(((spent / safeDaysElapsed) * daysTotal) * 100) / 100
      : spent;

    const potentialOverspend = Math.max(0, Math.round((projectedSpend - effectiveTarget) * 100) / 100);
    const isProjectedOver = projectedSpend > effectiveTarget;

    return {
      projectedSpend,
      potentialOverspend,
      dailyRate,
      isProjectedOver,
    };
  }
}
