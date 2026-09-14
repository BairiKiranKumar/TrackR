import {
  ExternalSourceAdapter,
  CandidateDraft,
} from '@/lib/services/inbox/ExternalSourceAdapter';
import { FinancialCandidateSource } from '@/types/finance';
import { financialInboxService } from '@/lib/services/inbox/FinancialInboxService';
import { getAllCandidates, getAllTransactions, getAllAccounts } from '@/lib/db/localDb';
import { setuBankAuthService, SetuBankAuthService } from './SetuBankAuthService';
import { setuApiClient, SetuApiClient } from './SetuApiClient';
import { RebitBankNormalizer } from './RebitBankNormalizer';
import { observabilityService } from '@/lib/services/ObservabilityService';

export interface BankSyncOptions {
  daysBack?: number;       // Default: 30 days
  forceRescan?: boolean;
}

export interface BankSyncResult {
  success: boolean;
  transactionsChecked: number;
  candidatesFound: number;
  duplicatesSkipped: number;
  error?: string;
}

/**
 * BankAdapter:
 * Implements ExternalSourceAdapter for Indian Bank Accounts via Setu Account Aggregator.
 *
 * CRITICAL ARCHITECTURAL GUARANTEES:
 * 1. ZERO SILENT TRANSACTIONS: Bank debits and credits ALWAYS enter the Financial Inbox
 *    as pending candidates. User retains 100% confirmation authority before ledger mutation.
 * 2. DETERMINISTIC IDEMPOTENCY: Bounded by `sourceReference = 'bank:<accountMask>:<txnId>'`.
 * 3. CROSS-SOURCE DEDUPLICATION: Detects collisions between bank transactions and Gmail receipts
 *    or manual entries (e.g. Swiggy food delivery receipt vs Swiggy bank debit).
 * 4. NO CREDENTIAL PERSISTENCE: Zero banking passwords, OTPs, or unmasked account numbers stored.
 */
export class BankAdapter implements ExternalSourceAdapter<BankSyncOptions> {
  source: FinancialCandidateSource = 'bank';

  constructor(
    private readonly authService: SetuBankAuthService = setuBankAuthService,
    private readonly apiClient: SetuApiClient = setuApiClient
  ) {}

  /**
   * Implements ExternalSourceAdapter interface.
   * Runs sync and returns newly created pending bank candidates.
   */
  async detect(options?: BankSyncOptions): Promise<CandidateDraft[]> {
    const result = await this.sync(options);
    if (!result.success) return [];

    const candidates = await financialInboxService.getCandidates({
      source: 'bank',
      status: 'pending',
    });

    return candidates.map(c => ({
      source: 'bank',
      amount: c.amount,
      currency: c.currency,
      payee: c.payee,
      date: c.date,
      suggestedCategory: c.suggestedCategory,
      suggestedAccount: c.suggestedAccount,
      suggestedProject: c.suggestedProject,
      suggestedGoal: c.suggestedGoal,
      suggestedLabels: c.suggestedLabels,
      confidence: c.confidence,
      reason: c.reason,
      sourceReference: c.sourceReference,
      duplicateOf: c.duplicateOf,
      rawPayload: c.rawPayload,
    }));
  }

  /**
   * Primary Bank Synchronization Pipeline:
   * 1. Validates offline state and active Setu consent
   * 2. Retrieves ReBIT DEPOSIT payload via Setu API
   * 3. Enforces mathematical idempotency via `bank:<accountMask>:<txnId>`
   * 4. Normalizes transactions and parses Indian narrations (UPI, POS, IMPS, NEFT, ATM)
   * 5. Resolves cross-source duplicates against Gmail candidates and existing ledger entries
   * 6. Enqueues candidates into the Financial Inbox (status: 'pending')
   */
  async sync(options?: BankSyncOptions): Promise<BankSyncResult> {
    // 1. Offline & Connection Guards
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return {
        success: false,
        transactionsChecked: 0,
        candidatesFound: 0,
        duplicatesSkipped: 0,
        error: 'Network offline. Bank sync requires an active internet connection.',
      };
    }

    if (!this.authService.isConnected()) {
      return {
        success: false,
        transactionsChecked: 0,
        candidatesFound: 0,
        duplicatesSkipped: 0,
        error: 'Bank account is not connected or consent authorization has expired.',
      };
    }

    const state = this.authService.getConnectionState();
    this.authService.saveConnectionState({ syncStatus: 'syncing', lastError: undefined });

    observabilityService.logEvent({
      category: 'bank_sync_started',
      message: `Bank synchronization started for ${state.fipName || 'Bank'}.`,
    });

    try {
      // 2. Obtain Data Session & Fetch ReBIT Account Data
      const session = await this.apiClient.createDataSession(state.consentId || 'default');
      const payload = await this.apiClient.fetchAccountData(session.sessionId);

      let transactionsChecked = 0;
      let candidatesFound = 0;
      let duplicatesSkipped = 0;

      // 3. Pre-load existing candidates, transactions, and user accounts
      const [existingCandidates, existingTransactions, userAccounts] = await Promise.all([
        getAllCandidates(),
        getAllTransactions(),
        getAllAccounts(),
      ]);

      const existingRefs = new Set<string>();
      existingCandidates.forEach(c => {
        if (c.sourceReference) existingRefs.add(c.sourceReference);
      });
      existingTransactions.forEach(t => {
        if (t.sourceReference) existingRefs.add(t.sourceReference);
      });

      // Filter by bounded days if specified
      const daysBack = options?.daysBack ?? 30;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysBack);
      const cutoffIso = cutoffDate.toISOString().split('T')[0];

      // 4. Ingest and Process ReBIT Accounts
      for (const account of payload.accounts || []) {
        // Match suggested account in user's TRACKR ledger
        const suggestedAccountId = this.matchUserAccount(account, userAccounts);

        for (const txn of account.transactions || []) {
          transactionsChecked++;

          const txnDate = txn.transactionTimestamp
            ? txn.transactionTimestamp.split('T')[0]
            : txn.valueDate;

          // Bounded window check
          if (!options?.forceRescan && txnDate < cutoffIso) {
            continue;
          }

          const sourceRef = `bank:${account.maskedAccNumber}:${txn.txnId}`;

          // Mathematical idempotency: skip if already ingested
          if (existingRefs.has(sourceRef)) {
            duplicatesSkipped++;
            continue;
          }

          // Deterministic Normalization
          const draft = RebitBankNormalizer.normalizeTransaction(
            txn,
            account,
            suggestedAccountId
          );

          // Cross-Source Duplicate Detection
          const duplicateMatch = this.detectCrossSourceDuplicate(
            draft,
            existingCandidates,
            existingTransactions
          );

          if (duplicateMatch) {
            draft.duplicateOf = duplicateMatch.matchedId;
            draft.reason = `${draft.reason} · ${duplicateMatch.reasonSuffix}`;
          }

          // Invariant: ALWAYS create in Financial Inbox as 'pending'
          await financialInboxService.createCandidate(draft);
          existingRefs.add(sourceRef);
          candidatesFound++;

          observabilityService.logEvent({
            category: 'bank_candidate_created',
            message: `Financial candidate created from bank debit/credit (${draft.payee} · ₹${draft.amount}).`,
            entityId: sourceRef,
          });
        }
      }

      // 5. Update Connection State & Statistics
      const now = new Date().toISOString();
      const currentState = this.authService.getConnectionState();

      this.authService.saveConnectionState({
        syncStatus: 'idle',
        lastSyncAt: now,
        stats: {
          transactionsChecked: (currentState.stats?.transactionsChecked || 0) + transactionsChecked,
          candidatesFound: (currentState.stats?.candidatesFound || 0) + candidatesFound,
          duplicatesSkipped: (currentState.stats?.duplicatesSkipped || 0) + duplicatesSkipped,
        },
        lastError: undefined,
      });

      observabilityService.logEvent({
        category: 'bank_sync_completed',
        message: `Bank sync completed. Checked: ${transactionsChecked}, Found: ${candidatesFound}, Skipped: ${duplicatesSkipped}.`,
      });

      return {
        success: true,
        transactionsChecked,
        candidatesFound,
        duplicatesSkipped,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown bank sync error';
      this.authService.saveConnectionState({ syncStatus: 'error', lastError: message });

      observabilityService.logEvent({
        category: 'bank_sync_failed',
        message: `Bank sync failed: ${message}`,
      });

      return {
        success: false,
        transactionsChecked: 0,
        candidatesFound: 0,
        duplicatesSkipped: 0,
        error: message,
      };
    }
  }

  /**
   * Cross-source duplicate detection:
   * Checks if a bank candidate matches an existing Gmail candidate or ledger transaction.
   */
  private detectCrossSourceDuplicate(
    draft: CandidateDraft,
    candidates: Awaited<ReturnType<typeof getAllCandidates>>,
    transactions: Awaited<ReturnType<typeof getAllTransactions>>
  ): { matchedId: string; reasonSuffix: string } | null {
    const draftDate = new Date(draft.date).getTime();
    const draftPayee = draft.payee.toLowerCase().trim();

    // 1. Check against candidates (e.g. Gmail candidate)
    for (const cand of candidates) {
      if (cand.status === 'rejected' || cand.status === 'ignored') continue;
      if (Math.abs(cand.amount - draft.amount) > 0.5) continue;

      const candDate = new Date(cand.date).getTime();
      const dayDiff = Math.abs(draftDate - candDate) / (1000 * 60 * 60 * 24);
      if (dayDiff > 2.5) continue;

      const candPayee = cand.payee.toLowerCase().trim();
      if (this.arePayeesSimilar(draftPayee, candPayee)) {
        return {
          matchedId: cand.id,
          reasonSuffix: `Correlated with ${cand.source.toUpperCase()} candidate (${cand.payee} on ${cand.date})`,
        };
      }
    }

    // 2. Check against existing ledger transactions
    for (const txn of transactions) {
      if (Math.abs(txn.amount - draft.amount) > 0.5) continue;

      const txnDate = new Date(txn.date).getTime();
      const dayDiff = Math.abs(draftDate - txnDate) / (1000 * 60 * 60 * 24);
      if (dayDiff > 2.5) continue;

      const txnPayee = (txn.payee || '').toLowerCase().trim();
      if (this.arePayeesSimilar(draftPayee, txnPayee)) {
        return {
          matchedId: txn.id,
          reasonSuffix: `Matches existing ledger transaction (${txn.payee || 'Transaction'} on ${txn.date})`,
        };
      }
    }

    return null;
  }

  /**
   * Payee similarity heuristic:
   * Recognizes merchant matches between normalized bank strings and email/manual strings.
   */
  private arePayeesSimilar(p1: string, p2: string): boolean {
    if (!p1 || !p2) return false;
    if (p1 === p2) return true;
    if (p1.includes(p2) || p2.includes(p1)) return true;

    // Common brand root extraction
    const brands = [
      'swiggy', 'zomato', 'blinkit', 'zepto', 'uber', 'ola',
      'netflix', 'amazon', 'flipkart', 'reliance', 'shell',
      'chai point', 'starbucks', 'tsspdcl', 'act fibernet'
    ];

    for (const b of brands) {
      if (p1.includes(b) && p2.includes(b)) return true;
    }

    return false;
  }

  /**
   * Matches a ReBIT account with a user's local FinanceAccount.
   */
  private matchUserAccount(
    account: { maskedAccNumber: string; fipName?: string },
    userAccounts: Awaited<ReturnType<typeof getAllAccounts>>
  ): string | undefined {
    const last4 = account.maskedAccNumber.slice(-4);
    const fipLower = (account.fipName || '').toLowerCase();

    for (const acc of userAccounts) {
      const accName = acc.name.toLowerCase();
      const accNotes = (acc.notes || '').toLowerCase();
      const accInst = (acc.institution || '').toLowerCase();

      // Check last 4 digits in name or notes
      if (accName.includes(last4) || accNotes.includes(last4)) {
        return acc.id;
      }

      // Check institution match
      if (fipLower && (accInst.includes(fipLower) || accName.includes(fipLower))) {
        return acc.id;
      }
    }

    return undefined;
  }
}

export const bankAdapter = new BankAdapter();
