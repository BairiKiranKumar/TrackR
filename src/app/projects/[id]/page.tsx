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
} from 'lucide-react';
import { Item, TaskMetadata } from '@/types';
import { contextGraphService } from '@/lib/services/ContextGraphService';
import { dataService } from '@/lib/services/DataService';
import { ContextPanel } from '@/components/context/ContextPanel';
import styles from './page.module.css';

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
        <div className={styles.emptySection} style={{ padding: 60 }}>
          <p>Loading project cockpit…</p>
        </div>
      </div>
    );
  }

  if (!cockpit) return null;

  const { project, metadata, nextActions, tasks, notes, transactions, finSummary, linkedBudgetProgress, activity } = cockpit;

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => (t.metadata as TaskMetadata)?.status === 'done').length;
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const hasFinancialRecords = transactions.length > 0 || finSummary.totalExpenses > 0 || finSummary.totalIncome > 0;

  return (
    <div className={styles.container} id="project-cockpit">
      {/* Back Link */}
      <Link href="/projects" className={styles.backLink}>
        <ArrowLeft size={16} />
        <span>Back to Projects</span>
      </Link>

      {/* Header Card */}
      <div className={styles.headerCard}>
        <div className={styles.headerTop}>
          <div className={styles.titleArea}>
            <div className={styles.projectEmoji}>{metadata.emoji || '📁'}</div>
            <div>
              <h1 className={styles.projectTitle}>{project.title}</h1>
              <div className={styles.headerMeta}>
                <span className={styles.statusBadge}>{metadata.status || 'Active'}</span>
                {metadata.targetDate && (
                  <span className={styles.targetDate}>
                    <Calendar size={13} />
                    <span>Target: {metadata.targetDate}</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className={styles.progressContainer}>
          <div className={styles.progressLabelRow}>
            <span>Project Completion</span>
            <span>{completedTasks} of {totalTasks} tasks ({progressPct}%)</span>
          </div>
          <div className={styles.progressBarBg}>
            <div className={styles.progressBarFill} style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className={styles.grid}>
        {/* Main Column */}
        <div className={styles.mainCol}>
          {/* 1. NEXT ACTIONS (Unblocked actionable tasks only) */}
          <div className={styles.sectionCard} id="section-next-actions">
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                <Zap size={16} color="var(--accent-purple, #8b5cf6)" />
                <span>Next Actions</span>
              </h2>
              <span className={styles.sectionBadge}>{nextActions.length}</span>
            </div>

            {nextActions.length === 0 ? (
              <div className={styles.emptySection}>
                <p>No actionable unblocked tasks right now.</p>
              </div>
            ) : (
              <div className={styles.taskList}>
                {nextActions.map(task => (
                  <div key={task.id} className={styles.taskItem}>
                    <div className={styles.taskItemLeft}>
                      <button
                        className={styles.checkBtn}
                        onClick={() => handleToggleTask(task)}
                        aria-label="Complete task"
                      >
                        <Circle size={17} />
                      </button>
                      <Link href={`/track/${task.id}`} className={styles.taskTitle}>
                        {task.title}
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 2. TASKS */}
          <div className={styles.sectionCard} id="section-tasks">
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                <CheckCircle2 size={16} color="var(--accent-blue, #38bdf8)" />
                <span>All Tasks</span>
              </h2>
              <span className={styles.sectionBadge}>{tasks.length}</span>
            </div>

            {/* Quick Add Task */}
            <form onSubmit={handleQuickAddTask} style={{ display: 'flex', gap: 8 }}>
              <input
                id="input-quick-add-project-task"
                type="text"
                placeholder="Add a task to this project…"
                value={newTaskTitle}
                onChange={e => setNewTaskTitle(e.target.value)}
                className="input-text"
                style={{ flex: 1, padding: '8px 12px', fontSize: '0.88rem' }}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!newTaskTitle.trim() || creatingTask}
                style={{ padding: '8px 14px' }}
              >
                <Plus size={14} />
                <span>Add</span>
              </button>
            </form>

            {tasks.length === 0 ? (
              <div className={styles.emptySection}>
                <p>No tasks yet in this project.</p>
              </div>
            ) : (
              <div className={styles.taskList}>
                {tasks.map(task => {
                  const isDone = (task.metadata as TaskMetadata)?.status === 'done';
                  return (
                    <div key={task.id} className={styles.taskItem}>
                      <div className={styles.taskItemLeft}>
                        <button
                          className={styles.checkBtn}
                          onClick={() => handleToggleTask(task)}
                          aria-label={isDone ? 'Mark active' : 'Complete task'}
                        >
                          {isDone ? (
                            <CheckCircle2 size={17} color="var(--color-success, #10b981)" />
                          ) : (
                            <Circle size={17} />
                          )}
                        </button>
                        <Link
                          href={`/track/${task.id}`}
                          className={`${styles.taskTitle} ${isDone ? styles.taskDone : ''}`}
                        >
                          {task.title}
                        </Link>
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
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
              <h2 className={styles.sectionTitle}>
                <FileText size={16} color="var(--accent-emerald, #10b981)" />
                <span>Notes & Docs</span>
              </h2>
              <span className={styles.sectionBadge}>{notes.length}</span>
            </div>

            {notes.length === 0 ? (
              <div className={styles.emptySection}>
                <p>No notes connected to this project.</p>
              </div>
            ) : (
              <div className={styles.taskList}>
                {notes.map(note => (
                  <div key={note.id} className={styles.taskItem}>
                    <Link href={`/notes/${note.id}`} className={styles.taskItemLeft}>
                      <FileText size={16} color="var(--accent-emerald, #10b981)" />
                      <span className={styles.taskTitle}>{note.title}</span>
                    </Link>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>Note</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 6. MONEY SECTION */}
          <div className={styles.sectionCard} id="section-money">
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                <DollarSign size={16} color="var(--color-success, #10b981)" />
                <span>Project Financials</span>
              </h2>
            </div>

            {!hasFinancialRecords ? (
              <div className={styles.emptySection} id="empty-project-expenses">
                <p>No project expenses yet</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Metrics */}
                <div className={styles.moneyGrid}>
                  <div className={styles.moneyMetric}>
                    <span className={styles.moneyLabel}>Total Spent</span>
                    <span className={styles.moneyValue} style={{ color: 'var(--color-danger, #ef4444)' }}>
                      ₹{finSummary.totalExpenses.toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.moneyMetric}>
                    <span className={styles.moneyLabel}>Total Income</span>
                    <span className={styles.moneyValue} style={{ color: 'var(--color-success, #10b981)' }}>
                      ₹{finSummary.totalIncome.toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.moneyMetric}>
                    <span className={styles.moneyLabel}>Net Position</span>
                    <span className={styles.moneyValue}>
                      {finSummary.net >= 0 ? '+' : ''}₹{finSummary.net.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Linked Budget Progress */}
                {linkedBudgetProgress && (
                  <div className={styles.budgetBox}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                      <span style={{ fontWeight: 700 }}>{linkedBudgetProgress.budget.name}</span>
                      <span>
                        ₹{linkedBudgetProgress.spent.toLocaleString()} / ₹{linkedBudgetProgress.budget.target.toLocaleString()} ({Math.round(linkedBudgetProgress.percentage)}%)
                      </span>
                    </div>
                    <div className={styles.progressBarBg}>
                      <div
                        className={styles.progressBarFill}
                        style={{
                          width: `${Math.min(100, linkedBudgetProgress.percentage)}%`,
                          background: linkedBudgetProgress.isOver
                            ? 'var(--color-danger, #ef4444)'
                            : linkedBudgetProgress.isAlert
                            ? 'var(--color-warning, #f59e0b)'
                            : 'var(--accent-purple, #8b5cf6)',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                      ₹{linkedBudgetProgress.remaining.toLocaleString()} remaining in budget
                    </span>
                  </div>
                )}

                {/* Linked Transactions List */}
                <div className={styles.taskList}>
                  {transactions.map(txn => {
                    const isExp = txn.type === 'expense';
                    return (
                      <div key={txn.id} className={styles.taskItem}>
                        <div className={styles.taskItemLeft}>
                          <DollarSign size={15} color={isExp ? 'var(--color-danger)' : 'var(--color-success)'} />
                          <span className={styles.taskTitle}>{txn.payee || txn.note || 'Transaction'}</span>
                        </div>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono, monospace)',
                            fontWeight: 700,
                            fontSize: '0.88rem',
                            color: isExp ? 'var(--color-danger)' : 'var(--color-success)',
                          }}
                        >
                          {isExp ? '-' : '+'}₹{txn.amount.toLocaleString()}
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
          {/* 4 & 5. Universal Context Panel */}
          <ContextPanel
            entityId={projectId}
            entityType="project"
            entityTitle={project.title}
            onLinkChanged={loadCockpit}
          />

          {/* 8. Recent Activity */}
          <div className={styles.sectionCard} id="section-activity">
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                <History size={15} color="var(--text-tertiary)" />
                <span>Recent Activity</span>
              </h2>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span>{event.description || event.type.replace('_', ' ')}</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
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
