'use client';

import React from 'react';
import { FinanceBudgetProgress } from '@/types/finance';
import { Badge } from '@/components/ui';
import styles from './BudgetCard.module.css';

interface BudgetCardProps {
  progress: FinanceBudgetProgress;
}

export function BudgetCard({ progress }: BudgetCardProps) {
  const { budget, spent, remaining, percentage, isAlert, isOver, categoryName } = progress;

  const pctCapped = Math.min(percentage, 100);

  // Calculate days remaining in current monthly cycle
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysRemaining = Math.max(0, lastDay - now.getDate());

  const badgeVariant = isOver ? 'danger' : isAlert ? 'warning' : 'default';
  const badgeLabel = isOver ? 'Over Limit' : isAlert ? `${Math.round(percentage)}% Warning` : `${Math.round(percentage)}%`;

  return (
    <div className={styles.card} id={`budget-card-${budget.id}`}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.name}>{budget.name}</span>
          <span className={styles.categoryMeta}>
            {categoryName || 'All Categories'}
            {budget.period !== 'monthly' && (
              <span className={styles.periodNote} title="Calculation engine currently computes monthly cycles. Multi-period custom cycles scheduled for Phase 5.">
                {' '}· {budget.period}
              </span>
            )}
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
          Spent: <span className={styles.monoNumber}>₹{spent.toLocaleString('en-IN')}</span> / ₹{budget.target.toLocaleString('en-IN')}
        </span>
        <span className={styles.pctInfo}>{Math.round(percentage)}%</span>
      </div>
    </div>
  );
}
