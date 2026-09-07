'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ChevronRight, Zap, CheckCircle2, Circle } from 'lucide-react';
import { dataService } from '@/lib/services/DataService';
import { useAppContext } from '@/components/providers/AppProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { Item, TrackerMetadata, TaskMetadata } from '@/types';
import { formatAmount } from '@/lib/services/MoneyParser';
import LandingPage from './landing';
import styles from './page.module.css';

// `/` is dual-purpose: the marketing landing page for signed-out visitors,
// and the personal dashboard for signed-in users. AuthProvider already
// handles redirecting authenticated-but-unconfigured users to /auth/setup.
export default function RootPage() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className={styles.loading}><div className="skeleton" style={{ width: '100%', height: 200, borderRadius: 16 }} /></div>;
  }

  if (!user) {
    return <LandingPage />;
  }

  return <HomeDashboard />;
}

function HomeDashboard() {
  const { items, refreshItems, isReady } = useAppContext();
  const [todayTasks, setTodayTasks] = useState<Item[]>([]);
  const [activeTrackers, setActiveTrackers] = useState<Item[]>([]);
  const [recentNotes, setRecentNotes] = useState<Item[]>([]);
  const [monthlyTotals, setMonthlyTotals] = useState({ income: 0, expenses: 0, net: 0 });
  const [recentActivity, setRecentActivity] = useState<{ id: string; description: string; emoji: string; time: string }[]>([]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const loadData = useCallback(async () => {
    const [tasks, totals, activity] = await Promise.all([
      dataService.getTodayTasks(),
      dataService.getMonthlyTotals(),
      dataService.getRecentActivity(10),
    ]);

    setTodayTasks(tasks.slice(0, 5));
    setMonthlyTotals(totals);

    // Active trackers
    const trackers = items
      .filter(i => i.type === 'tracker' && !i.archived)
      .slice(0, 3);
    setActiveTrackers(trackers);

    // Recent notes/journals
    const notes = items
      .filter(i => (i.type === 'note' || i.type === 'journal') && !i.archived)
      .slice(0, 3);
    setRecentNotes(notes);

    // Format activity
    const actItems = activity.slice(0, 5).map(a => ({
      id: a.id,
      description: a.description ?? a.itemTitle,
      emoji: getActivityEmoji(a.type),
      time: format(new Date(a.createdAt), 'h:mm a'),
    }));
    setRecentActivity(actItems);
  }, [items]);

  useEffect(() => {
    if (!isReady) return;
    loadData();
  }, [isReady, loadData]);

  async function handleCompleteTask(taskId: string) {
    await dataService.completeTask(taskId);
    await refreshItems();
  }

  if (!isReady) {
    return <div className={styles.loading}><div className="skeleton" style={{ width: '100%', height: 200, borderRadius: 16 }} /></div>;
  }

  return (
    <div className={styles.page}>
      {/* Greeting */}
      <div className={styles.greeting}>
        <div>
          <h1 className={styles.greetingText}>{greeting} 👋</h1>
          <p className={styles.greetingDate}>{format(new Date(), 'EEEE, MMMM d')}</p>
        </div>
        <Zap size={22} className={styles.zapIcon} />
      </div>

      {/* Today's Tasks */}
      {todayTasks.length > 0 && (
        <section className={styles.section}>
          <div className="section-header">
            <span className="section-title">Today</span>
            <Link href="/track" className={styles.seeAll} id="link-home-tasks-all">
              See all <ChevronRight size={14} />
            </Link>
          </div>
          <div className={styles.taskList}>
            {todayTasks.map(task => {
              const meta = task.metadata as TaskMetadata;
              return (
                <div key={task.id} className={styles.taskItem}>
                  <button
                    className={styles.taskCheck}
                    onClick={() => handleCompleteTask(task.id)}
                    id={`btn-task-complete-${task.id}`}
                    aria-label="Complete task"
                  >
                    {meta.status === 'done'
                      ? <CheckCircle2 size={20} className={styles.checkDone} />
                      : <Circle size={20} className={styles.checkTodo} />
                    }
                  </button>
                  <Link
                    href={`/track/${task.id}`}
                    className={styles.taskTitle}
                    id={`link-task-${task.id}`}
                  >
                    {task.title}
                  </Link>
                  {meta.priority === 'high' && <span className="badge badge-danger">High</span>}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Tracking */}
      {activeTrackers.length > 0 && (
        <section className={styles.section}>
          <div className="section-header">
            <span className="section-title">Tracking</span>
            <Link href="/track" className={styles.seeAll} id="link-home-trackers-all">
              See all <ChevronRight size={14} />
            </Link>
          </div>
          <div className={styles.trackerCards}>
            {activeTrackers.map(tracker => (
              <TrackerMiniCard key={tracker.id} tracker={tracker} />
            ))}
          </div>
        </section>
      )}

      {/* Money snapshot */}
      <section className={styles.section}>
        <div className="section-header">
          <span className="section-title">This Month</span>
          <Link href="/money" className={styles.seeAll} id="link-home-money-all">
            See all <ChevronRight size={14} />
          </Link>
        </div>
        <div className={styles.moneyCards}>
          <MoneyCard label="Income" amount={monthlyTotals.income} positive />
          <MoneyCard label="Expenses" amount={monthlyTotals.expenses} />
          <MoneyCard label="Net" amount={monthlyTotals.net} positive={monthlyTotals.net >= 0} />
        </div>
      </section>

      {/* Recent Notes */}
      {recentNotes.length > 0 && (
        <section className={styles.section}>
          <div className="section-header">
            <span className="section-title">Recent Notes</span>
            <Link href="/notes" className={styles.seeAll} id="link-home-notes-all">
              See all <ChevronRight size={14} />
            </Link>
          </div>
          <div className={styles.noteList}>
            {recentNotes.map(note => (
              <Link
                key={note.id}
                href={`/notes/${note.id}`}
                className={styles.noteCard}
                id={`link-note-${note.id}`}
              >
                <span className={styles.noteEmoji}>{note.type === 'journal' ? '📖' : '📝'}</span>
                <div className={styles.noteInfo}>
                  <span className={styles.noteTitle}>{note.title}</span>
                  <span className={styles.notePreview}>
                    {note.content?.slice(0, 60)?.replace(/\n/g, ' ') || 'Empty note'}
                  </span>
                </div>
                <ChevronRight size={16} className={styles.chevron} />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <section className={styles.section}>
          <div className="section-header">
            <span className="section-title">Activity</span>
          </div>
          <div className={styles.activityList}>
            {recentActivity.map(act => (
              <div key={act.id} className={styles.activityItem}>
                <span className={styles.activityEmoji}>{act.emoji}</span>
                <span className={styles.activityDesc}>{act.description}</span>
                <span className={styles.activityTime}>{act.time}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Bottom padding for nav */}
      <div style={{ height: 32 }} />
    </div>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function TrackerMiniCard({ tracker }: { tracker: Item }) {
  const meta = tracker.metadata as TrackerMetadata;
  const completed = meta.completedDays?.length ?? meta.completedDates?.length ?? 0;
  const total = meta.totalDays ?? 0;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const streak = meta.currentStreak ?? 0;

  return (
    <Link
      href={`/track/${tracker.id}`}
      className={styles.trackerCard}
      id={`link-tracker-${tracker.id}`}
    >
      <div className={styles.trackerHeader}>
        <span className={styles.trackerEmoji}>{meta.emoji ?? '🎯'}</span>
        <div className={styles.trackerInfo}>
          <span className={styles.trackerName}>{tracker.title}</span>
          {streak > 0 && (
            <span className="streak-badge">
              <span className="streak-fire">🔥</span> {streak} day{streak !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
      {total > 0 && (
        <div className={styles.trackerProgress}>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{
                width: `${pct}%`,
                background: meta.color ?? 'var(--accent-primary)',
              }}
            />
          </div>
          <span className={styles.trackerPct}>{completed}/{total}</span>
        </div>
      )}
    </Link>
  );
}

function MoneyCard({ label, amount, positive }: { label: string; amount: number; positive?: boolean }) {
  return (
    <div className={styles.moneyCard}>
      <span className={styles.moneyLabel}>{label}</span>
      <span className={`${styles.moneyAmount} ${positive ? styles.positive : styles.negative}`}>
        {formatAmount(Math.abs(amount))}
      </span>
    </div>
  );
}

function getActivityEmoji(type: string): string {
  const map: Record<string, string> = {
    task_completed: '✅',
    tracker_day_completed: '🎯',
    expense_added: '💸',
    income_added: '💵',
    note_saved: '📝',
    item_created: '✨',
    item_updated: '✏️',
  };
  return map[type] ?? '📌';
}
