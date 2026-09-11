import 'fake-indexeddb/auto';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const nav = globalThis.navigator as unknown as { onLine: boolean };
if (typeof nav === 'object' && nav !== null) {
  Object.defineProperty(nav, 'onLine', { value: true, writable: true, configurable: true });
} else {
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, writable: true, configurable: true });
}

import { dataService } from '../lib/services/DataService';
import { clearAllData, getItemById, getAllRelations, saveItem, enqueueSyncOp } from '../lib/db/localDb';
import { storageModeService } from '../lib/services/StorageModeService';
import { observabilityService, sanitizeDetails } from '../lib/services/ObservabilityService';
import { RemoteStorageProvider } from '../lib/storage/RemoteStorageProvider';
import { TrackrSupabaseProvider } from '../lib/storage/TrackrSupabaseProvider';
import { Item, ItemRelation } from '@/types';

class MockRemoteProvider implements RemoteStorageProvider {
  readonly kind = 'trackr_cloud' as const;
  public items: Item[] = [];
  public relations: ItemRelation[] = [];
  public upsertedItems: Item[] = [];
  public deletedItemIds: string[] = [];

  async upsertItem(item: Item): Promise<void> {
    this.upsertedItems.push(item);
    const idx = this.items.findIndex(i => i.id === item.id);
    if (idx >= 0) this.items[idx] = item;
    else this.items.push(item);
  }

  async deleteItem(id: string): Promise<void> {
    this.deletedItemIds.push(id);
    this.items = this.items.filter(i => i.id !== id);
  }

  async upsertRelation(relation: ItemRelation): Promise<void> {
    const idx = this.relations.findIndex(r => r.id === relation.id);
    if (idx >= 0) this.relations[idx] = relation;
    else this.relations.push(relation);
  }

  async deleteRelation(id: string): Promise<void> {
    this.relations = this.relations.filter(r => r.id !== id);
  }

  async clearAll(): Promise<void> {
    this.items = [];
    this.relations = [];
  }

  async pullItems(): Promise<Item[]> {
    return [...this.items];
  }

  async pullRelations(): Promise<ItemRelation[]> {
    return [...this.relations];
  }
}

describe('Phase 0: Foundation & Production Safety', () => {
  let mockProvider: MockRemoteProvider;

  beforeEach(async () => {
    await clearAllData();
    await observabilityService.clear();
    mockProvider = new MockRemoteProvider();
    storageModeService.setProviderOverrideForTesting(mockProvider);
  });

  describe('Deterministic Conflict Resolution', () => {
    it('applies remote updates cleanly when local item is not dirty', async () => {
      const initial = await dataService.createItem({
        id: 'note-1',
        type: 'note',
        title: 'Initial Title',
        content: 'Initial Content',
        metadata: {},
      });

      // Remote has a newer edit and local is clean (no pending sync ops)
      mockProvider.items = [{
        ...initial,
        title: 'Remote Updated Title',
        content: 'Remote Updated Content',
        version: 2,
        updatedAt: new Date(Date.now() + 5000).toISOString(),
      }];

      // Clear queue so local is not considered dirty
      await clearAllData();
      await saveItem(initial);

      await dataService.pullFromSupabase();

      const updated = await getItemById('note-1');
      assert.equal(updated?.title, 'Remote Updated Title');
      assert.equal(updated?.content, 'Remote Updated Content');
    });

    it('preserves local changes when local item is dirty and newer than remote', async () => {
      const localItem: Item = {
        id: 'task-1',
        type: 'task',
        title: 'Local Fresh Task',
        content: 'Local fresh notes',
        tags: [],
        archived: false,
        version: 2,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T12:00:00.000Z',
        metadata: { status: 'todo' },
      };
      await saveItem(localItem);
      // Mark as dirty in sync queue
      await enqueueSyncOp({
        id: 'op-1',
        entityType: 'item',
        entityId: 'task-1',
        operation: 'update',
        payload: localItem,
        createdAt: new Date().toISOString(),
        retryCount: 0,
        status: 'pending',
      });

      // Remote has an older copy
      mockProvider.items = [{
        ...localItem,
        title: 'Stale Remote Title',
        version: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
      }];

      await dataService.pullFromSupabase();

      const current = await getItemById('task-1');
      assert.equal(current?.title, 'Local Fresh Task', 'Local unpushed edit must not be overwritten by older remote');
    });

    it('detects conflict when remote is newer and local is dirty, preserving local state non-destructively', async () => {
      const localItem: Item = {
        id: 'note-conflict',
        type: 'note',
        title: 'Local Offline Draft',
        content: 'My crucial offline ideas',
        tags: ['draft'],
        archived: false,
        version: 2,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T10:00:00.000Z',
        metadata: { wordCount: 10 },
      };
      await saveItem(localItem);

      // Local item has pending sync op (dirty)
      await enqueueSyncOp({
        id: 'op-conflict',
        entityType: 'item',
        entityId: 'note-conflict',
        operation: 'update',
        payload: localItem,
        createdAt: new Date().toISOString(),
        retryCount: 0,
        status: 'pending',
      });

      // Remote has a conflicting newer change
      mockProvider.items = [{
        id: 'note-conflict',
        type: 'note',
        title: 'Remote Edited Title',
        content: 'Remote content from laptop',
        tags: ['remote'],
        archived: false,
        version: 3,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T14:00:00.000Z', // newer
        metadata: { wordCount: 25 },
      }];

      await dataService.pullFromSupabase();

      const resolved = await getItemById('note-conflict');
      assert.ok(resolved, 'Resolved item must exist');
      assert.equal(resolved?.title, 'Remote Edited Title');

      // Crucial: local unsynced edits must be preserved in recovery metadata
      const recovery = (resolved?.metadata as Record<string, unknown>)?._conflictRecovery as { title?: string; content?: string } | undefined;
      assert.ok(recovery, 'Conflict recovery snapshot must be attached');
      assert.equal(recovery?.title, 'Local Offline Draft');
      assert.equal(recovery?.content, 'My crucial offline ideas');

      // Observability audit event must be logged
      const conflictEvents = await observabilityService.getEventsByCategory('conflict_detected');
      assert.equal(conflictEvents.length, 1, 'Conflict event must be recorded');
      assert.equal(conflictEvents[0].entityId, 'note-conflict');
    });
  });

  describe('Relations Pull and Synchronization', () => {
    it('pulls remote relations down and merges them into local IndexedDB with deduplication', async () => {
      const rel1: ItemRelation = {
        id: 'rel-remote-1',
        sourceId: 'item-a',
        targetId: 'item-b',
        relationType: 'linked',
        createdAt: new Date().toISOString(),
      };
      mockProvider.relations = [rel1];

      await dataService.pullFromSupabase();

      const localRelations = await getAllRelations();
      assert.equal(localRelations.length, 1);
      assert.equal(localRelations[0].id, 'rel-remote-1');

      // Re-pulling must not duplicate
      await dataService.pullFromSupabase();
      const afterSecondPull = await getAllRelations();
      assert.equal(afterSecondPull.length, 1);
    });

    it('pullRelations stamps user_id on TrackrSupabaseProvider queries', async () => {
      type Recorded = { table: string; op?: string; row?: unknown; filters: [string, ...unknown[]][] };
      const capture: Recorded[] = [];
      const fakeClient = {
        from(table: string) {
          const rec: Recorded = { table, filters: [] };
          const api = {
            select(cols: string) { rec.op = 'select'; rec.filters.push(['select', cols]); return api; },
            eq(col: string, val: unknown) { rec.filters.push(['eq', col, val]); return api; },
            order(col: string, opts: unknown) { rec.filters.push(['order', col, opts]); return api; },
            then(resolve: (v: { data: unknown[]; error: null }) => void) {
              capture.push({ ...rec, filters: [...rec.filters] });
              resolve({ data: [], error: null });
            },
          };
          return api;
        },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const provider = new TrackrSupabaseProvider('user-xyz', fakeClient as any);
      await provider.pullRelations();

      const call = capture.find(c => c.table === 'item_relations' && c.op === 'select');
      assert.ok(call);
      const userFilter = call.filters.find(f => f[0] === 'eq' && f[1] === 'user_id' && f[2] === 'user-xyz');
      assert.ok(userFilter, 'pullRelations must filter by user_id');
    });
  });

  describe('Observability & Privacy-Preserving Logging', () => {
    it('sanitizes and redacts passwords, tokens, and secret fields', () => {
      const raw = {
        username: 'alice',
        password: 'mySecretPassword123!',
        token: 'eyJhGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThis',
        apiKey: 'sk_live_1234567890',
        nested: {
          clientSecret: 'secret_value',
          itemCount: 42,
        },
      };

      const sanitized = sanitizeDetails(raw);
      assert.equal(sanitized?.username, 'alice');
      assert.equal(sanitized?.password, '[REDACTED]');
      assert.equal(sanitized?.token, '[REDACTED]');
      assert.equal(sanitized?.apiKey, '[REDACTED]');
      assert.deepEqual(sanitized?.nested, {
        clientSecret: '[REDACTED]',
        itemCount: 42,
      });
    });

    it('persists diagnostic events and allows querying by category', async () => {
      await observabilityService.logEvent({
        category: 'sync_failure',
        message: 'Network unreachable during batch push',
        details: { retryCount: 3 },
      });
      await observabilityService.logEvent({
        category: 'auth_failure',
        message: 'Invalid refresh token',
      });

      const syncFailures = await observabilityService.getEventsByCategory('sync_failure');
      assert.equal(syncFailures.length, 1);
      assert.equal(syncFailures[0].message, 'Network unreachable during batch push');

      const recent = await observabilityService.getRecentEvents(10);
      assert.equal(recent.length, 2);
    });
  });

  describe('Sync Queue Explicit Operation Handling', () => {
    it('archiveItem increments version and enqueues an explicit archive operation', async () => {
      const item = await dataService.createItem({
        type: 'task',
        title: 'Finish report',
        content: '',
        metadata: { status: 'todo' },
      });

      assert.equal(item.version, 1);

      await dataService.archiveItem(item.id);

      const archived = await getItemById(item.id);
      assert.equal(archived?.archived, true);
      assert.equal(archived?.version, 2);
    });
  });
});
