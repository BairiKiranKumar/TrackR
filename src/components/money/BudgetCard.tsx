'use client';

import React from 'react';
import { FinanceBudgetProgress } from '@/types/finance';
import { Badge } from '@/components/ui';
import styles from './BudgetCard.module.css';

interface BudgetCardProps {
  progress: FinanceBudgetProgress;
}

const PERIOD_LABELS: Record<string, string> = {
  weekly: 'Weekly (Mon–Sun)',
  monthly: 'Monthly',
  yearly: 'Yearly',
  custom: 'Custom Period',
};

export function BudgetCard({ progress }: BudgetCardProps) {
  const {
    budget,
    spent,
    remaining,
    percentage,
    isAlert,
    isOver,
    categoryName,
    projectedSpend,
    potentialOverspend,
    daysRemaining: progDaysRemaining,
    rolloverAmount,
    effectiveTarget,
  } = progress;

  const pctCapped = Math.min(percentage, 100);

  // Fallback days remaining if not supplied
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysRemaining = progDaysRemaining ?? Math.max(0, lastDay - now.getDate());

  const targetToUse = effectiveTarget ?? budget.target;
  const periodLabel = PERIOD_LABELS[budget.period] || budget.period;

  const badgeVariant = isOver ? 'danger' : isAlert ? 'warning' : 'default';
  const badgeLabel = isOver ? 'Over Limit' : isAlert ? `${Math.round(percentage)}% Warning` : `${Math.round(percentage)}%`;

  return (
    <div className={styles.card} id={`budget-card-${budget.id}`}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.name}>{budget.name}</span>
          <span className={styles.categoryMeta}>
            {categoryName || 'All Categories'} · <span className={styles.periodNote}>{periodLabel}</span>
          </span>
        </div>
        <Badge variant={badgeVariant} size="sm">
          {badgeLabel}
        </Badge>
      </div>

      {/* Primary Remaining Callout */}
      <div className={styles.remainingRow}>
        <span className={`${styles.remainingValue} ${isOver ? styles.remainingOver : ''}`}>
          {isOver
            ? `Over by ₹${Math.abs(remaining).toLocaleString('en-IN')}`
            : `₹${remaining.toLocaleString('en-IN')} remaining`}
        </span>
        <span className={styles.daysMeta}>{daysRemaining} days remaining</span>
      </div>

      {/* Subtle Hairline Progress Bar */}
      <div className={styles.barTrack}>
        <div
          className={`${styles.barFill} ${
            isOver ? styles.fillOver : isAlert ? styles.fillAlert : styles.fillNormal
          }`}
          style={{ width: `${pctCapped}%` }}
        />
      </div>

      {/* Spent vs Limit Secondary Info */}
      <div className={styles.statsRow}>
        <span className={styles.spentInfo}>
          Spent: <span className={styles.monoNumber}>₹{spent.toLocaleString('en-IN')}</span> / ₹{targetToUse.toLocaleString('en-IN')}
        </span>
        <span className={styles.pctInfo}>{Math.round(percentage)}%</span>
      </div>

      {/* Rollover details if enabled and non-zero */}
      {budget.rollover && rolloverAmount !== undefined && rolloverAmount !== 0 && (
        <div className={styles.rolloverRow}>
          <span>Base: ₹{budget.target.toLocaleString('en-IN')}</span>
          <span className={rolloverAmount >= 0 ? styles.rolloverPositive : styles.rolloverNegative}>
            {rolloverAmount >= 0 ? `+₹${rolloverAmount.toLocaleString('en-IN')} rollover` : `-₹${Math.abs(rolloverAmount).toLocaleString('en-IN')} deficit`}
          </span>
          <span>Available: ₹{targetToUse.toLocaleString('en-IN')}</span>
        </div>
      )}

      {/* Deterministic Forecast / Projection */}
      {projectedSpend !== undefined && projectedSpend > 0 && (
        <div className={styles.forecastRow}>
          <span className={styles.forecastBadge}>Forecast (est)</span>
          <span>
            Projected: <span className={styles.monoNumber}>₹{Math.round(projectedSpend).toLocaleString('en-IN')}</span>
          </span>
          {potentialOverspend && potentialOverspend > 0 ? (
            <span className={styles.overspendWarn}>
              +₹{Math.round(potentialOverspend).toLocaleString('en-IN')} potential overspend
            </span>
          ) : (
            <span style={{ color: 'var(--text-muted)' }}>On track</span>
          )}
        </div>
      )}
    </div>
  );
}

