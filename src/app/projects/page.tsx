'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Folder,
  Plus,
  Search,
  CheckCircle2,
  FileText,
  DollarSign,
  Target,
  Sparkles,
  ArrowRight,
  TrendingUp,
  X,
  Clock,
  Layers,
} from 'lucide-react';
import { useAppContext } from '@/components/providers/AppProvider';
import { dataService } from '@/lib/services/DataService';
import { Item, ProjectContextSummary, ProjectMetadata } from '@/types';
import styles from './page.module.css';

interface ProjectWithContext {
  project: Item;
  context: ProjectContextSummary | null;
}

export default function ProjectsPage() {
  const router = useRouter();
  const { items, refreshItems, isLoading } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [projectData, setProjectData] = useState<ProjectWithContext[]>([]);
  const [loadingContexts, setLoadingContexts] = useState(true);

  // New project modal state
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newEmoji, setNewEmoji] = useState('📁');
  const [newColor, setNewColor] = useState('#6366f1');
  const [creating, setCreating] = useState(false);

  const projects = useMemo(() => {
    return items
      .filter(item => item.type === 'project' && !item.archived)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [items]);

  useEffect(() => {
    let isMounted = true;
    async function loadAllProjectContexts() {
      setLoadingContexts(true);
      const results: ProjectWithContext[] = [];
      for (const p of projects) {
        try {
          const ctx = await dataService.getProjectContext(p.id);
          results.push({ project: p, context: ctx });
        } catch {
          results.push({ project: p, context: null });
        }
      }
      if (isMounted) {
        setProjectData(results);
        setLoadingContexts(false);
      }
    }

    loadAllProjectContexts();
    return () => {
      isMounted = false;
    };
  }, [projects]);

  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return projectData;
    const q = searchQuery.toLowerCase();
    return projectData.filter(({ project }) => {
      const matchTitle = project.title.toLowerCase().includes(q);
      const matchContent = project.content?.toLowerCase().includes(q);
      const matchTag = project.tags?.some(t => t.toLowerCase().includes(q));
      return matchTitle || matchContent || matchTag;
    });
  }, [projectData, searchQuery]);

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const metadata: ProjectMetadata = {
        emoji: newEmoji,
        color: newColor,
        status: 'active',
        description: newDesc.trim(),
      };
      const created = await dataService.createItem({
        type: 'project',
        title: newTitle.trim(),
        content: newDesc.trim(),
        metadata,
      });
      await refreshItems();
      setShowNewModal(false);
      setNewTitle('');
      setNewDesc('');
      router.push(`/track/${created.id}`);
    } catch (err) {
      console.error('Failed to create project', err);
    } finally {
      setCreating(false);
    }
  }

  async function handleLoadSample() {
    try {
      await dataService.loadSampleData();
      await refreshItems();
    } catch (err) {
      console.error('Failed to load sample project', err);
    }
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTitleRow}>
          <div className={styles.titleGroup}>
            <div className={styles.iconBadge}>
              <Folder size={22} />
            </div>
            <div>
              <h1 className={styles.title}>Projects</h1>
              <p className={styles.subtitle}>
                Organize your work into cohesive initiatives. Every task, note, and expense connected in context.
              </p>
            </div>
          </div>

          <div className={styles.headerActions}>
            <button
              className="btn btn-primary"
              onClick={() => setShowNewModal(true)}
              id="btn-projects-new"
            >
              <Plus size={16} />
              <span>New Project</span>
            </button>
          </div>
        </div>

        {/* Search */}
        <div className={styles.searchBar}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search projects by name, goal, or tags…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            id="input-projects-search"
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
      </div>

      {/* Main Content */}
      <div className={styles.content}>
        {projects.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <Folder size={44} />
            </div>
            <h2 className={styles.emptyTitle}>No Projects Yet</h2>
            <p className={styles.emptySubtitle}>
              Projects connect your daily tasks, notes, habits, and expenses into focused outcomes.
            </p>
            <div className={styles.emptyActions}>
              <button
                className="btn btn-primary"
                onClick={() => setShowNewModal(true)}
              >
                <Plus size={16} />
                <span>Create First Project</span>
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleLoadSample}
              >
                <Sparkles size={16} />
                <span>Load Sample Project</span>
              </button>
            </div>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptySubtitle}>
              No projects found matching &quot;{searchQuery}&quot;.
            </p>
          </div>
        ) : (
          <div className={styles.projectGrid}>
            {filteredProjects.map(({ project, context }) => {
              const meta = (project.metadata || {}) as ProjectMetadata;
              const emoji = meta.emoji || '📁';
              const color = meta.color || '#6366f1';
              const openTasks = context?.openTasksCount ?? 0;
              const completedTasks = context?.completedTasksCount ?? 0;
              const totalTasks = openTasks + completedTasks;
              const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
              const notesCount = context?.notes.length ?? 0;
              const expensesTotal = context?.totalExpenses ?? 0;
              const trackersCount = context?.trackers.length ?? 0;

              return (
                <Link
                  key={project.id}
                  href={`/track/${project.id}`}
                  className={styles.projectCard}
                  style={{ '--project-accent': color } as React.CSSProperties}
                >
                  <div className={styles.cardAccentBar} />

                  <div className={styles.cardHeader}>
                    <div className={styles.cardTitleGroup}>
                      <span className={styles.projectEmoji}>{emoji}</span>
                      <h3 className={styles.projectTitle}>{project.title}</h3>
                    </div>
                    <ArrowRight size={16} className={styles.cardArrow} />
                  </div>

                  {project.content && (
                    <p className={styles.projectDesc}>{project.content}</p>
                  )}

                  {/* Task Progress */}
                  <div className={styles.progressSection}>
                    <div className={styles.progressHeader}>
                      <span className={styles.progressLabel}>
                        <CheckCircle2 size={13} />
                        <span>Tasks</span>
                      </span>
                      <span className={styles.progressValue}>
                        {completedTasks} / {totalTasks} ({progressPct}%)
                      </span>
                    </div>
                    <div className={styles.progressBar}>
                      <div
                        className={styles.progressFill}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Metrics Row */}
                  <div className={styles.metricsRow}>
                    <div className={styles.metricItem} title={`${notesCount} linked notes`}>
                      <FileText size={13} className={styles.metricIcon} />
                      <span>{notesCount} notes</span>
                    </div>

                    {expensesTotal > 0 && (
                      <div className={styles.metricItem} title={`Total tracked expenses: ₹${expensesTotal.toLocaleString('en-IN')}`}>
                        <DollarSign size={13} className={styles.metricIcon} />
                        <span>₹{expensesTotal.toLocaleString('en-IN')}</span>
                      </div>
                    )}

                    {trackersCount > 0 && (
                      <div className={styles.metricItem} title={`${trackersCount} active trackers`}>
                        <TrendingUp size={13} className={styles.metricIcon} />
                        <span>{trackersCount} tracker{trackersCount > 1 ? 's' : ''}</span>
                      </div>
                    )}
                  </div>

                  {/* Tags */}
                  {project.tags && project.tags.length > 0 && (
                    <div className={styles.tagsRow}>
                      {project.tags.map(t => (
                        <span key={t} className={styles.tagPill}>
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* New Project Modal */}
      {showNewModal && (
        <div className={styles.modalOverlay} onClick={() => setShowNewModal(false)}>
          <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Create New Project</h3>
              <button
                className={styles.closeBtn}
                onClick={() => setShowNewModal(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className={styles.modalForm}>
              <div className={styles.formRow}>
                <div className={styles.emojiPickerWrap}>
                  <label className={styles.formLabel}>Emoji</label>
                  <input
                    type="text"
                    className={styles.emojiInput}
                    value={newEmoji}
                    maxLength={2}
                    onChange={e => setNewEmoji(e.target.value)}
                  />
                </div>
                <div className={styles.titleInputWrap}>
                  <label className={styles.formLabel}>Project Name</label>
                  <input
                    type="text"
                    className={styles.textInput}
                    placeholder="e.g. YouTube Channel, Home Renovation"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Description / Target Outcome</label>
                <textarea
                  className={styles.textareaInput}
                  placeholder="What does success look like for this initiative?"
                  rows={3}
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Accent Color</label>
                <div className={styles.colorPills}>
                  {['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ef4444'].map(c => (
                    <button
                      key={c}
                      type="button"
                      className={`${styles.colorPill} ${newColor === c ? styles.colorPillActive : ''}`}
                      style={{ backgroundColor: c }}
                      onClick={() => setNewColor(c)}
                    />
                  ))}
                </div>
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowNewModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={creating || !newTitle.trim()}
                >
                  {creating ? 'Creating…' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
