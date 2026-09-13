'use client';

import React, { useMemo } from 'react';
import { Calendar } from 'lucide-react';
import styles from './CashFlowForecast.module.css';

interface ForecastEntry {
  date: string;
  label: string;
  amount: number;
  type: 'planned' | 'projected';
  paymentId: string;
}

interface CashFlowForecastProps {
  currentTotalBalance: number;
  forecastEntries: ForecastEntry[];
}

export function CashFlowForecast({
  currentTotalBalance,
  forecastEntries,
}: CashFlowForecastProps) {
  const items = useMemo(() => {
    const result: (ForecastEntry & { projected: number })[] = [];
    let r = currentTotalBalance;
    for (let i = 0; i < forecastEntries.length; i++) {
      r -= forecastEntries[i].amount;
      result.push({ ...forecastEntries[i], projected: r });
    }
    return result;
  }, [currentTotalBalance, forecastEntries]);

  return (
    <div className={styles.container} id="cash-flow-forecast">
      <div className={styles.header}>
        <span className={styles.title}>Cash Flow Forecast</span>
        <span className={styles.currentBalanceChip}>
          Base Balance: ₹{currentTotalBalance.toLocaleString()}
        </span>
      </div>

      {items.length === 0 ? (
        <div className={styles.empty}>
          <Calendar size={24} style={{ marginBottom: 8, opacity: 0.5 }} />
          <p>No upcoming planned payments scheduled.</p>
        </div>
      ) : (
        <div className={styles.timeline}>
          {items.map(entry => (
            <div key={entry.paymentId} className={styles.item}>
              <div className={styles.itemMeta}>
                <span className={styles.itemTitle}>{entry.label}</span>
                <span className={styles.itemDate}>{entry.date}</span>
              </div>
              <div className={styles.itemValues}>
                <span className={styles.itemAmount}>-₹{entry.amount.toLocaleString()}</span>
                <span className={styles.projectedBalance}>
                  Projected: ₹{entry.projected.toLocaleString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
