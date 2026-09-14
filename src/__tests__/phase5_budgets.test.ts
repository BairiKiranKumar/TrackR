/**
 * Phase 5 — Multi-Period Budgets Test Suite
 *
 * Tests:
 * 1. Multi-period engine bounds (weekly Monday-Sunday, monthly, yearly, custom)
 * 2. Rollover calculations (positive surplus, negative overspend, disabled)
 * 3. Budget forecasting (run-rate extrapolation, potential overspend alert)
 * 4. End-to-End Scenario 43 (Weekly budget crossing week boundary)
 */

import 'fake-indexeddb/auto';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Navigator mock for Node
const nav = globalThis.navigator as unknown as { onLine: boolean };
if (typeof nav === 'object' && nav !== null) {
  Object.defineProperty(nav, 'onLine', { value: true, writable: true, configurable: true });
} else {
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, writable: true, configurable: true });
}

import { clearAllData } from '@/lib/db/localDb';
import { financeAccountService } from '@/lib/services/finance/FinanceAccountService';
import { financeTransactionService } from '@/lib/services/finance/FinanceTransactionService';
import { financeBudgetService } from '@/lib/services/finance/FinanceBudgetService';
import { BudgetPeriodEngine } from '@/lib/services/finance/BudgetPeriodEngine';

describe('Phase 5 — Multi-Period Budgets Engine', () => {

  beforeEach(async () => {
    await clearAllData();
  });

  describe('1. Deterministic Multi-Period Bounds Engine', () => {
    it('calculates weekly bounds strictly Monday -> Sunday (ISO week)', () => {
      // Wednesday, Sep 16, 2026
      const wednesday = new Date(2026, 8, 16);
      const bounds = BudgetPeriodEngine.getPeriodBounds('weekly', wednesday);
      assert.equal(bounds.start, '2026-09-14', 'Start should be Monday Sep 14');
      assert.equal(bounds.end, '2026-09-20', 'End should be Sunday Sep 20');
      assert.equal(bounds.daysTotal, 7);
      assert.equal(bounds.daysElapsed, 3); // Mon, Tue, Wed = 3 days
      assert.equal(bounds.daysRemaining, 4);

      // Sunday, Sep 20, 2026 (day 0 in JS Date)
      const sunday = new Date(2026, 8, 20);
      const boundsSun = BudgetPeriodEngine.getPeriodBounds('weekly', sunday);
      assert.equal(boundsSun.start, '2026-09-14', 'Sunday must belong to Monday Sep 14 week');
      assert.equal(boundsSun.end, '2026-09-20');
      assert.equal(boundsSun.daysElapsed, 7);
      assert.equal(boundsSun.daysRemaining, 0);

      // Monday, Sep 21, 2026
      const monday = new Date(2026, 8, 21);
      const boundsMon = BudgetPeriodEngine.getPeriodBounds('weekly', monday);
      assert.equal(boundsMon.start, '2026-09-21');
      assert.equal(boundsMon.end, '2026-09-27');
      assert.equal(boundsMon.daysElapsed, 1);
      assert.equal(boundsMon.daysRemaining, 6);
    });

    it('calculates monthly bounds from 1st to last day', () => {
      const date = new Date(2026, 8, 10); // Sep 10, 2026
      const bounds = BudgetPeriodEngine.getPeriodBounds('monthly', date);
      assert.equal(bounds.start, '2026-09-01');
      assert.equal(bounds.end, '2026-09-30');
      assert.equal(bounds.daysTotal, 30);
      assert.equal(bounds.daysElapsed, 10);
      assert.equal(bounds.daysRemaining, 20);
    });

    it('calculates yearly bounds from Jan 1 to Dec 31', () => {
      const date = new Date(2026, 5, 15); // June 15, 2026
      const bounds = BudgetPeriodEngine.getPeriodBounds('yearly', date);
      assert.equal(bounds.start, '2026-01-01');
      assert.equal(bounds.end, '2026-12-31');
      assert.equal(bounds.daysTotal, 365);
    });

    it('calculates custom bounds with explicit start and end dates', () => {
      const bounds = BudgetPeriodEngine.getPeriodBounds(
        'custom',
        new Date(2026, 8, 15),
        '2026-09-10',
        '2026-09-25'
      );
      assert.equal(bounds.start, '2026-09-10');
      assert.equal(bounds.end, '2026-09-25');
      assert.equal(bounds.daysTotal, 16);
      assert.equal(bounds.daysElapsed, 6); // 10,11,12,13,14,15 = 6
      assert.equal(bounds.daysRemaining, 10);
    });

    it('calculates previous period bounds accurately for weekly and monthly', () => {
      // Reference date: Sep 16, 2026 (Wednesday in Sep 14 - Sep 20 week)
      const refDate = new Date(2026, 8, 16);
      const prevWeek = BudgetPeriodEngine.getPreviousPeriodBounds('weekly', refDate);
      assert.equal(prevWeek.start, '2026-09-07');
      assert.equal(prevWeek.end, '2026-09-13');

      const prevMonth = BudgetPeriodEngine.getPreviousPeriodBounds('monthly', refDate);
      assert.equal(prevMonth.start, '2026-08-01');
      assert.equal(prevMonth.end, '2026-08-31');
    });
  });

  describe('2. Budget Rollover Mechanics', () => {
    it('does not apply rollover when rollover is disabled', () => {
      const res = BudgetPeriodEngine.calculateRollover(
        { target: 10000, rollover: false },
        8000
      );
      assert.equal(res.rolloverAmount, 0);
      assert.equal(res.effectiveTarget, 10000);
    });

    it('rolls over positive surplus when rollover is enabled', () => {
      // Target: 10,000, Prev spent: 8,000 -> Unused: 2,000. Next effective: 12,000
      const res = BudgetPeriodEngine.calculateRollover(
        { target: 10000, rollover: true },
        8000
      );
      assert.equal(res.rolloverAmount, 2000);
      assert.equal(res.effectiveTarget, 12000);
    });

    it('handles negative overspend scenario when rollover is enabled', () => {
      // Target: 10,000, Prev spent: 11,500 -> Deficit: -1,500. Next effective: 8,500
      const res = BudgetPeriodEngine.calculateRollover(
        { target: 10000, rollover: true },
        11500
      );
      assert.equal(res.rolloverAmount, -1500);
      assert.equal(res.effectiveTarget, 8500);
    });
  });

  describe('3. Budget Forecasting', () => {
    it('accurately computes daily rate, projected spend, and potential overspend', () => {
      // Day 10 of 30, spent 8,000, budget 20,000
      const forecast = BudgetPeriodEngine.calculateForecast(8000, 10, 30, 20000);
      assert.equal(forecast.dailyRate, 800);
      assert.equal(forecast.projectedSpend, 24000);
      assert.equal(forecast.potentialOverspend, 4000);
      assert.equal(forecast.isProjectedOver, true);
    });

    it('reports no overspend if projected spending remains within budget', () => {
      // Day 15 of 30, spent 5,000, budget 20,000
      const forecast = BudgetPeriodEngine.calculateForecast(5000, 15, 30, 20000);
      assert.equal(forecast.dailyRate, 333.33);
      assert.equal(forecast.projectedSpend, 10000);
      assert.equal(forecast.potentialOverspend, 0);
      assert.equal(forecast.isProjectedOver, false);
    });
  });

  describe('4. End-to-End Scenario 43: Weekly budget crossing boundary', () => {
    it('tracks weekly spending and resets correctly when crossing week boundary', async () => {
      const account = await financeAccountService.createAccount({
        name: 'Weekly Checking',
        type: 'bank',
        openingBalance: 50000,
      });

      // Create weekly budget for Food: ₹5,000
      const budget = await financeBudgetService.createBudget({
        name: 'Food Weekly',
        target: 5000,
        period: 'weekly',
        startDate: '2026-09-14',
      });

      // Record 3 transactions in week 1 (Sep 14 - Sep 20, 2026): ₹1,000, ₹1,500, ₹1,000
      await financeTransactionService.createTransaction({
        accountId: account.id,
        date: '2026-09-14',
        amount: 1000,
        type: 'expense',
      });
      await financeTransactionService.createTransaction({
        accountId: account.id,
        date: '2026-09-15',
        amount: 1500,
        type: 'expense',
      });
      await financeTransactionService.createTransaction({
        accountId: account.id,
        date: '2026-09-16',
        amount: 1000,
        type: 'expense',
      });

      // Progress in week 1 (evaluated on Sep 17, 2026):
      // Spent: ₹3,500, Remaining: ₹1,500
      const week1Date = new Date(2026, 8, 17);
      const progWeek1 = await financeBudgetService.getBudgetProgress(budget.id, week1Date);
      assert.ok(progWeek1);
      assert.equal(progWeek1.spent, 3500);
      assert.equal(progWeek1.remaining, 1500);
      assert.equal(progWeek1.percentage, 70);

      // Now cross week boundary to week 2 (Sep 21 - Sep 27, 2026)
      const week2Date = new Date(2026, 8, 22);
      const progWeek2 = await financeBudgetService.getBudgetProgress(budget.id, week2Date);
      assert.ok(progWeek2);
      // Week 2 starts fresh: 0 spent, ₹5,000 remaining
      assert.equal(progWeek2.spent, 0, 'Week 2 spent should be 0 before transactions');
      assert.equal(progWeek2.remaining, 5000, 'Week 2 remaining should be full ₹5,000');
      assert.equal(progWeek2.periodStart, '2026-09-21');
      assert.equal(progWeek2.periodEnd, '2026-09-27');
    });

    it('correctly incorporates rollover into the next period when enabled', async () => {
      const account = await financeAccountService.createAccount({
        name: 'Rollover Checking',
        type: 'bank',
        openingBalance: 50000,
      });

      // Create weekly budget with rollover enabled: ₹5,000
      const budget = await financeBudgetService.createBudget({
        name: 'Weekly With Rollover',
        target: 5000,
        period: 'weekly',
        startDate: '2026-09-14',
        rollover: true,
      });

      // Week 1 (Sep 14 - Sep 20): Spend ₹3,500 (unused: ₹1,500)
      await financeTransactionService.createTransaction({
        accountId: account.id,
        date: '2026-09-15',
        amount: 3500,
        type: 'expense',
      });

      // Week 2 (Sep 21 - Sep 27):
      const week2Date = new Date(2026, 8, 22);
      const progWeek2 = await financeBudgetService.getBudgetProgress(budget.id, week2Date);
      assert.ok(progWeek2);
      assert.equal(progWeek2.rolloverAmount, 1500, 'Should roll over ₹1,500 from week 1');
      assert.equal(progWeek2.effectiveTarget, 6500, 'Effective target should be ₹5,000 + ₹1,500 = ₹6,500');
      assert.equal(progWeek2.remaining, 6500, 'Remaining should be ₹6,500');
    });
  });
});
