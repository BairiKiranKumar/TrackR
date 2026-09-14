'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  ChevronRight,
  CheckCircle2,
  Circle,
  Clock,
  FileText,
  DollarSign,
  Target,
  PlusCircle,
  Edit3,
  ArrowRight,
  AlertTriangle,
  Receipt,
} from 'lucide-react';
import { dataService } from '@/lib/services/DataService';
import { contextGraphService } from '@/lib/services/ContextGraphService';
import { financialInboxService } from '@/lib/services/inbox/FinancialInboxService';
import { useAppContext } from '@/components/providers/AppProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { Item, TrackerMetadata, TaskMetadata, ProjectMetadata, ProjectContextSummary, AttentionItem } from '@/types';
import { formatAmount } from '@/lib/services/MoneyDetectionService';
import { ContextualOnboarding } from '@/components/onboarding/ContextualOnboarding';
import LandingPage from './landing';
import styles from './page.module.css';

// `/` is dual-purpose: the marketing landing page for signed-out visitors,
// and the personal dashboard for signed-in users. AuthProvider already
// handles redirecting authenticated-but-unconfigured users to /auth/setup.
export default function RootPage() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className={styles.loading}><div className="skeleton" style={{ width: '100%', height: 200, borderRadius: 12 }} /></div>;
  }

  if (!user) {
    return <LandingPage />;
  }

  return <HomeDashboard />;
}

function HomeDashboard() {
  const { items, refreshItems, isReady } = useAppContext();
  const [todayTasks, setTodayTasks] = useState<Item[]>([]);
  const [monthlyTotals, setMonthlyTotals] = useState({ income: 0, expenses: 0, net: 0 });
  const [projectContexts, setProjectContexts] = useState<Record<string, ProjectContextSummary | null>>({});
  const [recentActivity, setRecentActivity] = useState<{ id: string; description: string; type: string; time: string }[]>([]);
  const [attentionItems, setAttentionItems] = useState<AttentionItem[]>([]);
  const [goalProgresses, setGoalProgresses] = useState<Record<string, { percentage: number; label: string }>>({});
  const [financialInboxSummary, setFinancialInboxSummary] = useState<{ count: number; totalAmount: number; currency: string } | null>(null);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const activeProjects = useMemo(
    () => items.filter(i => i.type === 'project' && !i.archived).slice(0, 4),
    [items]
  );

  const activeTrackers = useMemo(
    () => items.filter(i => i.type === 'tracker' && !i.archived).slice(0, 3),
    [items]
  );

  const activeGoals = useMemo(
    () => items.filter(i => i.type === 'goal' && !i.archived).slice(0, 3),
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

  useEffect(() => {
    if (!isReady) return;
    let active = true;

    async function load() {
      const [tasks, totals, activity, attention, inboxSum] = await Promise.all([
        dataService.getTodayTasks(),
        dataService.getMonthlyTotals(),
        dataService.getRecentActivity(10),
        contextGraphService.getAttentionItems(),
        financialInboxService.getPendingSummary().catch(() => null),
      ]);
      if (!active) return;
      setTodayTasks(tasks.slice(0, 5));
      setMonthlyTotals(totals);
      setAttentionItems(attention);
      if (inboxSum) setFinancialInboxSummary(inboxSum);

      const actItems = activity.slice(0, 6).map(a => ({
        id: a.id,
        description: a.description ?? a.itemTitle,
        type: a.type,
        time: format(new Date(a.createdAt), 'h:mm a'),
      }));
      setRecentActivity(actItems);

      // Load project contexts for active projects
      const contexts: Record<string, ProjectContextSummary | null> = {};
      await Promise.all(
        activeProjects.map(async (p) => {
          try {
            contexts[p.id] = await dataService.getProjectContext(p.id);
          } catch {
            contexts[p.id] = null;
          }
        })
      );
      if (active) {
        setProjectContexts(contexts);
      }

      // Load goal progresses
      const gProgs: Record<string, { percentage: number; label: string }> = {};
      await Promise.all(
        activeGoals.map(async (g) => {
          try {
            const p = await contextGraphService.calculateGoalProgress(g.id);
            if (p) gProgs[g.id] = { percentage: p.percentage, label: p.label };
          } catch {
            // ignore
          }
        })
      );
      if (active) {
        setGoalProgresses(gProgs);
      }
    }

    load();
    return () => { active = false; };
  }, [isReady, items, activeProjects, activeGoals]);

  async function handleCompleteTask(taskId: string) {
    await dataService.completeTask(taskId);
    await refreshItems();
  }

  if (!isReady) {
    return <div className={styles.loading}><div className="skeleton" style={{ width: '100%', height: 200, borderRadius: 12 }} /></div>;
  }

  return (
    <div className={styles.page}>
      {/* Calm Greeting */}
      <div className={styles.greeting}>
        <div>
          <h1 className={styles.greetingText}>{greeting}</h1>
          <p className={styles.greetingDate}>{format(new Date(), 'EEEE, MMMM d')}</p>
        </div>
      </div>

      {/* Smart Attention Engine */}
      {attentionItems.length > 0 && (
        <section className={styles.attentionSection} id="section-attention">
          <div className={styles.attentionHeader}>
            <div className={styles.attentionTitleRow}>
              <AlertTriangle size={16} className={styles.attentionIcon} />
              <span className="section-title">Needs Attention</span>
              <span className="badge badge-warning">{attentionItems.length}</span>
            </div>
          </div>
          <div className={styles.attentionList}>
            {attentionItems.slice(0, 4).map(att => (
              <Link
                key={att.id}
                href={att.actionUrl}
                className={`${styles.attentionCard} ${
                  att.severity === 'urgent'
                    ? styles.attentionHigh
                    : att.severity === 'warning'
                    ? styles.attentionMedium
                    : styles.attentionLow
                }`}
                id={`link-attention-${att.id}`}
              >
                <div className={styles.attentionCardLeft}>
                  <span className={styles.attentionCardTitle}>{att.title}</span>
                  <span className={styles.attentionCardReason}>{att.message}</span>
                </div>
                <ArrowRight size={14} className={styles.attentionActionArrow} />
              </Link>
            ))}
          </div>
        </section>
      )}

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

      {/* Financial Inbox Review Prompt (Only shown when non-empty) */}
      {financialInboxSummary && financialInboxSummary.count > 0 && (
        <div className={styles.inboxBanner} id="overview-financial-inbox-card" style={{ borderColor: 'var(--accent-primary)', marginBottom: 'var(--space-6)' }}>
          <div className={styles.inboxBannerLeft}>
            <span className={styles.inboxBannerBadge} style={{ background: 'var(--accent-primary)' }}>
              {financialInboxSummary.count}
            </span>
            <div className={styles.inboxBannerText}>
              <strong style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Receipt size={14} />
                Financial Inbox
              </strong>
              <p>
                {financialInboxSummary.count} transaction{financialInboxSummary.count > 1 ? 's' : ''} need review
                {financialInboxSummary.totalAmount > 0
                  ? ` · ₹${financialInboxSummary.totalAmount.toLocaleString('en-IN')} total`
                  : ''}
              </p>
            </div>
          </div>
          <Link href="/money/inbox" className={styles.inboxBannerBtn} id="btn-overview-review-financial-inbox">
            <span>Review</span>
            <ChevronRight size={14} />
          </Link>
        </div>
      )}

      {/* 0B. CONTEXTUAL ONBOARDING (Phase 6A - for new or zero-data users) */}
      {items.length === 0 && <ContextualOnboarding />}

      {/* 1. TODAY */}
      <section className={styles.section}>
        <div className="section-header">
          <span className="section-title">
            Today {todayTasks.length > 0 ? `— ${todayTasks.filter(t => (t.metadata as TaskMetadata).status !== 'done').length} to move forward` : ''}
          </span>
          <Link href="/track" className={styles.seeAll} id="link-home-tasks-all">
            See all <ChevronRight size={14} />
          </Link>
        </div>
        {todayTasks.length === 0 ? (
          <div className={styles.emptyTasks}>
            <p>No tasks scheduled for today.</p>
            <Link href="/track" className={styles.emptyTasksLink}>
              View all tasks <ArrowRight size={13} />
            </Link>
          </div>
        ) : (
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
                      ? <CheckCircle2 size={18} className={styles.checkDone} />
                      : <Circle size={18} className={styles.checkTodo} />
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
        )}
      </section>

      {/* 2. ACTIVE PROJECTS */}
      {activeProjects.length > 0 && (
        <section className={styles.section}>
          <div className="section-header">
            <span className="section-title">Active Projects</span>
            <Link href="/projects" className={styles.seeAll} id="link-home-projects-all">
              See all <ChevronRight size={14} />
            </Link>
          </div>
          <div className={styles.projectRowsList}>
            {activeProjects.map(proj => {
              const ctx = projectContexts[proj.id];
              const meta = (proj.metadata || {}) as ProjectMetadata;
              const totalTasks = (ctx?.openTasksCount ?? 0) + (ctx?.completedTasksCount ?? 0);
              const progressPct = totalTasks > 0 ? Math.round(((ctx?.completedTasksCount ?? 0) / totalTasks) * 100) : 0;
              const nextAction = ctx?.tasks?.find(t => (t.metadata as TaskMetadata)?.status !== 'done');
              const expensesTotal = ctx?.totalExpenses ?? 0;

              return (
                <Link
                  key={proj.id}
                  href={`/projects/${proj.id}`}
                  className={styles.projectRowItem}
                  id={`link-project-${proj.id}`}
                >
                  <div className={styles.projRowMain}>
                    <div className={styles.projRowTitleLine}>
                      <span className={styles.projRowTitle}>{proj.title}</span>
                      <span className={styles.projRowStatus}>{meta.status || 'active'}</span>
                    </div>
                    {nextAction ? (
                      <span className={styles.projRowNextAction}>
                        Next: {nextAction.title}
                      </span>
                    ) : proj.content ? (
                      <span className={styles.projRowNextAction}>{proj.content}</span>
                    ) : null}
                  </div>
                  <div className={styles.projRowMeta}>
                    <span className={styles.projRowPill}>
                      {ctx?.openTasksCount ?? 0} task{(ctx?.openTasksCount ?? 0) !== 1 ? 's' : ''}
                    </span>
                    {expensesTotal > 0 && (
                      <span className={styles.projRowSpend}>
                        ₹{expensesTotal.toLocaleString('en-IN')}
                      </span>
                    )}
                    <div className={styles.projRowProgress}>
                      <div className={styles.progressTrack}>
                        <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
                      </div>
                      <span className={styles.progressText}>{progressPct}%</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* 3. RECENT ACTIVITY */}
      {recentActivity.length > 0 && (
        <section className={styles.section}>
          <div className="section-header">
            <span className="section-title">Recent Activity</span>
          </div>
          <div className={styles.activityList}>
            {recentActivity.map(act => (
              <div key={act.id} className={styles.activityItem}>
                <div className={styles.activityIconWrap}>
                  {getActivityIcon(act.type)}
                </div>
                <span className={styles.activityDesc}>{act.description}</span>
                <span className={styles.activityTime}>{act.time}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 4. THIS MONTH SNAPSHOT */}
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

      {/* 5. TRACKING (if active trackers exist) */}
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

      {/* 6. GOALS IN MOTION */}
      {activeGoals.length > 0 && (
        <section className={styles.section}>
          <div className="section-header">
            <span className="section-title">Goals in Motion</span>
            <Link href="/track" className={styles.seeAll} id="link-home-goals-all">
              See all <ChevronRight size={14} />
            </Link>
          </div>
          <div className={styles.trackerCards}>
            {activeGoals.map(goal => {
              const prog = goalProgresses[goal.id];
              const pct = prog?.percentage ?? 0;
              return (
                <Link
                  key={goal.id}
                  href={`/track/${goal.id}`}
                  className={styles.trackerCard}
                  id={`link-home-goal-${goal.id}`}
                >
                  <div className={styles.trackerHeader}>
                    <div className={styles.trackerIconWrap} style={{ color: 'var(--color-goal, #f59e0b)' }}>
                      <Target size={16} />
                    </div>
                    <div className={styles.trackerInfo}>
                      <span className={styles.trackerName}>{goal.title}</span>
                      <span style={{ fontSize: '0.6875rem', color: 'var(--text-tertiary)' }}>
                        {prog?.label || 'Goal progress'}
                      </span>
                    </div>
                  </div>
                  <div className={styles.trackerProgress}>
                    <div className="progress-track" style={{ height: 6 }}>
                      <div
                        className="progress-fill"
                        style={{
                          width: `${pct}%`,
                          background: 'var(--color-goal, #f59e0b)',
                        }}
                      />
                    </div>
                    <span className={styles.trackerPct}>{Math.round(pct)}%</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* 7. RECENT NOTES */}
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
                <div className={styles.noteIconWrap}>
                  <FileText size={15} />
                </div>
                <div className={styles.noteInfo}>
                  <span className={styles.noteTitle}>{note.title || 'Untitled Note'}</span>
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

      {/* Bottom spacing */}
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
        <div className={styles.trackerIconWrap}>
          <Target size={16} />
        </div>
        <div className={styles.trackerInfo}>
          <span className={styles.trackerName}>{tracker.title}</span>
          {streak > 0 && (
            <span className="streak-badge">
              {streak} day{streak !== 1 ? 's' : ''}
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
      <span className={`financial-value ${styles.moneyAmount} ${positive ? styles.positive : styles.negative}`}>
        {formatAmount(Math.abs(amount))}
      </span>
    </div>
  );
}

function getActivityIcon(type: string) {
  switch (type) {
    case 'task_completed':
      return <CheckCircle2 size={15} style={{ color: 'var(--color-success)' }} />;
    case 'tracker_day_completed':
      return <Target size={15} style={{ color: 'var(--accent-primary)' }} />;
    case 'expense_added':
      return <DollarSign size={15} style={{ color: 'var(--color-danger)' }} />;
    case 'income_added':
      return <DollarSign size={15} style={{ color: 'var(--color-success)' }} />;
    case 'note_saved':
      return <FileText size={15} style={{ color: 'var(--text-secondary)' }} />;
    case 'item_created':
      return <PlusCircle size={15} style={{ color: 'var(--accent-primary)' }} />;
    case 'item_updated':
      return <Edit3 size={15} style={{ color: 'var(--text-tertiary)' }} />;
    default:
      return <Clock size={15} style={{ color: 'var(--text-tertiary)' }} />;
  }
}
