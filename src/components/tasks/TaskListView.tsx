'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  Circle,
  Trash2,
  Plus,
  Folder,
  AlertCircle,
  Calendar,
  Clock,
  CheckSquare,
} from 'lucide-react';
import { useAppContext } from '@/components/providers/AppProvider';
import { useConfirm } from '@/components/providers/ConfirmDialogProvider';
import { dataService } from '@/lib/services/DataService';
import { Item, TaskMetadata } from '@/types';
import styles from './TaskListView.module.css';

export type TaskViewMode = 'today' | 'upcoming' | 'overdue' | 'completed' | 'all';

interface TaskListViewProps {
  view: TaskViewMode;
  title?: string;
  subtitle?: string;
  showTabs?: boolean;
}

export function TaskListView({ view, title, subtitle, showTabs = true }: TaskListViewProps) {
  const { items, refreshItems } = useAppContext();
  const confirm = useConfirm();
  const [tasks, setTasks] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [addingTask, setAddingTask] = useState(false);
  const [blockedMap, setBlockedMap] = useState<Record<string, string[]>>({});

  const projectsMap = useMemo(() => {
    const map = new Map<string, { id: string; title: string }>();
    for (const item of items) {
      if (item.type === 'project') {
        map.set(item.id, { id: item.id, title: item.title });
      }
    }
    return map;
  }, [items]);

  const loadTasks = useCallback(async () => {
    try {
      const fetched = await dataService.getTasksByView(view);
      setTasks(fetched);

      // Check blockers for open tasks
      const blockEntries: Record<string, string[]> = {};
      for (const t of fetched) {
        const meta = t.metadata as TaskMetadata;
        if (meta.status !== 'done') {
          try {
            const deps = await dataService.getTaskDependencies(t.id);
            const incompleteBlockers = deps.blockedBy
              .filter(b => (b.metadata as TaskMetadata)?.status !== 'done')
              .map(b => b.title);
            if (incompleteBlockers.length > 0) {
              blockEntries[t.id] = incompleteBlockers;
            }
          } catch {
            // non-fatal
          }
        }
      }
      setBlockedMap(blockEntries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    let active = true;
    dataService.getTasksByView(view).then(async fetched => {
      if (!active) return;
      setTasks(fetched);
      const blockEntries: Record<string, string[]> = {};
      for (const t of fetched) {
        const meta = t.metadata as TaskMetadata;
        if (meta.status !== 'done') {
          try {
            const deps = await dataService.getTaskDependencies(t.id);
            const incompleteBlockers = deps.blockedBy
              .filter(b => (b.metadata as TaskMetadata)?.status !== 'done')
              .map(b => b.title);
            if (incompleteBlockers.length > 0) {
              blockEntries[t.id] = incompleteBlockers;
            }
          } catch {
            // non-fatal
          }
        }
      }
      if (active) {
        setBlockedMap(blockEntries);
        setLoading(false);
      }
    }).catch(err => {
      if (active) {
        setError(err instanceof Error ? err.message : 'Failed to load tasks');
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [view, items]);

  async function handleToggleComplete(task: Item) {
    const meta = task.metadata as TaskMetadata;
    const isDone = meta.status === 'done';

    try {
      if (isDone) {
        // Re-open task
        await dataService.updateItem(task.id, {
          metadata: {
            ...meta,
            status: 'todo',
            completedAt: undefined,
          },
        });
      } else {
        // Complete task (handles deterministic recurrence generation if configured)
        await dataService.completeTask(task.id);
      }
      await refreshItems();
    } catch (err) {
      console.error('Failed to toggle task completion:', err);
    }
  }

  async function handleDeleteTask(e: React.MouseEvent, id: string, taskTitle: string) {
    e.preventDefault();
    e.stopPropagation();
    const confirmed = await confirm({
      title: `Delete "${taskTitle || 'this task'}"?`,
      message: 'This removes the task and its dependencies.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;

    try {
      await dataService.deleteItem(id);
      await refreshItems();
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  }

  async function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newTaskTitle.trim();
    if (!trimmed) return;

    setAddingTask(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      let presetDueDate: string | undefined = undefined;
      if (view === 'today') presetDueDate = today;
      else if (view === 'upcoming') {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        presetDueDate = tomorrow.toISOString().slice(0, 10);
      }

      await dataService.createItem({
        type: 'task',
        title: trimmed,
        metadata: {
          status: 'todo',
          priority: 'medium',
          dueDate: presetDueDate,
        },
      });

      setNewTaskTitle('');
      await refreshItems();
    } catch (err) {
      console.error('Failed to add task:', err);
    } finally {
      setAddingTask(false);
    }
  }

  // View titles and tab counts
  const viewMeta: Record<TaskViewMode, { title: string; subtitle: string; emptyTitle: string; emptySub: string }> = {
    today: {
      title: title || 'Today',
      subtitle: subtitle || 'Tasks due today, overdue priorities, and items in progress.',
      emptyTitle: 'Clear for today',
      emptySub: 'No tasks due today or requiring immediate attention. Enjoy your day or plan ahead!',
    },
    upcoming: {
      title: title || 'Upcoming',
      subtitle: subtitle || 'Future tasks scheduled and ordered chronologically.',
      emptyTitle: 'No upcoming tasks',
      emptySub: 'You have no future scheduled tasks. Add tasks with due dates to plan ahead.',
    },
    overdue: {
      title: title || 'Overdue',
      subtitle: subtitle || 'Incomplete tasks whose target due date has passed.',
      emptyTitle: 'Zero overdue tasks',
      emptySub: 'Great job! You have no overdue tasks waiting on your attention.',
    },
    completed: {
      title: title || 'Completed',
      subtitle: subtitle || 'History of completed tasks and accomplishments.',
      emptyTitle: 'No completed tasks yet',
      emptySub: 'Finish tasks in your inbox or projects to see your history here.',
    },
    all: {
      title: title || 'All Tasks',
      subtitle: subtitle || 'Complete task overview across all projects.',
      emptyTitle: 'No tasks found',
      emptySub: 'Add a new task above or capture one from your inbox.',
    },
  };

  const currentMeta = viewMeta[view];

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>{currentMeta.title}</h1>
          <p className={styles.subtitle}>{currentMeta.subtitle}</p>
        </div>
      </div>

      {/* Tabs */}
      {showTabs && (
        <div className={styles.tabs}>
          <Link
            href="/today"
            className={`${styles.tab} ${view === 'today' ? styles.tabActive : ''}`}
            id="tab-view-today"
          >
            <Clock size={14} />
            <span>Today</span>
          </Link>
          <Link
            href="/upcoming"
            className={`${styles.tab} ${view === 'upcoming' ? styles.tabActive : ''}`}
            id="tab-view-upcoming"
          >
            <Calendar size={14} />
            <span>Upcoming</span>
          </Link>
          <Link
            href="/overdue"
            className={`${styles.tab} ${view === 'overdue' ? styles.tabActive : ''}`}
            id="tab-view-overdue"
          >
            <AlertCircle size={14} />
            <span>Overdue</span>
          </Link>
          <Link
            href="/completed"
            className={`${styles.tab} ${view === 'completed' ? styles.tabActive : ''}`}
            id="tab-view-completed"
          >
            <CheckCircle2 size={14} />
            <span>Completed</span>
          </Link>
          <Link
            href="/track?tab=tasks"
            className={`${styles.tab} ${view === 'all' ? styles.tabActive : ''}`}
            id="tab-view-all"
          >
            <CheckSquare size={14} />
            <span>All Tasks</span>
          </Link>
        </div>
      )}

      {/* Quick Add Form (except for completed view) */}
      {view !== 'completed' && (
        <form onSubmit={handleQuickAdd} className={styles.quickAddForm}>
          <input
            type="text"
            className={styles.quickAddInput}
            placeholder={`Add a task to ${view === 'today' ? 'Today' : view === 'upcoming' ? 'Upcoming' : 'Tasks'}…`}
            value={newTaskTitle}
            onChange={e => setNewTaskTitle(e.target.value)}
            disabled={addingTask}
            id="input-quick-add-task"
          />
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={!newTaskTitle.trim() || addingTask}
            id="btn-submit-quick-add"
          >
            <Plus size={14} />
            <span>Add</span>
          </button>
        </form>
      )}

      {/* Loading state */}
      {loading && (
        <div className={styles.taskList}>
          {[1, 2, 3, 4].map(n => (
            <div key={n} className={styles.skeletonRow} />
          ))}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className={styles.errorState}>
          <AlertCircle size={32} />
          <p>{error}</p>
          <button className="btn btn-secondary btn-sm" onClick={loadTasks}>
            Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && tasks.length === 0 && (
        <div className={styles.emptyState}>
          <CheckCircle2 size={40} className={styles.emptyIcon} />
          <h2 className={styles.emptyTitle}>{currentMeta.emptyTitle}</h2>
          <p className={styles.emptySubtitle}>{currentMeta.emptySub}</p>
        </div>
      )}

      {/* Task List */}
      {!loading && !error && tasks.length > 0 && (
        <div className={styles.taskList}>
          {tasks.map(task => {
            const meta = task.metadata as TaskMetadata;
            const isDone = meta.status === 'done';
            const projectId = meta.projectId;
            const project = projectId ? projectsMap.get(projectId) : null;
            const todayStr = new Date().toISOString().slice(0, 10);
            const isOverdue = Boolean(meta.dueDate && meta.dueDate < todayStr && !isDone);
            const isDueToday = meta.dueDate === todayStr;
            const blockers = blockedMap[task.id] || [];

            return (
              <div
                key={task.id}
                className={`${styles.taskRow} ${isDone ? styles.taskDone : ''}`}
                id={`task-row-${task.id}`}
              >
                {/* Completion Checkbox */}
                <button
                  type="button"
                  className={styles.checkBtn}
                  onClick={() => handleToggleComplete(task)}
                  id={`btn-toggle-complete-${task.id}`}
                  aria-label={isDone ? 'Mark uncompleted' : 'Mark completed'}
                >
                  {isDone ? (
                    <CheckCircle2 size={20} color="var(--color-success, #10b981)" />
                  ) : (
                    <Circle size={20} />
                  )}
                </button>

                {/* Task Info Link */}
                <Link href={`/track/${task.id}`} className={styles.taskInfo} id={`link-task-detail-${task.id}`}>
                  <span className={`${styles.taskTitle} ${isDone ? styles.taskTitleDone : ''}`}>
                    {task.title}
                  </span>

                  <div className={styles.metaRow}>
                    {/* Priority Badge */}
                    {meta.priority && meta.priority !== 'none' && (
                      <span
                        className={`${styles.priorityBadge} ${
                          meta.priority === 'urgent'
                            ? styles.priorityUrgent
                            : meta.priority === 'high'
                            ? styles.priorityHigh
                            : meta.priority === 'medium'
                            ? styles.priorityMedium
                            : styles.priorityLow
                        }`}
                      >
                        {meta.priority}
                      </span>
                    )}

                    {/* Due Date */}
                    {meta.dueDate && (
                      <span
                        className={`${styles.dateBadge} ${
                          isOverdue ? styles.dateOverdue : isDueToday ? styles.dateToday : ''
                        }`}
                      >
                        <Calendar size={12} />
                        <span>
                          {isDueToday
                            ? 'Today'
                            : isOverdue
                            ? `Overdue (${meta.dueDate})`
                            : meta.dueDate}
                        </span>
                      </span>
                    )}

                    {/* Project Link */}
                    {project && (
                      <span className={styles.projectLink} title={project.title}>
                        <Folder size={12} />
                        <span>{project.title}</span>
                      </span>
                    )}

                    {/* Blocked indicator */}
                    {blockers.length > 0 && (
                      <span className={styles.blockedBadge} title={`Blocked by: ${blockers.join(', ')}`}>
                        ⚠️ Blocked
                      </span>
                    )}
                  </div>
                </Link>

                {/* Actions */}
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.deleteBtn}
                    onClick={e => handleDeleteTask(e, task.id, task.title)}
                    id={`btn-delete-task-${task.id}`}
                    aria-label={`Delete ${task.title}`}
                    title="Delete task"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
