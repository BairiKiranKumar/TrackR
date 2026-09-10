'use client';

import { useEffect, useState } from 'react';
import { BarChart3, CheckCircle2, FileText, Flame, Landmark, X } from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useAppContext } from '@/components/providers/AppProvider';
import { dataService } from '@/lib/services/DataService';
import { WeeklyDigestSummary } from '@/types';
import { formatAmount } from '@/lib/services/MoneyDetectionService';
import styles from './WeeklyDigest.module.css';

function localDateKey(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function previousMonday(date: Date): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - 7);
  return result;
}

export function WeeklyDigest() {
  const { user } = useAuth();
  const { isReady } = useAppContext();
  const [digest, setDigest] = useState<WeeklyDigestSummary | null>(null);

  useEffect(() => {
    if (!user || !isReady || new Date().getDay() !== 1) return;

    const weekEnding = localDateKey(new Date());
    let active = true;
    async function prepareDigest() {
      const lastShown = await dataService.getSetting<string>('weekly-digest-last-shown');
      if (lastShown === weekEnding) return;

      const weekStart = localDateKey(previousMonday(new Date()));
      const summary = await dataService.getWeeklyDigestSummary(weekStart, weekEnding);
      await dataService.setSetting('weekly-digest-last-shown', weekEnding);
      if (active) setDigest(summary);
    }

    prepareDigest().catch(error => console.error('TRACKR weekly digest error:', error));
    return () => { active = false; };
  }, [isReady, user]);

  if (!digest) return null;

  return (
    <div className="overlay" role="presentation" onMouseDown={() => setDigest(null)}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="weekly-digest-title" onMouseDown={event => event.stopPropagation()}>
        <div className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Your weekly digest</span>
            <h2 id="weekly-digest-title">Here&apos;s how last week went</h2>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={() => setDigest(null)} aria-label="Close weekly digest"><X size={20} /></button>
        </div>

        <div className={styles.metrics}>
          <Metric icon={<CheckCircle2 size={18} />} value={digest.tasksCompleted} label="tasks completed" />
          <Metric icon={<FileText size={18} />} value={digest.notesWritten} label="notes written" />
          <Metric icon={<Flame size={18} />} value={digest.streakDays} label="days opened" />
          <Metric icon={<Landmark size={18} />} value={`${formatAmount(digest.income)} in`} label={`${formatAmount(digest.expenses)} out`} />
        </div>

        <div className={styles.referenceCard}>
          <BarChart3 size={18} />
          <div>
            <span>Top referenced</span>
            <strong>{digest.topReferencedItem ? digest.topReferencedItem.title : 'No references last week'}</strong>
            {digest.topReferencedItem && <small>{digest.topReferencedItem.references} reference{digest.topReferencedItem.references === 1 ? '' : 's'}</small>}
          </div>
        </div>

        <button className="btn btn-primary" onClick={() => setDigest(null)}>Keep going</button>
      </section>
    </div>
  );
}

function Metric({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div className={styles.metric}>
      <span className={styles.metricIcon}>{icon}</span>
      <strong>{value}</strong>
      <small>{label}</small>
    </div>
  );
}
