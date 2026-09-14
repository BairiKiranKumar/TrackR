import { DEFAULT_CURRENCY } from '@/types/finance';

export interface RawFinancialActivity {
  source: string;
  text?: string;
  payee?: string;
  amount?: number | string;
  date?: string;
  currency?: string;
  reference?: string;
  categoryHint?: string;
  note?: string;
  accountId?: string;
}

export interface DetectedFinancialActivity {
  payee: string;
  amount: number;
  date: string;
  currency: string;
  sourceReference?: string;
  categoryHint?: string;
  note?: string;
  accountId?: string;
}

/**
 * Deterministic Financial Activity Detector:
 * Standardized parsing interface for external sources (Manual, CSV, future Gmail/Bank).
 * Never uses AI — pure regex and format sanitization.
 */
export class FinancialActivityDetector {

  static parseAmount(raw: unknown): number | null {
    if (typeof raw === 'number' && !isNaN(raw) && raw > 0) return raw;
    if (typeof raw !== 'string') return null;

    const cleaned = raw.replace(/[₹$€£¥,\s]/g, '').replace(/[()]/g, '').trim();
    const num = parseFloat(cleaned);
    return !isNaN(num) && num > 0 ? num : null;
  }

  static parseDate(raw: unknown): string {
    if (!raw || typeof raw !== 'string') {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    const trimmed = raw.trim();
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
    // DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (dmyMatch) {
      return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
    }

    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    }

    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }

  /** Detect structured financial candidate from raw input */
  static detect(activity: RawFinancialActivity): DetectedFinancialActivity | null {
    const amount = this.parseAmount(activity.amount);
    if (!amount) return null;

    const payee = activity.payee?.trim() || activity.text?.slice(0, 50).trim() || 'Unknown Payee';
    const date = this.parseDate(activity.date);
    const currency = activity.currency?.trim().toUpperCase() || DEFAULT_CURRENCY;

    return {
      payee,
      amount,
      date,
      currency,
      sourceReference: activity.reference,
      categoryHint: activity.categoryHint,
      note: activity.note,
      accountId: activity.accountId,
    };
  }
}
