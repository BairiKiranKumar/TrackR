'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Moon, Sun, Cloud, RefreshCw,
  Download, Upload, ChevronRight, LogOut, Trash2,
  Sparkles, ShieldCheck, CheckCircle2, AlertCircle, Settings2,
} from 'lucide-react';
import { useAppContext } from '@/components/providers/AppProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { dataService } from '@/lib/services/DataService';
import { storageModeService } from '@/lib/services/StorageModeService';
import { StorageMode } from '@/types';
import styles from './page.module.css';

export default function SettingsPage() {
  const router = useRouter();
  const { theme, toggleTheme, refreshItems } = useAppContext();
  const { user, userConfig, signOut } = useAuth();
  const [clearing, setClearing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [importFeedback, setImportFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Storage mode (TRACKR Cloud vs. advanced BYODB) ──────────────────────
  const [storageMode, setStorageMode] = useState<StorageMode>('trackr_cloud');
  const [needsMigrationChoice, setNeedsMigrationChoice] = useState(false);
  const [switchTarget, setSwitchTarget] = useState<StorageMode | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrationDone, setMigrationDone] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const [mode, needsChoice] = await Promise.all([
        storageModeService.getEffectiveMode(),
        storageModeService.needsMigrationChoice(),
      ]);
      if (!active) return;
      setStorageMode(mode);
      setNeedsMigrationChoice(needsChoice);
    })();
    return () => { active = false; };
  }, [userConfig]);

  async function resolveMigrationChoice(target: StorageMode) {
    await storageModeService.setMode(target);
    setStorageMode(target);
    setNeedsMigrationChoice(false);
  }

  function handleSelectStorage(target: StorageMode) {
    if (target === storageMode) return;
    if (target === 'custom_supabase' && !userConfig) {
      // Never configured before — the setup wizard tests the connection and
      // sets the mode itself once it succeeds, so there's nothing to switch yet.
      router.push('/auth/setup');
      return;
    }
    setSwitchTarget(target);
  }

  async function confirmSwitch(moveExistingData: boolean) {
    if (!switchTarget) return;
    const target = switchTarget;
    await storageModeService.setMode(target);
    setStorageMode(target);
    setSwitchTarget(null);
    if (moveExistingData) {
      setMigrating(true);
      setMigrationDone(false);
      try {
        await dataService.migrateAllLocalDataToActiveProvider();
        setMigrationDone(true);
      } finally {
        setMigrating(false);
      }
    }
  }

  async function handleExport() {
    const data = await dataService.exportFullData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trackr-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportFeedback(null);
    try {
      const text = await file.text();
      const res = await dataService.importFullData(text);
      if (res.success) {
        await refreshItems();
        setImportFeedback({
          success: true,
          message: `Successfully imported ${res.itemsCount} items and ${res.relationsCount} relations.`,
        });
      } else {
        setImportFeedback({
          success: false,
          message: res.error || 'Failed to validate imported file structure.',
        });
      }
    } catch (err: unknown) {
      setImportFeedback({
        success: false,
        message: err instanceof Error ? err.message : 'Error reading file.',
      });
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleLoadSample() {
    setSampleLoading(true);
    try {
      const res = await dataService.loadSampleData();
      await refreshItems();
      alert(`Loaded sample "YouTube Channel" dataset (${res.itemsCount} items, ${res.relationsCount} relations).`);
    } catch (err) {
      console.error('Failed to load sample data', err);
      alert('Failed to load sample dataset.');
    } finally {
      setSampleLoading(false);
    }
  }

  async function handleClearAllData() {
    const confirmed = window.confirm(
      '⚠️ WARNING: Are you sure you want to clear ALL data?\n\nThis will permanently delete all tasks, notes, trackers, budgets, transactions, and links from both this device and Supabase. This action cannot be undone.'
    );
    if (!confirmed) return;
    const doubleConfirmed = window.prompt(
      'Type CLEAR to confirm wiping all data:'
    );
    if (doubleConfirmed !== 'CLEAR') {
      alert('Clear cancelled: confirmation phrase did not match.');
      return;
    }

    setClearing(true);
    try {
      await dataService.clearAllData();
      await refreshItems();
      alert('All data has been cleared.');
    } catch (err) {
      console.error('Clear error:', err);
      alert('Failed to clear all data. Check console for details.');
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
      </div>

      {/* Account */}
      {user && (
        <section className={styles.section}>
          <div className="section-header">
            <span className="section-title">Account</span>
          </div>
          <div className={styles.card}>
            <div className={styles.accountRow}>
              <div className={styles.avatar}>
                {user.user_metadata?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.user_metadata.avatar_url} alt="Avatar" className={styles.avatarImg} />
                ) : (
                  <span className={styles.avatarInitial}>{user.email?.[0]?.toUpperCase() ?? 'U'}</span>
                )}
              </div>
              <div className={styles.accountInfo}>
                <span className={styles.accountName}>
                  {user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email?.split('@')[0] ?? 'User'}
                </span>
                <span className={styles.accountEmail}>{user.email}</span>
              </div>
            </div>
            <div className={styles.accountDivider} />
            <button
              className={styles.signOutBtn}
              onClick={signOut}
              id="btn-sign-out"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        </section>
      )}

      {/* Storage */}
      <section className={styles.section}>
        <div className="section-header">
          <span className="section-title">Storage</span>
        </div>
        <div className={styles.card} style={{ padding: '16px' }}>
          {needsMigrationChoice && (
            <div
              role="alert"
              style={{
                marginBottom: 14, padding: '12px 14px', borderRadius: 10,
                background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.25)',
              }}
            >
              <p style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                We found data stored in your connected Supabase database.
              </p>
              <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Choose where TRACKR should store your future data.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => resolveMigrationChoice('custom_supabase')} id="btn-migration-keep-custom">
                  Continue with my Supabase
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => resolveMigrationChoice('trackr_cloud')} id="btn-migration-move-cloud">
                  Move to TRACKR Cloud
                </button>
              </div>
            </div>
          )}

          {switchTarget && (
            <div
              role="alertdialog"
              aria-label="Confirm storage change"
              style={{
                marginBottom: 14, padding: '12px 14px', borderRadius: 10,
                background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)',
              }}
              onKeyDown={e => { if (e.key === 'Escape') setSwitchTarget(null); }}
            >
              <p style={{ margin: '0 0 4px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Switch to {switchTarget === 'trackr_cloud' ? 'TRACKR Cloud' : 'my own Supabase'}?
              </p>
              <p style={{ margin: '0 0 10px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Future data will be saved there instead. Your existing data isn&apos;t moved automatically.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-primary btn-sm" onClick={() => confirmSwitch(true)} id="btn-switch-move-data">
                  Move my existing data
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => confirmSwitch(false)} id="btn-switch-keep-data">
                  Keep existing data where it is
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setSwitchTarget(null)} id="btn-switch-cancel">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {migrating && (
            <div style={{ marginBottom: 14, fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <RefreshCw size={14} /> Moving your data…
            </div>
          )}
          {migrationDone && !migrating && (
            <div style={{ marginBottom: 14, fontSize: '0.8rem', color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={14} /> Your existing data has been queued to move — it&apos;ll finish syncing shortly.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label
              style={{
                display: 'flex', gap: 10, padding: '12px', borderRadius: 10, cursor: 'pointer',
                border: `1px solid ${storageMode === 'trackr_cloud' ? 'var(--accent-primary, #6366f1)' : 'var(--border-subtle)'}`,
              }}
            >
              <input
                type="radio"
                name="storage-mode"
                checked={storageMode === 'trackr_cloud'}
                onChange={() => handleSelectStorage('trackr_cloud')}
                id="radio-storage-trackr-cloud"
                style={{ marginTop: 3 }}
              />
              <span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  <Cloud size={15} /> TRACKR Cloud
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-success)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    Recommended
                  </span>
                </span>
                <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                  Your data is securely stored in your TRACKR account. No setup required.
                </span>
              </span>
            </label>

            <label
              style={{
                display: 'flex', gap: 10, padding: '12px', borderRadius: 10, cursor: 'pointer',
                border: `1px solid ${storageMode === 'custom_supabase' ? 'var(--accent-primary, #6366f1)' : 'var(--border-subtle)'}`,
              }}
            >
              <input
                type="radio"
                name="storage-mode"
                checked={storageMode === 'custom_supabase'}
                onChange={() => handleSelectStorage('custom_supabase')}
                id="radio-storage-custom"
                style={{ marginTop: 3 }}
              />
              <span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  <Settings2 size={15} /> My own Supabase
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    Advanced
                  </span>
                </span>
                <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                  {userConfig
                    ? `Store your TRACKR data in a Supabase project you control (${userConfig.supabase_url.replace('https://', '').split('.supabase')[0]}.supabase.co).`
                    : 'Store your TRACKR data in a Supabase project you control.'}
                </span>
              </span>
            </label>
          </div>

          {storageMode === 'custom_supabase' && (
            <button
              className="btn btn-secondary btn-sm"
              style={{ marginTop: 10 }}
              onClick={() => router.push('/auth/setup')}
              id="btn-manage-custom-storage"
            >
              <RefreshCw size={14} /> {userConfig ? 'Change my Supabase project' : 'Connect my Supabase project'}
            </button>
          )}
        </div>
      </section>

      {/* Appearance */}
      <section className={styles.section}>
        <div className="section-header">
          <span className="section-title">Appearance</span>
        </div>
        <div className={styles.card}>
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              {theme === 'dark'
                ? <Moon size={18} className={styles.settingIcon} />
                : <Sun size={18} className={styles.settingIcon} />
              }
              <div>
                <span className={styles.settingLabel}>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
                <span className={styles.settingSubtitle}>Toggle app theme</span>
              </div>
            </div>
            <button
              id="btn-toggle-theme"
              className={styles.toggle}
              data-active={theme === 'dark'}
              onClick={toggleTheme}
              aria-label="Toggle theme"
            >
              <span className={styles.toggleThumb} />
            </button>
          </div>
        </div>
      </section>

      {/* Data management */}
      <section className={styles.section}>
        <div className="section-header">
          <span className="section-title">Data Management</span>
        </div>
        <div className={styles.card}>
          {/* Export */}
          <button className={styles.actionRow} onClick={handleExport} id="btn-export-data">
            <Download size={18} className={styles.settingIcon} />
            <div className={styles.settingInfo2}>
              <span className={styles.settingLabel}>Export Full Backup</span>
              <span className={styles.settingSubtitle}>Download all items, relations, and history as JSON</span>
            </div>
            <ChevronRight size={16} className={styles.chevron} />
          </button>

          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '0 16px' }} />

          {/* Import */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileImport}
            accept=".json,application/json"
            style={{ display: 'none' }}
          />
          <button
            className={styles.actionRow}
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            id="btn-import-data"
          >
            <Upload size={18} className={styles.settingIcon} />
            <div className={styles.settingInfo2}>
              <span className={styles.settingLabel}>
                {importing ? 'Importing…' : 'Import Data Backup'}
              </span>
              <span className={styles.settingSubtitle}>
                Restore from a validated TRACKR JSON export file
              </span>
            </div>
            <ChevronRight size={16} className={styles.chevron} />
          </button>

          {importFeedback && (
            <div
              style={{
                margin: '8px 16px 14px 16px',
                padding: '10px 12px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.8rem',
                backgroundColor: importFeedback.success
                  ? 'rgba(16, 185, 129, 0.1)'
                  : 'rgba(239, 68, 68, 0.1)',
                color: importFeedback.success
                  ? 'var(--color-success, #10b981)'
                  : 'var(--color-danger, #ef4444)',
                border: `1px solid ${
                  importFeedback.success
                    ? 'rgba(16, 185, 129, 0.25)'
                    : 'rgba(239, 68, 68, 0.25)'
                }`,
              }}
            >
              {importFeedback.success ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{importFeedback.message}</span>
            </div>
          )}

          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '0 16px' }} />

          {/* Load Sample Data */}
          <button
            className={styles.actionRow}
            onClick={handleLoadSample}
            disabled={sampleLoading}
            id="btn-load-sample-data"
          >
            <Sparkles size={18} className={styles.settingIcon} />
            <div className={styles.settingInfo2}>
              <span className={styles.settingLabel}>
                {sampleLoading ? 'Loading…' : 'Load Sample Project & Data'}
              </span>
              <span className={styles.settingSubtitle}>
                Load the interconnected &quot;YouTube Channel&quot; demo with tasks, notes, expenses & backlinks
              </span>
            </div>
            <ChevronRight size={16} className={styles.chevron} />
          </button>

          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '0 16px' }} />

          {/* Clear All */}
          <button
            className={styles.actionRow}
            onClick={handleClearAllData}
            disabled={clearing}
            id="btn-clear-all-data"
            style={{ color: 'var(--color-danger)' }}
          >
            <Trash2 size={18} className={styles.settingIcon} style={{ color: 'var(--color-danger)' }} />
            <div className={styles.settingInfo2}>
              <span className={styles.settingLabel} style={{ color: 'var(--color-danger)' }}>
                {clearing ? 'Clearing Data…' : 'Clear All Data'}
              </span>
              <span className={styles.settingSubtitle}>
                Wipe all demo & created items from local storage and your cloud storage
              </span>
            </div>
            <ChevronRight size={16} className={styles.chevron} />
          </button>
        </div>
      </section>

      {/* Privacy & Architecture */}
      <section className={styles.section}>
        <div className="section-header">
          <span className="section-title">Privacy & Architecture</span>
        </div>
        <div className={styles.card} style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <ShieldCheck size={20} color="var(--primary, #6366f1)" />
            <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              100% Local-First & Private
            </strong>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
            TRACKR runs deterministically in your browser using IndexedDB — no external AI APIs, no
            vector databases, and no hidden tracking. Every action saves locally first, then syncs in
            the background to your chosen storage: TRACKR Cloud (isolated to your account by
            row-level security) by default, or your own Supabase project if you connect one.
          </p>
        </div>
      </section>

      {/* About */}
      <section className={styles.section}>
        <div className={styles.about}>
          <div className={styles.logo}>T</div>
          <span className={styles.appName}>TRACKR</span>
          <span className={styles.tagline}>Write it. Track it. Link it. Understand it.</span>
          <span className={styles.version}>v1.0.0 · Local-first + Supabase sync</span>
        </div>
      </section>

      <div style={{ height: 32 }} />
    </div>
  );
}
