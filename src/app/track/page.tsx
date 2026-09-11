'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Star, Trash2, Target, Folder, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppContext } from '@/components/providers/AppProvider';
import { useConfirm } from '@/components/providers/ConfirmDialogProvider';
import { Item, TrackerMetadata, TaskMetadata } from '@/types';
import { dataService } from '@/lib/services/DataService';
import { formatAmount } from '@/lib/services/MoneyDetectionService';
import { TaskListView } from '@/components/tasks/TaskListView';
import styles from './page.module.css';

type Tab = 'tasks' | 'trackers' | 'goals' | 'projects';

function TrackContent() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as Tab | null;
  const [userTab, setUserTab] = useState<Tab | null>(null);
  const activeTab: Tab = userTab ?? (tabParam && ['tasks', 'trackers', 'goals', 'projects'].includes(tabParam) ? tabParam : 'tasks');
  const setActiveTab = setUserTab;
  const { items, refreshItems } = useAppContext();
  const confirm = useConfirm();
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

  async function handleDeleteItem(e: React.MouseEvent, id: string, title: string) {
    e.preventDefault();
    e.stopPropagation();
    const confirmed = await confirm({
      title: `Delete "${title || 'this item'}"?`,
      message: 'This can’t be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await dataService.deleteItem(id);
      await refreshItems();
    } catch (err) {
      console.error('Failed to delete item:', err);
    }
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
        <div style={{ marginTop: '0.75rem' }}>
          <TaskListView view="all" showTabs={true} />
        </div>
      )}

      {/* Trackers tab */}
      {activeTab === 'trackers' && (
        <div className={styles.list}>
          {trackers.length === 0 && (
            <div className="empty-state">
              <span className="empty-state__icon"><Target size={36} /></span>
              <span className="empty-state__title">No trackers yet</span>
              <span className="empty-state__subtitle">Create a series, streak, or habit tracker to stay consistent.</span>
            </div>
          )}
          {trackers.map(tracker => (
            <TrackerCard key={tracker.id} tracker={tracker} onUpdate={refreshItems} onDelete={(e) => handleDeleteItem(e, tracker.id, tracker.title)} />
          ))}
        </div>
      )}

      {/* Goals tab */}
      {activeTab === 'goals' && (
        <div className={styles.list}>
          {goals.length === 0 && (
            <div className="empty-state">
              <span className="empty-state__icon"><Star size={36} /></span>
              <span className="empty-state__title">No goals yet</span>
              <span className="empty-state__subtitle">Set targets and track your progress toward them.</span>
            </div>
          )}
          {goals.map(goal => <GoalCard key={goal.id} goal={goal} onDelete={(e) => handleDeleteItem(e, goal.id, goal.title)} />)}
        </div>
      )}

      {/* Projects tab */}
      {activeTab === 'projects' && (
        <div className={styles.list}>
          {projects.length === 0 && (
            <div className="empty-state">
              <span className="empty-state__icon"><Folder size={36} /></span>
              <span className="empty-state__title">No projects yet</span>
              <span className="empty-state__subtitle">Projects are containers. Use @references to connect notes, tasks, and money to them.</span>
            </div>
          )}
          {projects.map(project => <ProjectCard key={project.id} project={project} onDelete={(e) => handleDeleteItem(e, project.id, project.title)} />)}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

const DAY_GRID_PAGE_SIZE = 15;

function TrackerCard({ tracker, onUpdate, onDelete }: { tracker: Item; onUpdate: () => void; onDelete?: (e: React.MouseEvent) => void }) {
  const meta = tracker.metadata as TrackerMetadata;
  const isSeries = meta.trackerType === 'series';
  const isStreak = meta.trackerType === 'streak';
  const completed = meta.completedDays?.length ?? meta.completedDates?.length ?? 0;
  const total = meta.totalDays ?? 0;
  const pct = total > 0 ? (completed / total) * 100 : 0;
  const streak = meta.currentStreak ?? 0;

  const dayPageCount = Math.max(1, Math.ceil(total / DAY_GRID_PAGE_SIZE));
  // Open on whichever page of 15 contains the next day to complete, so a
  // tracker that's already well underway doesn't dump you back at day 1.
  const [dayPage, setDayPage] = useState(() =>
    Math.min(Math.floor(completed / DAY_GRID_PAGE_SIZE), dayPageCount - 1)
  );
  const dayPageStart = dayPage * DAY_GRID_PAGE_SIZE;
  const dayPageEnd = Math.min(dayPageStart + DAY_GRID_PAGE_SIZE, total);

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
    <div className={styles.trackerCard} id={`tracker-card-${tracker.id}`}>
      <div className={styles.trackerHeader}>
        <Link href={`/track/${tracker.id}`} className={styles.trackerMainLink} id={`link-tracker-${tracker.id}`}>
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
        </Link>
        {onDelete && (
          <button
            type="button"
            className="btn btn-icon btn-ghost"
            onClick={onDelete}
            id={`btn-delete-tracker-${tracker.id}`}
            title="Delete tracker"
            style={{ color: 'var(--text-tertiary)', marginLeft: 'auto', padding: 4, flexShrink: 0 }}
          >
            <Trash2 size={16} />
          </button>
        )}
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

      {/* Day grid for series, 15 days per page */}
      {isSeries && total > 0 && (
        <>
          <div className="day-grid">
            {Array.from({ length: dayPageEnd - dayPageStart }, (_, idx) => {
              const i = dayPageStart + idx;
              const isCompleted = (meta.completedDays ?? []).includes(i);
              const isToday = i === completed; // next day to complete
              return (
                <button
                  key={i}
                  type="button"
                  className={`day-dot ${isCompleted ? 'day-dot--completed' : ''} ${isToday ? 'day-dot--today' : ''}`}
                  onClick={() => handleDayTap(i)}
                  style={isCompleted ? { background: meta.color ?? 'var(--accent-primary)', borderColor: meta.color ?? 'var(--accent-primary)' } : {}}
                  title={`Day ${i + 1}`}
                  id={`day-dot-${tracker.id}-${i}`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          {dayPageCount > 1 && (
            <div className={styles.dayGridNav}>
              <button
                type="button"
                className={styles.dayGridNavBtn}
                onClick={() => setDayPage(p => Math.max(0, p - 1))}
                disabled={dayPage === 0}
                aria-label="Previous 15 days"
                id={`btn-tracker-days-prev-${tracker.id}`}
              >
                <ChevronLeft size={14} />
              </button>
              <span className={styles.dayGridNavLabel}>
                Days {dayPageStart + 1}–{dayPageEnd} of {total}
              </span>
              <button
                type="button"
                className={styles.dayGridNavBtn}
                onClick={() => setDayPage(p => Math.min(dayPageCount - 1, p + 1))}
                disabled={dayPage === dayPageCount - 1}
                aria-label="Next 15 days"
                id={`btn-tracker-days-next-${tracker.id}`}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}

      {/* Today button for streak */}
      {isStreak && (
        <button
          type="button"
          className={styles.streakTodayBtn}
          onClick={() => handleStreakTap()}
          id={`btn-streak-today-${tracker.id}`}
          style={{ background: (meta.completedDates ?? []).includes(new Date().toISOString().split('T')[0]) ? 'var(--color-success)' : meta.color ?? 'var(--accent-primary)' }}
        >
          {(meta.completedDates ?? []).includes(new Date().toISOString().split('T')[0]) ? '✅ Done today' : '✓ Mark today'}
        </button>
      )}
    </div>
  );
}

function GoalCard({ goal, onDelete }: { goal: Item; onDelete?: (e: React.MouseEvent) => void }) {
  const meta = goal.metadata as { targetAmount?: number; currentAmount?: number; currency?: string; isFinancial?: boolean; target?: number; current?: number };
  const target = meta.targetAmount ?? meta.target ?? 0;
  const current = meta.currentAmount ?? meta.current ?? 0;
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;

  return (
    <div className={styles.goalCard} id={`goal-card-${goal.id}`}>
      <div className={styles.goalHeader}>
        <Link href={`/track/${goal.id}`} className={styles.goalLink} id={`link-goal-${goal.id}`}>
          <Star size={18} color="var(--color-goal)" />
          <span className={styles.goalName}>{goal.title}</span>
          <span className={styles.goalPct}>{Math.round(pct)}%</span>
        </Link>
        {onDelete && (
          <button
            type="button"
            className="btn btn-icon btn-ghost"
            onClick={onDelete}
            id={`btn-delete-goal-${goal.id}`}
            title="Delete goal"
            style={{ color: 'var(--text-tertiary)', marginLeft: 'auto', padding: 4, flexShrink: 0 }}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
      <Link href={`/track/${goal.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
        <div className="progress-track" style={{ marginTop: 8 }}>
          <div className="progress-fill" style={{ width: `${pct}%`, background: 'var(--color-goal)' }} />
        </div>
        <div className={styles.goalAmounts}>
          <span style={{ color: 'var(--color-success)' }}>{formatAmount(current)}</span>
          <span style={{ color: 'var(--text-tertiary)' }}> / {formatAmount(target)}</span>
        </div>
      </Link>
    </div>
  );
}

function ProjectCard({ project, onDelete }: { project: Item; onDelete?: (e: React.MouseEvent) => void }) {
  const meta = project.metadata as { emoji?: string; color?: string; status?: string };
  return (
    <div className={styles.projectCard} id={`project-card-${project.id}`}>
      <Link href={`/track/${project.id}`} className={styles.projectMainLink} id={`link-project-${project.id}`}>
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
      {onDelete && (
        <button
          type="button"
          className="btn btn-icon btn-ghost"
          onClick={onDelete}
          id={`btn-delete-project-${project.id}`}
          title="Delete project"
          style={{ color: 'var(--text-tertiary)', marginLeft: 8, padding: 4, flexShrink: 0 }}
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: 'var(--text-tertiary)' }}>Loading…</div>}>
      <TrackContent />
    </Suspense>
  );
}
