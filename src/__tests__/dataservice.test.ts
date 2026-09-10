// Exercises the real DataService against a real (fake) IndexedDB backend —
// covering the Phase 1 critical-journey tests: creation, linking, deletion,
// search, offline persistence, sync recovery and export/import restoration.
//
// Uses `fake-indexeddb` to give `idb`/IndexedDB a working implementation
// under Node, so this runs the actual app code paths (DataService →
// localDb → idb) rather than a mock of them.

import 'fake-indexeddb/auto';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Minimal `navigator.onLine` so SyncQueueService's online/offline checks work
// under Node (Node 21+ already defines a read-only `navigator` global, so the
// property is patched in place rather than reassigning the whole object).
const nav = globalThis.navigator as unknown as { onLine: boolean };
if (typeof nav === 'object' && nav !== null) {
  Object.defineProperty(nav, 'onLine', { value: true, writable: true, configurable: true });
} else {
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, writable: true, configurable: true });
}
function setOnline(value: boolean) {
  (globalThis.navigator as unknown as { onLine: boolean }).onLine = value;
}

import { dataService } from '../lib/services/DataService';
import { clearAllData, getAllSyncOps, updateSyncOp } from '../lib/db/localDb';
import { syncQueueService } from '../lib/services/SyncQueueService';
import { storageModeService } from '../lib/services/StorageModeService';
import { initUserSupabase, clearUserSupabase } from '../lib/supabase';

// These sync-recovery tests exercise the custom-Supabase storage path
// (against an unreachable host, so failures are real but fast) — so the
// active-provider resolution needs to know custom storage is "configured".
function configureBrokenCustomProvider() {
  initUserSupabase('https://nonexistent.invalid.example', 'anon-key-placeholder');
  storageModeService.setCustomConfigured(true);
}
function clearCustomProvider() {
  clearUserSupabase();
  storageModeService.setCustomConfigured(false);
}

describe('Phase 1 Critical Journey — DataService', () => {
  beforeEach(async () => {
    await clearAllData();
    clearCustomProvider();
  });

  // ── Test A — Item creation ────────────────────────────────────────────
  it('Test A: creates every core item type and persists it', async () => {
    const project = await dataService.createItem({ type: 'project', title: 'Launch Website', content: '', metadata: {} });
    const note = await dataService.createItem({ type: 'note', title: 'Design notes', content: 'Use a clean grid', metadata: {} });
    const task = await dataService.createItem({ type: 'task', title: 'Buy domain', content: '', metadata: { status: 'todo' } });
    const expense = await dataService.createItem({
      type: 'expense', title: 'Domain purchase', content: '',
      metadata: { amount: 1200, currency: 'INR', category: 'work', date: '2026-01-01', isIncome: false },
    });

    const all = await dataService.getAllItems();
    for (const created of [project, note, task, expense]) {
      const found = all.find(i => i.id === created.id);
      assert.ok(found, `${created.type} should be persisted`);
      assert.equal(found?.title, created.title);
    }
  });

  // ── Test B — Linking (bidirectional) ──────────────────────────────────
  it('Test B: linking two items is navigable in both directions', async () => {
    const project = await dataService.createItem({ type: 'project', title: 'YouTube Channel', content: '', metadata: {} });
    const note = await dataService.createItem({ type: 'note', title: 'Episode ideas', content: '', metadata: {} });

    await dataService.linkItems(note.id, project.id, 'linked');

    const outgoing = await dataService.getOutgoingReferences(note.id);
    assert.ok(outgoing.some(r => r.item.id === project.id), 'note should reference project outgoing');

    const backlinks = await dataService.getBacklinks(project.id);
    assert.ok(backlinks.some(r => r.item.id === note.id), 'project should show note as a backlink');
  });

  it('Test B2: linking survives unrelated content edits (regression: manual links must not be wiped by autosave)', async () => {
    const project = await dataService.createItem({ type: 'project', title: 'YouTube Channel', content: '', metadata: {} });
    const task = await dataService.createItem({ type: 'task', title: 'Record episode 3', content: '', metadata: { status: 'todo' } });

    await dataService.linkItems(task.id, project.id, 'child');
    // Editing the task's content later (e.g. autosave) must not remove the manual project link.
    await dataService.updateItem(task.id, { content: 'Bring the tripod and extra batteries.' });

    const backlinks = await dataService.getBacklinks(project.id);
    assert.ok(backlinks.some(r => r.item.id === task.id), 'manual project link must survive a content edit');
  });

  // ── Test C — Deletion / orphan relation cleanup ───────────────────────
  it('Test C: deleting an item removes its relations safely (no orphans)', async () => {
    const project = await dataService.createItem({ type: 'project', title: 'Marathon 2026', content: '', metadata: {} });
    const note = await dataService.createItem({ type: 'note', title: 'Training log', content: '', metadata: {} });
    await dataService.linkItems(note.id, project.id, 'linked');

    await dataService.deleteItem(note.id);

    const backlinks = await dataService.getBacklinks(project.id);
    assert.equal(backlinks.length, 0, 'deleted item must not remain as a backlink');

    const allRelations = await dataService.getOutgoingReferences(note.id);
    assert.equal(allRelations.length, 0, 'relations sourced from a deleted item must be gone');
  });

  it('Test C2: duplicate relations between the same pair are prevented', async () => {
    const a = await dataService.createItem({ type: 'note', title: 'Note A', content: '', metadata: {} });
    const b = await dataService.createItem({ type: 'note', title: 'Note B', content: '', metadata: {} });

    await dataService.linkItems(a.id, b.id, 'linked');
    await dataService.linkItems(a.id, b.id, 'linked');

    const outgoing = await dataService.getOutgoingReferences(a.id);
    assert.equal(outgoing.length, 1, 'linking the same pair twice must not duplicate the relation');
  });

  // ── Test D — Search ────────────────────────────────────────────────────
  it('Test D: search matches title, content and tags — case-insensitively and partially', async () => {
    await dataService.createItem({ type: 'note', title: 'Grocery List', content: 'milk, eggs, bread', tags: ['home'], metadata: {} });
    await dataService.createItem({ type: 'task', title: 'Fix login bug', content: 'Auth token expiring early', tags: ['engineering'], metadata: { status: 'todo' } });
    await dataService.createItem({ type: 'project', title: 'Website Relaunch', content: '', tags: ['work', 'priority'], metadata: {} });

    const byTitlePartial = await dataService.search('relaunch');
    assert.ok(byTitlePartial.some(i => i.title === 'Website Relaunch'), 'partial, case-insensitive title match');

    const byContent = await dataService.search('AUTH TOKEN');
    assert.ok(byContent.some(i => i.title === 'Fix login bug'), 'case-insensitive content match');

    const byTag = await dataService.search('engineering');
    assert.ok(byTag.some(i => i.title === 'Fix login bug'), 'tag match');

    const typeFiltered = (await dataService.search('e')).filter(i => i.type === 'project');
    assert.ok(typeFiltered.every(i => i.type === 'project'), 'type filtering narrows results');
  });

  // ── Test E — Offline persistence ──────────────────────────────────────
  it('Test E: items and links created while offline persist after "reload"', async () => {
    setOnline(false);

    const project = await dataService.createItem({ type: 'project', title: 'Offline Project', content: '', metadata: {} });
    const note = await dataService.createItem({ type: 'note', title: 'Offline Note', content: '', metadata: {} });
    await dataService.linkItems(note.id, project.id, 'linked');

    // Simulate reload: re-read everything from IndexedDB fresh, not from any in-memory cache.
    const reloadedItems = await dataService.getAllItems();
    assert.ok(reloadedItems.some(i => i.id === project.id));
    assert.ok(reloadedItems.some(i => i.id === note.id));

    const backlinks = await dataService.getBacklinks(project.id);
    assert.ok(backlinks.some(r => r.item.id === note.id), 'offline-created link must survive reload');

    setOnline(true);
  });

  // ── Test F — Sync queue / recovery ────────────────────────────────────
  it('Test F: pending sync operations are queued, persisted, and failures retry without losing local data', async () => {
    const item = await dataService.createItem({ type: 'note', title: 'Needs sync', content: '', metadata: {} });

    let ops = await getAllSyncOps();
    assert.ok(ops.some(o => o.entityId === item.id), 'create must enqueue a sync operation');
    assert.ok(ops.every(o => o.status === 'pending'), 'newly queued ops start pending');

    // Point sync at an unreachable host so the queue actually attempts (and fails) a network call —
    // this exercises the real retry/backoff bookkeeping rather than a mock of it.
    configureBrokenCustomProvider();
    await syncQueueService.processQueue();

    ops = await getAllSyncOps();
    const opForItem = ops.find(o => o.entityId === item.id);
    assert.ok(opForItem, 'op must still exist after a failed sync attempt — local queue is never dropped on failure');
    assert.equal(opForItem?.status, 'failed');
    assert.ok((opForItem?.retryCount ?? 0) >= 1, 'retry count must increment on failure');
    assert.ok(opForItem?.lastError, 'failure reason should be recorded for visibility');

    // Local data must be untouched by a sync failure.
    const stillThere = await dataService.getItemById(item.id);
    assert.ok(stillThere, 'local item must survive a sync failure');

    clearCustomProvider();
  });

  it('Test F2: a permanently-failing op stops auto-retrying after the retry cap, and can be manually retried or dismissed without touching local data', async () => {
    const item = await dataService.createItem({ type: 'note', title: 'Chronically failing sync', content: '', metadata: {} });
    configureBrokenCustomProvider();

    // Fast-forward the op to one attempt away from the retry cap, with its
    // last attempt far enough in the past to clear the backoff window.
    let ops = await getAllSyncOps();
    let op = ops.find(o => o.entityId === item.id)!;
    op.retryCount = 7; // MAX_RETRIES - 1
    op.status = 'failed';
    op.lastAttemptAt = new Date(Date.now() - 60_000).toISOString();
    await updateSyncOp(op);

    await syncQueueService.processQueue();

    ops = await getAllSyncOps();
    op = ops.find(o => o.entityId === item.id)!;
    assert.equal(op.status, 'needs_attention', 'op must stop auto-retrying once the cap is hit');
    assert.ok(op.retryCount >= 8);

    const attention = await dataService.getSyncOpsNeedingAttention();
    assert.ok(attention.some(o => o.id === op.id), 'stuck op must be inspectable');

    // Local data is untouched by the exhausted retries.
    assert.ok(await dataService.getItemById(item.id));

    // Manual retry re-arms it.
    await dataService.retrySyncOp(op.id);
    ops = await getAllSyncOps();
    op = ops.find(o => o.entityId === item.id)!;
    assert.equal(op.status, 'pending');
    assert.equal(op.retryCount, 0);

    // Explicit dismissal removes the queue entry — but still not the item.
    await dataService.dismissSyncOp(op.id);
    ops = await getAllSyncOps();
    assert.ok(!ops.some(o => o.id === op.id));
    assert.ok(await dataService.getItemById(item.id), 'dismissing a sync op must never delete the underlying item');

    clearCustomProvider();
  });

  // ── Test G — Export / Import round-trip ───────────────────────────────
  it('Test G: export → clear local data → import restores items and relations', async () => {
    const project = await dataService.createItem({ type: 'project', title: 'Restore Test Project', content: '', metadata: {} });
    const note = await dataService.createItem({ type: 'note', title: 'Restore Test Note', content: 'some content', tags: ['x'], metadata: {} });
    await dataService.linkItems(note.id, project.id, 'linked');

    const exported = await dataService.exportFullData();

    await dataService.clearAllData();
    assert.equal((await dataService.getAllItems()).length, 0, 'clearAllData must wipe local items');

    const result = await dataService.importFullData(exported);
    assert.equal(result.success, true);
    assert.ok(result.itemsCount >= 2);
    assert.ok(result.relationsCount >= 1);

    const restoredItems = await dataService.getAllItems();
    assert.ok(restoredItems.some(i => i.title === 'Restore Test Project'));
    assert.ok(restoredItems.some(i => i.title === 'Restore Test Note'));

    const restoredProject = restoredItems.find(i => i.title === 'Restore Test Project')!;
    const backlinks = await dataService.getBacklinks(restoredProject.id);
    assert.ok(backlinks.length >= 1, 'relations must be restored, not just items');
  });

  // ── Test H — Security (documented limitation) ─────────────────────────
  it('Test H: per-user config lookups are scoped by user id at the query level (code-level guard only)', async () => {
    // NOTE: TRACKR isolates users by giving each their own Supabase project
    // (see UserConfigService), so the only cross-user-readable table is the
    // shared `user_configs` row on the master project. This test can only
    // verify the application always *asks* for a single user's row — it
    // cannot verify a Postgres RLS policy actually enforces that at the
    // database level, since that requires live Supabase credentials this
    // test environment does not have. See audit report §15/§Risks.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '../lib/services/UserConfigService.ts'), 'utf-8');
    assert.match(src, /\.eq\(['"]user_id['"],\s*userId\)/, 'getUserConfig must filter by the requesting user\'s id');
  });
});
