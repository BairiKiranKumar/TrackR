'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, Link2, Check, AlertCircle } from 'lucide-react';
import { RelationType, isValidRelation } from '@/types';
import { contextGraphService } from '@/lib/services/ContextGraphService';
import styles from './AddRelationModal.module.css';

interface AddRelationModalProps {
  sourceId: string;
  sourceType: string;
  sourceTitle?: string;
  isOpen: boolean;
  onClose: () => void;
  onLinked: () => void;
}

interface Candidate {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
}

const ALL_RELATIONS: { value: RelationType; label: string }[] = [
  { value: 'belongs_to', label: 'Belongs to (Parent/Container)' },
  { value: 'supports', label: 'Supports (Contributes progress)' },
  { value: 'funds', label: 'Funds (Financial backing)' },
  { value: 'depends_on', label: 'Depends on (Blocked until complete)' },
  { value: 'blocks', label: 'Blocks (Prevents target completion)' },
  { value: 'references', label: 'References (Mentions/Links)' },
  { value: 'related_to', label: 'Related to (Contextual connection)' },
];

export function AddRelationModal({
  sourceId,
  sourceType,
  sourceTitle,
  isOpen,
  onClose,
  onLinked,
}: AddRelationModalProps) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [selectedRelType, setSelectedRelType] = useState<RelationType>('related_to');
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    setSearch('');
    setSelectedCandidate(null);
    setError(null);
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;

    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await contextGraphService.searchLinkableEntities(search, sourceId);
        if (active) {
          setCandidates(results);
          setLoading(false);
        }
      } catch (err) {
        if (active) {
          console.error('Failed to search linkable entities:', err);
          setLoading(false);
        }
      }
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search, isOpen, sourceId]);

  const filteredCandidates = useMemo(() => {
    if (activeTab === 'all') return candidates;
    return candidates.filter(c => {
      if (activeTab === 'task') return c.type === 'task';
      if (activeTab === 'project') return c.type === 'project';
      if (activeTab === 'note') return c.type === 'note' || c.type === 'journal';
      if (activeTab === 'goal') return c.type === 'goal';
      if (activeTab === 'tracker') return c.type === 'tracker' || c.type === 'habit';
      if (activeTab === 'finance') return c.type === 'transaction' || c.type === 'budget';
      return true;
    });
  }, [candidates, activeTab]);

  // Dynamically calculate valid relation types for this candidate
  const availableRelations = useMemo(() => {
    if (!selectedCandidate) return [];
    return ALL_RELATIONS.filter(rel =>
      isValidRelation(sourceType, rel.value, selectedCandidate.type)
    );
  }, [selectedCandidate, sourceType]);

  function handleSelectCandidate(c: Candidate) {
    setSelectedCandidate(c);
    setError(null);
    const valids = ALL_RELATIONS.filter(rel => isValidRelation(sourceType, rel.value, c.type));
    if (c.type === 'project' && valids.some(r => r.value === 'belongs_to')) {
      setSelectedRelType('belongs_to');
    } else if (c.type === 'goal' && valids.some(r => r.value === 'supports')) {
      setSelectedRelType('supports');
    } else if (valids.some(r => r.value === 'related_to')) {
      setSelectedRelType('related_to');
    } else if (valids.length > 0) {
      setSelectedRelType(valids[0].value);
    }
  }

  if (!isOpen) return null;

  async function handleLink() {
    if (!selectedCandidate) return;
    setLinking(true);
    setError(null);

    const res = await contextGraphService.link(
      sourceId,
      sourceType,
      selectedCandidate.id,
      selectedCandidate.type,
      selectedRelType
    );

    if (!res.success) {
      setError(res.error || 'Failed to create relationship.');
      setLinking(false);
      return;
    }

    setLinking(false);
    handleClose();
    onLinked();
  }

  return (
    <div className={styles.overlay} onClick={handleClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <h3 className={styles.headerTitle}>
            Link Context to {sourceTitle ? `"${sourceTitle}"` : sourceType}
          </h3>
          <button className={styles.closeBtn} onClick={handleClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Search box */}
          <div className={styles.searchBox}>
            <Search size={16} className={styles.searchIcon} />
            <input
              id="input-link-modal-search"
              type="text"
              placeholder="Search tasks, projects, notes, goals, expenses…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className={styles.searchInput}
              autoFocus
            />
          </div>

          {/* Type tabs */}
          <div className={styles.tabs}>
            {[
              { id: 'all', label: 'All' },
              { id: 'project', label: 'Projects' },
              { id: 'task', label: 'Tasks' },
              { id: 'goal', label: 'Goals' },
              { id: 'note', label: 'Notes' },
              { id: 'tracker', label: 'Trackers' },
              { id: 'finance', label: 'Finance' },
            ].map(tab => (
              <button
                key={tab.id}
                className={`${styles.tabBtn} ${activeTab === tab.id ? styles.activeTab : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Candidates list */}
          <div className={styles.candidatesList}>
            {loading ? (
              <div className={styles.emptyCandidates}>Searching connected entities…</div>
            ) : filteredCandidates.length === 0 ? (
              <div className={styles.emptyCandidates}>No matching entities found.</div>
            ) : (
              filteredCandidates.map(c => {
                const isSelected = selectedCandidate?.id === c.id;
                return (
                  <div
                    key={c.id}
                    className={`${styles.candidateRow} ${isSelected ? styles.selectedCandidate : ''}`}
                    onClick={() => handleSelectCandidate(c)}
                  >
                    <div className={styles.candidateInfo}>
                      <span className={styles.candidateTitle}>{c.title}</span>
                      <span className={styles.candidateMeta}>{c.subtitle || c.type.toUpperCase()}</span>
                    </div>
                    {isSelected && <Check size={16} color="var(--accent-purple, #8b5cf6)" />}
                  </div>
                );
              })
            )}
          </div>

          {/* Configuration step if candidate selected */}
          {selectedCandidate && (
            <div className={styles.configStep}>
              <span className={styles.configLabel}>
                Relationship: {sourceType} → {selectedCandidate.type}
              </span>
              {availableRelations.length === 0 ? (
                <div className={styles.errorMessage}>
                  No valid relationship types permitted between {sourceType} and {selectedCandidate.type}.
                </div>
              ) : (
                <select
                  id="select-relation-type"
                  value={selectedRelType}
                  onChange={e => setSelectedRelType(e.target.value as RelationType)}
                  className={styles.relSelect}
                >
                  {availableRelations.map(r => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {error && (
            <div className={styles.errorMessage}>
              <AlertCircle size={14} style={{ display: 'inline', marginRight: 6 }} />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button className="btn btn-secondary" onClick={handleClose}>
            Cancel
          </button>
          <button
            id="btn-confirm-link"
            className="btn btn-primary"
            disabled={!selectedCandidate || availableRelations.length === 0 || linking}
            onClick={handleLink}
          >
            <Link2 size={15} />
            <span>{linking ? 'Linking…' : 'Link Context'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
