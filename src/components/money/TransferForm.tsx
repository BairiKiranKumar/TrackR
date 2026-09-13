'use client';

import React, { useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { FinanceAccount } from '@/types/finance';
import { financeTransactionService } from '@/lib/services/finance/FinanceTransactionService';
import styles from './TransferForm.module.css';

interface TransferFormProps {
  accounts: FinanceAccount[];
  onSuccess: () => void;
  onCancel?: () => void;
}

export function TransferForm({ accounts, onSuccess, onCancel }: TransferFormProps) {
  const [fromAccountId, setFromAccountId] = useState(accounts[0]?.id || '');
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id || '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid amount greater than 0.');
      return;
    }
    if (!fromAccountId || !toAccountId) {
      setError('Please select both source and destination accounts.');
      return;
    }
    if (fromAccountId === toAccountId) {
      setError('Source and destination accounts must be different.');
      return;
    }

    setLoading(true);
    try {
      await financeTransactionService.createTransfer({
        fromAccountId,
        toAccountId,
        amount: numAmount,
        date,
        note: note.trim() || undefined,
      });
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Transfer failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} id="form-transfer">
      <div className={styles.header}>
        <span className={styles.title}>
          <ArrowRightLeft size={20} color="var(--accent-primary, #6366f1)" />
          Transfer Money
        </span>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.field}>
        <label className={styles.label}>From Account</label>
        <select
          id="select-transfer-from"
          value={fromAccountId}
          onChange={e => setFromAccountId(e.target.value)}
          className={styles.select}
          required
        >
          {accounts.map(acc => (
            <option key={acc.id} value={acc.id}>
              {acc.name} (₹{acc.currentBalance.toLocaleString()})
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>To Account</label>
        <select
          id="select-transfer-to"
          value={toAccountId}
          onChange={e => setToAccountId(e.target.value)}
          className={styles.select}
          required
        >
          {accounts.map(acc => (
            <option key={acc.id} value={acc.id}>
              {acc.name} (₹{acc.currentBalance.toLocaleString()})
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Amount (₹)</label>
        <input
          id="input-transfer-amount"
          type="number"
          step="any"
          placeholder="0.00"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          className={styles.input}
          required
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Date</label>
        <input
          id="input-transfer-date"
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className={styles.input}
          required
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Note (Optional)</label>
        <input
          id="input-transfer-note"
          type="text"
          placeholder="e.g. Credit card payment, ATM withdrawal"
          value={note}
          onChange={e => setNote(e.target.value)}
          className={styles.input}
        />
      </div>

      <div className={styles.btnRow}>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-secondary"
            id="btn-transfer-cancel"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={loading || !amount || parseFloat(amount) <= 0}
          className={styles.submitBtn}
          id="btn-transfer-submit"
        >
          {loading ? 'Processing…' : 'Execute Transfer'}
        </button>
      </div>
    </form>
  );
}
