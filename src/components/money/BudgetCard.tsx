'use client';

import React from 'react';
import { FinanceBudgetProgress } from '@/types/finance';
import styles from './BudgetCard.module.css';

interface BudgetCardProps {
  progress: FinanceBudgetProgress;
}

export function BudgetCard({ progress }: BudgetCardProps) {
  const { budget, spent, remaining, percentage, projectedSpend, isAlert, isOver, categoryName } =
    progress;

  const pctCapped = Math.min(percentage, 100);

  const fillClass = isOver
    ? styles.fillOver
    : isAlert
    ? styles.fillAlert
    : styles.fillNormal;

  const badgeClass = isOver
    ? styles.badgeOver
    : isAlert
    ? styles.badgeAlert
    : styles.badgeNormal;

  const badgeText = isOver ? 'Over Budget' : isAlert ? 'Warning' : `${Math.round(percentage)}%`;

  return (
    <div className={styles.card} id={`budget-card-${budget.id}`}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.name}>{budget.name}</span>
          <span className={styles.subtitle}>
            {budget.period.toUpperCase()}{categoryName ? ` • ${categoryName}` : ''}
          </span>
        </div>
        <span className={`${styles.badge} ${badgeClass}`}>{badgeText}</span>
      </div>

      <div className={styles.progressContainer}>
        <div className={styles.barTrack}>
          <div
            className={`${styles.barFill} ${fillClass}`}
            style={{ width: `${pctCapped}%` }}
          />
        </div>

        <div className={styles.statsRow}>
          <span>
            Spent: <span className={styles.statValue}>₹{spent.toLocaleString()}</span>
          </span>
          <span>
            Limit: <span className={styles.statValue}>₹{budget.target.toLocaleString()}</span>
          </span>
        </div>
      </div>

      <div className={styles.footer}>
        <span>
          {isOver
            ? `Over by ₹${Math.abs(remaining).toLocaleString()}`
            : `Remaining: ₹${remaining.toLocaleString()}`}
        </span>
        {projectedSpend > 0 && (
          <span>Projected: ₹{Math.round(projectedSpend).toLocaleString()}</span>
        )}
      </div>
    </div>
  );
}
