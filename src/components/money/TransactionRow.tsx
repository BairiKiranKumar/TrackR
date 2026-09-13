'use client';

import React from 'react';
import { Copy, Trash2, ArrowUpRight, ArrowDownLeft, ArrowRightLeft } from 'lucide-react';
import { FinanceTransaction } from '@/types/finance';
import styles from './TransactionRow.module.css';

interface TransactionRowProps {
  transaction: FinanceTransaction;
  accountName?: string;
  categoryName?: string;
  categoryIcon?: string;
  selected?: boolean;
  onSelect?: (selected: boolean) => void;
  onClick?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
}

export function TransactionRow({
  transaction,
  accountName,
  categoryName,
  selected = false,
  onSelect,
  onClick,
  onDuplicate,
  onDelete,
}: TransactionRowProps) {
  const isIncome = transaction.type === 'income';
  const isTransfer = transaction.type === 'transfer';

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
            aria-label={`Select ${title}`}
          />
        )}
        <div
          className={styles.iconWrap}
          onClick={onClick}
          style={{ cursor: onClick ? 'pointer' : 'default' }}
        >
          {isTransfer ? (
            <ArrowRightLeft size={14} className={styles.transferIcon} />
          ) : isIncome ? (
            <ArrowUpRight size={14} className={styles.incomeIcon} />
          ) : (
            <ArrowDownLeft size={14} className={styles.expenseIcon} />
          )}
        </div>
        <div
          className={styles.meta}
          onClick={onClick}
          style={{ cursor: onClick ? 'pointer' : 'default' }}
        >
          <span className={styles.payee}>{title}</span>
          <div className={styles.subRow}>
            <span className={styles.dateText}>{transaction.date}</span>
            {accountName && <span className={styles.accountChip}>{accountName}</span>}
            {categoryName && !transaction.payee ? null : categoryName ? (
              <span className={styles.categoryChip}>{categoryName}</span>
            ) : null}
            {transaction.note && <span className={styles.noteText}>• {transaction.note}</span>}
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
              aria-label="Duplicate transaction"
            >
              <Copy size={13} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className={styles.actionBtn}
              title="Delete transaction"
              id={`btn-del-${transaction.id}`}
              aria-label="Delete transaction"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
