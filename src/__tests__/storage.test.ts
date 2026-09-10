// Tests for the TRACKR Cloud / BYODB storage-provider architecture:
// - StorageModeService's defaulting and "don't auto-migrate" policy
// - user_id stamping / scoping in TrackrSupabaseProvider (the actual
//   client-side guarantee behind the managed multi-tenant schema)
// - CustomSupabaseProvider staying single-tenant (no user_id leakage)
// - DataService's account-deletion and data-migration sequences
//
// Real database-level RLS enforcement (the actual security boundary) is
// NOT exercised here — that requires a live TRACKR Cloud project, which
// does not exist yet (see supabase/trackr-cloud-schema.sql, authored but
// unapplied). These tests instead pin down the one thing fully testable
// without live infra: that the app itself always asks for the right user's
// data and never constructs a write for anyone else's. Providers accept an
// injected fake Supabase client for exactly this purpose (see each
// provider's constructor) — production code never passes one.

import 'fake-indexeddb/auto';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const nav = globalThis.navigator as unknown as { onLine: boolean };
if (typeof nav === 'object' && nav !== null) {
  Object.defineProperty(nav, 'onLine', { value: true, writable: true, configurable: true });
} else {
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, writable: true, configurable: true });
}

import { storageModeService } from '../lib/services/StorageModeService';
import { TrackrSupabaseProvider } from '../lib/storage/TrackrSupabaseProvider';
import { CustomSupabaseProvider } from '../lib/storage/CustomSupabaseProvider';
import { dataService } from '../lib/services/DataService';
import { clearAllData, getAllSyncOps, setSetting } from '../lib/db/localDb';

// ─── Minimal fake Supabase query builder ───────────────────────────────────
// Chainable enough for what the providers actually call (.upsert /
// .delete().eq()/.or() / .select().eq().order()), recording every call so
// tests can assert exactly what was sent — in particular, whether user_id
// was stamped and filtered on.

type Recorded = { table: string; op?: string; row?: unknown; filters: [string, ...unknown[]][] };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeSupabase(capture: Recorded[], selectResults: Record<string, unknown[]> = {}): any {
  function from(table: string) {
    const rec: Recorded = { table, filters: [] };
    const api = {
      upsert(row: unknown) { rec.op = 'upsert'; rec.row = row; return api; },
      delete() { rec.op = 'delete'; return api; },
      select(cols: string) { rec.op = 'select'; rec.filters.push(['select', cols]); return api; },
      eq(col: string, val: unknown) { rec.filters.push(['eq', col, val]); return api; },
      or(expr: string) { rec.filters.push(['or', expr]); return api; },
      order(col: string, opts: unknown) { rec.filters.push(['order', col, opts]); return api; },
      then(resolve: (v: { data?: unknown[]; error: null }) => void) {
        capture.push({ ...rec, filters: [...rec.filters] });
        resolve(rec.op === 'select' ? { data: selectResults[table] ?? [], error: null } : { error: null });
      },
    };
    return api;
  }
  return { from };
}

describe('Storage architecture — TRACKR Cloud / BYODB', () => {
  describe('StorageModeService', () => {
    beforeEach(async () => {
      await clearAllData(); // also clears the 'settings' store used for storage-mode
      storageModeService.setActiveUser(null);
      storageModeService.setCustomConfigured(false);
      storageModeService.setProviderOverrideForTesting(null);
    });

    it('defaults a brand-new user to trackr_cloud with no migration prompt', async () => {
      storageModeService.setActiveUser('user-a');
      storageModeService.setCustomConfigured(false);
      assert.equal(await storageModeService.getEffectiveMode(), 'trackr_cloud');
      assert.equal(await storageModeService.needsMigrationChoice(), false);
    });

    it('preserves custom_supabase behavior for a legacy BYODB user until they choose (never auto-migrates)', async () => {
      storageModeService.setActiveUser('user-legacy');
      storageModeService.setCustomConfigured(true);
      assert.equal(await storageModeService.getEffectiveMode(), 'custom_supabase');
      assert.equal(await storageModeService.needsMigrationChoice(), true, 'must prompt, not silently switch');
    });

    it('an explicit choice persists and clears the migration prompt', async () => {
      storageModeService.setActiveUser('user-legacy');
      storageModeService.setCustomConfigured(true);
      await storageModeService.setMode('trackr_cloud');
      assert.equal(await storageModeService.getEffectiveMode(), 'trackr_cloud');
      assert.equal(await storageModeService.needsMigrationChoice(), false);
    });

    it('getActiveProvider resolves the right provider kind, and null when signed out', async () => {
      storageModeService.setActiveUser(null);
      storageModeService.setCustomConfigured(false);
      assert.equal(await storageModeService.getActiveProvider(), null);

      storageModeService.setActiveUser('user-a');
      const cloudProvider = await storageModeService.getActiveProvider();
      assert.equal(cloudProvider?.kind, 'trackr_cloud');

      storageModeService.setCustomConfigured(true);
      await storageModeService.setMode('custom_supabase');
      const customProvider = await storageModeService.getActiveProvider();
      assert.equal(customProvider?.kind, 'custom_supabase');
    });
  });

  describe('TrackrSupabaseProvider — user_id stamping and scoping', () => {
    it('stamps user_id on every upserted item', async () => {
      const capture: Recorded[] = [];
      const provider = new TrackrSupabaseProvider('user-123', fakeSupabase(capture));
      await provider.upsertItem({
        id: 'item-1', type: 'note', title: 'Test', tags: [], archived: false,
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', metadata: {},
      });

      const upsertCall = capture.find(c => c.table === 'items' && c.op === 'upsert');
      assert.ok(upsertCall);
      assert.equal((upsertCall!.row as { user_id?: string }).user_id, 'user-123');
    });

    it('stamps user_id on every upserted relation', async () => {
      const capture: Recorded[] = [];
      const provider = new TrackrSupabaseProvider('user-123', fakeSupabase(capture));
      await provider.upsertRelation({ id: 'rel-1', sourceId: 'a', targetId: 'b', relationType: 'linked', createdAt: '2026-01-01T00:00:00.000Z' });

      const upsertCall = capture.find(c => c.table === 'item_relations' && c.op === 'upsert');
      assert.ok(upsertCall);
      assert.equal((upsertCall!.row as { user_id?: string }).user_id, 'user-123');
    });

    it('scopes deleteItem, deleteRelation and clearAll by user_id (defense in depth on top of RLS)', async () => {
      const capture: Recorded[] = [];
      const provider = new TrackrSupabaseProvider('user-123', fakeSupabase(capture));
      await provider.deleteItem('item-1');
      await provider.deleteRelation('rel-1');
      await provider.clearAll();

      for (const call of capture) {
        if (call.op === 'delete') {
          const hasUserFilter = call.filters.some(f => f[0] === 'eq' && f[1] === 'user_id' && f[2] === 'user-123');
          assert.ok(hasUserFilter, `delete on ${call.table} must be scoped by user_id`);
        }
      }
    });

    it('scopes pullItems by user_id', async () => {
      const capture: Recorded[] = [];
      const provider = new TrackrSupabaseProvider('user-123', fakeSupabase(capture, { items: [] }));
      await provider.pullItems();

      const selectCall = capture.find(c => c.table === 'items' && c.op === 'select');
      assert.ok(selectCall);
      assert.ok(selectCall!.filters.some(f => f[0] === 'eq' && f[1] === 'user_id' && f[2] === 'user-123'));
    });

    it('a different provider instance for a different user stamps that user\'s own id, never another\'s', async () => {
      const capture: Recorded[] = [];
      const providerA = new TrackrSupabaseProvider('user-A', fakeSupabase(capture));
      const providerB = new TrackrSupabaseProvider('user-B', fakeSupabase(capture));
      const item = { id: 'shared-id', type: 'note' as const, title: 'x', tags: [], archived: false, createdAt: '', updatedAt: '', metadata: {} };
      await providerA.upsertItem(item);
      await providerB.upsertItem(item);

      const rows = capture.filter(c => c.op === 'upsert').map(c => (c.row as { user_id?: string }).user_id);
      assert.deepEqual(rows, ['user-A', 'user-B']);
    });
  });

  describe('CustomSupabaseProvider — stays single-tenant', () => {
    it('never stamps a user_id (BYODB projects are one-tenant-per-project, not multi-tenant)', async () => {
      const capture: Recorded[] = [];
      const provider = new CustomSupabaseProvider(fakeSupabase(capture));
      await provider.upsertItem({
        id: 'item-1', type: 'note', title: 'Test', tags: [], archived: false,
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', metadata: {},
      });

      const upsertCall = capture.find(c => c.table === 'items' && c.op === 'upsert');
      assert.ok(upsertCall);
      assert.equal((upsertCall!.row as { user_id?: string }).user_id, undefined);
    });
  });

  describe('DataService — migration and account deletion sequences', () => {
    beforeEach(async () => {
      await clearAllData();
      storageModeService.setActiveUser('user-123');
      storageModeService.setCustomConfigured(false);
      storageModeService.setProviderOverrideForTesting(null);
      await setSetting('storage-mode', 'trackr_cloud');
    });

    it('migrateAllLocalDataToActiveProvider re-enqueues every local item and relation', async () => {
      const a = await dataService.createItem({ type: 'note', title: 'A', content: '', metadata: {} });
      const b = await dataService.createItem({ type: 'note', title: 'B', content: '', metadata: {} });
      await dataService.linkItems(a.id, b.id, 'linked');

      const before = await getAllSyncOps();
      const result = await dataService.migrateAllLocalDataToActiveProvider();
      assert.equal(result.itemsCount, 2);
      assert.equal(result.relationsCount, 1);

      const after = await getAllSyncOps();
      assert.ok(after.length > before.length, 'migration must enqueue additional sync ops for re-upload');
    });

    it('deleteAccountData clears local IndexedDB and the correctly-scoped remote rows', async () => {
      const capture: Recorded[] = [];
      const fakeProvider = new TrackrSupabaseProvider('user-123', fakeSupabase(capture));
      storageModeService.setProviderOverrideForTesting(fakeProvider);

      await dataService.createItem({ type: 'note', title: 'To be deleted', content: '', metadata: {} });
      assert.ok((await dataService.getAllItems()).length > 0);

      const result = await dataService.deleteAccountData();
      assert.equal(result.remoteCleared, true);
      assert.equal(result.localCleared, true);
      assert.equal((await dataService.getAllItems()).length, 0, 'local data must be gone after account deletion');

      const clearCalls = capture.filter(c => c.op === 'delete' && c.filters.some(f => f[0] === 'eq' && f[1] === 'user_id' && f[2] === 'user-123'));
      assert.ok(clearCalls.length >= 3, 'clearAll must touch items, item_relations and activity_events, all scoped to this user');

      storageModeService.setProviderOverrideForTesting(null);
    });

    it('deleteAccountData still clears local data even if the remote clear fails (never destroys local data on a remote error)', async () => {
      const throwingProvider = new TrackrSupabaseProvider('user-123', {
        from() { throw new Error('simulated remote failure'); },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
      storageModeService.setProviderOverrideForTesting(throwingProvider);

      await dataService.createItem({ type: 'note', title: 'Still gets cleared locally', content: '', metadata: {} });

      const result = await dataService.deleteAccountData();
      assert.equal(result.remoteCleared, false);
      assert.ok(result.error);
      assert.equal(result.localCleared, true);
      assert.equal((await dataService.getAllItems()).length, 0);

      storageModeService.setProviderOverrideForTesting(null);
    });
  });
});
