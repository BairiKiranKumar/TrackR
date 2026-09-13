'use client';

import { X } from 'lucide-react';
import { FinanceTransaction } from '@/types/finance';
import { ContextPanel } from '@/components/context/ContextPanel';
import styles from './TransactionDetailDrawer.module.css';

interface TransactionDetailDrawerProps {
  transaction: FinanceTransaction | null;
  accountName?: string;
  categoryName?: string;
  categoryIcon?: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdated?: () => void;
}

export function TransactionDetailDrawer({
  transaction,
  accountName,
  categoryName,
  categoryIcon,
  isOpen,
  onClose,
  onUpdated,
}: TransactionDetailDrawerProps) {
  if (!isOpen || !transaction) return null;

  const isExp = transaction.type === 'expense';

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.drawer} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>
            Transaction Details
          </span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Amount Card */}
          <div className={styles.amountCard}>
            <span className={`${styles.amount} ${isExp ? styles.expense : styles.income}`}>
              {isExp ? '-' : '+'}₹{transaction.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className={styles.payee}>{transaction.payee || 'Unnamed Transaction'}</span>
          </div>

          {/* Metadata Grid */}
          <div className={styles.metaGrid}>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Account</span>
              <span className={styles.metaValue}>{accountName || 'Account'}</span>
            </div>

            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Category</span>
              <span className={styles.metaValue}>
                {categoryIcon ? `${categoryIcon} ` : ''}{categoryName || 'Uncategorized'}
              </span>
            </div>

            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Date</span>
              <span className={styles.metaValue}>{transaction.date}</span>
            </div>

            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Type</span>
              <span className={styles.metaValue} style={{ textTransform: 'capitalize' }}>{transaction.type}</span>
            </div>
          </div>

          {/* Note if any */}
          {transaction.note && (
            <div className={styles.noteBlock}>
              &ldquo;{transaction.note}&rdquo;
            </div>
          )}

          {/* Labels if any */}
          {transaction.labels && transaction.labels.length > 0 && (
            <div className={styles.tags}>
              {transaction.labels.map(l => (
                <span key={l} className={styles.tag}>#{l}</span>
              ))}
            </div>
          )}

          {/* Context Panel (Project, Goal, Task, Note links) */}
          <ContextPanel
            entityId={transaction.id}
            entityType="transaction"
            entityTitle={transaction.payee || `₹${transaction.amount} Transaction`}
            compact={true}
            onLinkChanged={onUpdated}
          />
        </div>
      </div>
    </div>
  );
}
