'use client';

import { useState } from 'react';
import { X, FileText, CheckSquare, Target, DollarSign, TrendingUp, BookOpen, Folder, Flame } from 'lucide-react';
import styles from './QuickAdd.module.css';
import { useRouter } from 'next/navigation';
import { dataService } from '@/lib/services/DataService';
import { useAppContext } from '@/components/providers/AppProvider';
import { ItemType } from '@/types';
import { TransactionForm } from '@/components/money/TransactionForm';

const QUICK_ITEMS: {
  type: ItemType;
  label: string;
  icon: React.ComponentType<{size?: number}>;
  color: string;
  bg: string;
}[] = [
  { type: 'note',    label: 'Note',    icon: FileText,     color: 'var(--color-note)',    bg: 'rgba(96,165,250,0.12)' },
  { type: 'task',    label: 'Task',    icon: CheckSquare,  color: 'var(--color-task)',    bg: 'rgba(52,211,153,0.12)' },
  { type: 'tracker', label: 'Tracker', icon: Target,       color: 'var(--color-tracker)', bg: 'rgba(167,139,250,0.12)' },
  { type: 'journal', label: 'Journal', icon: BookOpen,     color: 'var(--color-journal)', bg: 'rgba(147,197,253,0.12)' },
  { type: 'expense', label: 'Expense', icon: DollarSign,   color: 'var(--color-expense)', bg: 'rgba(248,113,113,0.12)' },
  { type: 'income',  label: 'Income',  icon: TrendingUp,   color: 'var(--color-income)',  bg: 'rgba(52,211,153,0.12)' },
  { type: 'project', label: 'Project', icon: Folder,       color: 'var(--color-project)', bg: 'rgba(245,158,11,0.12)' },
  { type: 'habit',   label: 'Habit',   icon: Flame,        color: 'var(--color-habit)',   bg: 'rgba(251,146,60,0.12)' },
];

interface QuickAddProps {
  onClose: () => void;
  initialType?: 'note';
}

export function QuickAdd({ onClose, initialType }: QuickAddProps) {
  const router = useRouter();
  const { refreshItems } = useAppContext();
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(() => initialType === 'note');
  const [noteTitle, setNoteTitle] = useState('');
  const [activeType, setActiveType] = useState<ItemType | null>(initialType ?? null);

  async function handleSelect(type: ItemType) {
    if (type === 'expense') { setShowExpenseForm(true); setActiveType(type); return; }
    if (type === 'income')  { setShowIncomeForm(true);  setActiveType(type); return; }
    if (type === 'note' || type === 'journal') {
      setShowNoteInput(true);
      setActiveType(type);
      return;
    }
    if (type === 'task') {
      setShowNoteInput(true);
      setActiveType(type);
      return;
    }

    // For tracker, habit, project → navigate to creation page
    onClose();
    router.push(`/track/new?type=${type}`);
  }

  async function handleNoteSubmit() {
    if (!noteTitle.trim()) return;
    const type = activeType === 'journal' ? 'journal' : activeType === 'task' ? 'task' : 'note';
    
    const item = await dataService.createItem({
      type: type as ItemType,
      title: noteTitle.trim(),
      content: '',
      metadata: type === 'task' ? { status: 'todo', priority: 'medium' } : {},
    });
    await refreshItems();
    onClose();
    if (type === 'task') {
      router.push('/track');
    } else {
      router.push(`/notes/${item.id}`);
    }
  }

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className={styles.sheet} role="dialog" aria-label="Quick add">
        <div className={styles.handle} />

        {!showExpenseForm && !showIncomeForm && !showNoteInput && (
          <>
            <div className={styles.header}>
              <span className={styles.title}>Add something</span>
              <button className="btn btn-icon btn-ghost" onClick={onClose} id="btn-quick-add-close">
                <X size={20} />
              </button>
            </div>

            <div className={styles.grid}>
              {QUICK_ITEMS.map(item => (
                <button
                  key={item.type}
                  id={`btn-quickadd-${item.type}`}
                  className={styles.gridItem}
                  onClick={() => handleSelect(item.type)}
                  style={{ '--item-color': item.color, '--item-bg': item.bg } as React.CSSProperties}
                >
                  <span className={styles.gridIcon}>
                    <item.icon size={22} />
                  </span>
                  <span className={styles.gridLabel}>{item.label}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {showNoteInput && (
          <div className={styles.inputSection}>
            <div className={styles.header}>
              <span className={styles.title}>
                {activeType === 'journal' ? '📖 Journal' : activeType === 'task' ? '✅ Task' : '📝 Note'}
              </span>
              <button className="btn btn-icon btn-ghost" onClick={onClose}>
                <X size={20} />
              </button>
            </div>
            <input
              autoFocus
              className="input"
              placeholder={
                activeType === 'task' ? 'What needs to be done?' :
                activeType === 'journal' ? 'What\'s on your mind today?' :
                'Note title...'
              }
              value={noteTitle}
              onChange={e => setNoteTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleNoteSubmit()}
              id="input-quicknote-title"
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
              <button
                className="btn btn-primary btn-sm"
                style={{ flex: 1 }}
                onClick={handleNoteSubmit}
                id="btn-quicknote-submit"
              >
                {activeType === 'task' ? 'Add Task' : 'Open Editor'}
              </button>
            </div>
          </div>
        )}

        {(showExpenseForm || showIncomeForm) && (
          <TransactionForm
            isIncome={showIncomeForm}
            onClose={onClose}
            onSaved={async () => { await refreshItems(); onClose(); }}
          />
        )}
      </div>
    </>
  );
}
