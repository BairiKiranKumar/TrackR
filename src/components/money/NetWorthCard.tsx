'use client';

import React from 'react';
import styles from './NetWorthCard.module.css';

interface NetWorthCardProps {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
}

export function NetWorthCard({ totalAssets, totalLiabilities, netWorth }: NetWorthCardProps) {
  const total = totalAssets + totalLiabilities;
  const assetRatio = total > 0 ? (totalAssets / total) * 100 : 100;

  return (
    <div className={styles.card} id="net-worth-card">
      <div className={styles.topSection}>
        <span className={styles.label}>Total Net Worth</span>
        <span
          className={styles.netWorthValue}
          style={{ color: netWorth >= 0 ? 'var(--color-success, #10b981)' : 'var(--color-danger, #ef4444)' }}
        >
          ₹{netWorth.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>

      <div className={styles.ratioTrack}>
        <div className={styles.ratioAssetFill} style={{ width: `${Math.min(100, Math.max(0, assetRatio))}%` }} />
      </div>

      <div className={styles.breakdownGrid}>
        <div className={styles.statBox}>
          <span className={styles.statLabel}>
            <span className={`${styles.statDot} ${styles.assetDot}`} />
            Total Assets
          </span>
          <span className={styles.statValue}>
            ₹{totalAssets.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        <div className={styles.statBox}>
          <span className={styles.statLabel}>
            <span className={`${styles.statDot} ${styles.liabilityDot}`} />
            Total Liabilities
          </span>
          <span className={styles.statValue}>
            ₹{totalLiabilities.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    </div>
  );
}
