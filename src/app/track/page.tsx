'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Target, CheckSquare, Flame, Star, Folder, Circle, CheckCircle2 } from 'lucide-react';
import { useAppContext } from '@/components/providers/AppProvider';
import { Item, TrackerMetadata, TaskMetadata } from '@/types';
import { dataService } from '@/lib/services/DataService';
import { formatAmount } from '@/lib/services/MoneyParser';
import styles from './page.module.css';

type Tab = 'tasks' | 'trackers' | 'goals' | 'projects';

export default function TrackPage() {
  const [activeTab, setActiveTab] = useState<Tab>('tasks');
  const { items, refreshItems } = useAppContext();
  const router = useRouter();

  const tasks = items.filter(i => i.type === 'task');
  const trackers = items.filter(i => i.type === 'tracker' || i.type === 'habit');
  const goals = items.filter(i => i.type === 'goal');
  const projects = items.filter(i => i.type === 'project');

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'tasks',    label: 'Tasks',    count: tasks.filter(t => (t.metadata as TaskMetadata).status !== 'done').length },
    { id: 'trackers', label: 'Trackers', count: trackers.length },
    { id: 'goals',    label: 'Goals',    count: goals.length },
    { id: 'projects', label: 'Projects', count: projects.length },
  ];

  async function handleCompleteTask(taskId: string) {
    await dataService.completeTask(taskId);
    await refreshItems();
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Track</h1>
        <button
          className="btn btn-primary btn-icon btn-round"
          onClick={() => router.push(`/track/new?type=${activeTab === 'tasks' ? 'task' : activeTab === 'trackers' ? 'tracker' : activeTab === 'goals' ? 'goal' : 'project'}`)}
          id="btn-track-new"
          aria-label="New item"
        >
          <Plus size={20} />
        </button>
      </div>

      {/* Tab bar */}
      <div className="tab-bar">
        {tabs.map(tab => (
          <button
            key={tab.id}
            id={`tab-track-${tab.id}`}
            className={`tab-item ${activeTab === tab.id ? 'tab-item--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.count > 0 && <span className={styles.tabCount}>{tab.count}</span>}
          </button>
        ))}
      </div>

      {/* Tasks tab */}
      {activeTab === 'tasks' && (
        <div className={styles.list}>
          {tasks.length === 0 && (
            <div className="empty-state">
              <span className="empty-state__icon"><CheckSquare size={40} /></span>
              <span className="empty-state__title">No tasks yet</span>
              <span className="empty-state__subtitle">Add tasks to track what needs to be done. Use @mentions to link them to projects.</span>
            </div>
          )}
          {tasks.map(task => {
            const meta = task.metadata as TaskMetadata;
            const isDone = meta.status === 'done';
            return (
              <div key={task.id} className={`${styles.taskRow} ${isDone ? styles.taskDone : ''}`}>
                <button
                  className={styles.checkBtn}
                  onClick={() => !isDone && handleCompleteTask(task.id)}
                  id={`btn-complete-${task.id}`}
                  aria-label={isDone ? 'Completed' : 'Mark complete'}
                >
                  {isDone
                    ? <CheckCircle2 size={22} color="var(--color-success)" />
                    : <Circle size={22} color="var(--text-tertiary)" />
                  }
                </button>
                <Link href={`/track/${task.id}`} className={styles.taskInfo} id={`link-task-${task.id}`}>
                  <span className={styles.taskTitle}>{task.title}</span>
                  {meta.dueDate && (
                    <span className={styles.taskDue}>{meta.dueDate}</span>
                  )}
                </Link>
                {meta.priority === 'high' && <span className="badge badge-danger">!</span>}
              </div>
            );
          })}
        </div>
      )}

      {/* Trackers tab */}
      {activeTab === 'trackers' && (
        <div className={styles.list}>
          {trackers.length === 0 && (
            <div className="empty-state">
              <span className="empty-state__icon">🎯</span>
              <span className="empty-state__title">No trackers yet</span>
              <span className="empty-state__subtitle">Create a series, streak, or habit tracker to stay consistent.</span>
            </div>
          )}
          {trackers.map(tracker => (
            <TrackerCard key={tracker.id} tracker={tracker} onUpdate={refreshItems} />
          ))}
        </div>
      )}

      {/* Goals tab */}
      {activeTab === 'goals' && (
        <div className={styles.list}>
          {goals.length === 0 && (
            <div className="empty-state">
              <span className="empty-state__icon">⭐</span>
              <span className="empty-state__title">No goals yet</span>
              <span className="empty-state__subtitle">Set targets and track your progress toward them.</span>
            </div>
          )}
          {goals.map(goal => <GoalCard key={goal.id} goal={goal} />)}
        </div>
      )}

      {/* Projects tab */}
      {activeTab === 'projects' && (
        <div className={styles.list}>
          {projects.length === 0 && (
            <div className="empty-state">
              <span className="empty-state__icon">📁</span>
              <span className="empty-state__title">No projects yet</span>
              <span className="empty-state__subtitle">Projects are containers. Use @references to connect notes, tasks, and money to them.</span>
            </div>
          )}
          {projects.map(project => <ProjectCard key={project.id} project={project} />)}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function TrackerCard({ tracker, onUpdate }: { tracker: Item; onUpdate: () => void }) {
  const meta = tracker.metadata as TrackerMetadata;
  const isSeries = meta.trackerType === 'series';
  const isStreak = meta.trackerType === 'streak';
  const completed = meta.completedDays?.length ?? meta.completedDates?.length ?? 0;
  const total = meta.totalDays ?? 0;
  const pct = total > 0 ? (completed / total) * 100 : 0;
  const streak = meta.currentStreak ?? 0;

  async function handleDayTap(dayIndex: number) {
    const completedDays = meta.completedDays ?? [];
    if (completedDays.includes(dayIndex)) return; // already done
    await dataService.completeTrackerDay(tracker.id, dayIndex);
    onUpdate();
  }

  async function handleStreakTap() {
    const today = new Date().toISOString().split('T')[0];
    const dates = meta.completedDates ?? [];
    if (dates.includes(today)) return;
    await dataService.completeTrackerDay(tracker.id, undefined, today);
    onUpdate();
  }

  return (
    <Link href={`/track/${tracker.id}`} className={styles.trackerCard} id={`link-tracker-${tracker.id}`}>
      <div className={styles.trackerHeader}>
        <span className={styles.trackerEmoji}>{meta.emoji ?? (isStreak ? '🔥' : '🎯')}</span>
        <div className={styles.trackerMeta}>
          <span className={styles.trackerName}>{tracker.title}</span>
          <div className={styles.trackerStats}>
            {streak > 0 && (
              <span className="streak-badge">
                <span className="streak-fire">🔥</span> {streak} day streak
              </span>
            )}
            {isSeries && total > 0 && (
              <span className={styles.trackerStat}>{completed}/{total} days</span>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar for series */}
      {isSeries && total > 0 && (
        <div className={styles.trackerProgressBar}>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${pct}%`, background: meta.color ?? 'var(--accent-primary)' }}
            />
          </div>
          <span className={styles.pct}>{Math.round(pct)}%</span>
        </div>
      )}

      {/* Day grid for series (first 10 days) */}
      {isSeries && total > 0 && (
        <div className="day-grid" onClick={e => e.preventDefault()}>
          {Array.from({ length: Math.min(total, 15) }, (_, i) => {
            const isCompleted = (meta.completedDays ?? []).includes(i);
            const isToday = i === completed; // next day to complete
            return (
              <button
                key={i}
                className={`day-dot ${isCompleted ? 'day-dot--completed' : ''} ${isToday ? 'day-dot--today' : ''}`}
                onClick={(e) => { e.preventDefault(); handleDayTap(i); }}
                style={isCompleted ? { background: meta.color ?? 'var(--accent-primary)', borderColor: meta.color ?? 'var(--accent-primary)' } : {}}
                title={`Day ${i + 1}`}
                id={`day-dot-${tracker.id}-${i}`}
              >
                {i + 1}
              </button>
            );
          })}
          {total > 15 && <span className={styles.moreDays}>+{total - 15}</span>}
        </div>
      )}

      {/* Today button for streak */}
      {isStreak && (
        <button
          className={styles.streakTodayBtn}
          onClick={(e) => { e.preventDefault(); handleStreakTap(); }}
          id={`btn-streak-today-${tracker.id}`}
          style={{ background: (meta.completedDates ?? []).includes(new Date().toISOString().split('T')[0]) ? 'var(--color-success)' : meta.color ?? 'var(--accent-primary)' }}
        >
          {(meta.completedDates ?? []).includes(new Date().toISOString().split('T')[0]) ? '✅ Done today' : '✓ Mark today'}
        </button>
      )}
    </Link>
  );
}

function GoalCard({ goal }: { goal: Item }) {
  const meta = goal.metadata as { targetAmount?: number; currentAmount?: number; currency?: string; isFinancial?: boolean; target?: number; current?: number };
  const target = meta.targetAmount ?? meta.target ?? 0;
  const current = meta.currentAmount ?? meta.current ?? 0;
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;

  return (
    <Link href={`/track/${goal.id}`} className={styles.goalCard} id={`link-goal-${goal.id}`}>
      <div className={styles.goalHeader}>
        <Star size={18} color="var(--color-goal)" />
        <span className={styles.goalName}>{goal.title}</span>
        <span className={styles.goalPct}>{Math.round(pct)}%</span>
      </div>
      <div className="progress-track" style={{ marginTop: 8 }}>
        <div className="progress-fill" style={{ width: `${pct}%`, background: 'var(--color-goal)' }} />
      </div>
      <div className={styles.goalAmounts}>
        <span style={{ color: 'var(--color-success)' }}>{formatAmount(current)}</span>
        <span style={{ color: 'var(--text-tertiary)' }}> / {formatAmount(target)}</span>
      </div>
    </Link>
  );
}

function ProjectCard({ project }: { project: Item }) {
  const meta = project.metadata as { emoji?: string; color?: string; status?: string };
  return (
    <Link href={`/track/${project.id}`} className={styles.projectCard} id={`link-project-${project.id}`}>
      <span className={styles.projectEmoji}>{meta.emoji ?? '📁'}</span>
      <div className={styles.projectInfo}>
        <span className={styles.projectName}>{project.title}</span>
        {project.content && (
          <span className={styles.projectDesc}>{project.content.slice(0, 60)}</span>
        )}
      </div>
      {meta.status && (
        <span className={`badge ${meta.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>
          {meta.status}
        </span>
      )}
    </Link>
  );
}
