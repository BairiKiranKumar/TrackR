import { openDB, DBSchema, IDBPDatabase } from 'idb';
import { Item, ItemRelation, ActivityEvent } from '@/types';

// ─── DB Schema ─────────────────────────────────────────────────────────────

interface TrackrDB extends DBSchema {
  items: {
    key: string;
    value: Item;
    indexes: {
      'by-type': string;
      'by-createdAt': string;
      'by-updatedAt': string;
      'by-archived': number;
    };
  };
  item_relations: {
    key: string;
    value: ItemRelation;
    indexes: {
      'by-source': string;
      'by-target': string;
    };
  };
  activity_events: {
    key: string;
    value: ActivityEvent;
    indexes: {
      'by-createdAt': string;
      'by-itemId': string;
    };
  };
  settings: {
    key: string;
    value: { key: string; value: unknown };
  };
}

// ─── DB Instance ───────────────────────────────────────────────────────────

const DB_NAME = 'trackr-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<TrackrDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<TrackrDB>> {
  if (!dbPromise) {
    dbPromise = openDB<TrackrDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Items store
        if (!db.objectStoreNames.contains('items')) {
          const itemStore = db.createObjectStore('items', { keyPath: 'id' });
          itemStore.createIndex('by-type', 'type');
          itemStore.createIndex('by-createdAt', 'createdAt');
          itemStore.createIndex('by-updatedAt', 'updatedAt');
          itemStore.createIndex('by-archived', 'archived');
        }

        // Relations store
        if (!db.objectStoreNames.contains('item_relations')) {
          const relStore = db.createObjectStore('item_relations', { keyPath: 'id' });
          relStore.createIndex('by-source', 'sourceId');
          relStore.createIndex('by-target', 'targetId');
        }

        // Activity events store
        if (!db.objectStoreNames.contains('activity_events')) {
          const actStore = db.createObjectStore('activity_events', { keyPath: 'id' });
          actStore.createIndex('by-createdAt', 'createdAt');
          actStore.createIndex('by-itemId', 'itemId');
        }

        // Settings store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

// ─── Generic CRUD helpers ──────────────────────────────────────────────────

export async function getAllItems(): Promise<Item[]> {
  const db = await getDb();
  const all = await db.getAll('items');
  return all.filter(i => !i.archived).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function getItemById(id: string): Promise<Item | undefined> {
  const db = await getDb();
  return db.get('items', id);
}

export async function getItemsByType(type: Item['type']): Promise<Item[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('items', 'by-type', type);
  return all.filter(i => !i.archived).sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function saveItem(item: Item): Promise<void> {
  const db = await getDb();
  await db.put('items', item);
}

export async function deleteItem(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('items', id);
}

export async function archiveItem(id: string): Promise<void> {
  const db = await getDb();
  const item = await db.get('items', id);
  if (item) {
    item.archived = true;
    item.updatedAt = new Date().toISOString();
    await db.put('items', item);
  }
}

// ─── Relations ─────────────────────────────────────────────────────────────

export async function getRelationsForSource(sourceId: string): Promise<ItemRelation[]> {
  const db = await getDb();
  return db.getAllFromIndex('item_relations', 'by-source', sourceId);
}

export async function getRelationsForTarget(targetId: string): Promise<ItemRelation[]> {
  const db = await getDb();
  return db.getAllFromIndex('item_relations', 'by-target', targetId);
}

export async function saveRelation(relation: ItemRelation): Promise<void> {
  const db = await getDb();
  await db.put('item_relations', relation);
}

export async function deleteRelationsForSource(sourceId: string): Promise<void> {
  const db = await getDb();
  const relations = await db.getAllFromIndex('item_relations', 'by-source', sourceId);
  const tx = db.transaction('item_relations', 'readwrite');
  await Promise.all(relations.map(r => tx.store.delete(r.id)));
  await tx.done;
}

// ─── Activity ──────────────────────────────────────────────────────────────

export async function getRecentActivity(limit = 50): Promise<ActivityEvent[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('activity_events', 'by-createdAt');
  return all.reverse().slice(0, limit);
}

export async function saveActivityEvent(event: ActivityEvent): Promise<void> {
  const db = await getDb();
  await db.put('activity_events', event);
}

// ─── Settings ──────────────────────────────────────────────────────────────

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  const record = await db.get('settings', key);
  return record?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.put('settings', { key, value });
}

// ─── Search (basic full-text) ───────────────────────────────────────────────

export async function searchItems(query: string): Promise<Item[]> {
  if (!query.trim()) return [];
  const db = await getDb();
  const all = await db.getAll('items');
  const q = query.toLowerCase();
  return all
    .filter(item => !item.archived)
    .filter(item =>
      item.title.toLowerCase().includes(q) ||
      item.content?.toLowerCase().includes(q) ||
      item.tags.some(t => t.toLowerCase().includes(q))
    )
    .sort((a, b) => {
      const aTitle = a.title.toLowerCase().includes(q) ? 2 : 0;
      const bTitle = b.title.toLowerCase().includes(q) ? 2 : 0;
      return (bTitle - aTitle) ||
        (new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    });
}

// ─── Seed check ────────────────────────────────────────────────────────────

export async function isSeeded(): Promise<boolean> {
  const val = await getSetting<boolean>('seeded');
  return val === true;
}

export async function markSeeded(): Promise<void> {
  await setSetting('seeded', true);
}
