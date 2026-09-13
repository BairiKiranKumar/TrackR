import {
  enqueueSyncOp,
  getPendingSyncOps,
  updateSyncOp,
  deleteSyncOp,
  getAllSyncOps,
} from '@/lib/db/localDb';
import { SyncOperation, SyncOperationType, SyncStatus, Item, ItemRelation } from '@/types';
import { storageModeService } from './StorageModeService';
import { RemoteStorageProvider } from '@/lib/storage/RemoteStorageProvider';
import { observabilityService } from './ObservabilityService';

// After this many failed attempts, an operation stops auto-retrying and is
// marked 'needs_attention' instead of 'failed' — it is never discarded, just
// no longer retried automatically, so a permanently-invalid op (bad schema,
// stale foreign key, etc.) doesn't spin forever. A transient network blip
// recovers well before this many attempts thanks to exponential backoff.
const MAX_RETRIES = 8;

type StatusListener = (state: { status: SyncStatus; pendingCount: number; failedCount: number; attentionCount: number }) => void;

function genId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
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
    const attention = ops.filter(o => o.status === 'needs_attention');

    let status: SyncStatus = 'synced';
    if (this.processing) {
      status = 'syncing';
    } else if (attention.length > 0) {
      status = 'needs_attention';
    } else if (failed.length > 0) {
      status = 'failed';
    } else if (pending.length > 0) {
      status = 'pending';
    }

    const state = {
      status,
      pendingCount: pending.length + (this.processing ? 1 : 0),
      failedCount: failed.length,
      attentionCount: attention.length,
    };

    this.listeners.forEach(fn => {
      try { fn(state); } catch (e) { console.error('Sync listener error:', e); }
    });
  }

  /** Ops that are no longer being retried automatically and need a manual look. */
  public async getOpsNeedingAttention(): Promise<SyncOperation[]> {
    const ops = await getAllSyncOps();
    return ops.filter(o => o.status === 'needs_attention');
  }

  /** Manually re-arm a stuck operation for one more round of automatic retries. */
  public async retryOp(id: string): Promise<void> {
    const ops = await getAllSyncOps();
    const op = ops.find(o => o.id === id);
    if (!op) return;
    op.status = 'pending';
    op.retryCount = 0;
    op.lastError = undefined;
    await updateSyncOp(op);
    this.emitStatus();
    this.trigger();
  }

  /**
   * Explicitly drop a stuck operation without retrying it again. This only
   * removes the queued *sync* record — it never touches the local item/
   * relation data, which stays exactly as the user left it.
   */
  public async discardOp(id: string): Promise<void> {
    await deleteSyncOp(id);
    this.emitStatus();
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

    const provider = await storageModeService.getActiveProvider();
    if (!provider) {
      // Not signed in, or no storage destination resolved yet — local only.
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
          await this.executeOp(op, provider);
          await deleteSyncOp(op.id);
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          op.retryCount += 1;
          op.lastAttemptAt = new Date().toISOString();
          op.lastError = errorMsg;
          // Stop auto-retrying a permanently-invalid op after MAX_RETRIES, but
          // never delete it — it stays inspectable/retryable via retryOp(),
          // and the local item/relation data it describes is untouched either way.
          op.status = op.retryCount >= MAX_RETRIES ? 'needs_attention' : 'failed';
          await updateSyncOp(op);

          try {
            await observabilityService.logEvent({
              category: 'sync_failure',
              message: `Sync ${op.operation} on ${op.entityType} ${op.entityId} failed: ${errorMsg}`,
              entityType: op.entityType,
              entityId: op.entityId,
              details: { operation: op.operation, retryCount: op.retryCount, status: op.status },
            });
          } catch {
            // Ignore observability logging error to prevent blocking sync loop
          }
        }
      }
    } finally {
      this.processing = false;
      this.emitStatus();
    }
  }

  private async executeOp(op: SyncOperation, provider: RemoteStorageProvider): Promise<void> {
    switch (op.operation) {
      case 'create':
      case 'update':
      case 'upsert':
      case 'archive': {
        if (op.entityType === 'item' && op.payload) {
          await provider.upsertItem(op.payload as Item);
        } else if (op.entityType === 'item_relation' && op.payload) {
          await provider.upsertRelation(op.payload as ItemRelation);
        } else if (op.entityType.startsWith('fa_')) {
          const anyProvider = provider as unknown as { upsertFinanceEntity?: (entityType: string, payload: unknown) => Promise<void> };
          if (typeof anyProvider.upsertFinanceEntity === 'function' && op.payload) {
            await anyProvider.upsertFinanceEntity(op.entityType, op.payload);
          }
        }
        break;
      }
      case 'delete': {
        if (op.entityType === 'item') {
          await provider.deleteItem(op.entityId);
        } else if (op.entityType === 'item_relation') {
          await provider.deleteRelation(op.entityId);
        } else if (op.entityType.startsWith('fa_')) {
          const anyProvider = provider as unknown as { deleteFinanceEntity?: (entityType: string, id: string) => Promise<void> };
          if (typeof anyProvider.deleteFinanceEntity === 'function') {
            await anyProvider.deleteFinanceEntity(op.entityType, op.entityId);
          }
        }
        break;
      }
      case 'relation_create': {
        if (op.payload) await provider.upsertRelation(op.payload as ItemRelation);
        break;
      }
      case 'relation_delete': {
        await provider.deleteRelation(op.entityId);
        break;
      }
      case 'clear':
      case 'clear_all': {
        await provider.clearAll();
        break;
      }
    }
  }
}

export const syncQueueService = new SyncQueueService();
