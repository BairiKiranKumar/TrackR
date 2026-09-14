'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Plus, FolderKanban, Wallet, Sparkles, X, ArrowRight, Database } from 'lucide-react';
import { dataService } from '@/lib/services/DataService';
import { useAppContext } from '@/components/providers/AppProvider';
import styles from './ContextualOnboarding.module.css';

export function ContextualOnboarding({ onDismiss }: { onDismiss?: () => void }) {
  const { refreshItems } = useAppContext();
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('trackr_onboarding_dismissed') === 'true';
    }
    return true;
  });
  const [loadingSample, setLoadingSample] = useState(false);

  function handleDismiss() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('trackr_onboarding_dismissed', 'true');
    }
    setDismissed(true);
    onDismiss?.();
  }

  function handleOpenCapture() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('trackr:open-capture'));
    }
  }

  async function handleLoadSample() {
    setLoadingSample(true);
    try {
      await dataService.loadSampleData();
      await refreshItems();
      handleDismiss();
    } catch {
      // ignore
    } finally {
      setLoadingSample(false);
    }
  }

  if (dismissed) return null;

  return (
    <div className={styles.container} id="contextual-onboarding">
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <div className={styles.badge}>
            <Sparkles size={12} /> Getting Started
          </div>
          <h2 className={styles.title}>Your Personal Operating System</h2>
          <p className={styles.subtitle}>
            Welcome to TRACKR. Write notes, manage tasks, track habits, and manage finances — all connected under one context graph.
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className={styles.dismissBtn}
          title="Dismiss guide"
          aria-label="Dismiss onboarding guide"
        >
          <X size={18} />
        </button>
      </div>

      <div className={styles.stepsGrid}>
        <div className={styles.stepCard}>
          <div className={styles.stepIconWrap} style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
            <Plus size={20} />
          </div>
          <h3 className={styles.stepTitle}>1. Capture Anything Instantly</h3>
          <p className={styles.stepDesc}>
            Press <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 5px', borderRadius: 4, fontFamily: 'monospace' }}>C</kbd> anywhere or tap Capture to jot down a thought, record a task, or log an expense without switching tabs.
          </p>
          <button
            onClick={handleOpenCapture}
            className={styles.stepAction}
            id="btn-onboarding-capture"
          >
            Open Capture <ArrowRight size={13} />
          </button>
        </div>

        <div className={styles.stepCard}>
          <div className={styles.stepIconWrap} style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa' }}>
            <FolderKanban size={20} />
          </div>
          <h3 className={styles.stepTitle}>2. Structure in Projects</h3>
          <p className={styles.stepDesc}>
            Group tasks, notes, and milestones into Projects. Connect habits and trackers to overarching Goals to measure real progress.
          </p>
          <Link href="/projects" className={styles.stepAction} id="btn-onboarding-projects">
            Explore Projects <ArrowRight size={13} />
          </Link>
        </div>

        <div className={styles.stepCard}>
          <div className={styles.stepIconWrap} style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
            <Wallet size={20} />
          </div>
          <h3 className={styles.stepTitle}>3. Connect Money to Context</h3>
          <p className={styles.stepDesc}>
            Track accounts, budgets, and transactions. Link expenses directly to projects and goals to see the financial reality of what you build.
          </p>
          <Link href="/money" className={styles.stepAction} id="btn-onboarding-money">
            Open Money <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      <div className={styles.footer}>
        <button
          onClick={handleLoadSample}
          disabled={loadingSample}
          className={styles.sampleBtn}
          id="btn-onboarding-sample"
        >
          <Database size={14} />
          {loadingSample ? 'Loading Demo Workspace…' : 'Load Sample Workspace (Demo Data)'}
        </button>

        <button onClick={handleDismiss} className={styles.skipLink}>
          Skip Guide
        </button>
      </div>
    </div>
  );
}
