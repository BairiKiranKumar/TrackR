'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { dataService } from '@/lib/services/DataService';
import { ItemType, TrackerMetadata, TaskMetadata } from '@/types';
import { useAppContext } from '@/components/providers/AppProvider';
import styles from './page.module.css';

function NewItemForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshItems } = useAppContext();

  const type = (searchParams.get('type') ?? 'note') as ItemType;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);

  // Tracker-specific
  const [trackerType, setTrackerType] = useState<'series' | 'streak' | 'goal'>('series');
  const [totalDays, setTotalDays] = useState('30');
  const [emoji, setEmoji] = useState('🎯');
  const [color, setColor] = useState('#7C6FEA');

  // Task-specific
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [dueDate, setDueDate] = useState('');

  // Goal-specific
  const [target, setTarget] = useState('');
  const [unit, setUnit] = useState('₹');

  // Project-specific
  const [projectEmoji, setProjectEmoji] = useState('📁');

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      let metadata: Record<string, unknown> = {};

      if (type === 'tracker' || type === 'habit') {
        metadata = {
          trackerType,
          totalDays: trackerType === 'series' ? parseInt(totalDays) : undefined,
          completedDays: [],
          completedDates: [],
          currentStreak: 0,
          longestStreak: 0,
          emoji,
          color,
          startDate: new Date().toISOString().split('T')[0],
        } as TrackerMetadata;
      } else if (type === 'task') {
        metadata = {
          status: 'todo',
          priority,
          dueDate: dueDate || undefined,
        } as TaskMetadata;
      } else if (type === 'goal') {
        metadata = {
          targetAmount: parseFloat(target) || 0,
          currentAmount: 0,
          currency: 'INR',
          isFinancial: unit === '₹',
          target: parseFloat(target) || 0,
          current: 0,
          unit,
        };
      } else if (type === 'project') {
        metadata = { emoji: projectEmoji, color, status: 'active' };
      }

      const item = await dataService.createItem({
        type,
        title: title.trim(),
        content,
        metadata,
      });

      await refreshItems();
      if (type === 'note' || type === 'journal') {
        router.push(`/notes/${item.id}`);
      } else {
        router.push(`/track/${item.id}`);
      }
    } finally {
      setSaving(false);
    }
  }

  const typeLabels: Record<string, string> = {
    tracker: '🎯 New Tracker',
    habit: '🔥 New Habit',
    task: '✅ New Task',
    goal: '⭐ New Goal',
    project: '📁 New Project',
    note: '📝 New Note',
    journal: '📖 Journal Entry',
  };

  const EMOJIS = ['🎯', '💪', '📚', '🎮', '🏃', '🎬', '💻', '🎵', '✏️', '🌟', '🔥', '⚡'];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <button className="btn btn-icon btn-ghost" onClick={() => router.back()} id="btn-new-back">
          <ArrowLeft size={20} />
        </button>
        <h1 className={styles.title}>{typeLabels[type] ?? 'New Item'}</h1>
      </div>

      <div className={styles.form}>
        {/* Title */}
        <div className={styles.field}>
          <label className="input-label" htmlFor="input-new-title">Title *</label>
          <input
            autoFocus
            id="input-new-title"
            className="input"
            placeholder={`Give it a name…`}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />
        </div>

        {/* Tracker-specific */}
        {(type === 'tracker' || type === 'habit') && (
          <>
            <div className={styles.field}>
              <label className="input-label">Type</label>
              <div className={styles.typeSelect}>
                {(['series', 'streak', 'goal'] as const).map(t => (
                  <button
                    key={t}
                    className={`${styles.typeBtn} ${trackerType === t ? styles.typeBtnActive : ''}`}
                    onClick={() => setTrackerType(t)}
                    id={`btn-tracker-type-${t}`}
                  >
                    {t === 'series' ? '📅 Series' : t === 'streak' ? '🔥 Streak' : '⭐ Goal'}
                  </button>
                ))}
              </div>
            </div>
            {trackerType === 'series' && (
              <div className={styles.field}>
                <label className="input-label" htmlFor="input-total-days">Total Days</label>
                <input
                  id="input-total-days"
                  type="number"
                  className="input"
                  value={totalDays}
                  onChange={e => setTotalDays(e.target.value)}
                  min="1"
                  max="365"
                />
              </div>
            )}
            <div className={styles.field}>
              <label className="input-label">Emoji</label>
              <div className={styles.emojiGrid}>
                {EMOJIS.map(e => (
                  <button
                    key={e}
                    className={`${styles.emojiBtn} ${emoji === e ? styles.emojiBtnActive : ''}`}
                    onClick={() => setEmoji(e)}
                    id={`btn-emoji-${e}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.field}>
              <label className="input-label" htmlFor="input-color">Color</label>
              <input
                id="input-color"
                type="color"
                className={styles.colorInput}
                value={color}
                onChange={e => setColor(e.target.value)}
              />
            </div>
          </>
        )}

        {/* Task-specific */}
        {type === 'task' && (
          <>
            <div className={styles.field}>
              <label className="input-label">Priority</label>
              <div className={styles.typeSelect}>
                {(['low', 'medium', 'high'] as const).map(p => (
                  <button
                    key={p}
                    className={`${styles.typeBtn} ${priority === p ? styles.typeBtnActive : ''}`}
                    onClick={() => setPriority(p)}
                    id={`btn-priority-${p}`}
                  >
                    {p === 'high' ? '🔴' : p === 'medium' ? '🟡' : '🟢'} {p}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.field}>
              <label className="input-label" htmlFor="input-due-date">Due Date (optional)</label>
              <input
                id="input-due-date"
                type="date"
                className="input"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>
          </>
        )}

        {/* Goal-specific */}
        {type === 'goal' && (
          <>
            <div className={styles.field}>
              <label className="input-label" htmlFor="input-target">Target</label>
              <input
                id="input-target"
                type="number"
                className="input"
                placeholder="50000"
                value={target}
                onChange={e => setTarget(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className="input-label" htmlFor="input-unit">Unit</label>
              <select
                id="input-unit"
                className="input"
                value={unit}
                onChange={e => setUnit(e.target.value)}
              >
                <option value="₹">₹ (Rupees)</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
                <option value="km">Kilometers</option>
                <option value="pages">Pages</option>
                <option value="books">Books</option>
              </select>
            </div>
          </>
        )}

        {/* Project-specific */}
        {type === 'project' && (
          <div className={styles.field}>
            <label className="input-label">Emoji</label>
            <div className={styles.emojiGrid}>
              {['📁', '▶️', '🎮', '💻', '📚', '🎵', '🌟', '🏠', '💼', '🎯'].map(e => (
                <button
                  key={e}
                  className={`${styles.emojiBtn} ${projectEmoji === e ? styles.emojiBtnActive : ''}`}
                  onClick={() => setProjectEmoji(e)}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        <div className={styles.field}>
          <label className="input-label" htmlFor="input-new-content">Description (optional)</label>
          <textarea
            id="input-new-content"
            className={`input ${styles.textarea}`}
            placeholder="Add details, @references, or notes…"
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={3}
          />
        </div>

        <button
          className="btn btn-primary btn-lg"
          style={{ width: '100%' }}
          onClick={handleSave}
          disabled={saving || !title.trim()}
          id="btn-new-save"
        >
          {saving ? 'Creating…' : `Create ${typeLabels[type]?.split(' ').slice(1).join(' ') ?? 'Item'}`}
        </button>
      </div>
    </div>
  );
}

export default function NewItemPage() {
  return (
    <Suspense fallback={<div style={{ color: 'var(--text-tertiary)', padding: 32, fontFamily: 'var(--font-family)' }}>Loading…</div>}>
      <NewItemForm />
    </Suspense>
  );
}
