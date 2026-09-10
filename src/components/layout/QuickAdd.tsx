'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  X,
  FileText,
  CheckSquare,
  DollarSign,
  Folder,
  Inbox,
  ArrowRight,
  Tag,
} from 'lucide-react';
import { dataService } from '@/lib/services/DataService';
import { useAppContext } from '@/components/providers/AppProvider';
import { Item, ItemType, InboxMetadata, CaptureResult } from '@/types';
import { localCaptureProcessor } from '@/lib/services/CaptureService';
import { TransactionForm } from '@/components/money/TransactionForm';
import { ItemTypeBadge } from '@/components/common/ItemTypeBadge';
import styles from './QuickAdd.module.css';

interface QuickAddProps {
  onClose: () => void;
  initialType?: 'note';
}

export function QuickAdd({ onClose, initialType }: QuickAddProps) {
  const router = useRouter();
  const { items, refreshItems } = useAppContext();
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showIncomeForm, setShowIncomeForm] = useState(false);

  // Universal input state
  const [rawText, setRawText] = useState('');
  const [saving, setSaving] = useState(false);

  const projects = useMemo(() => {
    return items.filter(i => i.type === 'project' && !i.archived);
  }, [items]);

  // Real-time deterministic detection
  const [detectedType, setDetectedType] = useState<ItemType>(initialType || 'note');
  const [detectedTags, setDetectedTags] = useState<string[]>([]);
  const [detectedProject, setDetectedProject] = useState<Item | null>(null);

  useEffect(() => {
    if (!rawText.trim()) return;

    let active = true;
    localCaptureProcessor.process(rawText, projects).then((res: CaptureResult) => {
      if (!active) return;
      setDetectedType(res.type);
      setDetectedTags(res.tags);
      if (res.projectId) {
        const found = projects.find(p => p.id === res.projectId);
        setDetectedProject(found || null);
      } else {
        setDetectedProject(null);
      }
    });

    return () => {
      active = false;
    };
  }, [rawText, projects]);

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setRawText(val);
    if (!val.trim()) {
      setDetectedType(initialType || 'note');
      setDetectedTags([]);
      setDetectedProject(null);
    }
  }

  async function handleQuickCapture(toInbox = true) {
    if (!rawText.trim()) return;
    setSaving(true);
    try {
      const processed = await localCaptureProcessor.process(rawText, projects);
      const metadata: InboxMetadata & Record<string, unknown> = {
        inbox: toInbox,
        processed: !toInbox,
        ...(processed.projectId ? { projectId: processed.projectId } : {}),
        ...(processed.metadata || {}),
      };

      if (processed.type === 'task') {
        metadata.status = 'todo';
        metadata.priority = 'medium';
      }

      const created = await dataService.createItem({
        type: processed.type,
        title: processed.title || 'Untitled capture',
        content: processed.content || '',
        tags: processed.tags,
        metadata,
      });

      if (processed.projectId) {
        await dataService.linkItems(created.id, processed.projectId, 'child');
      }

      await refreshItems();
      onClose();

      if (!toInbox) {
        if (created.type === 'note' || created.type === 'journal') {
          router.push(`/notes/${created.id}`);
        } else {
          router.push(`/track/${created.id}`);
        }
      }
    } catch (err) {
      console.error('Failed to quick capture', err);
    } finally {
      setSaving(false);
    }
  }

  function handleSelectType(type: ItemType) {
    if (type === 'expense') {
      setShowExpenseForm(true);
      return;
    }
    if (type === 'income') {
      setShowIncomeForm(true);
      return;
    }
    if (type === 'tracker' || type === 'habit' || type === 'project') {
      onClose();
      router.push(`/track/new?type=${type}`);
      return;
    }
    setDetectedType(type);
  }

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label="Quick capture"
        onKeyDown={e => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div className={styles.handle} />

        {!showExpenseForm && !showIncomeForm ? (
          <div className={styles.captureContainer}>
            {/* Header */}
            <div className={styles.header}>
              <div className={styles.headerLeft}>
                <span className={styles.title}>Quick Capture</span>
              </div>
              <button
                className="btn btn-icon btn-ghost"
                onClick={onClose}
                id="btn-quick-add-close"
                aria-label="Close quick capture"
              >
                <X size={18} />
              </button>
            </div>

            {/* Universal Text Input */}
            <div className={styles.inputCard}>
              <textarea
                autoFocus
                className={styles.captureTextarea}
                placeholder="What's on your mind? Capture anything..."
                value={rawText}
                onChange={handleInputChange}
                rows={3}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleQuickCapture(true);
                  }
                }}
                id="input-quick-capture"
              />

              {/* Real-time Detection Bar */}
              {rawText.trim() && (
                <div className={styles.detectionRow}>
                  <ItemTypeBadge type={detectedType} size="sm" />

                  {detectedProject && (
                    <span className={styles.detectedProject}>
                      <Folder size={11} />
                      <span>{detectedProject.title}</span>
                    </span>
                  )}

                  {detectedTags.map(tag => (
                    <span key={tag} className={styles.detectedTag}>
                      <Tag size={10} />
                      <span>#{tag}</span>
                    </span>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className={styles.captureActions}>
                {rawText.trim() && (
                  <button
                    type="button"
                    className={styles.openActionBtn}
                    onClick={() => handleQuickCapture(false)}
                    disabled={saving || !rawText.trim()}
                    id="btn-open-in-editor"
                  >
                    <span>Open in Editor</span>
                    <ArrowRight size={13} />
                  </button>
                )}

                <button
                  type="button"
                  className={styles.inboxActionBtn}
                  onClick={() => handleQuickCapture(true)}
                  disabled={saving || !rawText.trim()}
                  id="btn-save-to-inbox"
                >
                  <Inbox size={14} />
                  <span>Save to Inbox</span>
                  <span className={styles.shortcutKey}>⌘↵</span>
                </button>
              </div>
            </div>

            {/* Direct Creation Secondary Section */}
            <div className={styles.directSection}>
              <span className={styles.directLabel}>Create directly</span>
              <div className={styles.directRow}>
                <button
                  type="button"
                  className={styles.directBtn}
                  onClick={() => handleSelectType('note')}
                  id="btn-quickadd-note"
                >
                  <FileText size={14} />
                  <span>Note</span>
                </button>
                <button
                  type="button"
                  className={styles.directBtn}
                  onClick={() => handleSelectType('task')}
                  id="btn-quickadd-task"
                >
                  <CheckSquare size={14} />
                  <span>Task</span>
                </button>
                <button
                  type="button"
                  className={styles.directBtn}
                  onClick={() => handleSelectType('expense')}
                  id="btn-quickadd-expense"
                >
                  <DollarSign size={14} />
                  <span>Expense</span>
                </button>
                <button
                  type="button"
                  className={styles.directBtn}
                  onClick={() => handleSelectType('project')}
                  id="btn-quickadd-project"
                >
                  <Folder size={14} />
                  <span>Project</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <TransactionForm
            isIncome={showIncomeForm}
            onClose={onClose}
            onSaved={async () => {
              await refreshItems();
              onClose();
            }}
          />
        )}
      </div>
    </>
  );
}
