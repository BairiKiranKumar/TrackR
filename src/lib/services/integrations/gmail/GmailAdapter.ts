import {
  ExternalSourceAdapter,
  CandidateDraft,
} from '@/lib/services/inbox/ExternalSourceAdapter';
import { FinancialCandidateSource } from '@/types/finance';
import { FinancialActivityDetector } from '@/lib/services/inbox/FinancialActivityDetector';
import { financialInboxService } from '@/lib/services/inbox/FinancialInboxService';
import { getAllCandidates, getAllTransactions } from '@/lib/db/localDb';
import { gmailAuthService, GmailAuthService } from './GmailAuthService';
import { gmailApiClient, GmailApiClient } from './GmailApiClient';
import { observabilityService } from '@/lib/services/ObservabilityService';

export interface GmailSyncOptions {
  daysBack?: number;       // Default: 30 days bounded historical limit
  maxResults?: number;     // Default: 25 messages per sync batch
  forceRescan?: boolean;   // Fallback to rescan if cursor invalidated
}

export interface GmailSyncResult {
  success: boolean;
  messagesChecked: number;
  candidatesFound: number;
  duplicatesSkipped: number;
  error?: string;
}

/**
 * GmailAdapter:
 * Implements ExternalSourceAdapter for Gmail financial activity.
 *
 * GUARANTEES:
 * 1. Never creates real transactions directly — creates Financial Candidates for user review.
 * 2. Targeted search queries (no unbounded full mailbox scraping).
 * 3. Bounded historical window (default 30 days).
 * 4. Strictly idempotent via `sourceReference = 'gmail:<messageId>'`.
 * 5. Zero email body persistence.
 */
export class GmailAdapter implements ExternalSourceAdapter<GmailSyncOptions> {
  source: FinancialCandidateSource = 'gmail';

  constructor(
    private readonly authService: GmailAuthService = gmailAuthService,
    private readonly apiClient: GmailApiClient = gmailApiClient
  ) {}

  /**
   * Implements ExternalSourceAdapter interface.
   * Runs targeted detection on a set of Gmail messages or options.
   */
  async detect(options?: GmailSyncOptions): Promise<CandidateDraft[]> {
    const result = await this.sync(options);
    if (!result.success) return [];

    // Return any pending candidates created during this session
    const candidates = await financialInboxService.getCandidates({ source: 'gmail', status: 'pending' });
    return candidates.map(c => ({
      source: 'gmail',
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
      rawPayload: c.rawPayload,
    }));
  }

  /**
   * Primary Gmail synchronization pipeline:
   * 1. Validates connection and network state
   * 2. Builds targeted bounded query (last 30d default)
   * 3. Fetches message metadata
   * 4. Enforces duplicate avoidance via sourceReference
   * 5. Runs deterministic FinancialActivityDetector
   * 6. Creates candidates in Financial Inbox (status: 'pending')
   */
  async sync(options?: GmailSyncOptions): Promise<GmailSyncResult> {
    // 1. Offline & Connection Guards
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return {
        success: false,
        messagesChecked: 0,
        candidatesFound: 0,
        duplicatesSkipped: 0,
        error: 'Network offline. Gmail sync requires an active internet connection.',
      };
    }

    if (!this.authService.isConnected()) {
      return {
        success: false,
        messagesChecked: 0,
        candidatesFound: 0,
        duplicatesSkipped: 0,
        error: 'Gmail is not connected or authorization has expired.',
      };
    }

    const tokens = this.authService.getTokens();
    if (!tokens) {
      return {
        success: false,
        messagesChecked: 0,
        candidatesFound: 0,
        duplicatesSkipped: 0,
        error: 'No active authorization tokens found.',
      };
    }

    this.authService.saveConnectionState({ syncStatus: 'syncing', lastError: undefined });

    observabilityService.logEvent({
      category: 'gmail_sync_started',
      message: 'Gmail synchronization started.',
    });

    try {
      // 2. Build Bounded Targeted Query
      const query = this.buildTargetedQuery(options);
      const maxResults = options?.maxResults || 25;

      // 3. List matching messages
      const messageIds = await this.apiClient.listMessages(tokens.accessToken, query, maxResults);

      let messagesChecked = 0;
      let candidatesFound = 0;
      let duplicatesSkipped = 0;

      // 4. Pre-load existing source references to guarantee idempotency
      const [existingCandidates, existingTransactions] = await Promise.all([
        getAllCandidates(),
        getAllTransactions(),
      ]);

      const existingRefs = new Set<string>();
      existingCandidates.forEach(c => {
        if (c.sourceReference) existingRefs.add(c.sourceReference);
      });
      existingTransactions.forEach(t => {
        if (t.sourceReference) existingRefs.add(t.sourceReference);
      });

      // 5. Ingestion & Detection Loop
      for (const msgId of messageIds) {
        messagesChecked++;
        const sourceRef = `gmail:${msgId}`;

        // Idempotency: skip if already ingested as a candidate or transaction
        if (existingRefs.has(sourceRef)) {
          duplicatesSkipped++;
          continue;
        }

        // Fetch minimal metadata (From, Subject, Date, Snippet)
        const email = await this.apiClient.getMessage(tokens.accessToken, msgId);
        if (!email) continue;

        // Deterministic financial detection
        const detected = FinancialActivityDetector.detectFromEmail(email);
        if (!detected) {
          continue; // Not a financial transaction
        }

        // Create Candidate Draft
        const draft: CandidateDraft = {
          source: 'gmail',
          amount: detected.amount,
          currency: detected.currency,
          payee: detected.payee,
          date: detected.date,
          sourceReference: detected.sourceReference,
          suggestedCategory: detected.categoryHint,
          confidence: detected.confidence,
          reason: detected.reason,
          rawPayload: {
            snippet: detected.snippet,
            messageId: msgId,
          },
        };

        // Enqueue into Financial Inbox
        await financialInboxService.createCandidate(draft);
        existingRefs.add(sourceRef);
        candidatesFound++;

        observabilityService.logEvent({
          category: 'gmail_candidate_created',
          message: 'Financial candidate created from Gmail message.',
          entityId: sourceRef,
        });
      }

      // 6. Update Connection State & Statistics
      const now = new Date().toISOString();
      const currentState = this.authService.getConnectionState();

      this.authService.saveConnectionState({
        syncStatus: 'idle',
        lastSyncAt: now,
        stats: {
          messagesChecked: (currentState.stats?.messagesChecked || 0) + messagesChecked,
          candidatesFound: (currentState.stats?.candidatesFound || 0) + candidatesFound,
          duplicatesSkipped: (currentState.stats?.duplicatesSkipped || 0) + duplicatesSkipped,
        },
        lastError: undefined,
      });

      observabilityService.logEvent({
        category: 'gmail_sync_completed',
        message: `Gmail sync completed. Checked: ${messagesChecked}, Found: ${candidatesFound}, Skipped: ${duplicatesSkipped}.`,
      });

      return {
        success: true,
        messagesChecked,
        candidatesFound,
        duplicatesSkipped,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.authService.saveConnectionState({
        syncStatus: 'error',
        lastError: errorMsg,
      });

      observabilityService.logEvent({
        category: 'gmail_sync_failed',
        message: `Gmail sync failed: ${errorMsg}`,
      });

      return {
        success: false,
        messagesChecked: 0,
        candidatesFound: 0,
        duplicatesSkipped: 0,
        error: errorMsg,
      };
    }
  }

  /**
   * Constructs targeted Gmail search query:
   * Scopes strictly to receipts, orders, invoices, and payments within the bounded window.
   */
  private buildTargetedQuery(options?: GmailSyncOptions): string {
    const daysBack = options?.daysBack || 30;
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysBack);

    const yr = sinceDate.getFullYear();
    const mo = String(sinceDate.getMonth() + 1).padStart(2, '0');
    const day = String(sinceDate.getDate()).padStart(2, '0');
    const dateFilter = `after:${yr}/${mo}/${day}`;

    // Target likely financial subjects and known merchants
    const financialKeywords = [
      'receipt',
      'order',
      'payment',
      'invoice',
      'subscription',
      'charged',
      'debited',
      'transaction',
    ].join(' OR ');

    return `${dateFilter} (subject:(${financialKeywords}) OR from:(swiggy OR zomato OR amazon OR uber OR netflix OR apple OR google))`;
  }
}

export const gmailAdapter = new GmailAdapter();
