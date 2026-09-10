import {
  enqueueSyncOp,
  getPendingSyncOps,
  updateSyncOp,
  deleteSyncOp,
  getAllSyncOps,
} from '@/lib/db/localDb';
import { SyncOperation, SyncOperationType, SyncStatus, Item, ItemRelation } from '@/types';
import { getUserSupabase } from '@/lib/supabase';

type StatusListener = (state: { status: SyncStatus; pendingCount: number; failedCount: number }) => void;

function genId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function toSbRow(item: Item): Record<string, unknown> {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    content: item.content ?? '',
    metadata: item.metadata ?? {},
    tags: item.tags ?? [],
    pinned: item.pinned ?? false,
    archived: item.archived ?? false,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

function toSbRelation(relation: ItemRelation): Record<string, unknown> {
  return {
    id: relation.id,
    source_id: relation.sourceId,
    target_id: relation.targetId,
    relation_type: relation.relationType,
    created_at: relation.createdAt,
  };
}

class SyncQueueService {
  private processing = false;
  private listeners: Set<StatusListener> = new Set();
  private scheduledTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.trigger());
    }
  }

  public subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    this.emitStatus();
    return () => {
      this.listeners.delete(listener);
    };
  }

  private async emitStatus(): Promise<void> {
    const ops = await getAllSyncOps();
    const pending = ops.filter(o => o.status === 'pending');
    const failed = ops.filter(o => o.status === 'failed');

    let status: SyncStatus = 'synced';
    if (this.processing) {
      status = 'syncing';
    } else if (failed.length > 0) {
      status = 'failed';
    } else if (pending.length > 0) {
      status = 'pending';
    }

    const state = {
      status,
      pendingCount: pending.length + (this.processing ? 1 : 0),
      failedCount: failed.length,
    };

    this.listeners.forEach(fn => {
      try { fn(state); } catch (e) { console.error('Sync listener error:', e); }
    });
  }

  public async enqueue(
    entityType: 'item' | 'item_relation' | 'database',
    entityId: string,
    operation: SyncOperationType,
    payload?: unknown
  ): Promise<void> {
    const op: SyncOperation = {
      id: genId(),
      entityType,
      entityId,
      operation,
      payload,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      status: 'pending',
    };

    await enqueueSyncOp(op);
    this.emitStatus();
    this.trigger();
  }

  public trigger(): void {
    if (this.scheduledTimer) clearTimeout(this.scheduledTimer);
    this.scheduledTimer = setTimeout(() => {
      this.processQueue();
    }, 150);
  }

  public async processQueue(): Promise<void> {
    if (this.processing) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.emitStatus();
      return;
    }

    const sb = getUserSupabase();
    if (!sb) {
      // Local only mode — cloud sync not configured
      this.emitStatus();
      return;
    }

    this.processing = true;
    this.emitStatus();

    try {
      const ops = await getPendingSyncOps(30);
      for (const op of ops) {
        // Enforce backoff if previously failed
        if (op.lastAttemptAt && op.retryCount > 0) {
          const waitMs = Math.min(1000 * Math.pow(2, op.retryCount), 30000);
          const elapsed = Date.now() - new Date(op.lastAttemptAt).getTime();
          if (elapsed < waitMs) {
            continue; // wait for backoff window
          }
        }

        try {
          await this.executeOp(op, sb);
          await deleteSyncOp(op.id);
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          op.retryCount += 1;
          op.lastAttemptAt = new Date().toISOString();
          op.lastError = errorMsg;
          op.status = 'failed';
          await updateSyncOp(op);
        }
      }
    } finally {
      this.processing = false;
      this.emitStatus();
    }
  }

  private async executeOp(op: SyncOperation, sb: ReturnType<typeof getUserSupabase>): Promise<void> {
    if (!sb) return;

    switch (op.operation) {
      case 'create':
      case 'update': {
        if (op.entityType === 'item' && op.payload) {
          const row = toSbRow(op.payload as Item);
          const { error } = await sb.from('items').upsert(row, { onConflict: 'id' });
          if (error) throw error;
        } else if (op.entityType === 'item_relation' && op.payload) {
          const row = toSbRelation(op.payload as ItemRelation);
          const { error } = await sb.from('item_relations').upsert(row, { onConflict: 'id' });
          if (error) throw error;
        }
        break;
      }
      case 'delete': {
        if (op.entityType === 'item') {
          const { error: err1 } = await sb.from('items').delete().eq('id', op.entityId);
          if (err1) throw err1;
          // also delete relations pointing to/from this item
          await sb.from('item_relations').delete().or(`source_id.eq.${op.entityId},target_id.eq.${op.entityId}`);
        } else if (op.entityType === 'item_relation') {
          const { error } = await sb.from('item_relations').delete().eq('id', op.entityId);
          if (error) throw error;
        }
        break;
      }
      case 'relation_create': {
        if (op.payload) {
          const row = toSbRelation(op.payload as ItemRelation);
          const { error } = await sb.from('item_relations').upsert(row, { onConflict: 'id' });
          if (error) throw error;
        }
        break;
      }
      case 'relation_delete': {
        const { error } = await sb.from('item_relations').delete().eq('id', op.entityId);
        if (error) throw error;
        break;
      }
      case 'clear_all': {
        await sb.from('items').delete().neq('id', '0');
        await sb.from('item_relations').delete().neq('id', '0');
        await sb.from('activity_events').delete().neq('id', '0');
        break;
      }
    }
  }
}

export const syncQueueService = new SyncQueueService();
