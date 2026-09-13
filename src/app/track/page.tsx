'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Trash2, Target, Folder, ChevronLeft, ChevronRight, Check, Activity } from 'lucide-react';
import { useAppContext } from '@/components/providers/AppProvider';
import { useConfirm } from '@/components/providers/ConfirmDialogProvider';
import { Item, TrackerMetadata, TaskMetadata, GoalMetadata } from '@/types';
import { dataService } from '@/lib/services/DataService';
import { formatAmount } from '@/lib/services/MoneyDetectionService';
import { TaskListView } from '@/components/tasks/TaskListView';
import { Button, Badge, EmptyState } from '@/components/ui';
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
        <div>
          <h1 className={styles.title}>Track</h1>
          <p className={styles.subtitle}>Instruments, habits, goals, and active initiatives.</p>
        </div>
        <Button
          variant="primary"
          onClick={() => router.push(`/track/new?type=${activeTab === 'tasks' ? 'task' : activeTab === 'trackers' ? 'tracker' : activeTab === 'goals' ? 'goal' : 'project'}`)}
          id="btn-track-new"
        >
          <Plus size={15} />
          <span>New {activeTab === 'tasks' ? 'Task' : activeTab === 'trackers' ? 'Tracker' : activeTab === 'goals' ? 'Goal' : 'Project'}</span>
        </Button>
      </div>

      {/* Tab bar */}
      <div className={styles.tabsNav}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            id={`tab-track-${tab.id}`}
            className={`${styles.tabBtn} ${activeTab === tab.id ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span>{tab.label}</span>
            {tab.count > 0 && <span className={styles.tabCount}>{tab.count}</span>}
          </button>
        ))}
      </div>

      {/* Tasks tab */}
      {activeTab === 'tasks' && (
        <div style={{ marginTop: '0.5rem' }}>
          <TaskListView view="all" showTabs={true} />
        </div>
      )}

      {/* Trackers tab */}
      {activeTab === 'trackers' && (
        <div className={styles.list}>
          {trackers.length === 0 ? (
            <EmptyState
              icon={<Activity size={32} />}
              title="No trackers yet"
              description="Create a numeric series, habit frequency, or measurement tracker."
              action={
                <Button
                  variant="primary"
                  onClick={() => router.push('/track/new?type=tracker')}
                >
                  <Plus size={15} />
                  <span>Create Tracker</span>
                </Button>
              }
            />
          ) : (
            trackers.map(tracker => (
              <TrackerCard
                key={tracker.id}
                tracker={tracker}
                onUpdate={refreshItems}
                onDelete={(e) => handleDeleteItem(e, tracker.id, tracker.title)}
              />
            ))
          )}
        </div>
      )}

      {/* Goals tab */}
      {activeTab === 'goals' && (
        <div className={styles.list}>
          {goals.length === 0 ? (
            <EmptyState
              icon={<Target size={32} />}
              title="No goals yet"
              description="Set targets and connect them to tasks, projects, or financial milestones."
              action={
                <Button
                  variant="primary"
                  onClick={() => router.push('/track/new?type=goal')}
                >
                  <Plus size={15} />
                  <span>Create Goal</span>
                </Button>
              }
            />
          ) : (
            goals.map(goal => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onDelete={(e) => handleDeleteItem(e, goal.id, goal.title)}
              />
            ))
          )}
        </div>
      )}

      {/* Projects tab */}
      {activeTab === 'projects' && (
        <div className={styles.list}>
          {projects.length === 0 ? (
            <EmptyState
              icon={<Folder size={32} />}
              title="No projects yet"
              description="Group tasks, notes, trackers, and finances into cohesive initiatives."
              action={
                <Button
                  variant="primary"
                  onClick={() => router.push('/projects')}
                >
                  <Plus size={15} />
                  <span>Go to Projects</span>
                </Button>
              }
            />
          ) : (
            projects.map(project => (
              <ProjectCard
                key={project.id}
                project={project}
                onDelete={(e) => handleDeleteItem(e, project.id, project.title)}
              />
            ))
          )}
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
  const [dayPage, setDayPage] = useState(() =>
    Math.min(Math.floor(completed / DAY_GRID_PAGE_SIZE), dayPageCount - 1)
  );
  const dayPageStart = dayPage * DAY_GRID_PAGE_SIZE;
  const dayPageEnd = Math.min(dayPageStart + DAY_GRID_PAGE_SIZE, total);

  async function handleDayTap(dayIndex: number) {
    const completedDays = meta.completedDays ?? [];
    if (completedDays.includes(dayIndex)) return;
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

  const isDoneToday = (meta.completedDates ?? []).includes(new Date().toISOString().split('T')[0]);

  return (
    <div className={styles.trackerCard} id={`tracker-card-${tracker.id}`}>
      <div className={styles.cardHeader}>
        <Link href={`/track/${tracker.id}`} className={styles.cardMainLink} id={`link-tracker-${tracker.id}`}>
          <div className={styles.trackerTitleArea}>
            <h3 className={styles.cardTitle}>{tracker.title}</h3>
            <div className={styles.trackerMetaRow}>
              {streak > 0 && (
                <span className={styles.instrumentBadge}>
                  {streak} consecutive days
                </span>
              )}
              {isSeries && total > 0 && (
                <span className={styles.instrumentValue}>
                  {completed} / {total} days ({Math.round(pct)}%)
                </span>
              )}
              {typeof meta.target === 'number' && (
                <span className={styles.instrumentValue}>
                  Target: {meta.target} {meta.unit || ''}
                </span>
              )}
            </div>
          </div>
        </Link>

        <div className={styles.cardActions}>
          {isStreak && (
            <button
              type="button"
              className={`${styles.logBtn} ${isDoneToday ? styles.logBtnDone : ''}`}
              onClick={handleStreakTap}
              id={`btn-streak-today-${tracker.id}`}
              disabled={isDoneToday}
            >
              <Check size={13} />
              <span>{isDoneToday ? 'Recorded today' : 'Log today'}</span>
            </button>
          )}

          {onDelete && (
            <button
              type="button"
              className={styles.deleteBtn}
              onClick={onDelete}
              id={`btn-delete-tracker-${tracker.id}`}
              title="Delete tracker"
              aria-label="Delete tracker"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Progress bar for series */}
      {isSeries && total > 0 && (
        <div className={styles.hairlineBar}>
          <div
            className={styles.hairlineFill}
            style={{ width: `${pct}%`, background: meta.color ?? 'var(--accent-primary)' }}
          />
        </div>
      )}

      {/* Day grid for series */}
      {isSeries && total > 0 && (
        <>
          <div className={styles.dayGrid}>
            {Array.from({ length: dayPageEnd - dayPageStart }, (_, idx) => {
              const i = dayPageStart + idx;
              const isCompleted = (meta.completedDays ?? []).includes(i);
              const isToday = i === completed;
              return (
                <button
                  key={i}
                  type="button"
                  className={`${styles.dayDot} ${isCompleted ? styles.dayDotCompleted : ''} ${isToday ? styles.dayDotCurrent : ''}`}
                  onClick={() => handleDayTap(i)}
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
                <ChevronLeft size={13} />
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
                <ChevronRight size={13} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function GoalCard({ goal, onDelete }: { goal: Item; onDelete?: (e: React.MouseEvent) => void }) {
  const meta = goal.metadata as GoalMetadata;
  const target = meta.targetAmount || 0;
  const current = meta.currentAmount || 0;
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

  return (
    <div className={styles.goalCard} id={`goal-card-${goal.id}`}>
      <div className={styles.cardHeader}>
        <Link href={`/track/${goal.id}`} className={styles.cardMainLink} id={`link-goal-${goal.id}`}>
          <div className={styles.goalTitleArea}>
            <div className={styles.goalTopRow}>
              <h3 className={styles.cardTitle}>{goal.title}</h3>
              <Badge variant={pct >= 100 ? 'success' : 'primary'} size="sm">
                {pct}%
              </Badge>
            </div>
            <div className={styles.goalAmounts}>
              <span className={styles.monoStrong}>
                {meta.isFinancial ? formatAmount(current) : current}
              </span>
              <span className={styles.monoMuted}>
                {' '}/ {meta.isFinancial ? formatAmount(target) : target}
              </span>
            </div>
          </div>
        </Link>

        {onDelete && (
          <button
            type="button"
            className={styles.deleteBtn}
            onClick={onDelete}
            id={`btn-delete-goal-${goal.id}`}
            title="Delete goal"
            aria-label="Delete goal"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <Link href={`/track/${goal.id}`} className={styles.goalProgressLink}>
        <div className={styles.hairlineBar}>
          <div
            className={styles.hairlineFill}
            style={{
              width: `${pct}%`,
              background: pct >= 100 ? 'var(--color-success)' : 'var(--accent-primary)',
            }}
          />
        </div>
      </Link>
    </div>
  );
}

function ProjectCard({ project, onDelete }: { project: Item; onDelete?: (e: React.MouseEvent) => void }) {
  const meta = (project.metadata || {}) as { status?: string };
  const status = meta.status || 'active';

  return (
    <div className={styles.projectCard} id={`project-card-${project.id}`}>
      <Link href={`/projects/${project.id}`} className={styles.cardMainLink} id={`link-project-${project.id}`}>
        <div className={styles.projectInfo}>
          <h3 className={styles.cardTitle}>{project.title}</h3>
          {project.content && (
            <p className={styles.projectDesc}>{project.content.slice(0, 80)}</p>
          )}
        </div>
        <Badge variant={status === 'active' ? 'primary' : 'default'} size="sm">
          {status}
        </Badge>
      </Link>
      {onDelete && (
        <button
          type="button"
          className={styles.deleteBtn}
          onClick={onDelete}
          id={`btn-delete-project-${project.id}`}
          title="Delete project"
          aria-label="Delete project"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense fallback={<div style={{ padding: 32, color: 'var(--text-muted)' }}>Loading…</div>}>
      <TrackContent />
    </Suspense>
  );
}
