import { Item, ItemRelation } from '@/types';

/**
 * A remote sync destination for local IndexedDB data. SyncQueueService and
 * DataService talk only to this interface — they never know or care whether
 * writes land in TRACKR's managed project or a user's own Supabase project.
 * All retry/backoff/queueing business logic lives in SyncQueueService; a
 * provider's only job is "write this one thing" / "read everything back".
 */
export interface RemoteStorageProvider {
  readonly kind: 'trackr_cloud' | 'custom_supabase';

  upsertItem(item: Item): Promise<void>;
  deleteItem(id: string): Promise<void>;
  upsertRelation(relation: ItemRelation): Promise<void>;
  deleteRelation(id: string): Promise<void>;

  /** Wipe everything this provider stores for the current user. */
  clearAll(): Promise<void>;

  /** Full pull of the current user's non-archived items, newest first. */
  pullItems(): Promise<Item[]>;
}
