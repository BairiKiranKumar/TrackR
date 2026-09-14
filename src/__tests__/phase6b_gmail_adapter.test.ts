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
import { clearAllData, getAllCandidates, getAllTransactions } from '@/lib/db/localDb';

describe('Phase 6B: Gmail Adapter & Ingestion Pipeline', () => {
  let authService: GmailAuthService;
  let apiClient: GmailApiClient;
  let adapter: GmailAdapter;

  beforeEach(async () => {
    (navigator as unknown as { onLine: boolean }).onLine = true;
    memoryStorage.clear();
    await clearAllData();

    authService = new GmailAuthService();
    apiClient = new GmailApiClient();
    adapter = new GmailAdapter(authService, apiClient);

    GmailApiClient.setSimulatedMessages([
      {
        id: 'gmail_msg_swiggy_001',
        from: 'Swiggy <no-reply@swiggy.in>',
        subject: 'Order Delivered: ₹450 paid online',
        date: '2026-09-14T10:00:00.000Z',
        snippet: 'Your Biryani order from Paradise was delivered successfully.',
      },
      {
        id: 'gmail_msg_netflix_002',
        from: 'Netflix <info@netflix.com>',
        subject: 'Subscription renewed for ₹649',
        date: '2026-09-14T11:00:00.000Z',
        snippet: 'Your Premium plan was renewed for ₹649.',
      },
      {
        id: 'gmail_msg_newsletter_003',
        from: 'Tech Newsletter <news@digest.com>',
        subject: 'Top 10 programming languages in 2026',
        date: '2026-09-14T12:00:00.000Z',
        snippet: 'Read the latest trends in software development.',
      },
    ]);
  });

  // ─── 1. Connection Lifecycle ────────────────────────────────────────────────
  describe('Connection & OAuth Lifecycle', () => {
    it('1. Generates OAuth URL with CSRF state and readonly scope', () => {
      const { authUrl, state } = authService.initiateOAuthFlow('http://localhost:3000/settings');
      assert.ok(authUrl.includes('accounts.google.com/o/oauth2/v2/auth'));
      assert.ok(authUrl.includes('scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.readonly'));
      assert.ok(authUrl.includes(`state=${state}`));
    });

    it('2. Connects and validates tokens from OAuth callback hash', () => {
      // Setup CSRF state
      sessionStorage.setItem('trackr_gmail_csrf_state', 'valid_test_state');

      const hash = '#access_token=ya29.test_token_123&token_type=Bearer&expires_in=3600&state=valid_test_state';
      const result = authService.handleOAuthCallback(hash);

      assert.equal(result.success, true);
      assert.equal(authService.isConnected(), true);

      const tokens = authService.getTokens();
      assert.equal(tokens?.accessToken, 'ya29.test_token_123');
      assert.ok(tokens?.expiresAt && tokens.expiresAt > Date.now());
    });

    it('3. Rejects OAuth callback if CSRF state does not match', () => {
      sessionStorage.setItem('trackr_gmail_csrf_state', 'expected_state');
      const hash = '#access_token=ya29.test_token_123&state=tampered_state';
      const result = authService.handleOAuthCallback(hash);

      assert.equal(result.success, false);
      assert.ok(result.error?.includes('CSRF') || result.error?.includes('mismatch'));
      assert.equal(authService.isConnected(), false);
    });

    it('4. Disconnect wipes tokens and clears connection state', async () => {
      authService.simulateConnect('beta.tester@gmail.com');
      assert.equal(authService.isConnected(), true);

      await authService.disconnect();

      assert.equal(authService.isConnected(), false);
      assert.equal(authService.getTokens(), null);
      assert.equal(authService.getConnectionState().connected, false);
    });
  });

  // ─── 2. Ingestion & Bounded Retrieval ───────────────────────────────────────
  describe('Ingestion & Candidate Creation', () => {
    it('1. Syncing connected Gmail creates pending candidates without creating transactions', async () => {
      authService.simulateConnect('beta.tester@gmail.com');

      const syncResult = await adapter.sync({ daysBack: 30 });
      assert.equal(syncResult.success, true);
      assert.equal(syncResult.messagesChecked, 3);
      assert.equal(syncResult.candidatesFound, 2, 'Should detect 2 financial emails (Swiggy, Netflix)');
      assert.equal(syncResult.duplicatesSkipped, 0);

      // Verify candidates exist in Financial Inbox
      const candidates = await getAllCandidates();
      assert.equal(candidates.length, 2);

      const swiggyCand = candidates.find(c => c.payee === 'Swiggy');
      assert.ok(swiggyCand);
      assert.equal(swiggyCand?.amount, 450);
      assert.equal(swiggyCand?.currency, 'INR');
      assert.equal(swiggyCand?.source, 'gmail');
      assert.equal(swiggyCand?.sourceReference, 'gmail:gmail_msg_swiggy_001');
      assert.equal(swiggyCand?.status, 'pending');

      // CRITICAL CORE PRINCIPLE VERIFICATION: ZERO transactions created!
      const transactions = await getAllTransactions();
      assert.equal(transactions.length, 0, 'Gmail sync must NEVER automatically create transactions');
    });

    it('2. Repeated sync is 100% idempotent (skips already ingested messages)', async () => {
      authService.simulateConnect('beta.tester@gmail.com');

      // First run: 2 candidates found
      const run1 = await adapter.sync();
      assert.equal(run1.candidatesFound, 2);
      assert.equal(run1.duplicatesSkipped, 0);

      // Second run on same inbox: 0 new candidates, 2 skipped
      const run2 = await adapter.sync();
      assert.equal(run2.candidatesFound, 0);
      assert.equal(run2.duplicatesSkipped, 2);

      // Total candidates in database remains 2
      const candidates = await getAllCandidates();
      assert.equal(candidates.length, 2);
    });

    it('3. Disconnecting Gmail preserves previously created candidates', async () => {
      authService.simulateConnect('beta.tester@gmail.com');
      await adapter.sync();

      // Disconnect
      await authService.disconnect();
      assert.equal(authService.isConnected(), false);

      // Historical candidates remain intact
      const candidates = await getAllCandidates();
      assert.equal(candidates.length, 2);
      assert.equal(candidates[0].source, 'gmail');
    });

    it('4. Offline guard: Sync returns error when offline without mutating state', async () => {
      authService.simulateConnect('beta.tester@gmail.com');

      (navigator as unknown as { onLine: boolean }).onLine = false;

      const result = await adapter.sync();
      assert.equal(result.success, false);
      assert.ok(result.error?.includes('offline'));
      assert.equal(result.candidatesFound, 0);

      const candidates = await getAllCandidates();
      assert.equal(candidates.length, 0);
    });
  });
});
