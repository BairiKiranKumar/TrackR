/**
 * Phase 7 — End-to-End Indian Bank Integration Scenarios (B1 – B8)
 *
 * Scenarios tested:
 * - B1: Connect Bank (Setu AA) -> sync -> 15 bank transactions detected -> candidates in Financial Inbox (0 silent transactions)
 * - B2: Bank candidate -> user reviews -> accept -> transaction created in ledger -> candidate marked accepted
 * - B3: Resyncing same statement -> strictly idempotent (all skipped, 0 new candidates, 0 duplicates)
 * - B4: Cross-source deduplication -> Gmail Swiggy receipt + Bank Swiggy debit -> Bank candidate flagged duplicateOf
 * - B5: Bank candidate rejected by user -> resyncing skips it -> candidate stays rejected and never becomes a transaction
 * - B6: User disconnects Bank -> session wiped -> existing ledger transactions and candidates retained
 * - B7: User A Bank -> User B Bank -> strict tenant & connection isolation
 * - B8: Export TRACKR data -> verify session tokens absent, bank candidates and ledger entries cleanly serialized
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

import { SetuBankAuthService } from '@/lib/services/integrations/bank/SetuBankAuthService';
import { SetuApiClient } from '@/lib/services/integrations/bank/SetuApiClient';
import { BankAdapter } from '@/lib/services/integrations/bank/BankAdapter';
import { financialInboxService } from '@/lib/services/inbox/FinancialInboxService';
import { financeAccountService } from '@/lib/services/finance/FinanceAccountService';
import { financeTransactionService } from '@/lib/services/finance/FinanceTransactionService';
import { storageModeService } from '@/lib/services/StorageModeService';
import { dataService } from '@/lib/services/DataService';
import { clearAllData, getAllCandidates, getAllTransactions } from '@/lib/db/localDb';

describe('Phase 7: End-to-End Scenarios (B1 – B8)', () => {
  let authService: SetuBankAuthService;
  let apiClient: SetuApiClient;
  let adapter: BankAdapter;

  beforeEach(async () => {
    (navigator as unknown as { onLine: boolean }).onLine = true;
    memoryStorage.clear();
    await clearAllData();
    storageModeService.setActiveUser(null);

    authService = new SetuBankAuthService();
    apiClient = new SetuApiClient();
    apiClient.setForceNetworkError(false);
    apiClient.setTestOverridePayload(null);
    adapter = new BankAdapter(authService, apiClient);
  });

  // ─── SCENARIO B1 ────────────────────────────────────────────────────────────
  it('SCENARIO B1: Connect Bank (Setu AA) -> sync -> 15 bank transactions detected -> candidates in Financial Inbox (0 silent ledger transactions)', async () => {
    // 1. Connect Bank account (State Bank of India) via Setu AA simulation
    const state = authService.simulateConnect({
      fipId: 'SBI-FIP',
      fipName: 'State Bank of India',
      accountMask: 'XXXXXXXX4012',
    });
    assert.strictEqual(state.connected, true);
    assert.strictEqual(authService.isConnected(), true);

    // 2. Sync bank transactions
    const result = await adapter.sync();
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.candidatesFound, 15);
    assert.strictEqual(result.duplicatesSkipped, 0);

    // 3. Verify Financial Inbox safety boundary
    const candidates = await getAllCandidates();
    assert.strictEqual(candidates.length, 15);

    // All candidates must be 'pending' and originate from 'bank'
    for (const cand of candidates) {
      assert.strictEqual(cand.source, 'bank');
      assert.strictEqual(cand.status, 'pending');
      assert.strictEqual(cand.transactionId, undefined);
      assert.ok(cand.sourceReference?.startsWith('bank:XXXXXXXX4012:'));
    }

    // 4. CRITICAL: Zero silent transactions in the core ledger!
    const ledgerTransactions = await getAllTransactions();
    assert.strictEqual(ledgerTransactions.length, 0);
  });

  // ─── SCENARIO B2 ────────────────────────────────────────────────────────────
  it('SCENARIO B2: Bank candidate -> user reviews -> accept -> transaction created in ledger -> candidate marked accepted', async () => {
    // 1. Create user's local checking account
    const sbiAccount = await financeAccountService.createAccount({
      name: 'SBI Primary Savings (4012)',
      institution: 'State Bank of India',
      type: 'savings',
      currency: 'INR',
      openingBalance: 10000,
    });

    // 2. Connect & sync
    authService.simulateConnect();
    await adapter.sync();

    // 3. Find Swiggy candidate
    const candidates = await financialInboxService.getCandidates({ source: 'bank', status: 'pending' });
    const swiggyCandidate = candidates.find(c => c.payee.toLowerCase().includes('swiggy'));
    assert.ok(swiggyCandidate, 'Swiggy bank candidate should exist');
    assert.strictEqual(swiggyCandidate.amount, 499.0);
    assert.strictEqual(swiggyCandidate.status, 'pending');

    // 4. Explicit user confirmation / acceptance
    const acceptResult = await financialInboxService.acceptCandidate(swiggyCandidate.id, {
      accountId: sbiAccount.id,
      categoryId: 'cat_food',
    });
    assert.ok(acceptResult, 'Transaction should be created upon explicit user confirmation');
    assert.strictEqual(acceptResult.transaction.amount, 499.0);
    assert.strictEqual(acceptResult.transaction.accountId, sbiAccount.id);
    assert.strictEqual(acceptResult.transaction.source, 'bank');
    assert.strictEqual(acceptResult.transaction.sourceReference, swiggyCandidate.sourceReference);

    // 5. Verify candidate status transitioned to accepted
    assert.strictEqual(acceptResult.candidate.status, 'accepted');
    assert.strictEqual(acceptResult.candidate.transactionId, acceptResult.transaction.id);

    const updatedCandidate = (await getAllCandidates()).find(c => c.id === swiggyCandidate.id);
    assert.strictEqual(updatedCandidate?.status, 'accepted');
    assert.strictEqual(updatedCandidate?.transactionId, acceptResult.transaction.id);

    // 6. Ledger now has exactly 1 confirmed transaction
    const transactions = await getAllTransactions();
    assert.strictEqual(transactions.length, 1);
  });

  // ─── SCENARIO B3 ────────────────────────────────────────────────────────────
  it('SCENARIO B3: Resyncing same bank statement -> strictly idempotent (all skipped, 0 new candidates)', async () => {
    authService.simulateConnect();

    // First sync
    const sync1 = await adapter.sync();
    assert.strictEqual(sync1.candidatesFound, 15);
    assert.strictEqual(sync1.duplicatesSkipped, 0);

    // Second sync of same data
    const sync2 = await adapter.sync();
    assert.strictEqual(sync2.candidatesFound, 0);
    assert.strictEqual(sync2.duplicatesSkipped, 15);

    // Total candidates in database remains 15
    const candidates = await getAllCandidates();
    assert.strictEqual(candidates.length, 15);
  });

  // ─── SCENARIO B4 ────────────────────────────────────────────────────────────
  it('SCENARIO B4: Cross-source deduplication -> Gmail Swiggy receipt + Bank Swiggy debit -> Bank candidate flagged duplicateOf', async () => {
    // 1. User receives a Swiggy food delivery receipt in Gmail
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayIso = yesterday.toISOString().split('T')[0];

    const gmailCandidate = await financialInboxService.createCandidate({
      source: 'gmail',
      amount: 499.0,
      currency: 'INR',
      payee: 'Swiggy',
      date: yesterdayIso,
      sourceReference: 'gmail:swiggy_msg_4255',
      reason: 'Detected from Swiggy receipt email',
    });

    // 2. Connect bank and sync bank statement
    authService.simulateConnect();
    const syncResult = await adapter.sync();
    assert.strictEqual(syncResult.success, true);

    // 3. Find the bank candidate for Swiggy
    const candidates = await getAllCandidates();
    const bankSwiggy = candidates.find(
      c => c.source === 'bank' && c.payee.toLowerCase().includes('swiggy')
    );
    assert.ok(bankSwiggy, 'Bank Swiggy candidate must exist');

    // 4. Verify that cross-source duplicate detection linked it to the Gmail candidate!
    assert.strictEqual(bankSwiggy.duplicateOf, gmailCandidate.id);
    assert.ok(bankSwiggy.reason?.includes('Correlated with GMAIL candidate'));
  });

  // ─── SCENARIO B5 ────────────────────────────────────────────────────────────
  it('SCENARIO B5: Bank candidate rejected by user -> resyncing skips it -> candidate stays rejected', async () => {
    authService.simulateConnect();
    await adapter.sync();

    // 1. User rejects a candidate (e.g. Chai Point tea expense)
    const candidates = await financialInboxService.getCandidates({ source: 'bank', status: 'pending' });
    const chaiCand = candidates.find(c => c.payee.toLowerCase().includes('chai'));
    assert.ok(chaiCand, 'Chai Point candidate must exist');

    await financialInboxService.rejectCandidate(chaiCand.id);

    const afterReject = (await getAllCandidates()).find(c => c.id === chaiCand.id);
    assert.strictEqual(afterReject?.status, 'rejected');

    // 2. Resync bank statement
    const resync = await adapter.sync();
    assert.strictEqual(resync.candidatesFound, 0);
    assert.strictEqual(resync.duplicatesSkipped, 15);

    // 3. Rejected candidate remains rejected and NO transaction is created
    const finalCandidate = (await getAllCandidates()).find(c => c.id === chaiCand.id);
    assert.strictEqual(finalCandidate?.status, 'rejected');
    assert.strictEqual(finalCandidate?.transactionId, undefined);

    const txns = await getAllTransactions();
    assert.strictEqual(txns.length, 0);
  });

  // ─── SCENARIO B6 ────────────────────────────────────────────────────────────
  it('SCENARIO B6: User disconnects Bank -> session wiped -> existing ledger transactions and candidates retained', async () => {
    const acc = await financeAccountService.createAccount({
      name: 'SBI Checking',
      type: 'savings',
      currency: 'INR',
      openingBalance: 50000,
    });

    authService.simulateConnect();
    await adapter.sync();

    // Accept one transaction
    const pending = await financialInboxService.getCandidates({ source: 'bank', status: 'pending' });
    await financialInboxService.acceptCandidate(pending[0].id, { accountId: acc.id });

    assert.strictEqual((await getAllTransactions()).length, 1);
    assert.strictEqual((await getAllCandidates()).length, 15);
    assert.strictEqual(authService.isConnected(), true);

    // Disconnect bank
    await authService.disconnect();
    assert.strictEqual(authService.isConnected(), false);
    assert.strictEqual(authService.getSession(), null);

    // Transactions and candidates remain intact
    assert.strictEqual((await getAllTransactions()).length, 1);
    assert.strictEqual((await getAllCandidates()).length, 15);
  });

  // ─── SCENARIO B7 ────────────────────────────────────────────────────────────
  it('SCENARIO B7: User A Bank -> User B Bank -> strict tenant & connection isolation', async () => {
    // 1. User A connects bank and syncs
    storageModeService.setActiveUser('user_A');
    authService.simulateConnect({
      fipId: 'SBI-FIP',
      fipName: 'State Bank of India',
      accountMask: 'XXXXXXXX4012',
      userId: 'user_A',
    });
    assert.strictEqual(authService.isConnected('user_A'), true);

    // 2. User B checks bank connection
    storageModeService.setActiveUser('user_B');
    assert.strictEqual(authService.isConnected('user_B'), false);
    const userBState = authService.getConnectionState('user_B');
    assert.strictEqual(userBState.connected, false);
    assert.strictEqual(authService.getSession('user_B'), null);

    // User A credentials remain safe
    assert.strictEqual(authService.isConnected('user_A'), true);
  });

  // ─── SCENARIO B8 ────────────────────────────────────────────────────────────
  it('SCENARIO B8: Export TRACKR data -> verify session tokens absent, bank candidates and ledger entries cleanly serialized', async () => {
    const sbiAccount = await financeAccountService.createAccount({
      name: 'Primary SBI',
      type: 'savings',
      currency: 'INR',
      openingBalance: 20000,
    });

    authService.simulateConnect();
    await adapter.sync();

    // Accept one bank candidate
    const pending = await financialInboxService.getCandidates({ source: 'bank', status: 'pending' });
    await financialInboxService.acceptCandidate(pending[0].id, { accountId: sbiAccount.id });

    // Export full data snapshot
    const exportedJson = await dataService.exportFullData();
    assert.ok(exportedJson.length > 500);

    const parsed = JSON.parse(exportedJson);
    assert.ok(parsed.finance);
    assert.ok(parsed.finance.candidates.length >= 15);
    assert.strictEqual(parsed.finance.transactions.length, 1);

    // Verify bank sourceReference is present for auditability
    const exportedTxn = parsed.finance.transactions[0];
    assert.ok(exportedTxn.sourceReference.startsWith('bank:XXXXXXXX4012:'));

    // SECURITY VERIFICATION: No authentication tokens or session keys anywhere in the export!
    assert.strictEqual(exportedJson.includes('sim_token'), false);
    assert.strictEqual(exportedJson.includes('sim_session'), false);
    assert.strictEqual(exportedJson.includes('trackr_bank_auth_session'), false);
    assert.strictEqual(exportedJson.includes('trackr_bank_connection_state'), false);
  });
});
