'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ExternalLink,
  Trash2,
  Folder,
  Link2,
  Plus,
  X,
  CheckCircle2,
  Circle,
  FileText,
  DollarSign,
  TrendingUp,
  ArrowRight,
  AlertTriangle,
  AlertCircle,
  Star,
} from 'lucide-react';
import { dataService } from '@/lib/services/DataService';
import {
  Item,
  ItemRelation,
  TrackerMetadata,
  TrackerDayMetadata,
  TaskMetadata,
  TaskPriority,
  TaskStatus,
  TaskRecurrence,
  ProjectContextSummary,
  ProjectStatus,
  ProjectMetadata,
  RelationType,
  ITEM_TYPE_LABELS,
} from '@/types';
import { formatAmount } from '@/lib/services/MoneyDetectionService';
import { format, formatDistanceToNow } from 'date-fns';
import { useAppContext } from '@/components/providers/AppProvider';
import { useConfirm } from '@/components/providers/ConfirmDialogProvider';
import { ItemTypeBadge, getItemTypeIcon } from '@/components/common/ItemTypeBadge';
import styles from './page.module.css';

export default function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { refreshItems } = useAppContext();
  const confirm = useConfirm();
  const [item, setItem] = useState<Item | null>(null);
  const [backlinks, setBacklinks] = useState<{ relation: ItemRelation; item: Item }[]>([]);
  const [outgoing, setOutgoing] = useState<{ relation: ItemRelation; item: Item }[]>([]);
  const [projectContext, setProjectContext] = useState<ProjectContextSummary | null>(null);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  // Task dependencies
  const [dependencies, setDependencies] = useState<{ blockedBy: Item[]; blocking: Item[] }>({ blockedBy: [], blocking: [] });
  const [showDepModal, setShowDepModal] = useState(false);
  const [depSearch, setDepSearch] = useState('');
  const [depError, setDepError] = useState<string | null>(null);

  // Tracker state
  const [trackerEntries, setTrackerEntries] = useState<TrackerDayMetadata[]>([]);
  const [trackerStats, setTrackerStats] = useState<{
    hasSufficientData: boolean;
    count: number;
    latestValue?: number;
    averageValue?: number;
    minValue?: number;
    maxValue?: number;
    trend?: 'up' | 'down' | 'stable';
    trendMessage?: string;
  } | null>(null);
  const [entryValue, setEntryValue] = useState('');
  const [entryDate, setEntryDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [entryNote, setEntryNote] = useState('');

  // Link Modal state
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkRelationType, setLinkRelationType] = useState<RelationType>('linked');

  // Quick task input for projects
  const [newProjectTask, setNewProjectTask] = useState('');

  const loadData = useCallback(async (targetId?: string) => {
    const id = targetId || (await params).id;
    if (!id || id === 'new') {
      router.push('/track');
      return;
    }

    const [found, blinks, out, all] = await Promise.all([
      dataService.getItemById(id),
      dataService.getBacklinks(id),
      dataService.getOutgoingReferences(id),
      dataService.getAllItems(),
    ]);

    if (!found) {
      router.replace('/track');
      return;
    }

    setItem(found);
    setBacklinks(blinks);
    setOutgoing(out);
    setAllItems(all);

    if (found.type === 'project') {
      const ctx = await dataService.getProjectContext(found.id);
      setProjectContext(ctx);
    } else if (found.type === 'task') {
      const deps = await dataService.getTaskDependencies(found.id);
      setDependencies(deps);
    } else if (found.type === 'tracker' || found.type === 'habit') {
      const [entries, stats] = await Promise.all([
        dataService.getTrackerEntries(found.id),
        dataService.getTrackerStats(found.id),
      ]);
      setTrackerEntries(entries);
      setTrackerStats(stats);
    }

    setLoading(false);
  }, [params, router]);

  useEffect(() => {
    let active = true;
    params.then(({ id }) => {
      if (active) loadData(id);
    });
    return () => {
      active = false;
    };
  }, [params, loadData]);

  async function handleDelete() {
    if (!item) return;
    const confirmed = await confirm({
      title: `Delete "${item.title}"?`,
      message: 'This can’t be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    setDeleting(true);
    try {
      await dataService.deleteItem(item.id);
      await refreshItems();
      router.push('/track');
    } catch (err) {
      console.error('Failed to delete item:', err);
      setDeleting(false);
    }
  }

  async function handleAddLink(targetId: string) {
    if (!item) return;
    await dataService.linkItems(item.id, targetId, linkRelationType);
    setShowLinkModal(false);
    setLinkSearch('');
    await loadData();
  }

  async function handleUnlink(sourceId: string, targetId: string) {
    await dataService.unlinkItems(sourceId, targetId);
    await loadData();
  }

  async function handleToggleTask(taskId: string) {
    const t = allItems.find(i => i.id === taskId);
    if (!t) return;
    const meta = t.metadata as TaskMetadata;
    const isDone = meta.status === 'done';
    await dataService.updateItem(taskId, {
      metadata: {
        ...meta,
        status: isDone ? 'todo' : 'done',
        completedAt: isDone ? undefined : new Date().toISOString(),
      },
    });
    await loadData();
  }

  async function handleAddProjectTask(e: React.FormEvent) {
    e.preventDefault();
    if (!item || !newProjectTask.trim()) return;
    const task = await dataService.createItem({
      type: 'task',
      title: newProjectTask.trim(),
      metadata: {
        status: 'todo',
        priority: 'medium',
        projectId: item.id,
      },
    });
    await dataService.linkItems(task.id, item.id, 'child');
    setNewProjectTask('');
    await loadData();
  }

  async function handleAddDependency(dependsOnTaskId: string) {
    if (!item) return;
    setDepError(null);
    try {
      await dataService.addTaskDependency(item.id, dependsOnTaskId);
      setShowDepModal(false);
      setDepSearch('');
      await loadData();
    } catch (err) {
      setDepError(err instanceof Error ? err.message : 'Failed to add dependency');
    }
  }

  async function handleRemoveDependency(dependsOnTaskId: string) {
    if (!item) return;
    try {
      await dataService.removeTaskDependency(item.id, dependsOnTaskId);
      await loadData();
    } catch (err) {
      console.error('Failed to remove dependency:', err);
    }
  }

  async function handleUpdateTaskMeta(updates: Partial<TaskMetadata>) {
    if (!item) return;
    const meta = (item.metadata || {}) as TaskMetadata;
    const updated = await dataService.updateItem(item.id, {
      metadata: { ...meta, ...updates },
    });
    if (updated) setItem(updated);
    await loadData();
  }

  async function handleUpdateProjectStatus(status: ProjectStatus) {
    if (!item) return;
    const meta = (item.metadata || {}) as ProjectMetadata;
    const updated = await dataService.updateItem(item.id, {
      metadata: { ...meta, status },
    });
    if (updated) setItem(updated);
    await loadData();
  }

  async function handleLogTrackerEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    const meta = (item.metadata || {}) as TrackerMetadata;
    let val: number | undefined;
    if (meta.trackerType === 'boolean') {
      val = 1;
    } else if (entryValue.trim()) {
      val = parseFloat(entryValue.trim());
    }

    try {
      await dataService.addTrackerEntry(item.id, {
        date: entryDate || new Date().toISOString().slice(0, 10),
        value: val,
        note: entryNote.trim() || undefined,
      });
      setEntryValue('');
      setEntryNote('');
      await loadData();
      await refreshItems();
    } catch (err) {
      console.error('Failed to log tracker entry:', err);
    }
  }

  async function handleDeleteTrackerEntry(dateStr: string) {
    if (!item) return;
    try {
      await dataService.deleteTrackerEntry(item.id, dateStr);
      await loadData();
      await refreshItems();
    } catch (err) {
      console.error('Failed to delete tracker entry:', err);
    }
  }

  async function handleConnectTrackerToGoal(goalId: string) {
    if (!item) return;
    try {
      await dataService.connectTrackerToGoal(item.id, goalId);
      await loadData();
      await refreshItems();
    } catch (err) {
      console.error('Failed to connect tracker to goal:', err);
    }
  }

  // Find assigned project for non-project items
  const parentProject = useMemo(() => {
    if (!item || item.type === 'project') return null;
    const meta = item.metadata as Record<string, unknown>;
    const projId = meta.projectId as string | undefined;
    if (projId) {
      return allItems.find(i => i.id === projId && i.type === 'project') || null;
    }
    // Check if any outgoing relation has type child to a project
    const childRel = outgoing.find(r => r.item.type === 'project');
    if (childRel) return childRel.item;
    return null;
  }, [item, outgoing, allItems]);

  const candidateItems = useMemo(() => {
    if (!item) return [];
    const q = linkSearch.trim().toLowerCase();
    return allItems
      .filter(i => i.id !== item.id && !i.archived)
      .filter(i => {
        if (!q) return true;
        return (
          i.title.toLowerCase().includes(q) ||
          i.type.toLowerCase().includes(q) ||
          i.tags.some(t => t.toLowerCase().includes(q))
        );
      })
      .slice(0, 15);
  }, [allItems, item, linkSearch]);

  const candidateTasks = useMemo(() => {
    if (!item || item.type !== 'task') return [];
    const q = depSearch.trim().toLowerCase();
    const blockedIds = new Set(dependencies.blockedBy.map(b => b.id));
    return allItems
      .filter(i => i.type === 'task' && i.id !== item.id && !i.archived && !blockedIds.has(i.id))
      .filter(i => {
        if (!q) return true;
        return (
          i.title.toLowerCase().includes(q) ||
          i.tags.some(t => t.toLowerCase().includes(q))
        );
      })
      .slice(0, 15);
  }, [allItems, item, depSearch, dependencies]);

  function renderTypeContent(currItem: Item) {
    const meta = currItem.metadata as Record<string, unknown>;

    if (currItem.type === 'task') {
      const taskMeta = (meta || {}) as TaskMetadata;
      return (
        <div className={styles.section}>
          <div className="section-header">
            <span className="section-title">Task Configuration & Lifecycle</span>
          </div>

          <div className={styles.lifecycleGrid}>
            <div className={styles.lifecycleField}>
              <label className={styles.lifecycleLabel}>Status</label>
              <select
                className={styles.lifecycleSelect}
                value={taskMeta.status || 'todo'}
                onChange={e => handleUpdateTaskMeta({ status: e.target.value as TaskStatus })}
                id="select-task-status"
              >
                <option value="inbox">Inbox</option>
                <option value="todo">Todo</option>
                <option value="in_progress">In Progress</option>
                <option value="waiting">Waiting</option>
                <option value="done">Done</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <div className={styles.lifecycleField}>
              <label className={styles.lifecycleLabel}>Priority</label>
              <select
                className={styles.lifecycleSelect}
                value={taskMeta.priority || 'medium'}
                onChange={e => handleUpdateTaskMeta({ priority: e.target.value as TaskPriority })}
                id="select-task-priority"
              >
                <option value="none">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div className={styles.lifecycleField}>
              <label className={styles.lifecycleLabel}>Start Date</label>
              <input
                type="date"
                className={styles.lifecycleInput}
                value={taskMeta.startDate ? taskMeta.startDate.slice(0, 10) : ''}
                onChange={e => handleUpdateTaskMeta({ startDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                id="input-task-start-date"
              />
            </div>

            <div className={styles.lifecycleField}>
              <label className={styles.lifecycleLabel}>Due Date</label>
              <input
                type="date"
                className={styles.lifecycleInput}
                value={taskMeta.dueDate ? taskMeta.dueDate.slice(0, 10) : ''}
                onChange={e => handleUpdateTaskMeta({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
                id="input-task-due-date"
              />
            </div>

            <div className={styles.lifecycleField}>
              <label className={styles.lifecycleLabel}>Recurrence</label>
              <select
                className={styles.lifecycleSelect}
                value={typeof taskMeta.recurrence === 'string' ? taskMeta.recurrence : (taskMeta.recurrence?.frequency || 'none')}
                onChange={e => handleUpdateTaskMeta({ recurrence: e.target.value === 'none' ? undefined : (e.target.value as unknown as TaskRecurrence) })}
                id="select-task-recurrence"
              >
                <option value="none">None</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
          </div>

          {/* Task Dependencies */}
          <div style={{ marginTop: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Dependencies (Blocked By)</span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => { setShowDepModal(true); setDepError(null); }}
                id="btn-add-dependency"
              >
                <Plus size={14} />
                <span>Add Blocker</span>
              </button>
            </div>

            {dependencies.blockedBy.length === 0 ? (
              <p className={styles.emptyText} style={{ margin: '0.25rem 0 1rem 0' }}>
                No blockers. This task is unblocked and ready to execute.
              </p>
            ) : (
              <div className={styles.depList} style={{ marginBottom: '1rem' }}>
                {dependencies.blockedBy.map(dep => (
                  <div key={dep.id} className={styles.depItem}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <AlertTriangle size={14} style={{ color: '#f59e0b' }} />
                      <Link href={`/track/${dep.id}`} className={styles.depLink}>
                        {dep.title}
                      </Link>
                      <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                        {(dep.metadata as TaskMetadata)?.status || 'todo'}
                      </span>
                    </div>
                    <button
                      className={styles.depRemoveBtn}
                      onClick={() => handleRemoveDependency(dep.id)}
                      title="Remove dependency"
                      id={`btn-remove-dep-${dep.id}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {dependencies.blocking.length > 0 && (
              <div>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, display: 'block', marginBottom: '0.4rem' }}>
                  Tasks Blocked by This:
                </span>
                <div className={styles.depList}>
                  {dependencies.blocking.map(blk => (
                    <div key={blk.id} className={styles.depItem}>
                      <Link href={`/track/${blk.id}`} className={styles.depLink}>
                        {blk.title}
                      </Link>
                      <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>
                        {(blk.metadata as TaskMetadata)?.status || 'todo'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    if (currItem.type === 'tracker' || currItem.type === 'habit') {
      const trackerMeta = (meta || {}) as TrackerMetadata;
      const completed = trackerMeta.completedDays?.length ?? trackerMeta.completedDates?.length ?? 0;
      const total = trackerMeta.totalDays ?? 0;
      const streak = trackerMeta.currentStreak ?? 0;
      const longestStreak = trackerMeta.longestStreak ?? 0;

      return (
        <div className={styles.trackerContent}>
          {/* Tracker Header / Type badge */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="badge badge-neutral" style={{ textTransform: 'uppercase', fontWeight: 600 }}>
                {trackerMeta.trackerType || 'numeric'}
              </span>
              {trackerMeta.unit && <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Unit: {trackerMeta.unit}</span>}
              {trackerMeta.target !== undefined && <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Target: {trackerMeta.target} {trackerMeta.unit || ''}</span>}
            </div>

            {/* Trend Badge */}
            {trackerStats?.trend && (
              <span className={`${styles.trendBadge} ${trackerStats.trend === 'up' ? styles.trendUp : trackerStats.trend === 'down' ? styles.trendDown : styles.trendStable}`} id="tracker-trend-badge">
                Trend: {trackerStats.trend}
              </span>
            )}
          </div>

          {/* Stats row */}
          <div className={styles.statsRow}>
            <div className={styles.statBox}>
              <span className={styles.statValue}>
                {trackerStats?.latestValue !== undefined ? `${trackerStats.latestValue} ${trackerMeta.unit || ''}` : completed}
              </span>
              <span className={styles.statLabel}>
                {trackerStats?.latestValue !== undefined ? 'current value' : (total > 0 ? `/ ${total} days` : 'sessions')}
              </span>
            </div>
            <div className={styles.statBox}>
              <span className={styles.statValue}>
                {trackerStats?.averageValue !== undefined ? `${trackerStats.averageValue} ${trackerMeta.unit || ''}` : streak}
              </span>
              <span className={styles.statLabel}>
                {trackerStats?.averageValue !== undefined ? 'average' : 'current streak'}
              </span>
            </div>
            <div className={styles.statBox}>
              <span className={styles.statValue}>
                {trackerStats?.minValue !== undefined ? `${trackerStats.minValue} – ${trackerStats.maxValue}` : longestStreak}
              </span>
              <span className={styles.statLabel}>
                {trackerStats?.minValue !== undefined ? 'min – max' : 'longest streak'}
              </span>
            </div>
          </div>

          {/* Trend / Data Notice */}
          {trackerStats?.trendMessage && (
            <div style={{ background: 'var(--bg-card)', padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.8125rem', color: 'var(--text-tertiary)', marginBottom: '1rem', border: '1px solid var(--border-subtle)' }}>
              💡 {trackerStats.trendMessage}
            </div>
          )}

          {/* Log Entry Form */}
          <div className={styles.trackerLogCard}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.5rem' }}>
              Record New Entry
            </div>
            <form onSubmit={handleLogTrackerEntry} className={styles.trackerLogForm}>
              <input
                type="date"
                className={styles.lifecycleInput}
                value={entryDate}
                onChange={e => setEntryDate(e.target.value)}
                id="input-tracker-date"
              />
              {trackerMeta.trackerType !== 'boolean' && (
                <input
                  type="number"
                  step="any"
                  className={styles.lifecycleInput}
                  placeholder={trackerMeta.trackerType === 'duration' ? 'Minutes' : `Value (${trackerMeta.unit || 'num'})`}
                  value={entryValue}
                  onChange={e => setEntryValue(e.target.value)}
                  style={{ width: '130px' }}
                  id="input-tracker-value"
                />
              )}
              <input
                type="text"
                className={styles.lifecycleInput}
                placeholder="Optional note"
                value={entryNote}
                onChange={e => setEntryNote(e.target.value)}
                style={{ flex: 1, minWidth: '120px' }}
                id="input-tracker-note"
              />
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={trackerMeta.trackerType !== 'boolean' && !entryValue.trim()}
                id="btn-log-tracker-entry"
              >
                <Plus size={14} />
                <span>{trackerMeta.trackerType === 'boolean' ? 'Mark Completed' : 'Log'}</span>
              </button>
            </form>
          </div>

          {/* Connected Goal */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', background: 'var(--bg-card)', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
            <Star size={16} style={{ color: 'var(--color-goal, #f59e0b)' }} />
            <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>Goal:</span>
            {trackerMeta.goalId ? (
              <Link href={`/track/${trackerMeta.goalId}`} style={{ fontSize: '0.8125rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
                {allItems.find(i => i.id === trackerMeta.goalId)?.title || 'Connected Goal'}
              </Link>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                <select
                  className={styles.lifecycleSelect}
                  onChange={e => { if (e.target.value) handleConnectTrackerToGoal(e.target.value); }}
                  defaultValue=""
                  id="select-connect-goal"
                  style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                >
                  <option value="" disabled>Connect to a Goal…</option>
                  {allItems.filter(i => i.type === 'goal' && !i.archived).map(g => (
                    <option key={g.id} value={g.id}>{g.title}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Entry History */}
          <div className={styles.section}>
            <div className="section-header">
              <span className="section-title">Entry History</span>
              <span className={styles.count}>{trackerEntries.length}</span>
            </div>
            {trackerEntries.length === 0 ? (
              <p className={styles.emptyText}>No historical entries recorded yet.</p>
            ) : (
              <div className={styles.entryHistoryList}>
                {trackerEntries.map((entry, idx) => {
                  const dateKey = entry.date || (entry.completedAt ? entry.completedAt.slice(0, 10) : `entry-${idx}`);
                  return (
                    <div key={dateKey} className={styles.entryRow}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span className={styles.entryDate}>{dateKey}</span>
                        <span className={styles.entryVal}>
                          {entry.value !== undefined ? `${entry.value} ${trackerMeta.unit || ''}` : '✓ Done'}
                        </span>
                        {entry.note && <span className={styles.entryNote}>{entry.note}</span>}
                      </div>
                      <button
                        className={styles.depRemoveBtn}
                        onClick={() => handleDeleteTrackerEntry(dateKey)}
                        title="Delete entry"
                        id={`btn-del-entry-${dateKey}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Full day grid if series */}
          {trackerMeta.trackerType === 'series' && total > 0 && (
            <div>
              <div className="section-header" style={{ marginBottom: 8 }}>
                <span className="section-title">Progress</span>
              </div>
              <div className="day-grid">
                {Array.from({ length: total }, (_, i) => {
                  const isCompleted = (trackerMeta.completedDays ?? []).includes(i);
                  return (
                    <div
                      key={i}
                      className={`day-dot ${isCompleted ? 'day-dot--completed' : ''}`}
                      title={`Day ${i + 1}`}
                      style={isCompleted
                        ? { background: trackerMeta.color ?? 'var(--accent-primary)', borderColor: trackerMeta.color ?? 'var(--accent-primary)', color: 'white' }
                        : {}
                      }
                    >
                      {i + 1}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (currItem.type === 'goal') {
      const target = (meta.targetAmount as number) ?? 0;
      const current = (meta.currentAmount as number) ?? 0;
      const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;

      return (
        <div className={styles.goalContent}>
          <div className={styles.goalRing}>
            <div className={styles.goalRingText}>
              <span className={styles.goalRingMain}>{Math.round(pct)}%</span>
              <span className={styles.goalRingSub}>complete</span>
            </div>
          </div>
          <div className={styles.goalAmountRow}>
            <span style={{ color: 'var(--color-success)', fontSize: 'var(--font-size-lg)', fontWeight: 700 }}>
              {formatAmount(current)}
            </span>
            <span style={{ color: 'var(--text-tertiary)' }}> of {formatAmount(target)}</span>
          </div>
          <div className="progress-track" style={{ height: 8 }}>
            <div className="progress-fill" style={{ width: `${pct}%`, background: 'var(--color-goal)' }} />
          </div>
        </div>
      );
    }

    if (currItem.type === 'expense' || currItem.type === 'income') {
      const amount = meta.amount as number;
      const category = meta.category as string;
      const date = meta.date as string;
      const isIncome = meta.isIncome as boolean;

      return (
        <div className={styles.txnContent}>
          <div className={styles.txnAmount} style={{ color: isIncome ? 'var(--color-success)' : 'var(--color-danger)' }}>
            {isIncome ? '+' : '-'}{formatAmount(amount)}
          </div>
          <div className={styles.txnMeta}>
            <span className="badge badge-neutral">{category}</span>
            {date && <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-tertiary)' }}>{format(new Date(date), 'MMMM d, yyyy')}</span>}
          </div>
        </div>
      );
    }

    return null;
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', color: 'var(--text-tertiary)', fontFamily: 'var(--font-family)' }}>
        Loading…
      </div>
    );
  }

  if (!item) return null;

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <button className="btn btn-icon btn-ghost" onClick={() => router.back()} id="btn-item-back">
          <ArrowLeft size={20} />
        </button>
        <ItemTypeBadge type={item.type} />
        <button
          className="btn btn-icon btn-ghost"
          onClick={handleDelete}
          disabled={deleting}
          id="btn-item-delete"
          title="Delete item"
          style={{ marginLeft: 'auto', color: 'var(--color-danger, #ef4444)' }}
        >
          <Trash2 size={18} />
        </button>
      </div>

      {/* Title & Context Meta */}
      <div className={styles.titleSection}>
        <div className={styles.titleHeaderRow}>
          <h1 className={styles.title}>{item.title}</h1>
        </div>
        <p className={styles.date}>{format(new Date(item.createdAt), 'MMMM d, yyyy')}</p>
      </div>

      {/* Context Card — "What is this related to?" */}
      <div className={styles.contextCard}>
        <div className={styles.contextCardHeader}>
          <div className={styles.contextHeaderTitle}>
            <Link2 size={16} className={styles.contextIcon} />
            <span className={styles.contextTitle}>Context & Connections</span>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowLinkModal(true)}
            id="btn-add-context-link"
          >
            <Plus size={14} />
            <span>Link Item</span>
          </button>
        </div>

        <div className={styles.contextDetailsRow}>
          {item.type !== 'project' && (
            <div className={styles.contextField}>
              <span className={styles.contextLabel}>Project</span>
              {parentProject ? (
                <Link href={`/track/${parentProject.id}`} className={styles.projectPill}>
                  <Folder size={12} />
                  <span>{parentProject.title}</span>
                </Link>
              ) : (
                <span className={styles.unassignedText}>No parent project attached</span>
              )}
            </div>
          )}

          <div className={styles.contextField}>
            <span className={styles.contextLabel}>Connections</span>
            <span className={styles.connectionStats}>
              {outgoing.length} outgoing • {backlinks.length} backlink{backlinks.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      </div>

      {/* Project Cockpit View (Exclusive when item is a project) */}
      {item.type === 'project' && projectContext && (
        <div className={styles.projectCockpit}>
          {/* Status and Progress Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Status:</span>
              <select
                className={styles.lifecycleSelect}
                value={(item.metadata as ProjectMetadata)?.status || 'active'}
                onChange={e => handleUpdateProjectStatus(e.target.value as ProjectStatus)}
                id="select-project-status"
              >
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          {/* Real Project Progress */}
          <div style={{ background: 'var(--bg-card)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.8125rem' }}>
              <span style={{ fontWeight: 600 }}>Project Progress</span>
              <span style={{ color: 'var(--text-muted)' }} id="project-progress-label">
                {projectContext.progressPercentage !== null
                  ? `${projectContext.completedTasksCount} of ${projectContext.tasks.length} tasks complete (${projectContext.progressPercentage}%)`
                  : 'No tasks yet'}
              </span>
            </div>
            {projectContext.progressPercentage !== null && (
              <div className="progress-track" style={{ height: 8, borderRadius: 4 }}>
                <div
                  className="progress-fill"
                  style={{ width: `${projectContext.progressPercentage}%`, background: 'var(--accent-primary, #6366f1)', height: '100%', borderRadius: 4 }}
                />
              </div>
            )}
          </div>

          <div className={styles.cockpitMetrics}>
            <div className={styles.cockpitMetricCard}>
              <span className={styles.cockpitMetricLabel}>
                <CheckCircle2 size={14} /> Tasks Completed
              </span>
              <span className={styles.cockpitMetricValue}>
                {projectContext.completedTasksCount} / {projectContext.tasks.length}
              </span>
            </div>

            <div className={styles.cockpitMetricCard}>
              <span className={styles.cockpitMetricLabel}>
                <FileText size={14} /> Linked Notes
              </span>
              <span className={styles.cockpitMetricValue}>
                {projectContext.notes.length}
              </span>
            </div>

            <div className={styles.cockpitMetricCard}>
              <span className={styles.cockpitMetricLabel}>
                <DollarSign size={14} /> Tracked Spend
              </span>
              <span className={styles.cockpitMetricValue}>
                ₹{projectContext.totalExpenses.toLocaleString('en-IN')}
              </span>
            </div>

            {projectContext.trackers.length > 0 && (
              <div className={styles.cockpitMetricCard}>
                <span className={styles.cockpitMetricLabel}>
                  <TrendingUp size={14} /> Active Trackers
                </span>
                <span className={styles.cockpitMetricValue}>
                  {projectContext.trackers.length}
                </span>
              </div>
            )}
          </div>

          {/* Section 1: Next Actions */}
          {projectContext.nextActions.length > 0 && (
            <div className={styles.section}>
              <div className="section-header">
                <span className="section-title">⚡ Next Actions (Unblocked & Ready)</span>
                <span className={styles.count}>{projectContext.nextActions.length}</span>
              </div>
              <div className={styles.cockpitTaskList}>
                {projectContext.nextActions.map(t => (
                  <div key={t.id} className={styles.cockpitTaskItem}>
                    <button className={styles.taskCheckbox} onClick={() => handleToggleTask(t.id)}>
                      <Circle size={18} className={styles.taskTodoIcon} />
                    </button>
                    <Link href={`/track/${t.id}`} className={styles.cockpitTaskTitle}>
                      {t.title}
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 2: Project Tasks */}
          <div className={styles.section}>
            <div className="section-header">
              <span className="section-title">All Project Tasks</span>
              <span className={styles.count}>{projectContext.tasks.length}</span>
            </div>

            <form onSubmit={handleAddProjectTask} className={styles.quickAddForm}>
              <input
                type="text"
                className={styles.quickAddInput}
                placeholder="Add task to this project…"
                value={newProjectTask}
                onChange={e => setNewProjectTask(e.target.value)}
                id="input-project-task"
              />
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={!newProjectTask.trim()}
                id="btn-project-add-task"
              >
                <Plus size={14} />
                <span>Add</span>
              </button>
            </form>

            <div className={styles.cockpitTaskList}>
              {projectContext.tasks.length === 0 ? (
                <p className={styles.emptyText}>No tasks created for this project yet.</p>
              ) : (
                projectContext.tasks.map(t => {
                  const meta = t.metadata as TaskMetadata;
                  const isDone = meta.status === 'done';
                  return (
                    <div key={t.id} className={styles.cockpitTaskItem}>
                      <button
                        className={styles.taskCheckbox}
                        onClick={() => handleToggleTask(t.id)}
                      >
                        {isDone ? (
                          <CheckCircle2 size={18} className={styles.taskDoneIcon} />
                        ) : (
                          <Circle size={18} className={styles.taskTodoIcon} />
                        )}
                      </button>
                      <Link
                        href={`/track/${t.id}`}
                        className={`${styles.cockpitTaskTitle} ${isDone ? styles.taskTitleDone : ''}`}
                      >
                        {t.title}
                      </Link>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Section 3: Notes */}
          {projectContext.notes.length > 0 && (
            <div className={styles.section}>
              <div className="section-header">
                <span className="section-title">Linked Notes</span>
                <span className={styles.count}>{projectContext.notes.length}</span>
              </div>
              <div className={styles.refList}>
                {projectContext.notes.map(n => (
                  <Link key={n.id} href={`/notes/${n.id}`} className={styles.refCard}>
                    <FileText size={16} />
                    <div className={styles.refInfo}>
                      <span className={styles.refTitle}>{n.title}</span>
                    </div>
                    <ExternalLink size={14} className={styles.refIcon} />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Section 4: Trackers */}
          {projectContext.trackers.length > 0 && (
            <div className={styles.section}>
              <div className="section-header">
                <span className="section-title">Connected Trackers</span>
                <span className={styles.count}>{projectContext.trackers.length}</span>
              </div>
              <div className={styles.refList}>
                {projectContext.trackers.map(tr => (
                  <Link key={tr.id} href={`/track/${tr.id}`} className={styles.refCard}>
                    <TrendingUp size={16} />
                    <div className={styles.refInfo}>
                      <span className={styles.refTitle}>{tr.title}</span>
                      <span className={styles.refType}>{(tr.metadata as TrackerMetadata)?.trackerType || 'tracker'}</span>
                    </div>
                    <ExternalLink size={14} className={styles.refIcon} />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Section 5: Goals */}
          {projectContext.goals.length > 0 && (
            <div className={styles.section}>
              <div className="section-header">
                <span className="section-title">Connected Goals</span>
                <span className={styles.count}>{projectContext.goals.length}</span>
              </div>
              <div className={styles.refList}>
                {projectContext.goals.map(g => (
                  <Link key={g.id} href={`/track/${g.id}`} className={styles.refCard}>
                    <Star size={16} />
                    <div className={styles.refInfo}>
                      <span className={styles.refTitle}>{g.title}</span>
                    </div>
                    <ExternalLink size={14} className={styles.refIcon} />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Section 6: Financial Summary */}
          {projectContext.expenses.length > 0 && (
            <div className={styles.section}>
              <div className="section-header">
                <span className="section-title">Financial Summary</span>
                <span className={styles.count}>Total: ₹{projectContext.totalExpenses.toLocaleString('en-IN')}</span>
              </div>
              <div className={styles.refList}>
                {projectContext.expenses.map(e => (
                  <div key={e.id} className={styles.refCard}>
                    <DollarSign size={16} />
                    <div className={styles.refInfo}>
                      <span className={styles.refTitle}>{e.title}</span>
                      <span className={styles.refType}>₹{((e.metadata as { amount?: number })?.amount ?? 0).toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Section 8: Recent Activity */}
          {projectContext.recentActivity.length > 0 && (
            <div className={styles.section}>
              <div className="section-header">
                <span className="section-title">Recent Activity</span>
                <span className={styles.count}>{projectContext.recentActivity.length}</span>
              </div>
              <div className={styles.activityList}>
                {projectContext.recentActivity.map(act => (
                  <div key={act.id} className={styles.activityItem}>
                    <div>
                      <span className={styles.activityTitle}>{act.itemTitle || act.type}</span>
                      {act.description && (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: '0.5rem' }}>
                          {act.description}
                        </span>
                      )}
                    </div>
                    <span className={styles.activityTime}>
                      {formatDistanceToNow(new Date(act.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Type-specific content */}
      {renderTypeContent(item)}

      {/* Content / Description */}
      {item.content && (
        <div className={styles.section}>
          <div className="section-header"><span className="section-title">Notes & Details</span></div>
          <div className={styles.contentBlock}>
            {item.content.split('\n').map((line, i) => (
              <p key={i} style={{ minHeight: line ? undefined : 8 }}>{line}</p>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {item.tags.length > 0 && (
        <div className={styles.tags}>
          {item.tags.map(t => (
            <span key={t} className={styles.tag}>#{t}</span>
          ))}
        </div>
      )}

      {/* Outgoing references */}
      {outgoing.length > 0 && (
        <div className={styles.section}>
          <div className="section-header">
            <span className="section-title">Linked Outgoing Items</span>
            <span className={styles.count}>{outgoing.length}</span>
          </div>
          <div className={styles.refList}>
            {outgoing.map(({ item: ref, relation }) => (
              <div key={ref.id} className={styles.refCardWrap}>
                <Link
                  href={ref.type === 'note' || ref.type === 'journal' ? `/notes/${ref.id}` : `/track/${ref.id}`}
                  className={styles.refCard}
                  id={`link-ref-${ref.id}`}
                >
                  <span className={styles.refEmoji}>{getItemTypeIcon(ref.type, 16)}</span>
                  <div className={styles.refInfo}>
                    <span className={styles.refTitle}>{ref.title}</span>
                    <span className={styles.refType}>
                      {ITEM_TYPE_LABELS[ref.type]} • {relation.relationType}
                    </span>
                  </div>
                  <ExternalLink size={14} className={styles.refIcon} />
                </Link>
                <button
                  className={styles.unlinkBtn}
                  onClick={() => handleUnlink(item.id, ref.id)}
                  title="Remove connection"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Backlinks — the knowledge graph magic */}
      <div className={styles.section}>
        <div className="section-header">
          <span className="section-title">Backlinks & Linked Context</span>
          <span className={styles.count}>{backlinks.length}</span>
        </div>
        {backlinks.length === 0 ? (
          <p className={styles.emptyText}>
            No items reference this yet. Mention @{item.title} or click &quot;Link Item&quot; to connect it.
          </p>
        ) : (
          <div className={styles.refList}>
            {backlinks.map(({ item: src, relation }) => (
              <div key={src.id} className={styles.refCardWrap}>
                <Link
                  key={src.id}
                  href={src.type === 'note' || src.type === 'journal' ? `/notes/${src.id}` : `/track/${src.id}`}
                  className={styles.refCard}
                  id={`link-backlink-${src.id}`}
                >
                  <span className={styles.refEmoji}>{getItemTypeIcon(src.type, 16)}</span>
                  <div className={styles.refInfo}>
                    <span className={styles.refTitle}>{src.title}</span>
                    <span className={styles.refType}>
                      {ITEM_TYPE_LABELS[src.type]} • {relation.relationType} • {format(new Date(src.updatedAt), 'MMM d')}
                    </span>
                  </div>
                  <ExternalLink size={14} className={styles.refIcon} />
                </Link>
                <button
                  className={styles.unlinkBtn}
                  onClick={() => handleUnlink(src.id, item.id)}
                  title="Remove connection"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Manual Link Modal */}
      {showLinkModal && (
        <div className={styles.modalOverlay} onClick={() => setShowLinkModal(false)}>
          <div
            className={styles.modalBox}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Connect context"
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setShowLinkModal(false); } }}
          >
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleRow}>
                <Link2 size={18} className={styles.modalTitleIcon} />
                <h3 className={styles.modalTitle}>Connect Context</h3>
              </div>
              <button
                className={styles.closeBtn}
                onClick={() => setShowLinkModal(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <p className={styles.modalDesc}>
              Link <strong>&quot;{item.title}&quot;</strong> with another item.
            </p>

            <div className={styles.modalRelationSelect}>
              <label className={styles.modalLabel}>Relationship</label>
              <select
                className={styles.modalSelect}
                value={linkRelationType}
                onChange={e => setLinkRelationType(e.target.value as RelationType)}
              >
                <option value="linked">Related to (Bidirectional)</option>
                <option value="child">Child of</option>
                <option value="parent">Parent of</option>
                <option value="references">References</option>
              </select>
            </div>

            <div className={styles.modalSearchWrap}>
              <input
                type="search"
                className={styles.modalSearchInput}
                placeholder="Search items to connect…"
                value={linkSearch}
                onChange={e => setLinkSearch(e.target.value)}
                autoFocus
              />
            </div>

            <div className={styles.candidateList}>
              {candidateItems.length === 0 ? (
                <div className={styles.emptyCandidates}>
                  No items found matching your search.
                </div>
              ) : (
                candidateItems.map(candidate => (
                  <button
                    key={candidate.id}
                    className={styles.candidateItem}
                    onClick={() => handleAddLink(candidate.id)}
                  >
                    <div className={styles.candidateInfo}>
                      <span className={styles.candidateEmoji}>
                        {getItemTypeIcon(candidate.type, 16)}
                      </span>
                      <div className={styles.candidateTexts}>
                        <span className={styles.candidateTitle}>
                          {candidate.title || 'Untitled'}
                        </span>
                        <span className={styles.candidateSub}>
                          {ITEM_TYPE_LABELS[candidate.type]}
                          {candidate.tags.length > 0 && ` • #${candidate.tags.join(' #')}`}
                        </span>
                      </div>
                    </div>
                    <ArrowRight size={15} className={styles.candidateArrow} />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dependency Modal */}
      {showDepModal && (
        <div className={styles.modalOverlay} onClick={() => setShowDepModal(false)}>
          <div
            className={styles.modalBox}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Add Task Dependency"
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setShowDepModal(false); } }}
          >
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleRow}>
                <AlertTriangle size={18} className={styles.modalTitleIcon} />
                <h3 className={styles.modalTitle}>Add Blocker (Prerequisite)</h3>
              </div>
              <button
                className={styles.closeBtn}
                onClick={() => setShowDepModal(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <p className={styles.modalDesc}>
              Select a task that must be completed before <strong>&quot;{item.title}&quot;</strong> can start.
            </p>

            {depError && (
              <div className={styles.errorBanner} style={{ margin: '0 1.25rem 0.5rem 1.25rem' }}>
                <AlertCircle size={16} />
                <span>{depError}</span>
              </div>
            )}

            <div className={styles.modalSearchWrap}>
              <input
                type="search"
                className={styles.modalSearchInput}
                placeholder="Search tasks…"
                value={depSearch}
                onChange={e => setDepSearch(e.target.value)}
                autoFocus
                id="input-dep-search"
              />
            </div>

            <div className={styles.candidateList}>
              {candidateTasks.length === 0 ? (
                <div className={styles.emptyCandidates}>
                  No eligible tasks found.
                </div>
              ) : (
                candidateTasks.map(candidate => (
                  <button
                    key={candidate.id}
                    className={styles.candidateItem}
                    onClick={() => handleAddDependency(candidate.id)}
                    id={`btn-dep-candidate-${candidate.id}`}
                  >
                    <div className={styles.candidateInfo}>
                      <span className={styles.candidateEmoji}>
                        {getItemTypeIcon(candidate.type, 16)}
                      </span>
                      <div className={styles.candidateTexts}>
                        <span className={styles.candidateTitle}>
                          {candidate.title || 'Untitled'}
                        </span>
                        <span className={styles.candidateSub}>
                          {(candidate.metadata as TaskMetadata)?.status || 'todo'} • {(candidate.metadata as TaskMetadata)?.priority || 'medium'} priority
                        </span>
                      </div>
                    </div>
                    <Plus size={15} className={styles.candidateArrow} />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ height: 40 }} />
    </div>
  );
}
