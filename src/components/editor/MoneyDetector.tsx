'use client';

import { IndianRupee, X } from 'lucide-react';
import styles from './MoneyDetector.module.css';
import { MoneyDetection } from '@/types';

interface MoneyDetectorProps {
  detection: Pick<MoneyDetection, 'amount' | 'rawText'>;
  onAccept: (amount: number) => void;
  onDismiss: () => void;
}

export function MoneyDetector({ detection, onAccept, onDismiss }: MoneyDetectorProps) {
  return (
    <div className={styles.banner} id="money-detector-banner" role="alert">
      <span className={styles.icon}>
        <IndianRupee size={14} />
      </span>
      <div className={styles.content}>
        <span className={styles.label}>
          <strong>{detection.rawText}</strong> detected
        </span>
        <span className={styles.sub}>Add as expense?</span>
      </div>
      <div className={styles.actions}>
        <button
          className={styles.dismissBtn}
          onClick={onDismiss}
          id="btn-money-dismiss"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
        <button
          className={styles.addBtn}
          onClick={() => onAccept(detection.amount)}
          id="btn-money-add"
        >
          Add
        </button>
      </div>
    </div>
  );
}
