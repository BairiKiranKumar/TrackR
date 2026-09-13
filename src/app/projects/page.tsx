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
  Package,
  ArrowRight,
  TrendingUp,
  X,
  Calendar,
  Clock,
  Zap,
} from 'lucide-react';
import { useAppContext } from '@/components/providers/AppProvider';
import { dataService } from '@/lib/services/DataService';
import { Item, ProjectContextSummary, ProjectMetadata, ProjectStatus } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { Button, Modal, Badge, EmptyState } from '@/components/ui';
import styles from './page.module.css';

interface ProjectWithContext {
  project: Item;
  context: ProjectContextSummary | null;
}

const STATUS_LABELS: Record<ProjectStatus, { label: string; variant: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info' }> = {
  active: { label: 'Active', variant: 'primary' },
  on_hold: { label: 'On Hold', variant: 'warning' },
  completed: { label: 'Completed', variant: 'success' },
  paused: { label: 'Paused', variant: 'default' },
  archived: { label: 'Archived', variant: 'default' },
};

export default function ProjectsPage() {
  const router = useRouter();
  const { items, refreshItems } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [projectData, setProjectData] = useState<ProjectWithContext[]>([]);

  // New project modal state
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newStatus, setNewStatus] = useState<ProjectStatus>('active');
  const [newTargetDate, setNewTargetDate] = useState('');
  const [newColor, setNewColor] = useState('#8b5cf6');
  const [creating, setCreating] = useState(false);

  const projects = useMemo(() => {
    return items
      .filter(item => item.type === 'project' && !item.archived)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [items]);

  useEffect(() => {
    let isMounted = true;
    async function loadAllProjectContexts() {
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
        color: newColor,
        status: newStatus,
        targetDate: newTargetDate.trim() || undefined,
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
      setNewTargetDate('');
      router.push(`/projects/${created.id}`);
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
          <div>
            <h1 className={styles.title}>Projects</h1>
            <p className={styles.subtitle}>
              Unified initiatives connecting tasks, notes, goals, trackers, and financials in context.
            </p>
          </div>

          <div className={styles.headerActions}>
            <Button
              variant="primary"
              onClick={() => setShowNewModal(true)}
              id="btn-projects-new"
            >
              <Plus size={15} />
              <span>New Project</span>
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className={styles.searchBar}>
          <Search size={15} className={styles.searchIcon} />
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Filter projects by title, description, or tag…"
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
          <EmptyState
            icon={<Folder size={32} />}
            title="No projects yet"
            description="Create your first project to organize tasks, notes, trackers, and expenses into focused outcomes."
            action={
              <div className={styles.emptyActions}>
                <Button variant="primary" onClick={() => setShowNewModal(true)}>
                  <Plus size={15} />
                  <span>Create First Project</span>
                </Button>
                <Button variant="secondary" onClick={handleLoadSample}>
                  <Package size={15} />
                  <span>Load Sample Project</span>
                </Button>
              </div>
            }
          />
        ) : filteredProjects.length === 0 ? (
          <EmptyState
            title="No matching projects"
            description={`No projects found matching "${searchQuery}".`}
            action={
              <Button variant="secondary" onClick={() => setSearchQuery('')}>
                Clear Filter
              </Button>
            }
          />
        ) : (
          <div className={styles.projectList}>
            {filteredProjects.map(({ project, context }) => {
              const meta = (project.metadata || {}) as ProjectMetadata;
              const color = meta.color || 'var(--accent-primary)';
              const status: ProjectStatus = meta.status || 'active';
              const statusConfig = STATUS_LABELS[status] || STATUS_LABELS.active;

              const openTasks = context?.openTasksCount ?? 0;
              const completedTasks = context?.completedTasksCount ?? 0;
              const totalTasks = openTasks + completedTasks;
              const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
              const notesCount = context?.notes.length ?? 0;
              const expensesTotal = context?.totalExpenses ?? 0;
              const trackersCount = context?.trackers.length ?? 0;
              const goalsCount = context?.goals.length ?? 0;

              // Top actionable next task
              const nextAction = context?.nextActions?.[0];

              return (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className={styles.projectRow}
                >
                  <div
                    className={styles.colorStrip}
                    style={{ backgroundColor: color }}
                  />

                  <div className={styles.rowMain}>
                    {/* Top line: Title, Status, Progress */}
                    <div className={styles.rowHeader}>
                      <div className={styles.titleArea}>
                        <h2 className={styles.projectTitle}>{project.title}</h2>
                        <Badge variant={statusConfig.variant} size="sm">
                          {statusConfig.label}
                        </Badge>
                      </div>

                      <div className={styles.rowTopRight}>
                        {totalTasks > 0 && (
                          <span className={styles.progressPercent}>
                            {progressPct}%
                          </span>
                        )}
                        <ArrowRight size={15} className={styles.rowArrow} />
                      </div>
                    </div>

                    {/* Next Action unblocked row */}
                    {nextAction && (
                      <div className={styles.nextActionRow}>
                        <Zap size={13} className={styles.nextActionIcon} />
                        <span className={styles.nextActionLabel}>Next:</span>
                        <span className={styles.nextActionTitle}>{nextAction.title}</span>
                      </div>
                    )}

                    {/* Description excerpt */}
                    {project.content && !nextAction && (
                      <p className={styles.projectDesc}>{project.content}</p>
                    )}

                    {/* Context Metrics and Info */}
                    <div className={styles.contextMetrics}>
                      <div className={styles.metricItem} title={`${completedTasks} of ${totalTasks} tasks completed`}>
                        <CheckCircle2 size={13} className={styles.metricIcon} />
                        <span>
                          {totalTasks > 0 ? `${completedTasks}/${totalTasks} tasks` : '0 tasks'}
                        </span>
                      </div>

                      {notesCount > 0 && (
                        <div className={styles.metricItem} title={`${notesCount} connected notes`}>
                          <FileText size={13} className={styles.metricIcon} />
                          <span>{notesCount} note{notesCount !== 1 ? 's' : ''}</span>
                        </div>
                      )}

                      {expensesTotal > 0 && (
                        <div className={styles.metricItem} title={`Total tracked expenses: ₹${expensesTotal.toLocaleString('en-IN')}`}>
                          <DollarSign size={13} className={styles.metricIcon} />
                          <span className={styles.monoNumber}>₹{expensesTotal.toLocaleString('en-IN')}</span>
                        </div>
                      )}

                      {trackersCount > 0 && (
                        <div className={styles.metricItem} title={`${trackersCount} connected trackers`}>
                          <TrendingUp size={13} className={styles.metricIcon} />
                          <span>{trackersCount} tracker{trackersCount > 1 ? 's' : ''}</span>
                        </div>
                      )}

                      {goalsCount > 0 && (
                        <div className={styles.metricItem} title={`${goalsCount} linked goals`}>
                          <span>{goalsCount} goal{goalsCount > 1 ? 's' : ''}</span>
                        </div>
                      )}

                      {meta.targetDate && (
                        <div className={styles.metricItem} title={`Target date: ${meta.targetDate}`}>
                          <Calendar size={12} className={styles.metricIcon} />
                          <span>{meta.targetDate}</span>
                        </div>
                      )}

                      <div className={styles.metricSpacer} />

                      <div className={styles.updatedAt} title={`Updated ${new Date(project.updatedAt).toLocaleString()}`}>
                        <Clock size={11} />
                        <span>{formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}</span>
                      </div>
                    </div>

                    {/* Hairline progress bar */}
                    {totalTasks > 0 && (
                      <div className={styles.hairlineBar}>
                        <div
                          className={styles.hairlineFill}
                          style={{
                            width: `${progressPct}%`,
                            backgroundColor: color,
                          }}
                        />
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* New Project Modal */}
      <Modal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        title="Create New Project"
        description="Organize related tasks, notes, goals, and expenses into a focused initiative."
        footer={
          <div className={styles.modalFooter}>
            <Button
              variant="secondary"
              onClick={() => setShowNewModal(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateProject}
              disabled={creating || !newTitle.trim()}
              loading={creating}
            >
              Create Project
            </Button>
          </div>
        }
      >
        <form onSubmit={handleCreateProject} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="project-title-input">
              Project Name <span className={styles.requiredStar}>*</span>
            </label>
            <input
              id="project-title-input"
              type="text"
              className={styles.formInput}
              placeholder="e.g. Website Overhaul, Tax Filing 2026, Q3 Hiring"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel} htmlFor="project-desc-input">
              Outcome & Scope
            </label>
            <textarea
              id="project-desc-input"
              className={styles.formTextarea}
              placeholder="What does success look like for this initiative?"
              rows={3}
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
            />
          </div>

          <div className={styles.formRow}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="project-status-select">
                Initial Status
              </label>
              <select
                id="project-status-select"
                className={styles.formSelect}
                value={newStatus}
                onChange={e => setNewStatus(e.target.value as ProjectStatus)}
              >
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="project-target-date">
                Target Date
              </label>
              <input
                id="project-target-date"
                type="date"
                className={styles.formInput}
                value={newTargetDate}
                onChange={e => setNewTargetDate(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Accent Color</label>
            <div className={styles.colorPills}>
              {['#8b5cf6', '#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#ef4444'].map(c => (
                <button
                  key={c}
                  type="button"
                  className={`${styles.colorPill} ${newColor === c ? styles.colorPillActive : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setNewColor(c)}
                  aria-label={`Select color ${c}`}
                />
              ))}
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
