'use client';

import React from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { FinanceTransaction } from '@/types/finance';
import styles from './TransactionRow.module.css';

interface TransactionRowProps {
  transaction: FinanceTransaction;
  accountName?: string;
  categoryName?: string;
  categoryIcon?: string;
  selected?: boolean;
  onSelect?: (selected: boolean) => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}

export function TransactionRow({
  transaction,
  accountName,
  categoryName,
  categoryIcon,
  selected = false,
  onSelect,
  onDuplicate,
  onDelete,
}: TransactionRowProps) {
  const isIncome = transaction.type === 'income';
  const isTransfer = transaction.type === 'transfer';
  const icon = isTransfer ? '⇄' : categoryIcon || (isIncome ? '💰' : '💳');

  const title =
    transaction.payee ||
    categoryName ||
    (isTransfer ? 'Transfer' : isIncome ? 'Income' : 'Expense');

  return (
    <div
      className={`${styles.row} ${selected ? styles.selected : ''}`}
      id={`txn-row-${transaction.id}`}
    >
      <div className={styles.leftCol}>
        {onSelect && (
          <input
            type="checkbox"
            checked={selected}
            onChange={e => onSelect(e.target.checked)}
            className={styles.checkbox}
            id={`txn-select-${transaction.id}`}
          />
        )}
        <div className={styles.iconWrap}>{icon}</div>
        <div className={styles.meta}>
          <span className={styles.payee}>{title}</span>
          <div className={styles.subRow}>
            <span>{transaction.date}</span>
            {accountName && <span className={styles.accountChip}>{accountName}</span>}
            {categoryName && !transaction.payee ? null : categoryName ? (
              <span>• {categoryName}</span>
            ) : null}
            {transaction.note && <span>• {transaction.note}</span>}
          </div>
        </div>
      </div>

      <div className={styles.rightCol}>
        <span
          className={`${styles.amount} ${
            isTransfer ? styles.transfer : isIncome ? styles.income : styles.expense
          }`}
        >
          {isTransfer ? '' : isIncome ? '+' : '-'}₹
          {transaction.amount.toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>

        <div className={styles.actions}>
          {onDuplicate && !isTransfer && (
            <button
              onClick={onDuplicate}
              className={styles.actionBtn}
              title="Duplicate to today"
              id={`btn-dup-${transaction.id}`}
            >
              <Copy size={15} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className={styles.actionBtn}
              title="Delete transaction"
              id={`btn-del-${transaction.id}`}
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
