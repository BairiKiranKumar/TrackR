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

// LocalStorage in-memory mock for Node
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
import { clearAllData, getAllCandidates, getAllTransactions } from '@/lib/db/localDb';

describe('Phase 7: Bank Adapter & Ingestion Pipeline', () => {
  let authService: SetuBankAuthService;
  let apiClient: SetuApiClient;
  let adapter: BankAdapter;

  beforeEach(async () => {
    (navigator as unknown as { onLine: boolean }).onLine = true;
    memoryStorage.clear();
    await clearAllData();

    authService = new SetuBankAuthService();
    apiClient = new SetuApiClient();
    apiClient.setForceNetworkError(false);
    apiClient.setTestOverridePayload(null);
    adapter = new BankAdapter(authService, apiClient);
  });

  describe('Connection & Consent Lifecycle', () => {
    it('1. Initializes in disconnected state by default', () => {
      assert.strictEqual(authService.isConnected(), false);
      const state = authService.getConnectionState();
      assert.strictEqual(state.connected, false);
      assert.strictEqual(state.stats.candidatesFound, 0);
    });

    it('2. Simulates connection with valid consent and session keys', () => {
      const state = authService.simulateConnect({
        fipId: 'SBI-FIP',
        fipName: 'State Bank of India',
        accountMask: 'XXXXXXXX4012',
      });

      assert.strictEqual(state.connected, true);
      assert.strictEqual(state.fipName, 'State Bank of India');
      assert.strictEqual(state.accountMask, 'XXXXXXXX4012');
      assert.strictEqual(authService.isConnected(), true);

      const session = authService.getSession();
      assert.ok(session);
      assert.ok(session.token);
    });

    it('3. Disconnects bank, purges session tokens, resets connection metadata', async () => {
      authService.simulateConnect();
      assert.strictEqual(authService.isConnected(), true);

      await authService.disconnect();
      assert.strictEqual(authService.isConnected(), false);
      assert.strictEqual(authService.getSession(), null);

      const state = authService.getConnectionState();
      assert.strictEqual(state.connected, false);
    });
  });

  describe('Ingestion, Idempotency & Safety Boundary', () => {
    it('4. Offline guard: Sync returns error when offline without mutating state', async () => {
      authService.simulateConnect();
      (navigator as unknown as { onLine: boolean }).onLine = false;

      const res = await adapter.sync();
      assert.strictEqual(res.success, false);
      assert.ok(res.error?.includes('offline'));

      const candidates = await getAllCandidates();
      assert.strictEqual(candidates.length, 0);
    });

    it('5. Unconnected guard: Sync returns error if bank is not connected', async () => {
      const res = await adapter.sync();
      assert.strictEqual(res.success, false);
      assert.ok(res.error?.includes('not connected'));
    });

    it('6. Syncing bank statement creates pending candidates without creating transactions', async () => {
      authService.simulateConnect();

      const res = await adapter.sync();
      assert.strictEqual(res.success, true);
      assert.ok(res.candidatesFound > 0);

      // Verify Financial Inbox safety boundary: candidates are PENDING
      const candidates = await getAllCandidates();
      assert.strictEqual(candidates.length, res.candidatesFound);
      for (const cand of candidates) {
        assert.strictEqual(cand.source, 'bank');
        assert.strictEqual(cand.status, 'pending');
        assert.strictEqual(cand.transactionId, undefined);
      }

      // CRITICAL INVARIANT: ZERO SILENT TRANSACTIONS
      const txns = await getAllTransactions();
      assert.strictEqual(txns.length, 0);
    });

    it('7. Repeated sync is 100% idempotent (skips previously ingested transactions)', async () => {
      authService.simulateConnect();

      const firstSync = await adapter.sync();
      assert.strictEqual(firstSync.success, true);
      const initialCount = firstSync.candidatesFound;
      assert.ok(initialCount > 0);

      // Second sync of the exact same data
      const secondSync = await adapter.sync();
      assert.strictEqual(secondSync.success, true);
      assert.strictEqual(secondSync.candidatesFound, 0);
      assert.strictEqual(secondSync.duplicatesSkipped, initialCount);

      // Total candidates in database remains unchanged
      const allCandidates = await getAllCandidates();
      assert.strictEqual(allCandidates.length, initialCount);
    });

    it('8. Handles Setu API errors gracefully without corrupting database', async () => {
      authService.simulateConnect();
      apiClient.setForceNetworkError(true);

      const res = await adapter.sync();
      assert.strictEqual(res.success, false);
      assert.ok(res.error?.includes('Network error'));

      const state = authService.getConnectionState();
      assert.strictEqual(state.syncStatus, 'error');
    });

    it('9. Disconnecting bank retains existing candidates in Financial Inbox', async () => {
      authService.simulateConnect();
      await adapter.sync();

      const initialCount = (await getAllCandidates()).length;
      assert.ok(initialCount > 0);

      await authService.disconnect();
      assert.strictEqual(authService.isConnected(), false);

      const remainingCandidates = await getAllCandidates();
      assert.strictEqual(remainingCandidates.length, initialCount);
    });
  });
});
