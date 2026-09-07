'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { dataService } from '@/lib/services/DataService';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, TransactionCategory, IncomeCategory } from '@/types';
import styles from './TransactionForm.module.css';

interface TransactionFormProps {
  isIncome?: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  defaultNote?: string;
  defaultAmount?: number;
}

export function TransactionForm({ isIncome = false, onClose, onSaved, defaultNote = '', defaultAmount }: TransactionFormProps) {
  const [amount, setAmount] = useState(defaultAmount?.toString() ?? '');
  const [category, setCategory] = useState<TransactionCategory | IncomeCategory>(
    isIncome ? 'other' : 'food'
  );
  const [note, setNote] = useState(defaultNote);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);

  const categories = isIncome ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  async function handleSave() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;

    setSaving(true);
    try {
      await dataService.createItem({
        type: isIncome ? 'income' : 'expense',
        title: note.trim() || (isIncome ? 'Income' : 'Expense'),
        content: note,
        metadata: {
          amount: amt,
          currency: 'INR',
          category,
          isIncome,
          date,
        },
      });
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.form}>
      <div className={styles.header}>
        <span className={styles.title}>
          {isIncome ? '💵 Add Income' : '💸 Add Expense'}
        </span>
        <button className="btn btn-icon btn-ghost" onClick={onClose} id="btn-txn-close">
          <X size={20} />
        </button>
      </div>

      {/* Amount */}
      <div className={styles.amountRow}>
        <span className={styles.currencySymbol}>₹</span>
        <input
          autoFocus
          type="number"
          inputMode="decimal"
          className={styles.amountInput}
          placeholder="0"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          id="input-txn-amount"
        />
      </div>

      {/* Category */}
      <div className={styles.section}>
        <label className="input-label">Category</label>
        <div className={styles.categories}>
          {categories.map(cat => (
            <button
              key={cat.value}
              id={`btn-cat-${cat.value}`}
              className={`${styles.catBtn} ${category === cat.value ? styles.catActive : ''}`}
              onClick={() => setCategory(cat.value)}
            >
              <span>{cat.emoji}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Note */}
      <div className={styles.section}>
        <label className="input-label" htmlFor="input-txn-note">Note (optional)</label>
        <input
          id="input-txn-note"
          className="input"
          placeholder={isIncome ? 'Source or description...' : 'What did you spend on?'}
          value={note}
          onChange={e => setNote(e.target.value)}
        />
      </div>

      {/* Date */}
      <div className={styles.section}>
        <label className="input-label" htmlFor="input-txn-date">Date</label>
        <input
          id="input-txn-date"
          type="date"
          className="input"
          value={date}
          onChange={e => setDate(e.target.value)}
        />
      </div>

      {/* Actions */}
      <div className={styles.actions}>
        <button className="btn btn-secondary" onClick={onClose} id="btn-txn-cancel">Cancel</button>
        <button
          className="btn btn-primary"
          style={{ flex: 1, background: isIncome ? 'var(--color-success)' : 'var(--accent-primary)' }}
          onClick={handleSave}
          disabled={saving || !amount}
          id="btn-txn-save"
        >
          {saving ? 'Saving...' : isIncome ? 'Add Income' : 'Add Expense'}
        </button>
      </div>
    </div>
  );
}
