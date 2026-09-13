'use client';

import React, { useState, useEffect } from 'react';
import { X, Zap } from 'lucide-react';
import { FinanceAccount } from '@/types/finance';
import { financeAccountService } from '@/lib/services/finance/FinanceAccountService';
import { financeTransactionService } from '@/lib/services/finance/FinanceTransactionService';
import { CategorySelect } from './CategorySelect';
import styles from './QuickExpense.module.css';

interface QuickExpenseProps {
  onSuccess?: () => void;
}

export function QuickExpense({ onSuccess }: QuickExpenseProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [payee, setPayee] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      financeAccountService.getActiveAccounts().then(accs => {
        setAccounts(accs);
        if (accs.length > 0 && !selectedAccountId) {
          setSelectedAccountId(accs[0].id);
        }
      });
    }
  }, [isOpen, selectedAccountId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0 || !selectedAccountId) return;

    setLoading(true);
    try {
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      await financeTransactionService.createTransaction({
        accountId: selectedAccountId,
        amount: numAmount,
        type: 'expense',
        categoryId: selectedCategoryId || undefined,
        payee: payee.trim() || undefined,
        date: dateStr,
      });
      setAmount('');
      setPayee('');
      setIsOpen(false);
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error('Quick expense failed:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        id="btn-quick-expense-fab"
        className={styles.fab}
        onClick={() => setIsOpen(true)}
        title="Quick Expense"
      >
        <Zap size={18} />
        <span>Quick Expense</span>
      </button>

      {isOpen && (
        <div className={styles.overlay} onClick={() => setIsOpen(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.header}>
              <span className={styles.title}>
                <Zap size={20} color="var(--color-expense, #ef4444)" />
                Quick Expense
              </span>
              <button
                id="btn-quick-expense-close"
                className={styles.closeBtn}
                onClick={() => setIsOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Step 1: Amount */}
              <div className={styles.amountBox}>
                <span className={styles.currency}>₹</span>
                <input
                  id="input-quick-expense-amount"
                  type="number"
                  step="any"
                  autoFocus
                  placeholder="0"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className={styles.amountInput}
                  required
                />
              </div>

              {/* Step 2: Account Selector */}
              <div className={styles.section}>
                <label className={styles.sectionLabel}>Account</label>
                <div className={styles.pillsRow}>
                  {accounts.map(acc => (
                    <button
                      key={acc.id}
                      type="button"
                      id={`pill-acc-${acc.id}`}
                      className={`${styles.pill} ${selectedAccountId === acc.id ? styles.pillActive : ''}`}
                      onClick={() => setSelectedAccountId(acc.id)}
                    >
                      {acc.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 3: Category */}
              <div className={styles.section}>
                <label className={styles.sectionLabel}>Category</label>
                <CategorySelect
                  id="select-quick-expense-category"
                  direction="expense"
                  value={selectedCategoryId}
                  onChange={setSelectedCategoryId}
                  placeholder="Choose category…"
                />
              </div>

              {/* Optional: Payee */}
              <div className={styles.section}>
                <label className={styles.sectionLabel}>Payee / Place (Optional)</label>
                <input
                  id="input-quick-expense-payee"
                  type="text"
                  placeholder="e.g. Swiggy, Metro, Coffee"
                  value={payee}
                  onChange={e => setPayee(e.target.value)}
                  className={styles.inputField}
                />
              </div>

              <button
                id="btn-quick-expense-submit"
                type="submit"
                disabled={loading || !amount || parseFloat(amount) <= 0 || !selectedAccountId}
                className={styles.submitBtn}
              >
                {loading ? 'Recording…' : 'Record Expense'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
