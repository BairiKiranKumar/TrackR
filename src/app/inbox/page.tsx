'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Inbox,
  CheckCircle2,
  Folder,
  Tag,
  ArrowRight,
  Trash2,
  Filter,
  Search,
  Sparkles,
  Link2,
  ExternalLink,
  Layers,
  Calendar,
  X,
  Plus,
} from 'lucide-react';
import { useAppContext } from '@/components/providers/AppProvider';
import { dataService } from '@/lib/services/DataService';
import { Item, ItemType, ITEM_TYPE_LABELS, ITEM_TYPE_EMOJIS, InboxMetadata, RelationType } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import styles from './page.module.css';

const CONVERTIBLE_TYPES: ItemType[] = [
  'task',
  'note',
  'expense',
  'tracker',
  'journal',
  'goal',
  'project',
];

export default function InboxPage() {
  const router = useRouter();
  const { items, refreshItems, isLoading } = useAppContext();
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Link modal state
  const [linkingItem, setLinkingItem] = useState<Item | null>(null);
  const [linkSearchQuery, setLinkSearchQuery] = useState('');
  const [linkRelationType, setLinkRelationType] = useState<RelationType>('linked');

  // Filter inbox items
  const inboxItems = useMemo(() => {
    return items
      .filter(item => {
        if (item.archived) return false;
        const meta = item.metadata as InboxMetadata | undefined;
        return meta?.inbox === true && !meta?.processed;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [items]);

  // All projects for assignment
  const projects = useMemo(() => {
    return items.filter(item => item.type === 'project' && !item.archived);
  }, [items]);

  const filteredItems = useMemo(() => {
    return inboxItems.filter(item => {
      if (filterType !== 'all' && item.type !== filterType) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchContent = item.content?.toLowerCase().includes(q);
        const matchTag = item.tags?.some(t => t.toLowerCase().includes(q));
        return matchTitle || matchContent || matchTag;
      }
      return true;
    });
  }, [inboxItems, filterType, searchQuery]);

  // Candidate items to link with
  const candidateItems = useMemo(() => {
    if (!linkingItem) return [];
    const q = linkSearchQuery.trim().toLowerCase();
    return items
      .filter(i => i.id !== linkingItem.id && !i.archived)
      .filter(i => {
        if (!q) return true;
        return (
          i.title.toLowerCase().includes(q) ||
          i.tags.some(t => t.toLowerCase().includes(q)) ||
          i.type.toLowerCase().includes(q)
        );
      })
      .slice(0, 15);
  }, [items, linkingItem, linkSearchQuery]);

  // Handlers
  async function handleMarkProcessed(id: string) {
    setProcessingId(id);
    try {
      await dataService.markItemProcessed(id);
      await refreshItems();
    } finally {
      setProcessingId(null);
    }
  }

  async function handleConvertType(id: string, newType: ItemType) {
    setProcessingId(id);
    try {
      await dataService.convertItemType(id, newType);
      await refreshItems();
    } finally {
      setProcessingId(null);
    }
  }

  async function handleAssignProject(itemId: string, projectId: string) {
    setProcessingId(itemId);
    try {
      if (!projectId) {
        // Unassign
        const item = await dataService.getItemById(itemId);
        if (item) {
          const meta = { ...(item.metadata || {}) } as Record<string, unknown>;
          delete meta.projectId;
          await dataService.updateItem(itemId, { metadata: meta });
        }
      } else {
        await dataService.assignItemProject(itemId, projectId);
      }
      await refreshItems();
    } finally {
      setProcessingId(null);
    }
  }

  async function handleDeleteItem(id: string, title: string) {
    if (!window.confirm(`Delete "${title || 'Untitled'}" from Inbox?`)) return;
    setProcessingId(id);
    try {
      await dataService.deleteItem(id);
      await refreshItems();
    } finally {
      setProcessingId(null);
    }
  }

  async function handleConnectLink(targetId: string) {
    if (!linkingItem) return;
    try {
      await dataService.linkItems(linkingItem.id, targetId, linkRelationType);
      await refreshItems();
      setLinkingItem(null);
      setLinkSearchQuery('');
    } catch (e) {
      console.error('Failed to link items', e);
    }
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTitleRow}>
          <div className={styles.titleGroup}>
            <div className={styles.iconBadge}>
              <Inbox size={22} />
            </div>
            <div>
              <h1 className={styles.title}>Inbox</h1>
              <p className={styles.subtitle}>
                Triage your captures, attach projects, connect context, and clear your queue.
              </p>
            </div>
          </div>

          <div className={styles.countBadge}>
            <span className={styles.countNumber}>{inboxItems.length}</span>
            <span className={styles.countLabel}>awaiting triage</span>
          </div>
        </div>

        {/* Filters & Search */}
        <div className={styles.toolbar}>
          <div className={styles.searchWrap}>
            <Search size={16} className={styles.searchIcon} />
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Filter inbox items…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              id="input-inbox-search"
            />
            {searchQuery && (
              <button
                className={styles.clearSearchBtn}
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className={styles.typeFilterPills}>
            <button
              className={`${styles.filterPill} ${filterType === 'all' ? styles.filterPillActive : ''}`}
              onClick={() => setFilterType('all')}
            >
              All ({inboxItems.length})
            </button>
            {CONVERTIBLE_TYPES.map(type => {
              const count = inboxItems.filter(i => i.type === type).length;
              if (count === 0 && filterType !== type) return null;
              return (
                <button
                  key={type}
                  className={`${styles.filterPill} ${filterType === type ? styles.filterPillActive : ''}`}
                  onClick={() => setFilterType(type)}
                >
                  <span>{ITEM_TYPE_LABELS[type]}</span>
                  <span className={styles.pillCount}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main List */}
      <div className={styles.content}>
        {filteredItems.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <CheckCircle2 size={40} className={styles.checkIcon} />
            </div>
            <h2 className={styles.emptyTitle}>
              {inboxItems.length === 0 ? 'Nothing waiting to be organized' : 'No matching items'}
            </h2>
            <p className={styles.emptySubtitle}>
              {inboxItems.length === 0
                ? "You're all caught up. Every capture has been triaged into your workspace."
                : 'No inbox items match your current filter and search query.'}
            </p>
            {inboxItems.length === 0 && (
              <div className={styles.emptyActions}>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    const quickAddBtn = document.querySelector<HTMLButtonElement>('#btn-quick-add');
                    if (quickAddBtn) quickAddBtn.click();
                  }}
                  id="btn-inbox-capture-now"
                >
                  <Plus size={16} />
                  <span>Quick Capture</span>
                </button>
                <Link href="/projects" className="btn btn-secondary">
                  <Folder size={16} />
                  <span>Browse Projects</span>
                </Link>
              </div>
            )}
          </div>
        ) : (
          <div className={styles.itemList}>
            {filteredItems.map(item => {
              const assignedProjectId = (item.metadata as Record<string, unknown>)?.projectId as string | undefined;
              const assignedProject = assignedProjectId
                ? projects.find(p => p.id === assignedProjectId)
                : null;
              const isProcessing = processingId === item.id;

              return (
                <div
                  key={item.id}
                  className={`${styles.inboxCard} ${isProcessing ? styles.inboxCardProcessing : ''}`}
                >
                  {/* Card Header */}
                  <div className={styles.cardHeader}>
                    <div className={styles.cardMetaRow}>
                      <span className={styles.typeBadge}>
                        <span className={styles.typeText}>{ITEM_TYPE_LABELS[item.type]?.toUpperCase() || item.type.toUpperCase()}</span>
                      </span>

                      {assignedProject && (
                        <span className={styles.projectBadge}>
                          <Folder size={12} />
                          <span>{assignedProject.title}</span>
                        </span>
                      )}

                      <span className={styles.timeAgo}>
                        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                      </span>
                    </div>

                    <div className={styles.cardHeaderActions}>
                      <Link
                        href={item.type === 'note' ? `/notes/${item.id}` : `/track/${item.id}`}
                        className={styles.iconBtn}
                        title="Open full view"
                      >
                        <ExternalLink size={15} />
                      </Link>
                      <button
                        className={`${styles.iconBtn} ${styles.deleteIconBtn}`}
                        onClick={() => handleDeleteItem(item.id, item.title)}
                        title="Delete item"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className={styles.cardBody}>
                    <h3 className={styles.itemTitle}>{item.title || 'Untitled capture'}</h3>
                    {item.content && (
                      <p className={styles.itemContent}>{item.content}</p>
                    )}

                    {/* Tags */}
                    {item.tags && item.tags.length > 0 && (
                      <div className={styles.tagRow}>
                        {item.tags.map(tag => (
                          <span key={tag} className={styles.tagChip}>
                            <Tag size={11} />
                            <span>#{tag}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Triage Controls */}
                  <div className={styles.triageToolbar}>
                    <div className={styles.triageInputs}>
                      {/* Convert Type Dropdown */}
                      <div className={styles.controlGroup}>
                        <label className={styles.controlLabel}>Type</label>
                        <select
                          className={styles.selectControl}
                          value={item.type}
                          onChange={e => handleConvertType(item.id, e.target.value as ItemType)}
                          disabled={isProcessing}
                        >
                          {CONVERTIBLE_TYPES.map(t => (
                            <option key={t} value={t}>
                              {ITEM_TYPE_EMOJIS[t]} {ITEM_TYPE_LABELS[t]}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Assign Project Dropdown */}
                      <div className={styles.controlGroup}>
                        <label className={styles.controlLabel}>Project</label>
                        <select
                          className={styles.selectControl}
                          value={assignedProjectId || ''}
                          onChange={e => handleAssignProject(item.id, e.target.value)}
                          disabled={isProcessing}
                        >
                          <option value="">(No Project)</option>
                          {projects.map(p => (
                            <option key={p.id} value={p.id}>
                              📁 {p.title}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Connect Link Button */}
                      <button
                        className={styles.linkButton}
                        onClick={() => {
                          setLinkingItem(item);
                          setLinkSearchQuery('');
                        }}
                        title="Link to another item"
                      >
                        <Link2 size={14} />
                        <span>Link</span>
                      </button>
                    </div>

                    {/* Primary Processed Action */}
                    <button
                      className={styles.markDoneBtn}
                      onClick={() => handleMarkProcessed(item.id)}
                      disabled={isProcessing}
                      id={`btn-inbox-triage-done-${item.id}`}
                    >
                      <CheckCircle2 size={16} />
                      <span>Mark Triaged</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Link Modal */}
      {linkingItem && (
        <div className={styles.modalOverlay} onClick={() => setLinkingItem(null)}>
          <div
            className={styles.modalBox}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Connect context"
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setLinkingItem(null); } }}
          >
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleRow}>
                <Link2 size={18} className={styles.modalTitleIcon} />
                <h3 className={styles.modalTitle}>Connect Context</h3>
              </div>
              <button
                className={styles.closeBtn}
                onClick={() => setLinkingItem(null)}
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <p className={styles.modalDesc}>
              Link <strong>&quot;{linkingItem.title || 'Untitled'}&quot;</strong> with another item
              in your second brain.
            </p>

            <div className={styles.modalRelationSelect}>
              <label className={styles.modalLabel}>Relationship Type</label>
              <select
                className={styles.modalSelect}
                value={linkRelationType}
                onChange={e => setLinkRelationType(e.target.value as RelationType)}
              >
                <option value="linked">Related to (Bidirectional)</option>
                <option value="child">Child / Sub-item of</option>
                <option value="parent">Parent of</option>
                <option value="references">References</option>
              </select>
            </div>

            <div className={styles.modalSearchWrap}>
              <Search size={15} className={styles.modalSearchIcon} />
              <input
                type="search"
                className={styles.modalSearchInput}
                placeholder="Search items to link…"
                value={linkSearchQuery}
                onChange={e => setLinkSearchQuery(e.target.value)}
                autoFocus
              />
            </div>

            <div className={styles.candidateList}>
              {candidateItems.length === 0 ? (
                <div className={styles.emptyCandidates}>
                  No items found matching your search.
                </div>
              ) : (
                candidateItems.map(candidate => (
                  <button
                    key={candidate.id}
                    className={styles.candidateItem}
                    onClick={() => handleConnectLink(candidate.id)}
                  >
                    <div className={styles.candidateInfo}>
                      <span className={styles.candidateEmoji}>
                        {ITEM_TYPE_EMOJIS[candidate.type] || '📄'}
                      </span>
                      <div className={styles.candidateTexts}>
                        <span className={styles.candidateTitle}>
                          {candidate.title || 'Untitled'}
                        </span>
                        <span className={styles.candidateSub}>
                          {ITEM_TYPE_LABELS[candidate.type]}
                          {candidate.tags.length > 0 && ` • #${candidate.tags.join(' #')}`}
                        </span>
                      </div>
                    </div>
                    <ArrowRight size={15} className={styles.candidateArrow} />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
