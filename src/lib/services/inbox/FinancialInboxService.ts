import {
  FinancialCandidate,
  FinancialCandidateStatus,
  FinancialCandidateSource,
  FinanceTransaction,
  DEFAULT_CURRENCY,
} from '@/types/finance';
import {
  getAllCandidates,
  getCandidateById,
  saveCandidate,
  deleteCandidate,
  queryCandidates,
  genFinanceId,
  getAllAccounts,
} from '@/lib/db/localDb';
import { financeTransactionService } from '@/lib/services/finance/FinanceTransactionService';
import { automationEngine } from '@/lib/services/automation/AutomationEngine';
import { syncQueueService } from '@/lib/services/SyncQueueService';
import { CandidateDraft } from './ExternalSourceAdapter';

export class FinancialInboxService {

  // ─── Querying ─────────────────────────────────────────────────────────────

  async getAllCandidates(): Promise<FinancialCandidate[]> {
    return getAllCandidates();
  }

  async getCandidateById(id: string): Promise<FinancialCandidate | undefined> {
    return getCandidateById(id);
  }

  async getCandidates(filter?: {
    status?: FinancialCandidateStatus;
    source?: FinancialCandidateSource;
  }): Promise<FinancialCandidate[]> {
    return queryCandidates(filter);
  }

  async getPendingCandidates(): Promise<FinancialCandidate[]> {
    return this.getCandidates({ status: 'pending' });
  }

  async getPendingSummary(): Promise<{ count: number; totalAmount: number; currency: string }> {
    const pending = await this.getPendingCandidates();
    const count = pending.length;
    const totalAmount = pending.reduce((sum, c) => sum + c.amount, 0);
    const currency = pending[0]?.currency || DEFAULT_CURRENCY;
    return { count, totalAmount, currency };
  }

  // ─── Creation with Explainable Rule Suggestions ───────────────────────────

  /**
   * Create a new financial candidate for review.
   * Deterministically evaluates automation rules to propose category, project, and labels.
   * Checks for potential duplicate transactions.
   */
  async createCandidate(draft: CandidateDraft): Promise<FinancialCandidate> {
    const now = new Date().toISOString();
    const id = genFinanceId();

    let suggestedCategory = draft.suggestedCategory;
    let suggestedProject = draft.suggestedProject;
    let suggestedGoal = draft.suggestedGoal;
    let suggestedLabels = draft.suggestedLabels ? [...draft.suggestedLabels] : [];
    let reason = draft.reason;
    let duplicateOf = draft.duplicateOf;

    // 1. Run deterministic rule simulation to suggest classifications
    const mockTxn = {
      payee: draft.payee,
      amount: draft.amount,
      accountId: draft.suggestedAccount,
      date: draft.date,
    };
    const sim = await automationEngine.simulate(mockTxn, 'transaction_created');

    if (sim.matchedRules.length > 0) {
      const topMatch = sim.matchedRules[0];
      if (sim.preview.categoryId && !suggestedCategory) {
        suggestedCategory = String(sim.preview.categoryId);
      }
      if (sim.preview.projectId && !suggestedProject) {
        suggestedProject = String(sim.preview.projectId);
      }
      if (sim.preview.goalId && !suggestedGoal) {
        suggestedGoal = String(sim.preview.goalId);
      }
      if (Array.isArray(sim.preview.labels) && sim.preview.labels.length > 0) {
        suggestedLabels = Array.from(new Set([...suggestedLabels, ...(sim.preview.labels as string[])]));
      }

      reason = `Suggested by '${topMatch.ruleName}'`;
    }

    // 2. Duplicate detection check against existing transactions
    if (!duplicateOf && draft.suggestedAccount) {
      const potentialDupes = await financeTransactionService.findPotentialDuplicates({
        accountId: draft.suggestedAccount,
        date: draft.date,
        amount: draft.amount,
        payee: draft.payee,
      });

      if (potentialDupes.length > 0) {
        duplicateOf = potentialDupes[0].id;
        reason = `Possible duplicate: same account, date, and amount`;
      }
    }

    const candidate: FinancialCandidate = {
      id,
      source: draft.source,
      detectedAt: draft.detectedAt || now,
      amount: draft.amount,
      currency: draft.currency || DEFAULT_CURRENCY,
      payee: draft.payee,
      date: draft.date,
      suggestedCategory,
      suggestedAccount: draft.suggestedAccount,
      suggestedProject,
      suggestedGoal,
      suggestedLabels,
      reason: reason || 'Detected activity for review',
      sourceReference: draft.sourceReference,
      status: 'pending',
      duplicateOf,
      rawPayload: draft.rawPayload,
      createdAt: now,
      updatedAt: now,
    };

    await saveCandidate(candidate);
    await syncQueueService.enqueue('fa_candidate', candidate.id, 'upsert', candidate);

    return candidate;
  }

  // ─── Lifecycle Transitions ────────────────────────────────────────────────

  /**
   * Accept candidate: Converts candidate into a verified real transaction.
   * Safe, idempotent: prevents creating duplicate transactions if already accepted.
   */
  async acceptCandidate(
    id: string,
    overrides?: {
      accountId?: string;
      categoryId?: string;
      projectId?: string;
      goalId?: string;
      labels?: string[];
      amount?: number;
      date?: string;
      payee?: string;
    }
  ): Promise<{ candidate: FinancialCandidate; transaction: FinanceTransaction } | null> {
    const candidate = await getCandidateById(id);
    if (!candidate) return null;

    // Idempotent: if already accepted, return candidate and existing transaction
    if (candidate.status === 'accepted' && candidate.transactionId) {
      const existingTxn = await financeTransactionService.getTransactionById(candidate.transactionId);
      if (existingTxn) return { candidate, transaction: existingTxn };
    }

    // Resolve target account
    let accountId = overrides?.accountId ?? candidate.suggestedAccount;
    if (!accountId) {
      const accounts = await getAllAccounts();
      const active = accounts.filter(a => !a.archived);
      if (active.length > 0) {
        accountId = active[0].id;
      } else {
        throw new Error('No active account available to record transaction');
      }
    }

    // Create real transaction
    const transaction = await financeTransactionService.createTransaction({
      accountId,
      date: overrides?.date ?? candidate.date,
      amount: overrides?.amount ?? candidate.amount,
      currency: candidate.currency,
      type: 'expense',
      categoryId: overrides?.categoryId ?? candidate.suggestedCategory,
      payee: overrides?.payee ?? candidate.payee,
      projectId: overrides?.projectId ?? candidate.suggestedProject,
      goalId: overrides?.goalId ?? candidate.suggestedGoal,
      labels: overrides?.labels ?? candidate.suggestedLabels ?? [],
      source: 'financial_inbox',
      sourceReference: candidate.id,
    });

    const updatedCandidate: FinancialCandidate = {
      ...candidate,
      status: 'accepted',
      transactionId: transaction.id,
      updatedAt: new Date().toISOString(),
    };

    await saveCandidate(updatedCandidate);
    await syncQueueService.enqueue('fa_candidate', updatedCandidate.id, 'upsert', updatedCandidate);

    return { candidate: updatedCandidate, transaction };
  }

  async rejectCandidate(id: string, reason?: string): Promise<FinancialCandidate | null> {
    const candidate = await getCandidateById(id);
    if (!candidate) return null;

    const updated: FinancialCandidate = {
      ...candidate,
      status: 'rejected',
      reason: reason ?? candidate.reason,
      updatedAt: new Date().toISOString(),
    };

    await saveCandidate(updated);
    await syncQueueService.enqueue('fa_candidate', updated.id, 'upsert', updated);
    return updated;
  }

  async ignoreCandidate(id: string): Promise<FinancialCandidate | null> {
    const candidate = await getCandidateById(id);
    if (!candidate) return null;

    const updated: FinancialCandidate = {
      ...candidate,
      status: 'ignored',
      updatedAt: new Date().toISOString(),
    };

    await saveCandidate(updated);
    await syncQueueService.enqueue('fa_candidate', updated.id, 'upsert', updated);
    return updated;
  }

  async deleteCandidate(id: string): Promise<void> {
    await deleteCandidate(id);
    await syncQueueService.enqueue('fa_candidate', id, 'delete');
  }

  // ─── Batch Review ─────────────────────────────────────────────────────────

  async batchAccept(ids: string[]): Promise<{
    acceptedCount: number;
    totalAmount: number;
    transactions: FinanceTransaction[];
  }> {
    let acceptedCount = 0;
    let totalAmount = 0;
    const transactions: FinanceTransaction[] = [];

    for (const id of ids) {
      try {
        const res = await this.acceptCandidate(id);
        if (res) {
          acceptedCount++;
          totalAmount += res.transaction.amount;
          transactions.push(res.transaction);
        }
      } catch (err) {
        console.warn(`Failed to accept candidate ${id}:`, err);
      }
    }

    return { acceptedCount, totalAmount, transactions };
  }

  async batchReject(ids: string[]): Promise<number> {
    let count = 0;
    for (const id of ids) {
      const res = await this.rejectCandidate(id);
      if (res) count++;
    }
    return count;
  }

  // ─── Duplicate Review Resolution ──────────────────────────────────────────

  async resolveDuplicate(
    candidateId: string,
    resolution: 'keep_existing' | 'keep_new' | 'keep_both' | 'ignore'
  ): Promise<{ status: string; transactionId?: string }> {
    switch (resolution) {
      case 'keep_existing':
      case 'ignore':
        await this.ignoreCandidate(candidateId);
        return { status: 'ignored' };

      case 'keep_new':
      case 'keep_both': {
        const res = await this.acceptCandidate(candidateId);
        return { status: 'accepted', transactionId: res?.transaction.id };
      }
    }
  }

  // ─── Deterministic Sync Conflict Resolution ───────────────────────────────

  /**
   * Deterministic resolution precedence:
   * accepted > ignored > rejected > pending
   */
  resolveSyncConflict(local: FinancialCandidate, incoming: FinancialCandidate): FinancialCandidate {
    const precedence: Record<FinancialCandidateStatus, number> = {
      accepted: 4,
      ignored: 3,
      rejected: 2,
      pending: 1,
    };

    if (precedence[local.status] > precedence[incoming.status]) {
      return local;
    }
    if (precedence[incoming.status] > precedence[local.status]) {
      return incoming;
    }

    // Tie-breaker: latest updatedAt
    return new Date(incoming.updatedAt).getTime() >= new Date(local.updatedAt).getTime()
      ? incoming
      : local;
  }
}

export const financialInboxService = new FinancialInboxService();
