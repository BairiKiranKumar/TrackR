'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { dataService } from '@/lib/services/DataService';
import { Item, ItemRelation, TrackerMetadata, TaskMetadata, ITEM_TYPE_EMOJIS, ITEM_TYPE_LABELS } from '@/types';
import { formatAmount } from '@/lib/services/MoneyParser';
import { format } from 'date-fns';
import styles from './page.module.css';

export default function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [item, setItem] = useState<Item | null>(null);
  const [backlinks, setBacklinks] = useState<{ relation: ItemRelation; item: Item }[]>([]);
  const [outgoing, setOutgoing] = useState<{ relation: ItemRelation; item: Item }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { id } = await params;
      if (id === 'new') { router.push('/track'); return; }

      const [found, blinks, out] = await Promise.all([
        dataService.getItemById(id),
        dataService.getBacklinks(id),
        dataService.getOutgoingReferences(id),
      ]);

      if (!found) { router.replace('/track'); return; }
      setItem(found);
      setBacklinks(blinks);
      setOutgoing(out);
      setLoading(false);
    }
    load();
  }, [params]);

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
        <span className={styles.typeLabel}>
          {ITEM_TYPE_EMOJIS[item.type]} {ITEM_TYPE_LABELS[item.type]}
        </span>
      </div>

      {/* Title */}
      <div className={styles.titleSection}>
        <h1 className={styles.title}>{item.title}</h1>
        <p className={styles.date}>{format(new Date(item.createdAt), 'MMMM d, yyyy')}</p>
      </div>

      {/* Type-specific content */}
      {renderTypeContent(item)}

      {/* Content / Description */}
      {item.content && (
        <div className={styles.section}>
          <div className="section-header"><span className="section-title">Notes</span></div>
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
            <span className="section-title">References</span>
            <span className={styles.count}>{outgoing.length}</span>
          </div>
          <div className={styles.refList}>
            {outgoing.map(({ item: ref }) => (
              <Link key={ref.id} href={`/track/${ref.id}`} className={styles.refCard} id={`link-ref-${ref.id}`}>
                <span className={styles.refEmoji}>{ITEM_TYPE_EMOJIS[ref.type]}</span>
                <div className={styles.refInfo}>
                  <span className={styles.refTitle}>{ref.title}</span>
                  <span className={styles.refType}>{ITEM_TYPE_LABELS[ref.type]}</span>
                </div>
                <ExternalLink size={14} className={styles.refIcon} />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Backlinks — the knowledge graph magic */}
      <div className={styles.section}>
        <div className="section-header">
          <span className="section-title">Referenced In</span>
          <span className={styles.count}>{backlinks.length}</span>
        </div>
        {backlinks.length === 0 ? (
          <p className={styles.emptyText}>
            No items reference this yet. Start writing @{item.title} in a note to link it.
          </p>
        ) : (
          <div className={styles.refList}>
            {backlinks.map(({ item: src }) => (
              <Link
                key={src.id}
                href={src.type === 'note' || src.type === 'journal' ? `/notes/${src.id}` : `/track/${src.id}`}
                className={styles.refCard}
                id={`link-backlink-${src.id}`}
              >
                <span className={styles.refEmoji}>{ITEM_TYPE_EMOJIS[src.type]}</span>
                <div className={styles.refInfo}>
                  <span className={styles.refTitle}>{src.title}</span>
                  <span className={styles.refType}>{ITEM_TYPE_LABELS[src.type]} · {format(new Date(src.updatedAt), 'MMM d')}</span>
                </div>
                <ExternalLink size={14} className={styles.refIcon} />
              </Link>
            ))}
          </div>
        )}
      </div>

      <div style={{ height: 40 }} />
    </div>
  );
}

// ─── Type-specific content blocks ───────────────────────────────────────────

function renderTypeContent(item: Item) {
  const meta = item.metadata as Record<string, unknown>;

  if (item.type === 'tracker' || item.type === 'habit') {
    const trackerMeta = meta as unknown as TrackerMetadata;
    const completed = trackerMeta.completedDays?.length ?? trackerMeta.completedDates?.length ?? 0;
    const total = trackerMeta.totalDays ?? 0;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const streak = trackerMeta.currentStreak ?? 0;
    const longestStreak = trackerMeta.longestStreak ?? 0;

    return (
      <div className={styles.trackerContent}>
        {/* Stats row */}
        <div className={styles.statsRow}>
          <div className={styles.statBox}>
            <span className={styles.statValue}>{completed}</span>
            <span className={styles.statLabel}>{total > 0 ? `/ ${total} days` : 'sessions'}</span>
          </div>
          <div className={styles.statBox}>
            <span className={styles.statValue} style={{ color: 'var(--color-warning)' }}>
              <span className="streak-fire">🔥</span> {streak}
            </span>
            <span className={styles.statLabel}>current streak</span>
          </div>
          <div className={styles.statBox}>
            <span className={styles.statValue}>{longestStreak}</span>
            <span className={styles.statLabel}>longest streak</span>
          </div>
        </div>

        {/* Progress bar */}
        {total > 0 && (
          <div style={{ marginBottom: 'var(--space-5)' }}>
            <div className="progress-track" style={{ height: 10, borderRadius: 5 }}>
              <div
                className="progress-fill"
                style={{
                  width: `${pct}%`,
                  background: trackerMeta.color ?? 'var(--accent-primary)',
                  height: '100%',
                  borderRadius: 5,
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
                {pct}% complete
              </span>
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
                {total - completed} days left
              </span>
            </div>
          </div>
        )}

        {/* Full day grid */}
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

  if (item.type === 'goal') {
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

  if (item.type === 'expense' || item.type === 'income') {
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

  if (item.type === 'task') {
    const taskMeta = meta as unknown as TaskMetadata;
    return (
      <div className={styles.taskContent}>
        <span className={`badge ${taskMeta.status === 'done' ? 'badge-success' : taskMeta.status === 'in_progress' ? 'badge-accent' : 'badge-neutral'}`}>
          {taskMeta.status === 'done' ? '✅ Completed' : taskMeta.status === 'in_progress' ? '🔄 In Progress' : '⏳ Todo'}
        </span>
        {taskMeta.priority && (
          <span className={`badge ${taskMeta.priority === 'high' ? 'badge-danger' : taskMeta.priority === 'medium' ? 'badge-warning' : 'badge-neutral'}`}>
            {taskMeta.priority} priority
          </span>
        )}
      </div>
    );
  }

  return null;
}
