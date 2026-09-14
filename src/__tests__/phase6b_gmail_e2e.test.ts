/**
 * Phase 6B — End-to-End Gmail Integration Scenarios (G1 – G8)
 *
 * Scenarios tested:
 * - G1: Connect Gmail -> OAuth flow -> connected state -> sync -> financial email detected -> candidate in Financial Inbox
 * - G2: Gmail candidate -> rule suggestion -> user reviews -> accept -> transaction created -> candidate no longer pending
 * - G3: Same Gmail message -> sync twice -> idempotent (exactly one candidate)
 * - G4: Gmail candidate -> existing transaction detected -> duplicate review -> keep existing (no silent deletion)
 * - G5: Gmail candidate -> user rejects -> resync -> rejected candidate does not become a transaction
 * - G6: User disconnects Gmail -> existing transactions & candidates remain -> tokens purged
 * - G7: User A Gmail -> User B Gmail -> strict tenant & connection isolation
 * - G8: Export TRACKR data -> verify credentials absent, source metadata present
 */

import 'fake-indexeddb/auto';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Navigator mock for Node
const nav = globalThis.navigator as unknown as { onLine: boolean };
if (typeof nav === 'object' && nav !== null) {
  Object.defineProperty(nav, 'onLine', { value: true, writable: true, configurable: true });
} else {
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, writable: true, configurable: true });
}

// LocalStorage & SessionStorage in-memory mock for Node
const memoryStorage = new Map<string, string>();
const mockStorage = {
  getItem: (k: string) => memoryStorage.get(k) || null,
  setItem: (k: string, v: string) => memoryStorage.set(k, String(v)),
  removeItem: (k: string) => memoryStorage.delete(k),
  clear: () => memoryStorage.clear(),
};

Object.defineProperty(globalThis, 'localStorage', { value: mockStorage, writable: true, configurable: true });
Object.defineProperty(globalThis, 'sessionStorage', { value: mockStorage, writable: true, configurable: true });

import { GmailAuthService } from '@/lib/services/integrations/gmail/GmailAuthService';
import { GmailApiClient } from '@/lib/services/integrations/gmail/GmailApiClient';
import { GmailAdapter } from '@/lib/services/integrations/gmail/GmailAdapter';
import { financialInboxService } from '@/lib/services/inbox/FinancialInboxService';
import { financeAccountService } from '@/lib/services/finance/FinanceAccountService';
import { financeTransactionService } from '@/lib/services/finance/FinanceTransactionService';
import { automationEngine } from '@/lib/services/automation/AutomationEngine';
import { storageModeService } from '@/lib/services/StorageModeService';
import { dataService } from '@/lib/services/DataService';
import { clearAllData, getAllCandidates, getAllTransactions } from '@/lib/db/localDb';

describe('Phase 6B: End-to-End Scenarios (G1 – G8)', () => {
  let authService: GmailAuthService;
  let apiClient: GmailApiClient;
  let adapter: GmailAdapter;

  beforeEach(async () => {
    (navigator as unknown as { onLine: boolean }).onLine = true;
    memoryStorage.clear();
    await clearAllData();
    storageModeService.setActiveUser(null);

    authService = new GmailAuthService();
    apiClient = new GmailApiClient();
    adapter = new GmailAdapter(authService, apiClient);
  });

  // ─── SCENARIO G1 ────────────────────────────────────────────────────────────
  it('SCENARIO G1: Connect Gmail -> OAuth -> sync -> financial email detected -> candidate in Financial Inbox', async () => {
    // 1. User initiates OAuth connection
    const { authUrl, state } = authService.initiateOAuthFlow('http://localhost:3000/settings');
    assert.ok(authUrl.includes('accounts.google.com/o/oauth2/v2/auth'));
    assert.ok(authUrl.includes('scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.readonly'));
    assert.ok(state.length > 5);

    // 2. User consents; callback returns with token in URL hash fragment
    const hash = `#access_token=google_oauth_token_user_1&expires_in=3600&state=${state}&token_type=Bearer`;
    const callbackResult = authService.handleOAuthCallback(hash);
    assert.equal(callbackResult.success, true);
    assert.equal(authService.isConnected(), true);

    const connectionState = authService.getConnectionState();
    assert.equal(connectionState.connected, true);
    assert.equal(connectionState.syncStatus, 'idle');

    // 3. User receives a financial receipt in Gmail
    GmailApiClient.setSimulatedMessages([
      {
        id: 'msg_swiggy_g1',
        from: 'Swiggy <orders@swiggy.in>',
        subject: 'Order confirmation: ₹499 charged to your card',
        date: '2026-09-14T12:00:00.000Z',
        snippet: 'Thank you for your order. Paid ₹499 via UPI.',
      },
    ]);

    // 4. User triggers manual Gmail sync
    const syncResult = await adapter.sync();
    assert.equal(syncResult.success, true);
    assert.equal(syncResult.messagesChecked, 1);
    assert.equal(syncResult.candidatesFound, 1);
    assert.equal(syncResult.duplicatesSkipped, 0);

    // 5. Candidate appears in Financial Inbox as pending
    const candidates = await financialInboxService.getCandidates({ source: 'gmail', status: 'pending' });
    assert.equal(candidates.length, 1);
    const candidate = candidates[0];
    assert.equal(candidate.source, 'gmail');
    assert.equal(candidate.sourceReference, 'gmail:msg_swiggy_g1');
    assert.equal(candidate.amount, 499);
    assert.equal(candidate.currency, 'INR');
    assert.equal(candidate.payee, 'Swiggy');
    assert.equal(candidate.status, 'pending');
    assert.ok(candidate.reason?.includes('Swiggy'));

    // 6. CRITICAL: Confirm Gmail did NOT silently create a real transaction
    const transactions = await getAllTransactions();
    assert.equal(transactions.length, 0, 'No transaction must be created silently');
  });

  // ─── SCENARIO G2 ────────────────────────────────────────────────────────────
  it('SCENARIO G2: Gmail candidate -> rule suggestion -> user reviews -> accept -> transaction created -> no longer pending', async () => {
    // 1. Setup account and automation rule
    const account = await financeAccountService.createAccount({
      name: 'Primary Checking',
      type: 'bank',
      openingBalance: 10000,
    });

    await automationEngine.createRule({
      name: 'Auto-Category: Netflix -> Subscriptions',
      trigger: 'transaction_created',
      priority: 10,
      conditions: [{ field: 'payee', operator: 'contains', value: 'netflix' }],
      actions: [
        { type: 'assign_category', value: 'cat_subscriptions' },
        { type: 'add_label', value: 'entertainment' },
      ],
    });

    // 2. Connect Gmail & ingest Netflix renewal
    authService.simulateConnect('test@example.com');
    GmailApiClient.setSimulatedMessages([
      {
        id: 'msg_netflix_g2',
        from: 'Netflix <info@mailer.netflix.com>',
        subject: 'Subscription renewed for ₹649',
        date: '2026-09-14T08:30:00.000Z',
        snippet: 'Your Netflix Premium subscription has been renewed for ₹649.',
      },
    ]);

    await adapter.sync();

    // 3. Verify rule suggestion was deterministically attached to the candidate
    const pending = await financialInboxService.getPendingCandidates();
    assert.equal(pending.length, 1);
    const candidate = pending[0];
    assert.equal(candidate.suggestedCategory, 'cat_subscriptions');
    assert.ok(candidate.suggestedLabels?.includes('entertainment'));

    // 4. User reviews candidate and explicitly clicks Accept
    const acceptResult = await financialInboxService.acceptCandidate(candidate.id, {
      accountId: account.id,
    });
    assert.ok(acceptResult);
    assert.equal(acceptResult.candidate.status, 'accepted');
    assert.equal(acceptResult.transaction.amount, 649);
    assert.equal(acceptResult.transaction.payee, 'Netflix');
    assert.equal(acceptResult.transaction.source, 'gmail');
    assert.equal(acceptResult.transaction.sourceReference, 'gmail:msg_netflix_g2');

    // 5. Candidate is no longer in pending inbox
    const pendingAfter = await financialInboxService.getPendingCandidates();
    assert.equal(pendingAfter.length, 0);

    // 6. Account balance updated correctly
    const updatedAccount = await financeAccountService.getAccountById(account.id);
    assert.equal(updatedAccount?.currentBalance, 10000 - 649);
  });

  // ─── SCENARIO G3 ────────────────────────────────────────────────────────────
  it('SCENARIO G3: Same Gmail message synced twice -> strictly idempotent (exactly one candidate)', async () => {
    authService.simulateConnect('test@example.com');

    GmailApiClient.setSimulatedMessages([
      {
        id: 'msg_uber_g3',
        from: 'Uber Receipts <uber.india@uber.com>',
        subject: 'Trip Receipt: ₹320 paid',
        date: '2026-09-14T14:00:00.000Z',
        snippet: 'Total ₹320 was paid for your ride with Uber.',
      },
    ]);

    // First sync: creates 1 candidate
    const sync1 = await adapter.sync();
    assert.equal(sync1.candidatesFound, 1);
    assert.equal(sync1.duplicatesSkipped, 0);

    let candidates = await getAllCandidates();
    assert.equal(candidates.length, 1);

    // Second sync of same message: skips duplicate
    const sync2 = await adapter.sync();
    assert.equal(sync2.candidatesFound, 0);
    assert.equal(sync2.duplicatesSkipped, 1);

    candidates = await getAllCandidates();
    assert.equal(candidates.length, 1, 'Duplicate candidate must NOT be created');

    // Third sync after simulating reconnect: still skips duplicate
    authService.simulateConnect('test@example.com');
    const sync3 = await adapter.sync();
    assert.equal(sync3.candidatesFound, 0);
    assert.equal(sync3.duplicatesSkipped, 1);

    candidates = await getAllCandidates();
    assert.equal(candidates.length, 1);
  });

  // ─── SCENARIO G4 ────────────────────────────────────────────────────────────
  it('SCENARIO G4: Gmail candidate -> existing transaction detected -> duplicate review -> keep existing (no silent deletion)', async () => {
    const account = await financeAccountService.createAccount({
      name: 'Bank Account',
      type: 'bank',
      openingBalance: 50000,
    });

    // 1. User manually entered a transaction earlier
    const manualTxn = await financeTransactionService.createTransaction({
      accountId: account.id,
      date: '2026-09-14',
      amount: 1299,
      type: 'expense',
      payee: 'Amazon India',
      source: 'manual',
    });

    // 2. Gmail sync detects an email receipt with the same amount & payee
    authService.simulateConnect('test@example.com');
    GmailApiClient.setSimulatedMessages([
      {
        id: 'msg_amazon_g4',
        from: 'Amazon.in <auto-confirm@amazon.in>',
        subject: 'Your order has shipped: Total ₹1,299',
        date: '2026-09-14T09:00:00.000Z',
        snippet: 'Order details: Amazon India - ₹1,299 paid.',
      },
    ]);

    await adapter.sync();

    // 3. Candidate is created in inbox with duplicateOf detected or flagged for review
    const candidates = await financialInboxService.getPendingCandidates();
    assert.equal(candidates.length, 1);
    const candidate = candidates[0];

    // Find duplicates via transaction duplicate matching
    const duplicates = await financeTransactionService.findPotentialDuplicates({
      accountId: account.id,
      date: candidate.date,
      amount: candidate.amount,
      payee: candidate.payee,
    });

    assert.equal(duplicates.length, 1);
    assert.equal(duplicates[0].id, manualTxn.id);

    // 4. User chooses to keep existing transaction and dismiss/reject candidate
    await financialInboxService.rejectCandidate(candidate.id);

    // 5. Verify NO silent deletion: manual transaction is preserved intact
    const preservedTxn = await financeTransactionService.getTransactionById(manualTxn.id);
    assert.ok(preservedTxn);
    assert.equal(preservedTxn.amount, 1299);
    assert.equal(preservedTxn.payee, 'Amazon India');

    // 6. Verify only 1 transaction exists in total
    const allTxns = await getAllTransactions();
    assert.equal(allTxns.length, 1);
  });

  // ─── SCENARIO G5 ────────────────────────────────────────────────────────────
  it('SCENARIO G5: Gmail candidate -> user rejects -> resync -> rejected candidate does not become a transaction', async () => {
    authService.simulateConnect('test@example.com');

    GmailApiClient.setSimulatedMessages([
      {
        id: 'msg_zomato_g5',
        from: 'Zomato <order@zomato.com>',
        subject: 'Order summary: ₹280 paid',
        date: '2026-09-14T19:00:00.000Z',
        snippet: 'Food order from Dominos: ₹280 paid online.',
      },
    ]);

    await adapter.sync();

    const pending = await financialInboxService.getPendingCandidates();
    assert.equal(pending.length, 1);

    // User rejects the candidate
    const rejected = await financialInboxService.rejectCandidate(pending[0].id);
    assert.equal(rejected?.status, 'rejected');

    // Resync runs
    const resync = await adapter.sync();
    assert.equal(resync.duplicatesSkipped, 1, 'Rejected candidate sourceReference must prevent re-ingestion');

    // Verify 0 transactions were created
    const transactions = await getAllTransactions();
    assert.equal(transactions.length, 0);

    // Verify candidate status remains rejected
    const candidate = await financialInboxService.getCandidateById(pending[0].id);
    assert.equal(candidate?.status, 'rejected');
  });

  // ─── SCENARIO G6 ────────────────────────────────────────────────────────────
  it('SCENARIO G6: User disconnects Gmail -> existing transactions & candidates remain -> tokens purged', async () => {
    const account = await financeAccountService.createAccount({
      name: 'Checking',
      type: 'bank',
      openingBalance: 15000,
    });

    authService.simulateConnect('user@gmail.com');
    GmailApiClient.setSimulatedMessages([
      {
        id: 'msg_apple_g6',
        from: 'Apple <no_reply@email.apple.com>',
        subject: 'Your invoice from Apple: ₹199',
        date: '2026-09-14T07:00:00.000Z',
        snippet: 'iCloud 200GB Storage plan: ₹199.',
      },
      {
        id: 'msg_google_g6',
        from: 'Google Play <googleplay-noreply@google.com>',
        subject: 'Your Google Play Order Receipt: ₹130',
        date: '2026-09-14T07:30:00.000Z',
        snippet: 'Order details for YouTube Premium ₹130.',
      },
    ]);

    await adapter.sync();

    // User accepts one candidate
    const pending = await financialInboxService.getPendingCandidates();
    assert.equal(pending.length, 2);
    await financialInboxService.acceptCandidate(pending[0].id, { accountId: account.id });

    // User disconnects Gmail
    await authService.disconnect();

    // Verify connection state & tokens purged
    assert.equal(authService.isConnected(), false);
    assert.equal(authService.getTokens(), null);
    const connState = authService.getConnectionState();
    assert.equal(connState.connected, false);

    // Sync is now blocked
    const syncAttempt = await adapter.sync();
    assert.equal(syncAttempt.success, false);
    assert.ok(syncAttempt.error?.includes('Gmail is not connected'));

    // CRITICAL: Historical transactions & candidates are safely preserved
    const txns = await getAllTransactions();
    assert.equal(txns.length, 1);
    assert.equal(txns[0].amount, pending[0].amount);

    const candidates = await getAllCandidates();
    assert.equal(candidates.length, 2);
  });

  // ─── SCENARIO G7 ────────────────────────────────────────────────────────────
  it('SCENARIO G7: User A Gmail -> User B Gmail -> strict isolation', async () => {
    // 1. User A logs in and connects Gmail
    storageModeService.setActiveUser('user_alice');
    authService.simulateConnect('alice@company.com', 'user_alice');

    assert.equal(authService.isConnected('user_alice'), true);
    assert.equal(authService.getConnectionState('user_alice').email, 'alice@company.com');
    assert.ok(authService.getTokens('user_alice')?.accessToken);

    // 2. User B logs in
    storageModeService.setActiveUser('user_bob');

    // Verify User B does NOT see User A's connection or tokens
    assert.equal(authService.isConnected('user_bob'), false);
    assert.equal(authService.getConnectionState('user_bob').connected, false);
    assert.equal(authService.getTokens('user_bob'), null);

    // 3. User B connects their own Gmail
    authService.simulateConnect('bob@personal.com', 'user_bob');
    assert.equal(authService.isConnected('user_bob'), true);
    assert.equal(authService.getConnectionState('user_bob').email, 'bob@personal.com');

    // 4. User A disconnects
    await authService.disconnect('user_alice');
    assert.equal(authService.isConnected('user_alice'), false);

    // User B is unaffected
    assert.equal(authService.isConnected('user_bob'), true);
    assert.equal(authService.getConnectionState('user_bob').email, 'bob@personal.com');
  });

  // ─── SCENARIO G8 ────────────────────────────────────────────────────────────
  it('SCENARIO G8: Export TRACKR data -> verify credentials absent, source metadata present', async () => {
    const account = await financeAccountService.createAccount({
      name: 'Export Test Account',
      type: 'bank',
      openingBalance: 25000,
    });

    authService.simulateConnect('export.user@gmail.com');
    GmailApiClient.setSimulatedMessages([
      {
        id: 'msg_export_001',
        from: 'Swiggy <order@swiggy.in>',
        subject: 'Order delivered: ₹750 paid',
        date: '2026-09-14T15:00:00.000Z',
        snippet: 'Food delivery total ₹750.',
      },
      {
        id: 'msg_export_002',
        from: 'Uber <receipts@uber.com>',
        subject: 'Ride receipt: ₹420 paid',
        date: '2026-09-14T16:00:00.000Z',
        snippet: 'Trip receipt ₹420.',
      },
    ]);

    await adapter.sync();

    // Accept Swiggy candidate into a transaction
    const pending = await financialInboxService.getPendingCandidates();
    const swiggyCandidate = pending.find(c => c.payee === 'Swiggy');
    assert.ok(swiggyCandidate, 'Swiggy candidate must be found in pending inbox');
    await financialInboxService.acceptCandidate(swiggyCandidate.id, { accountId: account.id });

    // Export full application data
    const exportedJson = await dataService.exportFullData();
    assert.ok(exportedJson.length > 50);

    const parsed = JSON.parse(exportedJson);
    assert.ok(parsed.finance);
    assert.ok(Array.isArray(parsed.finance.transactions));
    assert.ok(Array.isArray(parsed.finance.candidates));

    // 1. Verify source metadata is present in export
    const exportedTxn = parsed.finance.transactions.find((t: { payee: string }) => t.payee === 'Swiggy');
    assert.ok(exportedTxn);
    assert.equal(exportedTxn.source, 'gmail');
    assert.equal(exportedTxn.sourceReference, 'gmail:msg_export_001');

    const exportedCandidate = parsed.finance.candidates.find((c: { payee: string }) => c.payee === 'Uber');
    assert.ok(exportedCandidate);
    assert.equal(exportedCandidate.source, 'gmail');
    assert.equal(exportedCandidate.sourceReference, 'gmail:msg_export_002');

    // 2. CRITICAL SECURITY: Verify zero credentials or tokens in exported data
    assert.equal(exportedJson.includes('simulated_test_gmail_token'), false, 'OAuth access token must NEVER be in export');
    assert.equal(exportedJson.includes('client_secret'), false, 'Client secret must NEVER be in export');
    assert.equal(exportedJson.includes('access_token'), false, 'Access token key must NEVER be in export');
    assert.equal(exportedJson.includes('refresh_token'), false, 'Refresh token must NEVER be in export');

    // 3. Clear database and re-import
    await clearAllData();
    const importResult = await dataService.importFullData(exportedJson);
    assert.equal(importResult.success, true);

    // Verify records restored with source metadata
    const restoredTxns = await getAllTransactions();
    assert.equal(restoredTxns.length, 1);
    assert.equal(restoredTxns[0].source, 'gmail');
    assert.equal(restoredTxns[0].sourceReference, 'gmail:msg_export_001');

    const restoredCandidates = await getAllCandidates();
    assert.equal(restoredCandidates.length, 2);
  });
});
