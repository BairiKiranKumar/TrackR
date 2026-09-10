'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Moon, Sun, Database, RefreshCw, Wifi,
  Download, Upload, ChevronRight, LogOut, Trash2,
  Sparkles, ShieldCheck, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { useAppContext } from '@/components/providers/AppProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { dataService } from '@/lib/services/DataService';
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

      {/* Database */}
      <section className={styles.section}>
        <div className="section-header">
          <span className="section-title">Database</span>
        </div>
        <div className={styles.card}>
          <div className={styles.syncStatus}>
            {userConfig ? (
              <>
                <div className={styles.statusBadge} data-status="connected">
                  <Wifi size={14} /> Personal Supabase Connected
                </div>
                <span className={styles.lastSynced}>
                  {userConfig.supabase_url.replace('https://', '').split('.supabase')[0]}.supabase.co
                </span>
                <p className={styles.statusDesc}>
                  Your data syncs to your personal Supabase database automatically and works offline too.
                </p>
              </>
            ) : (
              <>
                <div className={styles.statusBadge} data-status="local">
                  <Database size={14} /> No Database Connected
                </div>
                <p className={styles.statusDesc}>
                  Connect your personal Supabase project to sync data across all your devices.
                </p>
              </>
            )}
          </div>
          <div className={styles.connectedActions}>
            {userConfig ? (
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => router.push('/auth/setup')}
                id="btn-change-db"
              >
                <RefreshCw size={16} /> Change Database
              </button>
            ) : (
              <button
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={() => router.push('/auth/setup')}
                id="btn-connect-db"
              >
                <Wifi size={16} /> Connect Database
              </button>
            )}
          </div>
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
                Wipe all demo & created items from local storage and Supabase
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
            TRACKR runs deterministically in your browser using IndexedDB. No external AI APIs,
            no vector databases, and no hidden tracking. When configured, cloud sync transmits directly
            to your own private Supabase instance.
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
