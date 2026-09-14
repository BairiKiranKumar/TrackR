'use client';

import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Edit2,
  Sparkles,
  Check,
  Mail,
  Building2,
} from 'lucide-react';
import {
  FinancialCandidate,
  FinanceAccount,
  FinanceCategory,
  formatFinanceAmountFull,
} from '@/types/finance';
import { Button, Modal, Badge } from '@/components/ui';
import styles from './FinancialInboxReview.module.css';

interface FinancialInboxReviewProps {
  candidates: FinancialCandidate[];
  accounts: FinanceAccount[];
  categories: FinanceCategory[];
  onAccept: (id: string, overrides?: Record<string, unknown>) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  onIgnore: (id: string) => Promise<void>;
  onBatchAccept: (ids: string[]) => Promise<void>;
  onResolveDuplicate: (id: string, resolution: 'keep_existing' | 'keep_new' | 'keep_both' | 'ignore') => Promise<void>;
}

export function FinancialInboxReview({
  candidates,
  accounts,
  categories,
  onAccept,
  onReject,
  onIgnore,
  onBatchAccept,
  onResolveDuplicate,
}: FinancialInboxReviewProps) {
  const [editingCandidate, setEditingCandidate] = useState<FinancialCandidate | null>(null);
  const [editCategory, setEditCategory] = useState('');
  const [editAccount, setEditAccount] = useState('');
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const pending = useMemo(() => candidates.filter(c => c.status === 'pending'), [candidates]);
  const totalAmount = useMemo(() => pending.reduce((sum, c) => sum + c.amount, 0), [pending]);

  // Category map for label resolution
  const catMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const accMap = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts]);

  // Batch summary breakdown
  const batchSummary = useMemo(() => {
    const categoryCounts: Record<string, number> = {};
    for (const c of pending) {
      const catName = c.suggestedCategory ? (catMap.get(c.suggestedCategory)?.name || 'Uncategorized') : 'Uncategorized';
      categoryCounts[catName] = (categoryCounts[catName] || 0) + 1;
    }
    return categoryCounts;
  }, [pending, catMap]);

  const handleOpenEdit = (cand: FinancialCandidate) => {
    setEditingCandidate(cand);
    setEditCategory(cand.suggestedCategory || '');
    setEditAccount(cand.suggestedAccount || (accounts[0]?.id || ''));
  };

  const handleSaveEdit = async () => {
    if (!editingCandidate) return;
    setIsProcessing(true);
    try {
      await onAccept(editingCandidate.id, {
        categoryId: editCategory || undefined,
        accountId: editAccount || undefined,
      });
      setEditingCandidate(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBatchAcceptSubmit = async () => {
    setIsProcessing(true);
    try {
      const ids = pending.map(c => c.id);
      await onBatchAccept(ids);
      setShowBatchModal(false);
    } finally {
      setIsProcessing(false);
    }
  };

  if (pending.length === 0) {
    return (
      <div className={styles.emptyState}>
        <div className={styles.emptyIconWrap}>
          <Check size={28} className={styles.emptyCheck} />
        </div>
        <h3 className={styles.emptyTitle}>All Caught Up</h3>
        <p className={styles.emptySubtitle}>
          No pending financial transactions require your review right now.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Top Banner & Batch Action Bar */}
      <div className={styles.header}>
        <div>
          <h2 className={styles.headerTitle}>
            {pending.length} item{pending.length === 1 ? '' : 's'} need review
          </h2>
          <p className={styles.headerSubtitle}>
            Total pending: <span className={styles.totalHighlight}>{formatFinanceAmountFull(totalAmount)}</span>
          </p>
        </div>

        <div className={styles.headerActions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowBatchModal(true)}
            disabled={isProcessing}
          >
            <CheckCircle2 size={14} />
            Accept All Suggested
          </Button>
        </div>
      </div>

      {/* Candidate List */}
      <div className={styles.list}>
        {pending.map(cand => {
          const cat = cand.suggestedCategory ? catMap.get(cand.suggestedCategory) : undefined;
          const acc = cand.suggestedAccount ? accMap.get(cand.suggestedAccount) : undefined;

          return (
            <div
              key={cand.id}
              className={`${styles.row} ${cand.duplicateOf ? styles.duplicateRow : ''}`}
              id={`candidate-row-${cand.id}`}
            >
              {/* Left Details */}
              <div className={styles.rowMain}>
                <div className={styles.primaryInfo}>
                  <span className={styles.amount}>{formatFinanceAmountFull(cand.amount, cand.currency)}</span>
                  <span className={styles.payee}>{cand.payee}</span>
                  <span className={styles.metaBadge}>
                    {cand.source === 'csv' ? <FileSpreadsheet size={12} /> : null}
                    {cand.source === 'gmail' ? <Mail size={12} /> : null}
                    {cand.source === 'bank' ? <Building2 size={12} /> : null}
                    {cand.source}
                  </span>
                </div>

                <div className={styles.subInfo}>
                  <span>{cand.date}</span>
                  {acc && <span>· {acc.name}</span>}
                  {cand.suggestedCategory && (
                    <span className={styles.suggestionPill}>
                      <Sparkles size={11} />
                      Suggested: {cat?.name || cand.suggestedCategory}
                    </span>
                  )}
                  {cand.reason && <span className={styles.reasonText}>({cand.reason})</span>}
                </div>

                {/* Gmail review disclaimer */}
                {cand.source === 'gmail' && (
                  <div className={styles.gmailBanner}>
                    <Mail size={12} className={styles.gmailIcon} />
                    <span>Detected from Gmail · TRACKR has not created a transaction yet. Review and accept below.</span>
                  </div>
                )}

                {/* Bank review disclaimer */}
                {cand.source === 'bank' && (
                  <div className={styles.gmailBanner}>
                    <Building2 size={12} className={styles.gmailIcon} />
                    <span>Detected from Bank Account · TRACKR has not created a transaction yet. Review and accept below.</span>
                  </div>
                )}

                {/* Duplicate diff banner if detected */}
                {cand.duplicateOf && (
                  <div className={styles.duplicateBanner}>
                    <div className={styles.duplicateHeader}>
                      <AlertTriangle size={13} className={styles.duplicateIcon} />
                      <span>Possible Duplicate Transaction Detected</span>
                    </div>
                    <div className={styles.duplicateActions}>
                      <button
                        className={styles.dupBtn}
                        onClick={() => onResolveDuplicate(cand.id, 'keep_both')}
                      >
                        Keep Both
                      </button>
                      <button
                        className={styles.dupBtn}
                        onClick={() => onResolveDuplicate(cand.id, 'keep_new')}
                      >
                        Keep New
                      </button>
                      <button
                        className={styles.dupBtn}
                        onClick={() => onResolveDuplicate(cand.id, 'keep_existing')}
                      >
                        Keep Existing
                      </button>
                      <button
                        className={styles.dupBtn}
                        onClick={() => onResolveDuplicate(cand.id, 'ignore')}
                      >
                        Ignore
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Action Buttons */}
              <div className={styles.rowActions}>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => onAccept(cand.id)}
                  disabled={isProcessing}
                >
                  Record
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenEdit(cand)}
                  disabled={isProcessing}
                >
                  <Edit2 size={13} />
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onReject(cand.id)}
                  disabled={isProcessing}
                >
                  Reject
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onIgnore(cand.id)}
                  disabled={isProcessing}
                >
                  Ignore
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Candidate Modal */}
      {editingCandidate && (
        <Modal
          isOpen={true}
          onClose={() => setEditingCandidate(null)}
          title="Review & Record Transaction"
        >
          <div className={styles.editForm}>
            <div className={styles.formRow}>
              <span className={styles.formLabel}>Payee</span>
              <span className={styles.formStatic}>{editingCandidate.payee}</span>
            </div>
            <div className={styles.formRow}>
              <span className={styles.formLabel}>Amount</span>
              <span className={styles.formStatic}>
                {formatFinanceAmountFull(editingCandidate.amount, editingCandidate.currency)}
              </span>
            </div>
            <div className={styles.formRow}>
              <span className={styles.formLabel}>Date</span>
              <span className={styles.formStatic}>{editingCandidate.date}</span>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.inputLabel}>Account</label>
              <select
                className={styles.selectInput}
                value={editAccount}
                onChange={e => setEditAccount(e.target.value)}
              >
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} (Balance: ₹{acc.currentBalance.toLocaleString('en-IN')})
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.inputLabel}>Category</label>
              <select
                className={styles.selectInput}
                value={editCategory}
                onChange={e => setEditCategory(e.target.value)}
              >
                <option value="">-- Select Category --</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.icon ? `${cat.icon} ` : ''}{cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.modalActions}>
              <Button variant="secondary" onClick={() => setEditingCandidate(null)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSaveEdit} disabled={isProcessing}>
                Record Transaction
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Batch Acceptance Confirmation Modal */}
      {showBatchModal && (
        <Modal
          isOpen={true}
          onClose={() => setShowBatchModal(false)}
          title={`Record ${pending.length} Transactions?`}
        >
          <div className={styles.batchModalContent}>
            <p className={styles.batchSub}>
              Confirming will record all pending transactions into your accounts using their suggested categories.
            </p>

            <div className={styles.batchTotalBox}>
              <span>Total Spending</span>
              <span className={styles.batchAmount}>{formatFinanceAmountFull(totalAmount)}</span>
            </div>

            <div className={styles.breakdownSection}>
              <span className={styles.breakdownTitle}>Category Breakdown:</span>
              <div className={styles.breakdownList}>
                {Object.entries(batchSummary).map(([cat, count]) => (
                  <div key={cat} className={styles.breakdownRow}>
                    <span>{cat}</span>
                    <Badge variant="default" size="sm">
                      ×{count}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.modalActions}>
              <Button variant="secondary" onClick={() => setShowBatchModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleBatchAcceptSubmit} disabled={isProcessing}>
                Record {pending.length} Transactions
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
