import {
  getAllItems, getItemById, getItemsByType, saveItem,
  archiveItem as localArchiveItem, getRelationsForSource, getRelationsForTarget,
  saveRelation, deleteRelationsForSource, getRecentActivity,
  saveActivityEvent, searchItems, getSetting, setSetting, getAllRelations,
  deleteItem as localDeleteItem, deleteRelationsForItem, clearAllData as localClearAllData,
} from '@/lib/db/localDb';
import { buildRelationsFromText } from './ReferenceParser';
import { BudgetItem, BudgetMetadata, BudgetProgress, DailyStreakState, Item, ItemType, ItemRelation, ActivityEvent, ActivityEventType, TransactionCategory, TransactionMetadata, WeeklyDigestSummary } from '@/types';
import { getUserSupabase } from '@/lib/supabase';

// ─── ID generation ─────────────────────────────────────────────────────────
function genId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getLocalDateKey(date = new Date()): string {
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return offsetDate.toISOString().slice(0, 10);
}

function getPreviousDateKey(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() - 1);
  return getLocalDateKey(date);
}

// ─── Supabase transform helpers ─────────────────────────────────────────────
// IndexedDB uses camelCase; Supabase tables use snake_case

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

function fromSbRow(row: Record<string, unknown>): Item {
  return {
    id: row.id as string,
    type: row.type as ItemType,
    title: row.title as string,
    content: (row.content as string) ?? '',
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    tags: (row.tags as string[]) ?? [],
    pinned: (row.pinned as boolean) ?? false,
    archived: (row.archived as boolean) ?? false,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

// ─── Supabase sync helpers (fire-and-forget) ────────────────────────────────

async function syncItemToSb(item: Item): Promise<void> {
  const sb = getUserSupabase();
  if (!sb) return;
  try {
    await sb.from('items').upsert(toSbRow(item), { onConflict: 'id' });
  } catch {
    // Swallow — local data is source of truth, Supabase is async backup
  }
}

async function syncArchiveToSb(id: string): Promise<void> {
  const sb = getUserSupabase();
  if (!sb) return;
  try {
    await sb.from('items').update({ archived: true, updated_at: new Date().toISOString() }).eq('id', id);
  } catch { /* swallow */ }
}

async function syncDeleteItemToSb(id: string): Promise<void> {
  const sb = getUserSupabase();
  if (!sb) return;
  try {
    await sb.from('items').delete().eq('id', id);
    await sb.from('item_relations').delete().or(`source_id.eq.${id},target_id.eq.${id}`);
  } catch { /* swallow */ }
}

async function syncClearAllToSb(): Promise<void> {
  const sb = getUserSupabase();
  if (!sb) return;
  try {
    await sb.from('items').delete().neq('id', '0');
    await sb.from('item_relations').delete().neq('id', '0');
    await sb.from('activity_events').delete().neq('id', '0');
  } catch { /* swallow */ }
}

async function syncRelationToSb(rel: ItemRelation): Promise<void> {
  const sb = getUserSupabase();
  if (!sb) return;
  try {
    await sb.from('item_relations').upsert({
      id: rel.id,
      source_id: rel.sourceId,
      target_id: rel.targetId,
      relation_type: rel.relationType,
      created_at: rel.createdAt,
    }, { onConflict: 'id' });
  } catch { /* swallow */ }
}

async function syncDeleteRelationsToSb(sourceId: string): Promise<void> {
  const sb = getUserSupabase();
  if (!sb) return;
  try {
    await sb.from('item_relations').delete().eq('source_id', sourceId);
  } catch { /* swallow */ }
}

async function syncActivityToSb(event: ActivityEvent): Promise<void> {
  const sb = getUserSupabase();
  if (!sb) return;
  try {
    await sb.from('activity_events').upsert({
      id: event.id,
      item_id: event.itemId,
      item_title: event.itemTitle,
      type: event.type,
      description: event.description,
      metadata: { amount: event.amount, itemType: event.itemType },
      created_at: event.createdAt,
    }, { onConflict: 'id' });
  } catch { /* swallow */ }
}

// ─── Sync status ─────────────────────────────────────────────────────────────

type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline';
type SyncListener = (status: SyncStatus) => void;
const syncListeners: SyncListener[] = [];
let currentSyncStatus: SyncStatus = 'idle';

function setSyncStatus(status: SyncStatus) {
  currentSyncStatus = status;
  syncListeners.forEach(fn => fn(status));
}

// ─── DataService singleton ─────────────────────────────────────────────────

class DataService {

  /** Subscribe to sync status changes */
  onSyncStatusChange(fn: SyncListener): () => void {
    syncListeners.push(fn);
    fn(currentSyncStatus);
    return () => {
      const idx = syncListeners.indexOf(fn);
      if (idx >= 0) syncListeners.splice(idx, 1);
    };
  }

  // ── Pull from Supabase on login ──────────────────────────────────────────
  // Called by AuthProvider after user config is loaded.
  // Downloads all items from Supabase and saves them to local IndexedDB.

  async pullFromSupabase(): Promise<void> {
    const sb = getUserSupabase();
    if (!sb) return;

    setSyncStatus('syncing');
    try {
      const { data: rows, error } = await sb
        .from('items')
        .select('*')
        .eq('archived', false)
        .order('updated_at', { ascending: false });

      if (error || !rows) {
        setSyncStatus('offline');
        return;
      }

      // Merge remote → local (remote wins for newer records)
      for (const row of rows) {
        const remoteItem = fromSbRow(row as Record<string, unknown>);
        const localItem = await getItemById(remoteItem.id);
        if (!localItem || remoteItem.updatedAt > localItem.updatedAt) {
          await saveItem(remoteItem);
        }
      }

      setSyncStatus('synced');
    } catch {
      setSyncStatus('offline');
    }
  }

  // ── Push local → Supabase (initial sync for existing local data) ─────────

  async pushLocalToSupabase(): Promise<void> {
    const sb = getUserSupabase();
    if (!sb) return;
    const items = await getAllItems();
    if (!items.length) return;

    setSyncStatus('syncing');
    try {
      const rows = items.map(toSbRow);
      // Batch upsert (Supabase supports arrays)
      await sb.from('items').upsert(rows, { onConflict: 'id' });
      setSyncStatus('synced');
    } catch {
      setSyncStatus('offline');
    }
  }

  // ── Items ──────────────────────────────────────────────────────────────

  async getAllItems(): Promise<Item[]> {
    return getAllItems();
  }

  async getItemById(id: string): Promise<Item | undefined> {
    return getItemById(id);
  }

  async getItemsByType(type: ItemType): Promise<Item[]> {
    return getItemsByType(type);
  }

  async createItem(partial: Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'archived' | 'tags'> & {
    tags?: string[];
    id?: string;
  }): Promise<Item> {
    const now = new Date().toISOString();
    const item: Item = {
      ...partial,
      id: partial.id ?? genId(),
      tags: partial.tags ?? [],
      archived: false,
      createdAt: now,
      updatedAt: now,
    };

    // 1. Save locally (instant)
    await saveItem(item);
    await this.logActivity('item_created', item);

    // 2. Parse @references
    if (item.content) {
      await this.updateReferencesFromContent(item.id, item.content);
    }

    // 3. Sync to Supabase (async, non-blocking)
    syncItemToSb(item);

    return item;
  }

  async updateItem(id: string, updates: Partial<Omit<Item, 'id' | 'createdAt'>>): Promise<Item | null> {
    const existing = await getItemById(id);
    if (!existing) return null;

    const updated: Item = {
      ...existing,
      ...updates,
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    await saveItem(updated);

    if (updates.content !== undefined) {
      await this.updateReferencesFromContent(id, updates.content ?? '');
    }

    // Sync to Supabase (async)
    syncItemToSb(updated);

    return updated;
  }

  async archiveItem(id: string): Promise<void> {
    await localArchiveItem(id);
    syncArchiveToSb(id);
  }

  async deleteItem(id: string): Promise<void> {
    await localDeleteItem(id);
    await deleteRelationsForItem(id);
    syncDeleteItemToSb(id);
  }

  async clearAllData(): Promise<void> {
    await localClearAllData();
    syncClearAllToSb();
  }

  // ── References ─────────────────────────────────────────────────────────

  async updateReferencesFromContent(sourceId: string, content: string): Promise<void> {
    const allItems = await getAllItems();
    const relations = buildRelationsFromText(sourceId, content, allItems);

    await deleteRelationsForSource(sourceId);
    syncDeleteRelationsToSb(sourceId);

    for (const rel of relations) {
      await saveRelation(rel);
      syncRelationToSb(rel);
    }
  }

  async getOutgoingReferences(sourceId: string): Promise<{ relation: ItemRelation; item: Item }[]> {
    const relations = await getRelationsForSource(sourceId);
    const results: { relation: ItemRelation; item: Item }[] = [];
    for (const rel of relations) {
      const item = await getItemById(rel.targetId);
      if (item) results.push({ relation: rel, item });
    }
    return results;
  }

  async getBacklinks(targetId: string): Promise<{ relation: ItemRelation; item: Item }[]> {
    const relations = await getRelationsForTarget(targetId);
    const results: { relation: ItemRelation; item: Item }[] = [];
    for (const rel of relations) {
      const item = await getItemById(rel.sourceId);
      if (item) results.push({ relation: rel, item });
    }
    return results;
  }

  async addManualRelation(sourceId: string, targetId: string): Promise<void> {
    const rel: ItemRelation = {
      id: genId(),
      sourceId,
      targetId,
      relationType: 'linked',
      createdAt: new Date().toISOString(),
    };
    await saveRelation(rel);
    syncRelationToSb(rel);
  }

  // ── Activity ───────────────────────────────────────────────────────────

  async getRecentActivity(limit = 50): Promise<ActivityEvent[]> {
    return getRecentActivity(limit);
  }

  async logActivity(
    type: ActivityEventType,
    item: Item,
    description?: string,
    amount?: number,
  ): Promise<void> {
    const event: ActivityEvent = {
      id: genId(),
      type,
      itemId: item.id,
      itemTitle: item.title,
      itemType: item.type,
      description,
      amount,
      createdAt: new Date().toISOString(),
    };
    await saveActivityEvent(event);
    syncActivityToSb(event);
  }

  // ── Search ─────────────────────────────────────────────────────────────

  async search(query: string): Promise<Item[]> {
    return searchItems(query);
  }

  async getItemsForAtMention(query: string): Promise<Item[]> {
    const all = await getAllItems();
    if (!query) return all.slice(0, 20);
    const q = query.toLowerCase();
    return all.filter(i => i.title.toLowerCase().includes(q)).slice(0, 10);
  }

  // ── Finance helpers ────────────────────────────────────────────────────

  async getTransactionsThisMonth(): Promise<Item[]> {
    const expenses = await getItemsByType('expense');
    const income = await getItemsByType('income');
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    return [...expenses, ...income].filter(item => {
      const meta = item.metadata as { date?: string };
      return meta.date && meta.date >= monthStart;
    });
  }

  async getMonthlyTotals(): Promise<{ income: number; expenses: number; net: number }> {
    const txns = await this.getTransactionsThisMonth();
    let income = 0;
    let expenses = 0;
    for (const txn of txns) {
      const meta = txn.metadata as { amount: number; isIncome: boolean };
      if (meta.isIncome) income += meta.amount ?? 0;
      else expenses += meta.amount ?? 0;
    }
    return { income, expenses, net: income - expenses };
  }

  async getMonthlyBudgetProgress(): Promise<BudgetProgress[]> {
    const [budgetItems, transactions] = await Promise.all([
      getItemsByType('budget'),
      this.getTransactionsThisMonth(),
    ]);
    const spendingByCategory = new Map<TransactionCategory, number>();

    for (const transaction of transactions) {
      const metadata = transaction.metadata as TransactionMetadata;
      if (!metadata.isIncome) {
        const category = metadata.category as TransactionCategory;
        spendingByCategory.set(category, (spendingByCategory.get(category) ?? 0) + metadata.amount);
      }
    }

    return budgetItems
      .map(item => item as BudgetItem)
      .filter(item => {
        const metadata = item.metadata as BudgetMetadata;
        return metadata.period === 'monthly' && Boolean(metadata.category) && metadata.limit > 0;
      })
      .map(budget => {
        const metadata = budget.metadata as BudgetMetadata;
        const spent = spendingByCategory.get(metadata.category!) ?? 0;
        const percentage = (spent / metadata.limit) * 100;
        return { budget, spent, percentage, isAlert: percentage >= 80 };
      })
      .sort((a, b) => b.percentage - a.percentage);
  }

  async saveMonthlyBudget(category: TransactionCategory, limit: number, currency = 'INR'): Promise<Item | null> {
    if (!Number.isFinite(limit) || limit <= 0) return null;

    const budgets = await getItemsByType('budget');
    const existing = budgets.find(item => {
      const metadata = item.metadata as BudgetMetadata;
      return metadata.period === 'monthly' && metadata.category === category;
    });
    const metadata: BudgetMetadata = {
      limit,
      currency,
      period: 'monthly',
      category,
      startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
      alertThreshold: 0.8,
    };

    if (existing) {
      return this.updateItem(existing.id, { metadata, title: `${category} monthly budget` });
    }

    return this.createItem({
      type: 'budget',
      title: `${category} monthly budget`,
      content: '',
      metadata,
    });
  }

  // ── Tracker helpers ────────────────────────────────────────────────────

  async completeTrackerDay(trackerId: string, dayIndex?: number, date?: string): Promise<Item | null> {
    const tracker = await getItemById(trackerId);
    if (!tracker || tracker.type !== 'tracker') return null;

    const meta = tracker.metadata as {
      trackerType: string;
      completedDays?: number[];
      completedDates?: string[];
      currentStreak?: number;
      longestStreak?: number;
    };

    const today = new Date().toISOString().split('T')[0];

    if (meta.trackerType === 'series' && dayIndex !== undefined) {
      const days = meta.completedDays ?? [];
      if (!days.includes(dayIndex)) {
        days.push(dayIndex);
        days.sort((a, b) => a - b);
      }
      const streak = this.calculateSeriesStreak(days);
      const updated = await this.updateItem(trackerId, {
        metadata: { ...meta, completedDays: days, currentStreak: streak, longestStreak: Math.max(meta.longestStreak ?? 0, streak) },
      });
      if (updated) await this.logActivity('tracker_day_completed', updated, `Day ${dayIndex + 1} completed`);
      return updated;
    }

    if (meta.trackerType === 'streak') {
      const dates = meta.completedDates ?? [];
      const d = date ?? today;
      if (!dates.includes(d)) {
        dates.push(d);
        dates.sort();
      }
      const streak = this.calculateStreakFromDates(dates);
      const updated = await this.updateItem(trackerId, {
        metadata: { ...meta, completedDates: dates, currentStreak: streak, longestStreak: Math.max(meta.longestStreak ?? 0, streak) },
      });
      if (updated) await this.logActivity('tracker_day_completed', updated, 'Streak day logged');
      return updated;
    }

    return null;
  }

  private calculateSeriesStreak(completedDays: number[]): number {
    if (!completedDays.length) return 0;
    const sorted = [...completedDays].sort((a, b) => a - b);
    let streak = 1, max = 1;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i - 1] + 1) { streak++; max = Math.max(max, streak); }
      else streak = 1;
    }
    return max;
  }

  private calculateStreakFromDates(dates: string[]): number {
    if (!dates.length) return 0;
    const sorted = [...dates].sort();
    let streak = 1;
    for (let i = sorted.length - 1; i > 0; i--) {
      const diff = (new Date(sorted[i]).getTime() - new Date(sorted[i - 1]).getTime()) / 86400000;
      if (diff === 1) streak++;
      else break;
    }
    return streak;
  }

  // ── Settings ───────────────────────────────────────────────────────────

  async getSetting<T>(key: string): Promise<T | undefined> {
    return getSetting<T>(key);
  }

  async setSetting(key: string, value: unknown): Promise<void> {
    return setSetting(key, value);
  }

  // ── App-open streak ────────────────────────────────────────────────────

  async getDailyStreak(): Promise<DailyStreakState | undefined> {
    return this.getSetting<DailyStreakState>('daily-app-streak');
  }

  async getWeeklyDigestSummary(weekStart: string, weekEnding: string): Promise<WeeklyDigestSummary> {
    const [items, streak, allRelations] = await Promise.all([
      getAllItems(),
      this.getDailyStreak(),
      getAllRelations(),
    ]);
    const inWeek = (date?: string) => Boolean(date && date.slice(0, 10) >= weekStart && date.slice(0, 10) < weekEnding);
    let income = 0;
    let expenses = 0;

    for (const item of items) {
      if (item.type !== 'income' && item.type !== 'expense') continue;
      const metadata = item.metadata as TransactionMetadata;
      if (!inWeek(metadata.date)) continue;
      if (metadata.isIncome) income += metadata.amount;
      else expenses += metadata.amount;
    }

    const referenceCounts = new Map<string, number>();
    for (const relation of allRelations) {
      if (inWeek(relation.createdAt)) {
        referenceCounts.set(relation.targetId, (referenceCounts.get(relation.targetId) ?? 0) + 1);
      }
    }

    let topReferencedItem: WeeklyDigestSummary['topReferencedItem'];
    let highestReferenceCount = 0;
    for (const item of items) {
      const count = referenceCounts.get(item.id) ?? 0;
      if (count > highestReferenceCount) {
        highestReferenceCount = count;
        topReferencedItem = { title: item.title, references: count };
      }
    }

    return {
      weekEnding,
      tasksCompleted: items.filter(item => item.type === 'task' && inWeek((item.metadata as { completedAt?: string }).completedAt)).length,
      notesWritten: items.filter(item => (item.type === 'note' || item.type === 'journal') && inWeek(item.createdAt)).length,
      streakDays: (streak?.openedDates ?? []).filter(date => inWeek(date)).length,
      income,
      expenses,
      ...(topReferencedItem ? { topReferencedItem } : {}),
    };
  }

  async recordDailyAppOpen(): Promise<DailyStreakState> {
    const today = getLocalDateKey();
    const existing = await this.getDailyStreak();

    if (existing?.lastOpenedDate === today) return existing;

    const lastOpenedDate = existing?.lastOpenedDate;
    const continuesStreak = lastOpenedDate === getPreviousDateKey(today);
    const currentStreak = continuesStreak ? (existing?.currentStreak ?? 0) + 1 : 1;
    const milestoneReached = ([7, 30, 100] as const).find(milestone => milestone === currentStreak);
    const streak: DailyStreakState = {
      openedDates: [...(existing?.openedDates ?? []), today],
      currentStreak,
      longestStreak: Math.max(existing?.longestStreak ?? 0, currentStreak),
      lastOpenedDate: today,
      ...(lastOpenedDate && !continuesStreak && (existing?.currentStreak ?? 0) > 0
        ? { endedStreak: existing?.currentStreak, endedOn: today }
        : {}),
      ...(milestoneReached ? { milestoneReached, milestoneReachedOn: today } : {}),
    };

    await this.setSetting('daily-app-streak', streak);
    return streak;
  }

  // ── Task helpers ───────────────────────────────────────────────────────

  async getTodayTasks(): Promise<Item[]> {
    const tasks = await getItemsByType('task');
    const today = new Date().toISOString().split('T')[0];
    return tasks.filter(t => {
      const meta = t.metadata as { status?: string; dueDate?: string };
      return meta.status !== 'done' && meta.status !== 'cancelled' &&
        (meta.dueDate === today || !meta.dueDate);
    });
  }

  async completeTask(taskId: string): Promise<Item | null> {
    const task = await getItemById(taskId);
    if (!task) return null;
    const updated = await this.updateItem(taskId, {
      metadata: { ...task.metadata, status: 'done', completedAt: new Date().toISOString() },
    });
    if (updated) await this.logActivity('task_completed', updated, 'Task completed');
    return updated;
  }
}

export const dataService = new DataService();
