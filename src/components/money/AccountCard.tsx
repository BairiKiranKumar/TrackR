'use client';

import React from 'react';
import Link from 'next/link';
import { FinanceAccount } from '@/types/finance';
import styles from './AccountCard.module.css';

interface AccountCardProps {
  account: FinanceAccount;
  onClick?: () => void;
}

export function AccountCard({ account, onClick }: AccountCardProps) {
  const isCreditOrLoan = account.type === 'credit_card' || account.type === 'loan';
  const isNegative = account.currentBalance < 0;

  const content = (
    <div className={styles.card} id={`account-card-${account.id}`}>
      <div className={styles.header}>
        <div className={styles.accountInfo}>
          <span className={styles.name}>{account.name}</span>
          {account.institution && (
            <span className={styles.institution}>{account.institution}</span>
          )}
        </div>
        <span className={styles.typeBadge}>{account.type.replace('_', ' ')}</span>
      </div>

      <div className={styles.balanceRow}>
        <span className={styles.balanceLabel}>Current Balance</span>
        <span
          className={`${styles.balanceValue} ${
            isCreditOrLoan
              ? account.currentBalance > 0
                ? styles.negative
                : styles.positive
              : isNegative
              ? styles.negative
              : ''
          }`}
        >
          {account.currency === 'INR' ? '₹' : `${account.currency} `}
          {account.currentBalance.toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      </div>
    </div>
  );

  if (onClick) {
    return (
      <div onClick={onClick} style={{ cursor: 'pointer' }}>
        {content}
      </div>
    );
  }

  return (
    <Link href={`/money/accounts/${account.id}`} style={{ textDecoration: 'none' }}>
      {content}
    </Link>
  );
}
