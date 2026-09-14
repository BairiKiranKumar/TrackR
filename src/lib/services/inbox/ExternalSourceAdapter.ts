import {
  FinancialCandidate,
  FinancialCandidateSource,
  CsvImportRow,
} from '@/types/finance';
import { FinancialActivityDetector, RawFinancialActivity } from './FinancialActivityDetector';

export type CandidateDraft = Omit<FinancialCandidate, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'detectedAt'> & {
  detectedAt?: string;
};

/**
 * ExternalSourceAdapter:
 * Architectural boundary for incoming financial data.
 * Transforms raw inputs from any source into clean candidate drafts.
 * Ready for future Gmail/Bank/Notification adapters.
 */
export interface ExternalSourceAdapter<T = unknown> {
  source: FinancialCandidateSource;
  detect(input: T): Promise<CandidateDraft[]>;
}

export class ManualSourceAdapter implements ExternalSourceAdapter<RawFinancialActivity> {
  source: FinancialCandidateSource = 'manual';

  async detect(input: RawFinancialActivity): Promise<CandidateDraft[]> {
    const detected = FinancialActivityDetector.detect(input);
    if (!detected) return [];

    const now = new Date().toISOString();
    return [
      {
        source: 'manual',
        detectedAt: now,
        amount: detected.amount,
        currency: detected.currency,
        payee: detected.payee,
        date: detected.date,
        suggestedCategory: detected.categoryHint,
        suggestedAccount: detected.accountId,
        sourceReference: detected.sourceReference,
        reason: 'Manually added candidate for review',
      },
    ];
  }
}

export class CsvSourceAdapter implements ExternalSourceAdapter<{ rows: CsvImportRow[]; accountId?: string }> {
  source: FinancialCandidateSource = 'csv';

  async detect(input: { rows: CsvImportRow[]; accountId?: string }): Promise<CandidateDraft[]> {
    const drafts: CandidateDraft[] = [];
    const now = new Date().toISOString();

    for (const row of input.rows) {
      if (!row.parsed.amount || !row.parsed.date) continue;

      drafts.push({
        source: 'csv',
        detectedAt: now,
        amount: row.parsed.amount,
        currency: row.parsed.currency || 'INR',
        payee: row.parsed.payee || 'Unknown Payee',
        date: row.parsed.date,
        suggestedCategory: undefined,
        suggestedAccount: input.accountId,
        duplicateOf: row.duplicateOf,
        reason: row.isDuplicate
          ? 'Possible duplicate detected during CSV import'
          : 'Imported row routed for user review',
        rawPayload: row.rawRow,
      });
    }

    return drafts;
  }
}

import { GmailAdapter, gmailAdapter, type GmailSyncOptions } from '@/lib/services/integrations/gmail/GmailAdapter';
import { BankAdapter, bankAdapter, type BankSyncOptions } from '@/lib/services/integrations/bank/BankAdapter';

export { GmailAdapter, gmailAdapter, BankAdapter, bankAdapter };
export type { GmailSyncOptions, BankSyncOptions };

/** Gmail Adapter implementing ExternalSourceAdapter */
export class FutureGmailAdapter extends GmailAdapter {}

/** Bank Adapter implementing ExternalSourceAdapter */
export class FutureBankAdapter extends BankAdapter {}

