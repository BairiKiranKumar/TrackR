'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Circle,
  FileText,
  DollarSign,
  Plus,
  History,
  Zap,
  Target,
  TrendingUp,
} from 'lucide-react';
import { Item, TaskMetadata, GoalMetadata, TrackerMetadata, ProjectStatus } from '@/types';
import { contextGraphService } from '@/lib/services/ContextGraphService';
import { dataService } from '@/lib/services/DataService';
import { ContextPanel } from '@/components/context/ContextPanel';
import { Badge, Button } from '@/components/ui';
import styles from './page.module.css';

const STATUS_VARIANTS: Record<ProjectStatus, 'primary' | 'warning' | 'success' | 'default'> = {
  active: 'primary',
  on_hold: 'warning',
  completed: 'success',
  paused: 'default',
  archived: 'default',
};

export default function ProjectCockpitPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.id as string;

  const [cockpit, setCockpit] = useState<Awaited<ReturnType<typeof contextGraphService.getProjectCockpitSummary>>>(null);
  const [loading, setLoading] = useState(true);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [creatingTask, setCreatingTask] = useState(false);

  const loadCockpit = useCallback(async () => {
    if (!projectId) return;
    try {
      const summary = await contextGraphService.getProjectCockpitSummary(projectId);
      if (!summary) {
        router.replace('/projects');
        return;
      }
      setCockpit(summary);
    } catch (err) {
      console.error('Failed to load project cockpit:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId, router]);

  useEffect(() => {
    let active = true;
    if (!projectId) return;

    contextGraphService.getProjectCockpitSummary(projectId)
      .then(summary => {
        if (!active) return;
        if (!summary) {
          router.replace('/projects');
          return;
        }
        setCockpit(summary);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load project cockpit:', err);
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [projectId, router]);

  async function handleToggleTask(task: Item) {
    const meta = (task.metadata || {}) as TaskMetadata;
    const isDone = meta.status === 'done';
    const nextStatus = isDone ? 'todo' : 'done';
    await dataService.updateItem(task.id, {
      metadata: { ...meta, status: nextStatus, completedAt: nextStatus === 'done' ? new Date().toISOString() : undefined },
    });
    await loadCockpit();
  }

  async function handleQuickAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    setCreatingTask(true);
    try {
      const created = await dataService.createItem({
        type: 'task',
        title: newTaskTitle.trim(),
        metadata: {
          status: 'todo',
          projectId,
        } as TaskMetadata,
      });
      if (created) {
        await contextGraphService.link(created.id, 'task', projectId, 'project', 'belongs_to');
        setNewTaskTitle('');
        await loadCockpit();
      }
    } finally {
      setCreatingTask(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.emptySection} style={{ padding: 48 }}>
          <p>Loading project command center…</p>
        </div>
      </div>
    );
  }

  if (!cockpit) return null;

  const {
    project,
    metadata,
    nextActions,
    tasks,
    notes,
    goals,
    trackers,
    transactions,
    finSummary,
    linkedBudgetProgress,
    activity,
  } = cockpit;

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => (t.metadata as TaskMetadata)?.status === 'done').length;
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const projectStatus: ProjectStatus = (metadata.status as ProjectStatus) || 'active';
  const statusVariant = STATUS_VARIANTS[projectStatus] || 'primary';

  const hasFinancialRecords = transactions.length > 0 || finSummary.totalExpenses > 0 || finSummary.totalIncome > 0;

  return (
    <div className={styles.container} id="project-cockpit">
      {/* Navigation breadcrumb */}
      <div className={styles.topNav}>
        <Link href="/projects" className={styles.backLink}>
          <ArrowLeft size={14} />
          <span>Projects</span>
        </Link>
      </div>

      {/* Header Command Card */}
      <div className={styles.headerCard}>
        <div className={styles.headerTop}>
          <div className={styles.titleArea}>
            <h1 className={styles.projectTitle}>{project.title}</h1>
            <div className={styles.headerMeta}>
              <Badge variant={statusVariant} size="sm">
                {projectStatus.replace('_', ' ')}
              </Badge>
              {metadata.targetDate && (
                <span className={styles.targetDate}>
                  <Calendar size={12} />
                  <span>Target: {metadata.targetDate}</span>
                </span>
              )}
            </div>
          </div>

          <div className={styles.headerProgressCol}>
            <div className={styles.progressPercentRow}>
              <span className={styles.progressPercent}>{progressPct}%</span>
              <span className={styles.progressMeta}>
                {completedTasks} of {totalTasks} tasks
              </span>
            </div>
          </div>
        </div>

        {project.content && (
          <p className={styles.projectDescription}>{project.content}</p>
        )}

        {/* Hairline Progress Bar */}
        <div className={styles.progressBarBg}>
          <div
            className={styles.progressBarFill}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Two Column Command Center Layout */}
      <div className={styles.grid}>
        {/* Main Column */}
        <div className={styles.mainCol}>
          {/* 1. NEXT ACTIONS (Unblocked actionable tasks only) */}
          <div className={styles.sectionCard} id="section-next-actions">
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitleGroup}>
                <Zap size={15} className={styles.actionIcon} />
                <h2 className={styles.sectionTitle}>Next Actions</h2>
              </div>
              <Badge variant="primary" size="sm">
                {nextActions.length}
              </Badge>
            </div>

            {nextActions.length === 0 ? (
              <div className={styles.emptySection}>
                <p>No actionable unblocked tasks right now.</p>
              </div>
            ) : (
              <div className={styles.rowList}>
                {nextActions.map(task => (
                  <div key={task.id} className={styles.structuredRow}>
                    <button
                      className={styles.checkBtn}
                      onClick={() => handleToggleTask(task)}
                      aria-label="Complete task"
                    >
                      <Circle size={16} />
                    </button>
                    <Link href={`/track/${task.id}`} className={styles.rowTitle}>
                      {task.title}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. TASKS */}
          <div className={styles.sectionCard} id="section-tasks">
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitleGroup}>
                <CheckCircle2 size={15} className={styles.taskIcon} />
                <h2 className={styles.sectionTitle}>All Tasks</h2>
              </div>
              <Badge variant="default" size="sm">
                {tasks.length}
              </Badge>
            </div>

            {/* Quick Add Task */}
            <form onSubmit={handleQuickAddTask} className={styles.quickAddForm}>
              <input
                id="input-quick-add-project-task"
                type="text"
                placeholder="Add a task to this project…"
                value={newTaskTitle}
                onChange={e => setNewTaskTitle(e.target.value)}
                className={styles.quickAddInput}
              />
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={!newTaskTitle.trim() || creatingTask}
              >
                <Plus size={13} />
                <span>Add</span>
              </Button>
            </form>

            {tasks.length === 0 ? (
              <div className={styles.emptySection}>
                <p>No tasks yet in this project.</p>
              </div>
            ) : (
              <div className={styles.rowList}>
                {tasks.map(task => {
                  const isDone = (task.metadata as TaskMetadata)?.status === 'done';
                  return (
                    <div key={task.id} className={styles.structuredRow}>
                      <button
                        className={styles.checkBtn}
                        onClick={() => handleToggleTask(task)}
                        aria-label={isDone ? 'Mark active' : 'Complete task'}
                      >
                        {isDone ? (
                          <CheckCircle2 size={16} className={styles.checkedIcon} />
                        ) : (
                          <Circle size={16} />
                        )}
                      </button>
                      <Link
                        href={`/track/${task.id}`}
                        className={`${styles.rowTitle} ${isDone ? styles.taskDone : ''}`}
                      >
                        {task.title}
                      </Link>
                      <span className={styles.rowMeta}>
                        {(task.metadata as TaskMetadata)?.status || 'todo'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. NOTES */}
          <div className={styles.sectionCard} id="section-notes">
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitleGroup}>
                <FileText size={15} className={styles.noteIcon} />
                <h2 className={styles.sectionTitle}>Notes & Docs</h2>
              </div>
              <Badge variant="default" size="sm">
                {notes.length}
              </Badge>
            </div>

            {notes.length === 0 ? (
              <div className={styles.emptySection}>
                <p>No notes connected to this project.</p>
              </div>
            ) : (
              <div className={styles.rowList}>
                {notes.map(note => (
                  <Link key={note.id} href={`/notes/${note.id}`} className={styles.structuredRowLink}>
                    <div className={styles.rowLinkLeft}>
                      <FileText size={14} className={styles.noteIcon} />
                      <span className={styles.rowTitle}>{note.title}</span>
                    </div>
                    <span className={styles.rowMeta}>Note</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* 4. GOALS */}
          {goals.length > 0 && (
            <div className={styles.sectionCard} id="section-goals">
              <div className={styles.sectionHeader}>
                <div className={styles.sectionTitleGroup}>
                  <Target size={15} className={styles.goalIcon} />
                  <h2 className={styles.sectionTitle}>Connected Goals</h2>
                </div>
                <Badge variant="default" size="sm">
                  {goals.length}
                </Badge>
              </div>

              <div className={styles.rowList}>
                {goals.map(goal => {
                  const gMeta = (goal.metadata || {}) as GoalMetadata;
                  const current = gMeta.currentAmount || 0;
                  const target = gMeta.targetAmount || 100;
                  const pct = Math.min(100, Math.round((current / target) * 100));

                  return (
                    <div key={goal.id} className={styles.structuredRow}>
                      <div className={styles.goalRowLeft}>
                        <Target size={14} className={styles.goalIcon} />
                        <span className={styles.rowTitle}>{goal.title}</span>
                      </div>
                      <div className={styles.goalRowRight}>
                        <span className={styles.monoNumber}>
                          {gMeta.isFinancial ? `₹${current.toLocaleString()} / ₹${target.toLocaleString()}` : `${current} / ${target}`}
                        </span>
                        <span className={styles.progressPercent}>{pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5. TRACKERS */}
          {trackers.length > 0 && (
            <div className={styles.sectionCard} id="section-trackers">
              <div className={styles.sectionHeader}>
                <div className={styles.sectionTitleGroup}>
                  <TrendingUp size={15} className={styles.trackerIcon} />
                  <h2 className={styles.sectionTitle}>Active Trackers</h2>
                </div>
                <Badge variant="default" size="sm">
                  {trackers.length}
                </Badge>
              </div>

              <div className={styles.rowList}>
                {trackers.map(tr => {
                  const tMeta = (tr.metadata || {}) as TrackerMetadata;
                  return (
                    <div key={tr.id} className={styles.structuredRow}>
                      <div className={styles.rowLinkLeft}>
                        <TrendingUp size={14} className={styles.trackerIcon} />
                        <span className={styles.rowTitle}>{tr.title}</span>
                      </div>
                      <span className={styles.rowMeta}>
                        {tMeta.targetValue ? `Target: ${tMeta.targetValue} ${tMeta.unit || ''}` : 'Tracking'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 6. MONEY SECTION */}
          <div className={styles.sectionCard} id="section-money">
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitleGroup}>
                <DollarSign size={15} className={styles.moneyIcon} />
                <h2 className={styles.sectionTitle}>Project Financials</h2>
              </div>
            </div>

            {!hasFinancialRecords ? (
              <div className={styles.emptySection} id="empty-project-expenses">
                <p>No project expenses yet</p>
              </div>
            ) : (
              <div className={styles.moneyContent}>
                {/* Metrics */}
                <div className={styles.moneyGrid}>
                  <div className={styles.moneyMetric}>
                    <span className={styles.moneyLabel}>Total Spent</span>
                    <span className={`${styles.moneyValue} ${styles.moneyDanger}`}>
                      ₹{finSummary.totalExpenses.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className={styles.moneyMetric}>
                    <span className={styles.moneyLabel}>Total Income</span>
                    <span className={`${styles.moneyValue} ${styles.moneySuccess}`}>
                      ₹{finSummary.totalIncome.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className={styles.moneyMetric}>
                    <span className={styles.moneyLabel}>Net Position</span>
                    <span className={styles.moneyValue}>
                      {finSummary.net >= 0 ? '+' : ''}₹{finSummary.net.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                {/* Linked Budget Progress */}
                {linkedBudgetProgress && (
                  <div className={styles.budgetBox}>
                    <div className={styles.budgetHeader}>
                      <span className={styles.budgetName}>{linkedBudgetProgress.budget.name}</span>
                      <span className={styles.monoNumber}>
                        ₹{linkedBudgetProgress.spent.toLocaleString('en-IN')} / ₹{linkedBudgetProgress.budget.target.toLocaleString('en-IN')} ({Math.round(linkedBudgetProgress.percentage)}%)
                      </span>
                    </div>
                    <div className={styles.progressBarBg}>
                      <div
                        className={styles.progressBarFill}
                        style={{
                          width: `${Math.min(100, linkedBudgetProgress.percentage)}%`,
                          background: linkedBudgetProgress.isOver
                            ? 'var(--color-danger)'
                            : linkedBudgetProgress.isAlert
                            ? 'var(--color-warning)'
                            : 'var(--accent-primary)',
                        }}
                      />
                    </div>
                    <span className={styles.budgetRemaining}>
                      ₹{linkedBudgetProgress.remaining.toLocaleString('en-IN')} remaining in budget
                    </span>
                  </div>
                )}

                {/* Linked Transactions List */}
                <div className={styles.rowList}>
                  {transactions.map(txn => {
                    const isExp = txn.type === 'expense';
                    return (
                      <div key={txn.id} className={styles.structuredRow}>
                        <div className={styles.rowLinkLeft}>
                          <DollarSign
                            size={14}
                            className={isExp ? styles.expenseIcon : styles.incomeIcon}
                          />
                          <span className={styles.rowTitle}>
                            {txn.payee || txn.note || 'Transaction'}
                          </span>
                        </div>
                        <span
                          className={`${styles.monoNumber} ${isExp ? styles.expenseAmount : styles.incomeAmount}`}
                        >
                          {isExp ? '-' : '+'}₹{txn.amount.toLocaleString('en-IN')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Side Column */}
        <div className={styles.sideCol}>
          {/* Related / Context Panel */}
          <div className={styles.sideSection} id="section-related">
            <ContextPanel
              entityId={projectId}
              entityType="project"
              entityTitle={project.title}
              onLinkChanged={loadCockpit}
            />
          </div>

          {/* Activity Timeline */}
          <div className={styles.sectionCard} id="section-activity">
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitleGroup}>
                <History size={14} className={styles.activityIcon} />
                <h2 className={styles.sectionTitle}>Recent Activity</h2>
              </div>
            </div>

            {activity.length === 0 ? (
              <div className={styles.emptySection}>
                <p>No activity recorded yet.</p>
              </div>
            ) : (
              <div className={styles.timeline}>
                {activity.slice(0, 8).map(event => (
                  <div key={event.id} className={styles.timelineItem}>
                    <div className={styles.timelineDot} />
                    <div className={styles.timelineBody}>
                      <span className={styles.timelineText}>
                        {event.description || event.type.replace('_', ' ')}
                      </span>
                      <span className={styles.timelineDate}>
                        {new Date(event.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
