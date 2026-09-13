'use client';

import React, { useState, useRef } from 'react';
import { UploadCloud, CheckCircle2 } from 'lucide-react';
import { FinanceAccount, CsvColumnMap, CsvImportRow, CsvImportResult } from '@/types/finance';
import { financeCsvService } from '@/lib/services/finance/FinanceCsvService';
import styles from './CsvImportWizard.module.css';

interface CsvImportWizardProps {
  accounts: FinanceAccount[];
  onComplete?: () => void;
}

type Step = 'upload' | 'mapping' | 'preview' | 'complete';

export function CsvImportWizard({ accounts, onComplete }: CsvImportWizardProps) {
  const [step, setStep] = useState<Step>('upload');
  const [csvContent, setCsvContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id || '');
  const [columnMap, setColumnMap] = useState<CsvColumnMap>({});
  const [previewRows, setPreviewRows] = useState<CsvImportRow[]>([]);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [importResult, setImportResult] = useState<CsvImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = evt => {
      const text = evt.target?.result as string;
      if (text) {
        setCsvContent(text);
        const { headers: parsedHeaders } = financeCsvService.parseCsvString(text);
        setHeaders(parsedHeaders);

        // Auto-guess columns based on common names
        const guess: CsvColumnMap = {};
        parsedHeaders.forEach(h => {
          const lower = h.toLowerCase();
          if (lower.includes('date') || lower.includes('time')) guess.date = h;
          else if (lower.includes('amount') || lower.includes('debit') || lower.includes('value')) guess.amount = h;
          else if (lower.includes('payee') || lower.includes('description') || lower.includes('narration') || lower.includes('merchant')) guess.payee = h;
          else if (lower.includes('type') || lower.includes('dr/cr')) guess.type = h;
          else if (lower.includes('category')) guess.category = h;
          else if (lower.includes('note') || lower.includes('remark')) guess.note = h;
        });
        setColumnMap(guess);
        setStep('mapping');
      }
    };
    reader.readAsText(file);
  }

  async function handleProceedToPreview() {
    if (!columnMap.date || !columnMap.amount || !selectedAccountId) return;
    setLoading(true);
    try {
      const rows = financeCsvService.previewCsvRows(csvContent, columnMap);
      const checkedRows = await financeCsvService.checkDuplicates(rows, selectedAccountId);
      setPreviewRows(checkedRows);
      setStep('preview');
    } finally {
      setLoading(false);
    }
  }

  async function handleExecuteImport() {
    setLoading(true);
    try {
      const res = await financeCsvService.importRows(previewRows, selectedAccountId, {
        skipDuplicates,
      });
      setImportResult(res);
      setStep('complete');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.wizard} id="csv-import-wizard">
      {/* Steps Progress */}
      <div className={styles.stepIndicator}>
        <div className={styles.stepContainer}>
          <div className={`${styles.stepNumber} ${step === 'upload' ? styles.stepActive : styles.stepDone}`}>1</div>
          <span className={styles.stepLabel}>Upload</span>
        </div>
        <div className={styles.stepContainer}>
          <div className={`${styles.stepNumber} ${step === 'mapping' ? styles.stepActive : step === 'preview' || step === 'complete' ? styles.stepDone : ''}`}>2</div>
          <span className={styles.stepLabel}>Map</span>
        </div>
        <div className={styles.stepContainer}>
          <div className={`${styles.stepNumber} ${step === 'preview' ? styles.stepActive : step === 'complete' ? styles.stepDone : ''}`}>3</div>
          <span className={styles.stepLabel}>Preview</span>
        </div>
        <div className={styles.stepContainer}>
          <div className={`${styles.stepNumber} ${step === 'complete' ? styles.stepDone : ''}`}>4</div>
          <span className={styles.stepLabel}>Done</span>
        </div>
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className={styles.dropZone} onClick={() => fileInputRef.current?.click()}>
          <UploadCloud size={44} color="var(--accent-primary, #6366f1)" />
          <div>
            <p style={{ fontWeight: 600, fontSize: '1rem' }}>Click or drop CSV file here</p>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary, #636375)' }}>Supports bank statements, credit card exports, Google Sheets CSV</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className={styles.fileInput}
            id="input-csv-file"
          />
        </div>
      )}

      {/* Step 2: Column Mapping */}
      {step === 'mapping' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary, #9e9ead)' }}>
            Mapping columns from <strong>{fileName}</strong>
          </p>

          <div className={styles.mapField}>
            <label className={styles.mapLabel}>Target Account</label>
            <select
              value={selectedAccountId}
              onChange={e => setSelectedAccountId(e.target.value)}
              className={styles.select}
              id="select-import-account"
            >
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <div className={styles.gridMapping}>
            <div className={styles.mapField}>
              <label className={styles.mapLabel}>Date Column *</label>
              <select
                value={columnMap.date || ''}
                onChange={e => setColumnMap({ ...columnMap, date: e.target.value })}
                className={styles.select}
                id="select-col-date"
              >
                <option value="">Select column…</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>

            <div className={styles.mapField}>
              <label className={styles.mapLabel}>Amount Column *</label>
              <select
                value={columnMap.amount || ''}
                onChange={e => setColumnMap({ ...columnMap, amount: e.target.value })}
                className={styles.select}
                id="select-col-amount"
              >
                <option value="">Select column…</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>

            <div className={styles.mapField}>
              <label className={styles.mapLabel}>Payee / Description Column</label>
              <select
                value={columnMap.payee || ''}
                onChange={e => setColumnMap({ ...columnMap, payee: e.target.value })}
                className={styles.select}
                id="select-col-payee"
              >
                <option value="">None / Ignored</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>

            <div className={styles.mapField}>
              <label className={styles.mapLabel}>Type Column (Debit/Credit/Dr/Cr)</label>
              <select
                value={columnMap.type || ''}
                onChange={e => setColumnMap({ ...columnMap, type: e.target.value })}
                className={styles.select}
                id="select-col-type"
              >
                <option value="">None (Defaults to Expense)</option>
                {headers.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>

          <div className={styles.actionsRow}>
            <button className="btn btn-secondary" onClick={() => setStep('upload')}>Back</button>
            <button
              className={styles.btnPrimary}
              onClick={handleProceedToPreview}
              disabled={!columnMap.date || !columnMap.amount || loading}
              id="btn-import-proceed-preview"
            >
              {loading ? 'Analyzing…' : 'Proceed to Preview'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 'preview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary, #9e9ead)' }}>
              {previewRows.length} rows detected ({previewRows.filter(r => r.isDuplicate).length} potential duplicates)
            </span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={e => setSkipDuplicates(e.target.checked)}
              />
              Skip duplicates automatically
            </label>
          </div>

          <div className={styles.previewTableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Payee</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.slice(0, 50).map((row, idx) => (
                  <tr
                    key={idx}
                    className={row.errors.length > 0 ? styles.errorRow : row.isDuplicate ? styles.duplicateRow : ''}
                  >
                    <td>{row.parsed.date || 'Invalid'}</td>
                    <td>{row.parsed.payee || '—'}</td>
                    <td style={{ textTransform: 'capitalize' }}>{row.parsed.type}</td>
                    <td>₹{row.parsed.amount?.toLocaleString() || '0'}</td>
                    <td>
                      {row.errors.length > 0 ? (
                        <span style={{ color: 'var(--color-danger, #ef4444)' }}>Error</span>
                      ) : row.isDuplicate ? (
                        <span style={{ color: 'var(--color-warning, #f59e0b)' }}>Duplicate</span>
                      ) : (
                        <span style={{ color: 'var(--color-success, #10b981)' }}>Ready</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.actionsRow}>
            <button className="btn btn-secondary" onClick={() => setStep('mapping')}>Back</button>
            <button
              className={styles.btnPrimary}
              onClick={handleExecuteImport}
              disabled={loading}
              id="btn-import-confirm"
            >
              {loading ? 'Importing…' : 'Import Transactions'}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Complete */}
      {step === 'complete' && importResult && (
        <div className={styles.summaryBox}>
          <CheckCircle2 size={48} color="var(--color-success, #10b981)" />
          <h3>Import Complete!</h3>
          <p style={{ color: 'var(--text-secondary, #9e9ead)', fontSize: '0.9rem' }}>
            Successfully imported <strong>{importResult.imported}</strong> transactions into your account.
          </p>
          {importResult.duplicatesFound > 0 && (
            <p style={{ color: 'var(--text-tertiary, #636375)', fontSize: '0.85rem' }}>
              {importResult.duplicatesFound} potential duplicate transactions were detected and handled.
            </p>
          )}
          <button
            className={styles.btnPrimary}
            onClick={() => {
              if (onComplete) onComplete();
              else setStep('upload');
            }}
            id="btn-import-done"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
