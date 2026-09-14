'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Inbox, RefreshCw } from 'lucide-react';
import {
  FinancialCandidate,
  FinanceAccount,
  FinanceCategory,
} from '@/types/finance';
import { financialInboxService } from '@/lib/services/inbox/FinancialInboxService';
import { financeAccountService } from '@/lib/services/finance/FinanceAccountService';
import { financeCategoryService } from '@/lib/services/finance/FinanceCategoryService';
import { FinancialInboxReview } from '@/components/money/FinancialInboxReview';
import { Button } from '@/components/ui';
import styles from './page.module.css';

export default function FinancialInboxPage() {
  const [candidates, setCandidates] = useState<FinancialCandidate[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => {
    setVersion(v => v + 1);
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [cands, accs, cats] = await Promise.all([
          financialInboxService.getAllCandidates(),
          financeAccountService.getActiveAccounts(),
          financeCategoryService.getAllCategories(),
        ]);
        if (!active) return;
        setCandidates(cands);
        setAccounts(accs);
        setCategories(cats);
      } catch (err) {
        console.error('Failed to load Financial Inbox data:', err);
      } finally {
        if (active) setIsLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [version]);

  const handleAccept = async (id: string, overrides?: Record<string, unknown>) => {
    await financialInboxService.acceptCandidate(id, overrides);
    refresh();
  };

  const handleReject = async (id: string) => {
    await financialInboxService.rejectCandidate(id);
    refresh();
  };

  const handleIgnore = async (id: string) => {
    await financialInboxService.ignoreCandidate(id);
    refresh();
  };

  const handleBatchAccept = async (ids: string[]) => {
    await financialInboxService.batchAccept(ids);
    refresh();
  };

  const handleResolveDuplicate = async (
    id: string,
    resolution: 'keep_existing' | 'keep_new' | 'keep_both' | 'ignore'
  ) => {
    await financialInboxService.resolveDuplicate(id, resolution);
    refresh();
  };

  return (
    <div className={styles.page}>
      {/* Navigation Header */}
      <div className={styles.topNav}>
        <Link href="/money" className={styles.backLink}>
          <ArrowLeft size={16} />
          <span>Back to Money</span>
        </Link>
        <Button variant="ghost" size="sm" onClick={refresh}>
          <RefreshCw size={14} className={isLoading ? styles.spinning : ''} />
          Refresh
        </Button>
      </div>

      {/* Page Title & Subtitle */}
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <div className={styles.iconBox}>
            <Inbox size={22} className={styles.titleIcon} />
          </div>
          <div>
            <h1 className={styles.title}>Financial Inbox</h1>
            <p className={styles.subtitle}>
              Deterministic review queue for incoming transactions, rule suggestions, and detected duplicates.
            </p>
          </div>
        </div>
      </div>

      {/* Review Queue Component */}
      {isLoading ? (
        <div className={styles.loadingBox}>
          <div className="skeleton" style={{ height: 120, borderRadius: 12 }} />
        </div>
      ) : (
        <FinancialInboxReview
          candidates={candidates}
          accounts={accounts}
          categories={categories}
          onAccept={handleAccept}
          onReject={handleReject}
          onIgnore={handleIgnore}
          onBatchAccept={handleBatchAccept}
          onResolveDuplicate={handleResolveDuplicate}
        />
      )}
    </div>
  );
}
