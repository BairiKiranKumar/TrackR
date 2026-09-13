'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { FinanceAccount } from '@/types/finance';
import { Badge } from '@/components/ui';
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
          <span className={styles.metaText}>
            {account.institution ? `${account.institution} · ` : ''}
            {account.type.replace('_', ' ')} · {account.currency}
          </span>
        </div>
        <Badge variant="default" size="sm">
          {account.type.replace('_', ' ')}
        </Badge>
      </div>

      <div className={styles.balanceRow}>
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
        <div className={styles.viewLink}>
          <span>View</span>
          <ArrowRight size={13} />
        </div>
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
