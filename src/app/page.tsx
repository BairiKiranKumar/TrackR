'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ChevronRight, Flame, Zap, CheckCircle2, Circle } from 'lucide-react';
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
  const { items, refreshItems, isReady, dailyStreak } = useAppContext();
  const [todayTasks, setTodayTasks] = useState<Item[]>([]);
  const [monthlyTotals, setMonthlyTotals] = useState({ income: 0, expenses: 0, net: 0 });
  const [recentActivity, setRecentActivity] = useState<{ id: string; description: string; emoji: string; time: string }[]>([]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const activeTrackers = useMemo(
    () => items.filter(i => i.type === 'tracker' && !i.archived).slice(0, 3),
    [items]
  );

  const activeProjects = useMemo(
    () => items.filter(i => i.type === 'project' && !i.archived).slice(0, 3),
    [items]
  );

  const inboxCount = useMemo(
    () => items.filter(i => {
      if (i.archived) return false;
      const meta = i.metadata as Record<string, unknown> | undefined;
      return meta?.inbox === true && !meta?.processed;
    }).length,
    [items]
  );

  const recentNotes = useMemo(
    () => items.filter(i => (i.type === 'note' || i.type === 'journal') && !i.archived).slice(0, 3),
    [items]
  );

  const isMilestone = Boolean(
    dailyStreak &&
    dailyStreak.milestoneReachedOn === dailyStreak.lastOpenedDate &&
    dailyStreak.milestoneReached
  );

  useEffect(() => {
    if (!isReady) return;
    let active = true;

    async function load() {
      const [tasks, totals, activity] = await Promise.all([
        dataService.getTodayTasks(),
        dataService.getMonthlyTotals(),
        dataService.getRecentActivity(10),
      ]);
      if (!active) return;
      setTodayTasks(tasks.slice(0, 5));
      setMonthlyTotals(totals);

      const actItems = activity.slice(0, 5).map(a => ({
        id: a.id,
        description: a.description ?? a.itemTitle,
        emoji: getActivityEmoji(a.type),
        time: format(new Date(a.createdAt), 'h:mm a'),
      }));
      setRecentActivity(actItems);
    }

    load();
    return () => { active = false; };
  }, [isReady, items]);

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

      {/* Inbox Triage Prompt */}
      {inboxCount > 0 && (
        <div className={styles.inboxBanner}>
          <div className={styles.inboxBannerLeft}>
            <span className={styles.inboxBannerBadge}>{inboxCount}</span>
            <div className={styles.inboxBannerText}>
              <strong>{inboxCount} item{inboxCount > 1 ? 's' : ''} in Inbox</strong>
              <p>Triage and connect to projects to keep your workspace clear.</p>
            </div>
          </div>
          <Link href="/inbox" className={styles.inboxBannerBtn} id="link-today-inbox-triage">
            <span>Triage</span>
            <ChevronRight size={14} />
          </Link>
        </div>
      )}

      {dailyStreak && (
        <section className={`${styles.streakCard} ${isMilestone ? styles.streakMilestone : ''}`}>
          {isMilestone && (
            <div className={styles.confettiWrap} aria-hidden="true">
              <span className={`${styles.confettiPiece} ${styles.c1}`}>✦</span>
              <span className={`${styles.confettiPiece} ${styles.c2}`}>🎉</span>
              <span className={`${styles.confettiPiece} ${styles.c3}`}>★</span>
              <span className={`${styles.confettiPiece} ${styles.c4}`}>✨</span>
              <span className={`${styles.confettiPiece} ${styles.c5}`}>◆</span>
              <span className={`${styles.confettiPiece} ${styles.c6}`}>🎈</span>
            </div>
          )}
          <div className={`${styles.streakIcon} ${isMilestone ? styles.streakIconCelebration : ''}`}>
            <Flame size={20} />
          </div>
          <div className={styles.streakContent}>
            <div className={styles.streakHeader}>
              <strong>{dailyStreak.currentStreak}-day app streak</strong>
              {isMilestone && (
                <span className={styles.milestoneBadge}>
                  {dailyStreak.milestoneReached} DAYS!
                </span>
              )}
            </div>
            {dailyStreak.endedOn === dailyStreak.lastOpenedDate && dailyStreak.endedStreak ? (
              <p>Your {dailyStreak.endedStreak}-day streak ended — start a new one today.</p>
            ) : isMilestone ? (
              <p>🎉 Milestone unlocked! You reached {dailyStreak.milestoneReached} consecutive days.</p>
            ) : (
              <p>Open TRACKR each day to keep it going.</p>
            )}
          </div>
        </section>
      )}

      {/* Active Projects Spotlight */}
      {activeProjects.length > 0 && (
        <section className={styles.section}>
          <div className="section-header">
            <span className="section-title">Projects</span>
            <Link href="/projects" className={styles.seeAll} id="link-home-projects-all">
              See all <ChevronRight size={14} />
            </Link>
          </div>
          <div className={styles.projectsRow}>
            {activeProjects.map(proj => (
              <Link
                key={proj.id}
                href={`/track/${proj.id}`}
                className={styles.projectSpotlightCard}
              >
                <div className={styles.projSpotlightTop}>
                  <span className={styles.projSpotlightEmoji}>
                    {(proj.metadata as Record<string, unknown>)?.emoji as string || '📁'}
                  </span>
                  <span className={styles.projSpotlightTitle}>{proj.title}</span>
                </div>
                {proj.content && (
                  <p className={styles.projSpotlightDesc}>{proj.content}</p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

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
