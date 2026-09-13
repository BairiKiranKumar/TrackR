'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download } from 'lucide-react';
import { FinanceAccount } from '@/types/finance';
import { financeAccountService } from '@/lib/services/finance/FinanceAccountService';
import { financeCsvService } from '@/lib/services/finance/FinanceCsvService';
import { CsvImportWizard } from '@/components/money/CsvImportWizard';

export default function ImportExportPage() {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const accs = await financeAccountService.getActiveAccounts();
      setAccounts(accs);
    } catch (err) {
      console.error('Failed to load accounts for import:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    financeAccountService.getActiveAccounts().then(accs => {
      if (!ignore) {
        setAccounts(accs);
        setLoading(false);
      }
    }).catch(err => {
      console.error('Failed to load accounts for import:', err);
      if (!ignore) setLoading(false);
    });
    return () => { ignore = true; };
  }, []);

  async function handleExportTransactions() {
    const csv = await financeCsvService.exportTransactionsCsv();
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trackr-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/money" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
            <ArrowLeft size={18} />
          </Link>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            CSV Import & Export
          </h1>
        </div>

        <button className="btn btn-secondary" onClick={handleExportTransactions} id="btn-export-csv-page">
          <Download size={16} />
          <span>Export Transactions (.csv)</span>
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, color: 'var(--text-secondary)' }}>Loading…</div>
      ) : accounts.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: 'var(--bg-card)', borderRadius: 16 }}>
          <p>Please create at least one account before importing transactions.</p>
          <Link href="/money" className="btn btn-primary" style={{ marginTop: 12 }}>
            Go to Accounts
          </Link>
        </div>
      ) : (
        <CsvImportWizard accounts={accounts} onComplete={loadData} />
      )}
    </div>
  );
}
