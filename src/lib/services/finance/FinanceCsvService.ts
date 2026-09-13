import {
  CsvColumnMap, CsvImportRow, CsvImportResult, FinanceTransaction,
  FinanceExportPayload, FINANCE_EXPORT_VERSION, DEFAULT_CURRENCY,
  TransactionType,
} from '@/types/finance';
import {
  getAllFinanceData,
} from '@/lib/db/localDb';
import { financeTransactionService } from './FinanceTransactionService';

export class FinanceCsvService {

  // ─── CSV IMPORT ──────────────────────────────────────────────────────────

  parseDate(raw: string): string | undefined {
    if (!raw?.trim()) return undefined;
    // Handle common formats: DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD, DD-MM-YYYY
    const trimmed = raw.trim();

    // ISO format
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);

    // DD/MM/YYYY
    const dmySlash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dmySlash) return `${dmySlash[3]}-${dmySlash[2].padStart(2, '0')}-${dmySlash[1].padStart(2, '0')}`;

    // MM/DD/YYYY — ambiguous but common for US exports
    const mdySlash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (mdySlash && parseInt(mdySlash[1]) <= 12) {
      return `${mdySlash[3]}-${mdySlash[1].padStart(2, '0')}-${mdySlash[2].padStart(2, '0')}`;
    }

    // DD-MM-YYYY
    const dmyDash = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
    if (dmyDash) return `${dmyDash[3]}-${dmyDash[2].padStart(2, '0')}-${dmyDash[1].padStart(2, '0')}`;

    // Try native Date parsing as fallback
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);

    return undefined;
  }

  parseAmount(raw: string): number | undefined {
    if (!raw?.trim()) return undefined;
    // Remove currency symbols, commas, spaces
    const cleaned = raw.trim().replace(/[₹$€£¥,\s]/g, '').replace(/[()]/g, '');
    const num = parseFloat(cleaned);
    if (isNaN(num)) return undefined;
    return Math.abs(num);
  }

  inferType(raw: string): TransactionType | undefined {
    if (!raw?.trim()) return undefined;
    const lower = raw.toLowerCase().trim();
    if (['expense', 'debit', 'dr', 'withdrawal', 'purchase', 'payment', 'charge'].some(k => lower.includes(k))) return 'expense';
    if (['income', 'credit', 'cr', 'deposit', 'salary', 'refund'].some(k => lower.includes(k))) return 'income';
    if (['transfer'].some(k => lower.includes(k))) return 'transfer';
    return undefined;
  }

  /** Parse a CSV string into rows */
  parseCsvString(csv: string): { headers: string[]; rows: Record<string, string>[] } {
    const lines = csv.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return { headers: [], rows: [] };

    const parseRow = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseRow(lines[0]);
    const rows = lines.slice(1).map(line => {
      const values = parseRow(line);
      return headers.reduce((obj, h, i) => ({ ...obj, [h]: values[i] ?? '' }), {} as Record<string, string>);
    });

    return { headers, rows };
  }

  /** Preview rows: parse and validate without importing */
  previewCsvRows(csv: string, columnMap: CsvColumnMap, accountId?: string): CsvImportRow[] {
    void accountId;
    const { rows } = this.parseCsvString(csv);

    return rows.map(rawRow => {
      const errors: string[] = [];

      const dateRaw = columnMap.date ? rawRow[columnMap.date] : '';
      const amountRaw = columnMap.amount ? rawRow[columnMap.amount] : '';
      const typeRaw = columnMap.type ? rawRow[columnMap.type] : '';

      const date = this.parseDate(dateRaw);
      const amount = this.parseAmount(amountRaw);
      const type = this.inferType(typeRaw) ?? 'expense';

      if (!date) errors.push(`Invalid date: "${dateRaw}"`);
      if (!amount || amount <= 0) errors.push(`Invalid amount: "${amountRaw}"`);

      return {
        rawRow,
        parsed: {
          date,
          amount,
          type,
          payee: columnMap.payee ? rawRow[columnMap.payee]?.trim() : undefined,
          categoryName: columnMap.category ? rawRow[columnMap.category]?.trim() : undefined,
          note: columnMap.note ? rawRow[columnMap.note]?.trim() : undefined,
          currency: columnMap.currency ? rawRow[columnMap.currency]?.trim() : undefined,
        },
        errors,
        isDuplicate: false,
      };
    });
  }

  /** Check for duplicates against existing transactions */
  async checkDuplicates(rows: CsvImportRow[], accountId: string): Promise<CsvImportRow[]> {
    const result: CsvImportRow[] = [];

    for (const row of rows) {
      if (row.errors.length > 0 || !row.parsed.date || !row.parsed.amount) {
        result.push(row);
        continue;
      }

      const potentialDuplicates = await financeTransactionService.findPotentialDuplicates({
        accountId,
        date: row.parsed.date,
        amount: row.parsed.amount,
        payee: row.parsed.payee,
      });

      result.push({
        ...row,
        isDuplicate: potentialDuplicates.length > 0,
        duplicateOf: potentialDuplicates[0]?.id,
      });
    }

    return result;
  }

  /**
   * Import validated rows as transactions.
   * Skips invalid rows and flagged duplicates.
   * Returns a summary.
   */
  async importRows(
    rows: CsvImportRow[],
    accountId: string,
    options: { skipDuplicates: boolean; categoryMap?: Record<string, string> }
  ): Promise<CsvImportResult> {
    let imported = 0;
    let skipped = 0;
    let duplicatesFound = 0;
    const errors: string[] = [];

    for (const row of rows) {
      if (row.errors.length > 0) {
        skipped++;
        errors.push(...row.errors);
        continue;
      }

      if (row.isDuplicate) {
        duplicatesFound++;
        if (options.skipDuplicates) {
          skipped++;
          continue;
        }
      }

      const { parsed } = row;
      if (!parsed.date || !parsed.amount) {
        skipped++;
        continue;
      }

      try {
        await financeTransactionService.createTransaction({
          accountId,
          date: parsed.date,
          amount: parsed.amount,
          currency: parsed.currency ?? DEFAULT_CURRENCY,
          type: parsed.type ?? 'expense',
          categoryId: parsed.categoryName ? options.categoryMap?.[parsed.categoryName] : undefined,
          payee: parsed.payee,
          note: parsed.note,
          source: 'csv_import',
        });
        imported++;
      } catch (err) {
        skipped++;
        errors.push(`Row import failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return { total: rows.length, imported, skipped, errors, duplicatesFound };
  }

  // ─── CSV EXPORT ──────────────────────────────────────────────────────────

  transactionsToCsv(transactions: FinanceTransaction[]): string {
    const headers = ['Date', 'Type', 'Amount', 'Currency', 'Payee', 'Category', 'Account', 'Note', 'Labels', 'Project'];
    const rows = transactions.map(t => [
      t.date,
      t.type,
      t.amount.toString(),
      t.currency,
      t.payee ?? '',
      t.categoryId ?? '',
      t.accountId,
      (t.note ?? '').replace(/"/g, '""'),
      t.labels.join('|'),
      t.projectId ?? '',
    ].map(v => `"${v}"`).join(','));

    return [headers.join(','), ...rows].join('\n');
  }

  async exportTransactionsCsv(): Promise<string> {
    const all = await financeTransactionService.getAllTransactions();
    return this.transactionsToCsv(all);
  }

  /** Full finance data export as JSON (not CSV — preserves all relationships) */
  async exportFullFinanceJson(): Promise<FinanceExportPayload> {
    const data = await getAllFinanceData();
    return {
      version: FINANCE_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      ...data,
    };
  }
}

export const financeCsvService = new FinanceCsvService();
