'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Inbox,
  CheckCircle2,
  Folder,
  Tag,
  ArrowRight,
  Trash2,
  Search,
  Link2,
  ExternalLink,
  X,
  Plus,
} from 'lucide-react';
import { useAppContext } from '@/components/providers/AppProvider';
import { useConfirm } from '@/components/providers/ConfirmDialogProvider';
import { dataService } from '@/lib/services/DataService';
import { Item, ItemType, ITEM_TYPE_LABELS, InboxMetadata, RelationType } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { ItemTypeBadge, getItemTypeIcon } from '@/components/common/ItemTypeBadge';
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
  const { items, refreshItems } = useAppContext();
  const confirm = useConfirm();
  const [filterType, setFilterType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkProjectModal, setShowBulkProjectModal] = useState(false);
  const [showBulkTagModal, setShowBulkTagModal] = useState(false);
  const [bulkTagInput, setBulkTagInput] = useState('');
  const [bulkTagMode, setBulkTagMode] = useState<'add' | 'remove'>('add');

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

  const allFilteredSelected = useMemo(() => {
    if (filteredItems.length === 0) return false;
    return filteredItems.every(i => selectedIds.has(i.id));
  }, [filteredItems, selectedIds]);

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map(i => i.id)));
    }
  }

  function toggleSelectItem(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
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
    const confirmed = await confirm({
      title: `Delete "${title || 'Untitled'}"?`,
      message: 'This removes it from your Inbox permanently.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    setProcessingId(id);
    try {
      await dataService.deleteItem(id);
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
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

  // Bulk Handlers
  async function handleBulkAssignProject(projectId: string) {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    try {
      await dataService.bulkAssignProject(ids, projectId);
      setSelectedIds(new Set());
      setShowBulkProjectModal(false);
      await refreshItems();
    } catch (err) {
      console.error('Failed to bulk assign project:', err);
    }
  }

  async function handleBulkAddTags(tagString: string) {
    const ids = Array.from(selectedIds);
    const tags = tagString.split(/[,\s]+/).map(t => t.trim().replace(/^#/, '')).filter(Boolean);
    if (!ids.length || !tags.length) return;
    try {
      await dataService.bulkAddTags(ids, tags);
      setSelectedIds(new Set());
      setShowBulkTagModal(false);
      setBulkTagInput('');
      await refreshItems();
    } catch (err) {
      console.error('Failed to bulk add tags:', err);
    }
  }

  async function handleBulkRemoveTags(tagString: string) {
    const ids = Array.from(selectedIds);
    const tags = tagString.split(/[,\s]+/).map(t => t.trim().replace(/^#/, '')).filter(Boolean);
    if (!ids.length || !tags.length) return;
    try {
      await dataService.bulkRemoveTags(ids, tags);
      setSelectedIds(new Set());
      setShowBulkTagModal(false);
      setBulkTagInput('');
      await refreshItems();
    } catch (err) {
      console.error('Failed to bulk remove tags:', err);
    }
  }

  async function handleBulkArchive() {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    try {
      await dataService.bulkArchive(ids);
      setSelectedIds(new Set());
      await refreshItems();
    } catch (err) {
      console.error('Failed to bulk archive:', err);
    }
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    const confirmed = await confirm({
      title: `Delete ${ids.length} selected item${ids.length > 1 ? 's' : ''}?`,
      message: 'This will permanently remove these items and clean up their relationships.',
      confirmLabel: 'Delete All',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await dataService.bulkDelete(ids);
      setSelectedIds(new Set());
      await refreshItems();
    } catch (err) {
      console.error('Failed to bulk delete:', err);
    }
  }

  async function handleBulkMarkProcessed() {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    try {
      await dataService.bulkMarkProcessed(ids);
      setSelectedIds(new Set());
      await refreshItems();
    } catch (err) {
      console.error('Failed to bulk mark processed:', err);
    }
  }

  async function handleBulkConvertType(type: ItemType) {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    try {
      await dataService.bulkConvertType(ids, type);
      setSelectedIds(new Set());
      await refreshItems();
    } catch (err) {
      console.error('Failed to bulk convert type:', err);
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
            {filteredItems.length > 0 && (
              <div className={styles.selectAllRow}>
                <label className={styles.selectAllLabel}>
                  <input
                    type="checkbox"
                    className={styles.itemCheckbox}
                    checked={allFilteredSelected}
                    onChange={toggleSelectAll}
                    id="checkbox-inbox-select-all"
                  />
                  <span>Select all ({filteredItems.length})</span>
                </label>
                {selectedIds.size > 0 && (
                  <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>
                    {selectedIds.size} selected
                  </span>
                )}
              </div>
            )}

            {filteredItems.map(item => {
              const assignedProjectId = (item.metadata as Record<string, unknown>)?.projectId as string | undefined;
              const assignedProject = assignedProjectId
                ? projects.find(p => p.id === assignedProjectId)
                : null;
              const isProcessing = processingId === item.id;
              const isSelected = selectedIds.has(item.id);

              return (
                <div
                  key={item.id}
                  className={`${styles.inboxCard} ${isProcessing ? styles.inboxCardProcessing : ''} ${isSelected ? styles.inboxCardSelected : ''}`}
                >
                  {/* Card Header */}
                  <div className={styles.cardHeader}>
                    <div className={styles.cardMetaRow}>
                      <input
                        type="checkbox"
                        className={styles.itemCheckbox}
                        checked={isSelected}
                        onChange={() => toggleSelectItem(item.id)}
                        id={`checkbox-inbox-item-${item.id}`}
                        aria-label={`Select ${item.title}`}
                      />
                      <ItemTypeBadge type={item.type} size="sm" />

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
                              {ITEM_TYPE_LABELS[t]}
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
                        {getItemTypeIcon(candidate.type, 15)}
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

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className={styles.bulkFloatingBar} role="toolbar" aria-label="Bulk actions">
          <div className={styles.bulkCountPill} id="bulk-selected-count">
            {selectedIds.size} selected
          </div>

          <button
            className={styles.bulkBtn}
            onClick={() => setShowBulkProjectModal(true)}
            id="btn-bulk-project"
            title="Assign Project"
          >
            <Folder size={14} />
            <span>Project</span>
          </button>

          <button
            className={styles.bulkBtn}
            onClick={() => {
              setBulkTagMode('add');
              setShowBulkTagModal(true);
            }}
            id="btn-bulk-add-tags"
            title="Add Tags"
          >
            <Tag size={14} />
            <span>+ Tag</span>
          </button>

          <button
            className={styles.bulkBtn}
            onClick={() => {
              setBulkTagMode('remove');
              setShowBulkTagModal(true);
            }}
            id="btn-bulk-remove-tags"
            title="Remove Tags"
          >
            <Tag size={14} />
            <span>- Tag</span>
          </button>

          <button
            className={styles.bulkBtn}
            onClick={handleBulkMarkProcessed}
            id="btn-bulk-processed"
            title="Mark Triaged"
          >
            <CheckCircle2 size={14} />
            <span>Triaged</span>
          </button>

          <select
            className={styles.selectControl}
            style={{ padding: '0.25rem 0.5rem', height: 28, fontSize: '0.75rem' }}
            defaultValue=""
            onChange={e => {
              if (e.target.value) {
                handleBulkConvertType(e.target.value as ItemType);
                e.target.value = '';
              }
            }}
            id="select-bulk-convert-type"
            title="Convert selected items"
          >
            <option value="" disabled>Convert to…</option>
            {CONVERTIBLE_TYPES.map(t => (
              <option key={t} value={t}>
                {ITEM_TYPE_LABELS[t]}
              </option>
            ))}
          </select>

          <button
            className={styles.bulkBtn}
            onClick={handleBulkArchive}
            id="btn-bulk-archive"
            title="Archive selected"
          >
            <span>Archive</span>
          </button>

          <button
            className={`${styles.bulkBtn} ${styles.bulkBtnDanger}`}
            onClick={handleBulkDelete}
            id="btn-bulk-delete"
            title="Delete selected"
          >
            <Trash2 size={14} />
            <span>Delete</span>
          </button>

          <button
            className={styles.bulkClearBtn}
            onClick={() => setSelectedIds(new Set())}
            id="btn-bulk-clear-selection"
            aria-label="Clear selection"
            title="Clear selection"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Bulk Project Modal */}
      {showBulkProjectModal && (
        <div className={styles.modalOverlay} onClick={() => setShowBulkProjectModal(false)}>
          <div className={styles.modalBox} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Assign Project">
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleRow}>
                <Folder size={18} className={styles.modalTitleIcon} />
                <h3 className={styles.modalTitle}>Assign Project</h3>
              </div>
              <button className={styles.closeBtn} onClick={() => setShowBulkProjectModal(false)}>
                <X size={18} />
              </button>
            </div>
            <p className={styles.modalDesc}>
              Assign <strong>{selectedIds.size} items</strong> to a project:
            </p>
            <div className={styles.candidateList}>
              {projects.length === 0 ? (
                <div className={styles.emptyCandidates}>No active projects found. Create one first!</div>
              ) : (
                projects.map(p => (
                  <button
                    key={p.id}
                    className={styles.candidateItem}
                    onClick={() => handleBulkAssignProject(p.id)}
                    id={`btn-bulk-choose-project-${p.id}`}
                  >
                    <div className={styles.candidateInfo}>
                      <span className={styles.candidateEmoji}>📁</span>
                      <div className={styles.candidateTexts}>
                        <span className={styles.candidateTitle}>{p.title}</span>
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

      {/* Bulk Tag Modal */}
      {showBulkTagModal && (
        <div className={styles.modalOverlay} onClick={() => setShowBulkTagModal(false)}>
          <div className={styles.modalBox} onClick={e => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${bulkTagMode === 'add' ? 'Add' : 'Remove'} Tags`}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleRow}>
                <Tag size={18} className={styles.modalTitleIcon} />
                <h3 className={styles.modalTitle}>{bulkTagMode === 'add' ? 'Add Tags' : 'Remove Tags'}</h3>
              </div>
              <button className={styles.closeBtn} onClick={() => setShowBulkTagModal(false)}>
                <X size={18} />
              </button>
            </div>
            <p className={styles.modalDesc}>
              {bulkTagMode === 'add' ? 'Add tags to' : 'Remove tags from'} <strong>{selectedIds.size} selected items</strong> (comma-separated):
            </p>
            <form onSubmit={e => {
              e.preventDefault();
              if (bulkTagMode === 'add') handleBulkAddTags(bulkTagInput);
              else handleBulkRemoveTags(bulkTagInput);
            }}>
              <input
                type="text"
                className={styles.modalSearchInput}
                placeholder="e.g. urgent, work, travel"
                value={bulkTagInput}
                onChange={e => setBulkTagInput(e.target.value)}
                autoFocus
                id="input-bulk-tag"
                style={{ width: '100%', marginBottom: '1rem' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowBulkTagModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm" id="btn-submit-bulk-tag">
                  {bulkTagMode === 'add' ? 'Apply Tags' : 'Remove Tags'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
