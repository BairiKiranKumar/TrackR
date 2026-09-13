import {
  Item, ItemRelation, RelationType, isValidRelation,
  ContextSummary, AttentionItem, GoalMetadata, ProjectMetadata,
  TaskMetadata, TrackerMetadata,
} from '@/types';
import {
  FinanceTransaction, FinanceBudget,
} from '@/types/finance';
import {
  getAllItems, getItemById, saveItem,
  getRelationsForSource, getRelationsForTarget, saveRelation,
  deleteRelationByPair, queryTransactions, getAllTransactions,
  getTransactionById, saveTransaction, getAllBudgets, getBudgetById,
  getAllPlannedPayments, getRecentActivity,
} from '@/lib/db/localDb';
import { syncQueueService } from './SyncQueueService';
import { financeBudgetService } from './finance/FinanceBudgetService';
import { financeReportService } from './finance/FinanceReportService';

// ─── Unique ID generator ───────────────────────────────────────────────────
function genId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function toLocalDateString(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export class ContextGraphService {

  // ─── Relation Validation & Linking ───────────────────────────────────────

  validateRelation(sourceType: string, relationType: RelationType, targetType: string): { valid: boolean; reason?: string } {
    if (!sourceType || !targetType) {
      return { valid: false, reason: 'Source and target entity types must be specified.' };
    }
    const valid = isValidRelation(sourceType, relationType, targetType);
    if (!valid) {
      return {
        valid: false,
        reason: `Invalid relationship: Cannot create relation "${relationType}" from ${sourceType} to ${targetType}.`,
      };
    }
    return { valid: true };
  }

  /**
   * Creates an intentional, validated relationship between two entities with
   * bidirectional persistence, and offline sync enqueuing.
   */
  async link(
    sourceId: string,
    sourceType: string,
    rawTargetId: string,
    rawTargetType: string,
    rawRelationType?: RelationType
  ): Promise<{ success: boolean; relation?: ItemRelation; error?: string }> {
    const KNOWN_RELATIONS = new Set([
      'belongs_to', 'references', 'related_to', 'supports', 'funds',
      'funded_by', 'depends_on', 'blocks', 'parent', 'child', 'linked',
    ]);
    let targetId = rawTargetId;
    let targetType = rawTargetType;
    let relationType = rawRelationType as RelationType;

    if (KNOWN_RELATIONS.has(rawTargetId)) {
      relationType = rawTargetId as RelationType;
      targetId = rawTargetType;
      targetType = (rawRelationType as unknown as string) || '';
    }

    if (!relationType) {
      relationType = 'related_to';
    }

    if (sourceId === targetId) {
      return { success: false, error: 'Cannot link an entity to itself.' };
    }

    const validation = this.validateRelation(sourceType, relationType, targetType);
    if (!validation.valid) {
      return { success: false, error: validation.reason };
    }

    // Duplicate prevention
    const existing = await getRelationsForSource(sourceId);
    const dup = existing.find(r => r.targetId === targetId && r.relationType === relationType);
    if (dup) {
      return { success: true, relation: dup };
    }

    const rel: ItemRelation = {
      id: genId(),
      sourceId,
      targetId,
      relationType,
      createdAt: new Date().toISOString(),
    };

    await saveRelation(rel);
    await syncQueueService.enqueue('item_relation', rel.id, 'upsert', rel);

    // Sync foreign key shortcuts for maximum compatibility
    await this.syncForeignKeyShortcuts(sourceId, sourceType, targetId, targetType, relationType);

    return { success: true, relation: rel };
  }

  /**
   * Unlinks two entities in both directions and enqueues sync deletions.
   */
  async unlink(sourceId: string, targetId: string): Promise<boolean> {
    const [forward, backward] = await Promise.all([
      getRelationsForSource(sourceId),
      getRelationsForSource(targetId),
    ]);

    const toRemove = [
      ...forward.filter(r => r.targetId === targetId),
      ...backward.filter(r => r.targetId === sourceId),
    ];

    await deleteRelationByPair(sourceId, targetId);
    await deleteRelationByPair(targetId, sourceId);

    for (const rel of toRemove) {
      await syncQueueService.enqueue('item_relation', rel.id, 'delete');
    }

    // Clean up foreign keys if they pointed directly
    await this.clearForeignKeyShortcuts(sourceId, targetId);
    await this.clearForeignKeyShortcuts(targetId, sourceId);
    return true;
  }

  private async syncForeignKeyShortcuts(
    sourceId: string,
    sourceType: string,
    targetId: string,
    targetType: string,
    relationType: RelationType
  ): Promise<void> {
    // 1. Transaction linked to project or goal
    if (sourceType === 'transaction') {
      const txn = await getTransactionById(sourceId);
      if (txn) {
        let changed = false;
        if (targetType === 'project' && (relationType === 'belongs_to' || relationType === 'funds')) {
          txn.projectId = targetId;
          changed = true;
        } else if (targetType === 'goal' && (relationType === 'supports' || relationType === 'funds')) {
          txn.goalId = targetId;
          changed = true;
        }
        if (changed) {
          txn.updatedAt = new Date().toISOString();
          await saveTransaction(txn);
          await syncQueueService.enqueue('fa_transaction', txn.id, 'upsert', txn);
        }
      }
    }

    // 2. Task/Note/Tracker linked to project
    if (['task', 'note', 'tracker', 'habit', 'journal'].includes(sourceType) && targetType === 'project' && relationType === 'belongs_to') {
      const item = await getItemById(sourceId);
      if (item) {
        item.metadata = { ...(item.metadata || {}), projectId: targetId };
        item.updatedAt = new Date().toISOString();
        await saveItem(item);
        await syncQueueService.enqueue('item', item.id, 'upsert', item);
      }
    }

    // 3. Task/Tracker linked to goal
    if (['task', 'tracker'].includes(sourceType) && targetType === 'goal' && relationType === 'supports') {
      const item = await getItemById(sourceId);
      if (item) {
        item.metadata = { ...(item.metadata || {}), goalId: targetId };
        item.updatedAt = new Date().toISOString();
        await saveItem(item);
        await syncQueueService.enqueue('item', item.id, 'upsert', item);
      }
    }
  }

  private async clearForeignKeyShortcuts(sourceId: string, targetId: string): Promise<void> {
    const txn = await getTransactionById(sourceId);
    if (txn) {
      let changed = false;
      if (txn.projectId === targetId) { txn.projectId = undefined; changed = true; }
      if (txn.goalId === targetId) { txn.goalId = undefined; changed = true; }
      if (changed) {
        txn.updatedAt = new Date().toISOString();
        await saveTransaction(txn);
        await syncQueueService.enqueue('fa_transaction', txn.id, 'upsert', txn);
      }
      return;
    }

    const item = await getItemById(sourceId);
    if (item && item.metadata) {
      const meta = item.metadata as Record<string, unknown>;
      let changed = false;
      if (meta.projectId === targetId) { delete meta.projectId; changed = true; }
      if (meta.goalId === targetId) { delete meta.goalId; changed = true; }
      if (changed) {
        item.updatedAt = new Date().toISOString();
        await saveItem(item);
        await syncQueueService.enqueue('item', item.id, 'upsert', item);
      }
    }
  }

  // ─── Direct Context Query ────────────────────────────────────────────────

  /**
   * Retrieves all directly connected entities grouped by entity type.
   * Checks both ItemRelation graph (forward and backward) and explicit foreign keys.
   */
  async getDirectContext(entityId: string, entityType?: string): Promise<ContextSummary> {
    const [forwardRels, backwardRels] = await Promise.all([
      getRelationsForSource(entityId),
      getRelationsForTarget(entityId),
    ]);

    // Collect all related entity IDs
    const relatedIds = new Set<string>();
    for (const r of forwardRels) relatedIds.add(r.targetId);
    for (const r of backwardRels) relatedIds.add(r.sourceId);

    // Resolve current entity metadata for title
    let entityTitle = entityId;
    if (entityType === 'transaction') {
      const t = await getTransactionById(entityId);
      if (t) entityTitle = `${t.type === 'expense' ? '-' : '+'}₹${t.amount} (${t.payee || 'Transaction'})`;
    } else {
      const item = await getItemById(entityId);
      if (item) entityTitle = item.title;
    }

    const tasks: Item[] = [];
    const projects: Item[] = [];
    const notes: Item[] = [];
    const goals: Item[] = [];
    const trackers: Item[] = [];
    const transactions: FinanceTransaction[] = [];
    const budgets: FinanceBudget[] = [];

    // Also look up explicit foreign keys if entity is a Project or Goal
    if (entityType === 'project' || (!entityType && (await getItemById(entityId))?.type === 'project')) {
      const allTxns = await queryTransactions({ projectId: entityId });
      for (const t of allTxns) {
        if (!transactions.some(existing => existing.id === t.id)) {
          transactions.push(t);
        }
      }
      const allBudgets = await getAllBudgets();
      for (const b of allBudgets) {
        if (relatedIds.has(b.id) && !budgets.some(existing => existing.id === b.id)) {
          budgets.push(b);
        }
      }
    } else if (entityType === 'goal' || (!entityType && (await getItemById(entityId))?.type === 'goal')) {
      const allTxns = await queryTransactions({ goalId: entityId });
      for (const t of allTxns) {
        if (!transactions.some(existing => existing.id === t.id)) {
          transactions.push(t);
        }
      }
    }

    // Resolve items by relatedIds
    for (const id of Array.from(relatedIds)) {
      const item = await getItemById(id);
      if (item) {
        if (item.type === 'task') tasks.push(item);
        else if (item.type === 'project') projects.push(item);
        else if (item.type === 'note' || item.type === 'journal') notes.push(item);
        else if (item.type === 'goal') goals.push(item);
        else if (item.type === 'tracker' || item.type === 'habit') trackers.push(item);
        continue;
      }

      // Check transactions
      const txn = await getTransactionById(id);
      if (txn && !transactions.some(existing => existing.id === txn.id)) {
        transactions.push(txn);
        continue;
      }

      // Check budgets
      const budget = await getBudgetById(id);
      if (budget && !budgets.some(existing => existing.id === budget.id)) {
        budgets.push(budget);
      }
    }

    // Also find any Universal Items with explicit foreign keys
    const allItems = await getAllItems();
    for (const it of allItems) {
      if (it.id === entityId || it.archived) continue;
      const meta = it.metadata as Record<string, unknown> | undefined;
      if (!meta) continue;

      if (meta.projectId === entityId && !projects.some(p => p.id === it.id)) {
        if (it.type === 'task' && !tasks.some(t => t.id === it.id)) tasks.push(it);
        else if ((it.type === 'note' || it.type === 'journal') && !notes.some(n => n.id === it.id)) notes.push(it);
        else if (it.type === 'goal' && !goals.some(g => g.id === it.id)) goals.push(it);
        else if ((it.type === 'tracker' || it.type === 'habit') && !trackers.some(tr => tr.id === it.id)) trackers.push(it);
      } else if (meta.goalId === entityId) {
        if (it.type === 'task' && !tasks.some(t => t.id === it.id)) tasks.push(it);
        else if ((it.type === 'tracker' || it.type === 'habit') && !trackers.some(tr => tr.id === it.id)) trackers.push(it);
      }
    }

    // 2nd-degree related discovery items
    const relatedItems = await this.getRelatedContext(entityId, 8);

    const totalCount =
      tasks.length +
      projects.length +
      notes.length +
      goals.length +
      trackers.length +
      transactions.length +
      budgets.length;

    return {
      entityId,
      entityType: entityType || 'item',
      entityTitle,
      tasks,
      projects,
      notes,
      goals,
      trackers,
      transactions,
      budgets,
      relatedItems,
      totalCount,
    };
  }

  // ─── 2nd-Degree Context Discovery (Deterministic Graph Traversal) ─────────

  /**
   * Traverses graph up to 2 hops away with cycle prevention and strict limits.
   * Completely deterministic: no AI, no hallucination.
   */
  async getRelatedContext(
    entityId: string,
    limitOrEntityType?: number | string,
    maybeLimit?: number
  ): Promise<{ item: Item | FinanceTransaction; reason: string }[]> {
    const limit = typeof limitOrEntityType === 'number'
      ? limitOrEntityType
      : (typeof maybeLimit === 'number' ? maybeLimit : 10);
    const visited = new Set<string>([entityId]);
    const results: { item: Item | FinanceTransaction; reason: string }[] = [];

    // Step 1: get direct 1st-hop neighbours
    const [f1, b1] = await Promise.all([
      getRelationsForSource(entityId),
      getRelationsForTarget(entityId),
    ]);
    const hop1 = new Map<string, string>(); // neighbourId -> relation reason

    for (const r of f1) {
      hop1.set(r.targetId, `via ${r.relationType}`);
      visited.add(r.targetId);
    }
    for (const r of b1) {
      hop1.set(r.sourceId, `via linked`);
      visited.add(r.sourceId);
    }

    // Also check foreign key parents (e.g. project of item or transaction)
    const currentItem = await getItemById(entityId);
    const currentTxn = !currentItem ? await getTransactionById(entityId) : null;
    if (currentItem?.metadata && (currentItem.metadata as Record<string, unknown>).projectId) {
      const pid = (currentItem.metadata as Record<string, unknown>).projectId as string;
      hop1.set(pid, 'via project');
      visited.add(pid);
    }
    if (currentTxn?.projectId) {
      hop1.set(currentTxn.projectId, 'via project');
      visited.add(currentTxn.projectId);
    }
    if (currentTxn?.goalId) {
      hop1.set(currentTxn.goalId, 'via goal');
      visited.add(currentTxn.goalId);
    }

    // Step 2: for each 1st-hop neighbour, find 2nd-hop items
    for (const [hop1Id] of Array.from(hop1.entries())) {
      if (results.length >= limit) break;

      const [f2, b2] = await Promise.all([
        getRelationsForSource(hop1Id),
        getRelationsForTarget(hop1Id),
      ]);

      const hop1Item = await getItemById(hop1Id);
      const hop1Title = hop1Item?.title || 'Connected item';

      for (const r of [...f2, ...b2]) {
        const targetId = r.sourceId === hop1Id ? r.targetId : r.sourceId;
        if (visited.has(targetId)) continue;
        visited.add(targetId);

        const it = await getItemById(targetId);
        if (it && !it.archived) {
          results.push({ item: it, reason: `Connected via ${hop1Title}` });
          if (results.length >= limit) break;
          continue;
        }

        const txn = await getTransactionById(targetId);
        if (txn) {
          results.push({ item: txn, reason: `Connected via ${hop1Title}` });
          if (results.length >= limit) break;
        }
      }
    }

    return results;
  }

  // ─── Link Candidate Search ───────────────────────────────────────────────

  async searchLinkableEntities(
    query: string,
    excludeId: string = ''
  ): Promise<{ id: string; type: string; title: string; subtitle?: string; metadata?: Record<string, unknown> }[]> {
    const q = query.toLowerCase().trim();
    const results: { id: string; type: string; title: string; subtitle?: string; metadata?: Record<string, unknown> }[] = [];

    // Search items
    const allItems = await getAllItems();
    for (const it of allItems) {
      if (it.id === excludeId || it.archived) continue;
      const titleMatch = it.title.toLowerCase().includes(q);
      const tagMatch = it.tags.some(t => t.toLowerCase().includes(q));
      if (!q || titleMatch || tagMatch) {
        results.push({
          id: it.id,
          type: it.type,
          title: it.title,
          subtitle: it.type.toUpperCase(),
          metadata: it.metadata as Record<string, unknown>,
        });
      }
    }

    // Search transactions
    const allTxns = await getAllTransactions();
    for (const t of allTxns) {
      if (t.id === excludeId) continue;
      const payeeMatch = t.payee?.toLowerCase().includes(q);
      const noteMatch = t.note?.toLowerCase().includes(q);
      const amtMatch = String(t.amount).includes(q) || `₹${t.amount}`.includes(q);
      if (!q || payeeMatch || noteMatch || amtMatch) {
        results.push({
          id: t.id,
          type: 'transaction',
          title: `${t.type === 'expense' ? '-' : '+'}₹${t.amount} ${t.payee || 'Transaction'}`,
          subtitle: `${t.date} • ${t.type.toUpperCase()}`,
        });
      }
    }

    // Search budgets
    const allBudgets = await getAllBudgets();
    for (const b of allBudgets) {
      if (b.id === excludeId || b.archived) continue;
      if (!q || b.name.toLowerCase().includes(q)) {
        results.push({
          id: b.id,
          type: 'budget',
          title: b.name,
          subtitle: `Budget ₹${b.target} (${b.period})`,
        });
      }
    }

    return results.slice(0, 30);
  }

  // ─── Goal Multi-Source Progress Engine ────────────────────────────────────

  async calculateGoalProgress(goalId: string): Promise<{
    percentage: number;
    current: number;
    target: number;
    source: 'manual' | 'tasks' | 'tracker' | 'financial';
    label: string;
  } | null> {
    const goal = await getItemById(goalId);
    if (!goal || goal.type !== 'goal') return null;

    const meta = (goal.metadata || {}) as GoalMetadata;
    const target = meta.targetAmount || 100;
    const source = meta.progressSource || (meta.targetAmount && meta.targetAmount > 0 ? 'financial' : 'manual');

    switch (source) {
      case 'financial': {
        // Find transactions linked to goal
        const txns = await queryTransactions({ goalId });
        const income = txns.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
        const percentage = target > 0 ? Math.min(100, Math.round((income / target) * 100)) : 0;
        return {
          percentage,
          current: income,
          target,
          source: 'financial',
          label: `Financial: ₹${income.toLocaleString()} of ₹${target.toLocaleString()} (${percentage}%)`,
        };
      }

      case 'tasks': {
        const direct = await this.getDirectContext(goalId, 'goal');
        const tasks = direct.tasks;
        if (tasks.length === 0) {
          return { percentage: 0, current: 0, target: 0, source: 'tasks', label: 'Tasks: 0 linked tasks' };
        }
        const done = tasks.filter(t => {
          const m = t.metadata as TaskMetadata | undefined;
          return m?.status === 'done';
        }).length;
        const percentage = Math.round((done / tasks.length) * 100);
        return {
          percentage,
          current: done,
          target: tasks.length,
          source: 'tasks',
          label: `Tasks: ${done} of ${tasks.length} completed (${percentage}%)`,
        };
      }

      case 'tracker': {
        let trackerId = meta.trackerId;
        if (!trackerId) {
          const direct = await this.getDirectContext(goalId, 'goal');
          if (direct.trackers.length > 0) {
            trackerId = direct.trackers[0].id;
          }
        }
        if (!trackerId) {
          return { percentage: 0, current: 0, target, source: 'tracker', label: 'Tracker: No tracker linked' };
        }
        const tracker = await getItemById(trackerId);
        if (!tracker) {
          return { percentage: 0, current: 0, target, source: 'tracker', label: 'Tracker: Linked tracker not found' };
        }
        const tMeta = tracker.metadata as TrackerMetadata | undefined;
        let currentVal = tMeta?.current ?? 0;
        const entries = (tMeta?.entries || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        if (entries.length > 0 && entries[0].value !== undefined) {
          currentVal = entries[0].value;
        }
        const targetVal = tMeta?.target || target;
        const percentage = targetVal > 0 ? Math.min(100, Math.round((currentVal / targetVal) * 100)) : 0;
        return {
          percentage,
          current: currentVal,
          target: targetVal,
          source: 'tracker',
          label: `Tracker (${tracker.title}): ${currentVal} of ${targetVal} (${percentage}%)`,
        };
      }

      case 'manual':
      default: {
        const current = meta.currentAmount ?? 0;
        const percentage = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
        return {
          percentage,
          current,
          target,
          source: 'manual',
          label: `Manual: ${current} of ${target} (${percentage}%)`,
        };
      }
    }
  }

  // ─── Smart Attention Model (Deterministic) ────────────────────────────────

  /**
   * Deterministic smart attention engine.
   * Evaluates transparent rules and produces actionable alerts with human-readable explanations.
   */
  async getAttentionItems(): Promise<AttentionItem[]> {
    const attention: AttentionItem[] = [];
    const today = toLocalDateString(new Date());
    const now = new Date();

    // 1. Overdue Tasks
    const allItems = await getAllItems();
    for (const item of allItems) {
      if (item.type !== 'task' || item.archived) continue;
      const meta = item.metadata as TaskMetadata | undefined;
      if (!meta || meta.status === 'done' || meta.status === 'cancelled') continue;

      if (meta.dueDate && meta.dueDate < today) {
        const diffDays = Math.max(1, Math.ceil((now.getTime() - new Date(meta.dueDate).getTime()) / 86400000));
        attention.push({
          id: `attn-task-${item.id}`,
          type: 'overdue_task',
          title: item.title,
          message: `Task is overdue by ${diffDays} day${diffDays === 1 ? '' : 's'}.`,
          severity: 'urgent',
          entityId: item.id,
          entityType: 'task',
          actionUrl: `/track/${item.id}`,
          date: meta.dueDate,
        });
      }
    }

    // 2. Budget Alerts
    const budgets = await financeBudgetService.getActiveBudgets();
    for (const b of budgets) {
      const prog = await financeBudgetService.getBudgetProgress(b.id, now);
      if (!prog) continue;

      const thresholdFraction = b.alertThreshold > 1 ? b.alertThreshold / 100 : b.alertThreshold;
      const isOver = prog.isOver || prog.percentage >= 100;
      const isAlert = prog.isAlert || prog.percentage >= thresholdFraction * 100;

      if (isOver) {
        attention.push({
          id: `attn-budget-${b.id}`,
          type: 'budget_warning',
          title: `${b.name} Budget`,
          message: `Budget is 100% exceeded! Spent ₹${prog.spent.toLocaleString()} of ₹${b.target.toLocaleString()}.`,
          severity: 'urgent',
          entityId: b.id,
          entityType: 'budget',
          actionUrl: '/money',
        });
      } else if (isAlert) {
        attention.push({
          id: `attn-budget-${b.id}`,
          type: 'budget_warning',
          title: `${b.name} Budget`,
          message: `Budget is ${Math.round(prog.percentage)}% used with ₹${prog.remaining.toLocaleString()} remaining.`,
          severity: 'warning',
          entityId: b.id,
          entityType: 'budget',
          actionUrl: '/money',
        });
      }
    }

    // 3. Planned Payments Due Soon (within 5 days)
    const planned = await getAllPlannedPayments();
    for (const p of planned) {
      if (p.status !== 'pending') continue;
      const rawDate = p.dueDate || (p as unknown as { nextDate?: string }).nextDate;
      if (!rawDate) continue;
      const dueDate = new Date(rawDate);
      const diffDays = Math.ceil((dueDate.getTime() - now.getTime()) / 86400000);
      if (diffDays >= 0 && diffDays <= 5) {
        const title = p.name || (p as unknown as { payee?: string }).payee || 'Planned Payment';
        attention.push({
          id: `attn-planned-${p.id}`,
          type: 'planned_payment',
          title,
          message: `Upcoming payment of ₹${p.amount.toLocaleString()} due in ${diffDays === 0 ? 'today' : `${diffDays} day${diffDays === 1 ? '' : 's'}`}.`,
          severity: diffDays <= 1 ? 'urgent' : 'warning',
          entityId: p.id,
          entityType: 'planned_payment',
          actionUrl: '/money',
          date: rawDate,
        });
      }
    }

    // 4. Goal Deadlines Approaching (within 7 days)
    for (const item of allItems) {
      if (item.type !== 'goal' || item.archived) continue;
      const meta = item.metadata as GoalMetadata | undefined;
      if (!meta?.deadline) continue;

      const deadline = new Date(meta.deadline);
      const diffDays = Math.ceil((deadline.getTime() - now.getTime()) / 86400000);
      if (diffDays >= 0 && diffDays <= 7) {
        const prog = await this.calculateGoalProgress(item.id);
        if (prog && prog.percentage < 100) {
          attention.push({
            id: `attn-goal-${item.id}`,
            type: 'goal_deadline',
            title: item.title,
            message: `Goal deadline in ${diffDays} day${diffDays === 1 ? '' : 's'}, ${100 - prog.percentage}% remaining.`,
            severity: diffDays <= 2 ? 'urgent' : 'warning',
            entityId: item.id,
            entityType: 'goal',
            actionUrl: `/track/${item.id}`,
            date: meta.deadline,
          });
        }
      }
    }

    // 5. Blocked Projects (Project has active tasks with uncompleted dependency tasks)
    for (const item of allItems) {
      if (item.type !== 'project' || item.archived) continue;
      const direct = await this.getDirectContext(item.id, 'project');
      const incompleteTasks = direct.tasks.filter(t => {
        const m = t.metadata as TaskMetadata | undefined;
        return m?.status !== 'done' && m?.status !== 'cancelled';
      });

      let blockedTaskCount = 0;
      for (const t of incompleteTasks) {
        const fRels = await getRelationsForSource(t.id);
        const depIds = fRels.filter(r => r.relationType === 'depends_on').map(r => r.targetId);
        for (const depId of depIds) {
          const dep = await getItemById(depId);
          const depMeta = dep?.metadata as TaskMetadata | undefined;
          if (dep && depMeta?.status !== 'done') {
            blockedTaskCount++;
            break;
          }
        }
      }

      if (blockedTaskCount > 0) {
        attention.push({
          id: `attn-proj-${item.id}`,
          type: 'blocked_project',
          title: item.title,
          message: `Project is blocked by ${blockedTaskCount} task${blockedTaskCount === 1 ? '' : 's'} waiting on dependencies.`,
          severity: 'warning',
          entityId: item.id,
          entityType: 'project',
          actionUrl: `/projects/${item.id}`,
        });
      }
    }

    // 6. Missed Tracker Entries
    for (const item of allItems) {
      if (item.type !== 'tracker' || item.archived) continue;
      const meta = item.metadata as TrackerMetadata | undefined;
      if (!meta || meta.frequency === 'daily' || !meta.frequency) {
        const entries = meta?.entries || [];
        const hasTodayEntry = entries.some(e => e.date === today);
        if (!hasTodayEntry) {
          attention.push({
            id: `attn-tracker-${item.id}`,
            type: 'missed_tracker',
            title: item.title,
            message: `No tracker entry recorded for today.`,
            severity: 'info',
            entityId: item.id,
            entityType: 'tracker',
            actionUrl: `/track/${item.id}`,
          });
        }
      }
    }

    return attention;
  }

  // ─── Project Cockpit Aggregator ──────────────────────────────────────────

  /**
   * Builds the complete cockpit data for a project:
   * Next Actions, Tasks, Notes, Goals, Trackers, Money, Activity, Related Context.
   */
  async getProjectCockpitSummary(projectId: string) {
    const project = await getItemById(projectId);
    if (!project) return null;

    const direct = await this.getDirectContext(projectId, 'project');

    // Filter Next Actions: tasks that are 'todo' or 'in_progress' and NOT blocked by any other task
    const allTaskDeps = await Promise.all(
      direct.tasks.map(async t => {
        const fRels = await getRelationsForSource(t.id);
        const depIds = fRels.filter(r => r.relationType === 'depends_on').map(r => r.targetId);
        const blockers = await Promise.all(depIds.map(id => getItemById(id)));
        const activeBlockers = blockers.filter(b => {
          const m = b?.metadata as TaskMetadata | undefined;
          return b && m?.status !== 'done';
        });
        return { task: t, isBlocked: activeBlockers.length > 0 };
      })
    );

    const nextActions = allTaskDeps
      .filter(({ task, isBlocked }) => {
        const m = task.metadata as TaskMetadata | undefined;
        const isActive = m?.status === 'todo' || m?.status === 'in_progress';
        return isActive && !isBlocked;
      })
      .map(({ task }) => task);

    // Financial context
    const finSummary = await financeReportService.getProjectFinancialSummary(projectId);

    // Find if a budget is directly linked to this project
    let linkedBudgetProgress = null;
    if (direct.budgets.length > 0) {
      linkedBudgetProgress = await financeBudgetService.getBudgetProgress(direct.budgets[0].id);
    } else {
      const allBudgets = await financeBudgetService.getActiveBudgets();
      const projectBudget = allBudgets.find(b =>
        (b as unknown as { projectId?: string }).projectId === projectId ||
        b.name.toLowerCase().includes(project.title.toLowerCase())
      );
      if (projectBudget) {
        linkedBudgetProgress = await financeBudgetService.getBudgetProgress(projectBudget.id);
      }
    }

    if (linkedBudgetProgress) {
      (linkedBudgetProgress as unknown as Record<string, unknown>).budgetAmount = linkedBudgetProgress.budget.target;
      (linkedBudgetProgress as unknown as Record<string, unknown>).spentAmount = linkedBudgetProgress.spent;
      (linkedBudgetProgress as unknown as Record<string, unknown>).remainingAmount = linkedBudgetProgress.remaining;
    }

    // Recent activity
    const allEvents = await getRecentActivity(20);
    const projectItemIds = new Set([projectId, ...direct.tasks.map(t => t.id), ...direct.notes.map(n => n.id)]);
    const projectActivity = allEvents.filter(e => projectItemIds.has(e.itemId));

    return {
      project,
      metadata: (project.metadata || {}) as ProjectMetadata,
      nextActions,
      tasks: direct.tasks,
      notes: direct.notes,
      goals: direct.goals,
      trackers: direct.trackers,
      transactions: direct.transactions,
      budgets: direct.budgets,
      finSummary,
      linkedBudgetProgress,
      activity: projectActivity,
      relatedContext: direct.relatedItems,
    };
  }
}

export const contextGraphService = new ContextGraphService();
