'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Folder,
  Target,
  CheckSquare,
  FileText,
  Activity,
  DollarSign,
  PieChart,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Compass,
} from 'lucide-react';
import { ContextSummary, Item } from '@/types';
import { FinanceTransaction } from '@/types/finance';
import { contextGraphService } from '@/lib/services/ContextGraphService';
import { AddRelationModal } from './AddRelationModal';
import styles from './ContextPanel.module.css';

interface ContextPanelProps {
  entityId: string;
  entityType: string;
  entityTitle?: string;
  compact?: boolean;
  onLinkChanged?: () => void;
}

export function ContextPanel({
  entityId,
  entityType,
  entityTitle,
  compact = false,
  onLinkChanged,
}: ContextPanelProps) {
  const [context, setContext] = useState<ContextSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRelated, setShowRelated] = useState(false);

  const loadContext = useCallback(async () => {
    if (!entityId) return;
    try {
      const res = await contextGraphService.getDirectContext(entityId, entityType);
      setContext(res);
    } catch (err) {
      console.error('Failed to load context for entity:', entityId, err);
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType]);

  useEffect(() => {
    let active = true;
    if (!entityId) {
      return;
    }
    contextGraphService.getDirectContext(entityId, entityType)
      .then(res => {
        if (active) {
          setContext(res);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error('Failed to load context for entity:', entityId, err);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [entityId, entityType]);

  async function handleUnlink(targetId: string) {
    await contextGraphService.unlink(entityId, targetId);
    await loadContext();
    if (onLinkChanged) onLinkChanged();
  }

  function handleLinked() {
    loadContext();
    if (onLinkChanged) onLinkChanged();
  }

  const totalConnected =
    (context?.projects.length || 0) +
    (context?.goals.length || 0) +
    (context?.tasks.length || 0) +
    (context?.notes.length || 0) +
    (context?.trackers.length || 0) +
    (context?.transactions.length || 0) +
    (context?.budgets.length || 0);

  function getItemHref(item: Item): string {
    if (item.type === 'project') return `/projects/${item.id}`;
    if (item.type === 'note' || item.type === 'journal') return `/notes/${item.id}`;
    return `/track/${item.id}`;
  }

  return (
    <div className={`${styles.panel} ${compact ? styles.compact : ''}`} id={`context-panel-${entityId}`}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h4 className={styles.title}>Connected Context</h4>
          <span className={styles.countBadge} id="context-count-badge">{totalConnected}</span>
        </div>

        <button
          id="btn-open-link-modal"
          className={styles.linkBtn}
          onClick={() => setShowAddModal(true)}
          title="Connect new context"
        >
          <Plus size={14} />
          <span>Link Context</span>
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className={styles.emptyState}>
          <p>Loading context…</p>
        </div>
      ) : totalConnected === 0 ? (
        <div className={styles.emptyState} id="context-empty-state">
          <p>No connected context yet. Connect projects, goals, notes, or expenses to see them here.</p>
        </div>
      ) : (
        <div className={styles.groups}>
          {/* Projects */}
          {context && context.projects.length > 0 && (
            <div className={styles.group}>
              <div className={styles.groupHeader}>
                <Folder size={14} color="var(--accent-purple, #8b5cf6)" />
                <span>Projects ({context.projects.length})</span>
              </div>
              <div className={styles.itemGrid}>
                {context.projects.map(p => (
                  <div key={p.id} className={styles.contextRow}>
                    <Link href={`/projects/${p.id}`} className={styles.rowMain}>
                      <div className={styles.rowIcon}><Folder size={15} /></div>
                      <div className={styles.rowTexts}>
                        <span className={styles.rowTitle}>{p.title}</span>
                        <span className={styles.rowMeta}>Project</span>
                      </div>
                    </Link>
                    <div className={styles.rowActions}>
                      <button
                        className={styles.unlinkBtn}
                        onClick={() => handleUnlink(p.id)}
                        title="Unlink"
                        aria-label={`Unlink ${p.title}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Goals */}
          {context && context.goals.length > 0 && (
            <div className={styles.group}>
              <div className={styles.groupHeader}>
                <Target size={14} color="var(--color-warning, #f59e0b)" />
                <span>Goals ({context.goals.length})</span>
              </div>
              <div className={styles.itemGrid}>
                {context.goals.map(g => (
                  <div key={g.id} className={styles.contextRow}>
                    <Link href={`/track/${g.id}`} className={styles.rowMain}>
                      <div className={styles.rowIcon}><Target size={15} /></div>
                      <div className={styles.rowTexts}>
                        <span className={styles.rowTitle}>{g.title}</span>
                        <span className={styles.rowMeta}>Goal</span>
                      </div>
                    </Link>
                    <div className={styles.rowActions}>
                      <button
                        className={styles.unlinkBtn}
                        onClick={() => handleUnlink(g.id)}
                        title="Unlink"
                        aria-label={`Unlink ${g.title}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tasks */}
          {context && context.tasks.length > 0 && (
            <div className={styles.group}>
              <div className={styles.groupHeader}>
                <CheckSquare size={14} color="var(--accent-blue, #38bdf8)" />
                <span>Tasks ({context.tasks.length})</span>
              </div>
              <div className={styles.itemGrid}>
                {context.tasks.map(t => (
                  <div key={t.id} className={styles.contextRow}>
                    <Link href={`/track/${t.id}`} className={styles.rowMain}>
                      <div className={styles.rowIcon}><CheckSquare size={15} /></div>
                      <div className={styles.rowTexts}>
                        <span className={styles.rowTitle}>{t.title}</span>
                        <span className={styles.rowMeta}>{String((t.metadata as Record<string, unknown>)?.status || 'Task')}</span>
                      </div>
                    </Link>
                    <div className={styles.rowActions}>
                      <button
                        className={styles.unlinkBtn}
                        onClick={() => handleUnlink(t.id)}
                        title="Unlink"
                        aria-label={`Unlink ${t.title}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {context && context.notes.length > 0 && (
            <div className={styles.group}>
              <div className={styles.groupHeader}>
                <FileText size={14} color="var(--accent-emerald, #10b981)" />
                <span>Notes ({context.notes.length})</span>
              </div>
              <div className={styles.itemGrid}>
                {context.notes.map(n => (
                  <div key={n.id} className={styles.contextRow}>
                    <Link href={`/notes/${n.id}`} className={styles.rowMain}>
                      <div className={styles.rowIcon}><FileText size={15} /></div>
                      <div className={styles.rowTexts}>
                        <span className={styles.rowTitle}>{n.title}</span>
                        <span className={styles.rowMeta}>Note</span>
                      </div>
                    </Link>
                    <div className={styles.rowActions}>
                      <button
                        className={styles.unlinkBtn}
                        onClick={() => handleUnlink(n.id)}
                        title="Unlink"
                        aria-label={`Unlink ${n.title}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trackers */}
          {context && context.trackers.length > 0 && (
            <div className={styles.group}>
              <div className={styles.groupHeader}>
                <Activity size={14} color="var(--accent-orange, #f97316)" />
                <span>Trackers ({context.trackers.length})</span>
              </div>
              <div className={styles.itemGrid}>
                {context.trackers.map(tr => (
                  <div key={tr.id} className={styles.contextRow}>
                    <Link href={`/track/${tr.id}`} className={styles.rowMain}>
                      <div className={styles.rowIcon}><Activity size={15} /></div>
                      <div className={styles.rowTexts}>
                        <span className={styles.rowTitle}>{tr.title}</span>
                        <span className={styles.rowMeta}>Tracker</span>
                      </div>
                    </Link>
                    <div className={styles.rowActions}>
                      <button
                        className={styles.unlinkBtn}
                        onClick={() => handleUnlink(tr.id)}
                        title="Unlink"
                        aria-label={`Unlink ${tr.title}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Transactions */}
          {context && context.transactions.length > 0 && (
            <div className={styles.group}>
              <div className={styles.groupHeader}>
                <DollarSign size={14} color="var(--color-success, #10b981)" />
                <span>Transactions ({context.transactions.length})</span>
              </div>
              <div className={styles.itemGrid}>
                {context.transactions.map(txn => {
                  const isExp = txn.type === 'expense';
                  return (
                    <div key={txn.id} className={styles.contextRow}>
                      <div className={styles.rowMain}>
                        <div className={styles.rowIcon}><DollarSign size={15} /></div>
                        <div className={styles.rowTexts}>
                          <span className={styles.rowTitle}>{txn.payee || txn.note || 'Transaction'}</span>
                          <span className={styles.rowMeta}>
                            {txn.date} • {txn.type.toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <div className={styles.rowActions}>
                        <span className={`${styles.amount} ${isExp ? styles.expense : styles.income}`}>
                          {isExp ? '-' : '+'}₹{txn.amount.toLocaleString()}
                        </span>
                        <button
                          className={styles.unlinkBtn}
                          onClick={() => handleUnlink(txn.id)}
                          title="Unlink"
                          aria-label="Unlink transaction"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Budgets */}
          {context && context.budgets.length > 0 && (
            <div className={styles.group}>
              <div className={styles.groupHeader}>
                <PieChart size={14} color="var(--accent-purple, #8b5cf6)" />
                <span>Budgets ({context.budgets.length})</span>
              </div>
              <div className={styles.itemGrid}>
                {context.budgets.map(b => (
                  <div key={b.id} className={styles.contextRow}>
                    <Link href="/money" className={styles.rowMain}>
                      <div className={styles.rowIcon}><PieChart size={15} /></div>
                      <div className={styles.rowTexts}>
                        <span className={styles.rowTitle}>{b.name}</span>
                        <span className={styles.rowMeta}>Target ₹{b.target.toLocaleString()} ({b.period})</span>
                      </div>
                    </Link>
                    <div className={styles.rowActions}>
                      <button
                        className={styles.unlinkBtn}
                        onClick={() => handleUnlink(b.id)}
                        title="Unlink"
                        aria-label={`Unlink ${b.name}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2nd-Degree Related Context Discovery */}
      {context && context.relatedItems.length > 0 && (
        <div className={styles.relatedSection}>
          <div className={styles.relatedHeader} onClick={() => setShowRelated(!showRelated)}>
            <div className={styles.relatedTitle}>
              <Compass size={14} color="var(--accent-purple-light, #c4b5fd)" />
              <span>Discovered Related Context ({context.relatedItems.length})</span>
            </div>
            {showRelated ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </div>

          {showRelated && (
            <div className={styles.itemGrid} style={{ marginTop: 8 }}>
              {context.relatedItems.map(({ item, reason }, idx) => {
                const isTxn = 'amount' in item;
                const title = isTxn
                  ? `${(item as FinanceTransaction).type === 'expense' ? '-' : '+'}₹${(item as FinanceTransaction).amount} ${(item as FinanceTransaction).payee || 'Txn'}`
                  : (item as Item).title;
                const href = isTxn ? '/money/transactions' : getItemHref(item as Item);

                return (
                  <div key={item.id + idx} className={styles.contextRow}>
                    <Link href={href} className={styles.rowMain}>
                      <div className={styles.rowTexts}>
                        <span className={styles.rowTitle}>{title}</span>
                        <span className={styles.rowMeta}>
                          <span className={styles.reasonBadge}>{reason}</span>
                        </span>
                      </div>
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Add Relation Modal */}
      <AddRelationModal
        sourceId={entityId}
        sourceType={entityType}
        sourceTitle={entityTitle || context?.entityTitle}
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onLinked={handleLinked}
      />
    </div>
  );
}
