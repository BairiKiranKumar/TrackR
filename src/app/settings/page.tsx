'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Moon, Sun, Cloud, RefreshCw,
  Download, Upload, ChevronRight, LogOut, Trash2,
  Package, CheckCircle2, AlertCircle, Settings2,
  Lock, Zap, Plug, Sliders, Mail, Link2, Unlink, Building2,
} from 'lucide-react';
import { useAppContext } from '@/components/providers/AppProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { useConfirm } from '@/components/providers/ConfirmDialogProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { dataService } from '@/lib/services/DataService';
import { storageModeService } from '@/lib/services/StorageModeService';
import { gmailAuthService } from '@/lib/services/integrations/gmail/GmailAuthService';
import { gmailAdapter } from '@/lib/services/integrations/gmail/GmailAdapter';
import { setuBankAuthService } from '@/lib/services/integrations/bank/SetuBankAuthService';
import { bankAdapter } from '@/lib/services/integrations/bank/BankAdapter';
import { StorageMode } from '@/types';
import { Button, Badge } from '@/components/ui';
import { AutomationSettings } from '@/components/settings/AutomationSettings';
import styles from './page.module.css';

export default function SettingsPage() {
  const router = useRouter();
  const { theme, toggleTheme, refreshItems } = useAppContext();
  const { user, userConfig, signOut } = useAuth();
  const confirm = useConfirm();
  const showToast = useToast();
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
  const [activeTab, setActiveTab] = useState<'general' | 'automation'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('tab') === 'automation') return 'automation';
    }
    return 'general';
  });

  // ── Gmail Integration State ──────────────────────────────────────────
  const [gmailState, setGmailState] = useState(() => gmailAuthService.getConnectionState());
  const [isGmailSyncing, setIsGmailSyncing] = useState(false);

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
      // Check for Google OAuth callback tokens in URL hash
      if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
        const res = gmailAuthService.handleOAuthCallback(window.location.hash);
        if (res.success) {
          if (active) setGmailState(gmailAuthService.getConnectionState());
          showToast('Gmail connected successfully!', 'success');
          window.history.replaceState(null, '', window.location.pathname);
        } else {
          showToast(`Gmail connection failed: ${res.error}`, 'error');
        }
      }
    })();

    return () => { active = false; };
  }, [userConfig, showToast]);

  async function handleConnectGmail() {
    // If client ID is unset (e.g. development/testing), use deterministic simulation
    if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) {
      gmailAuthService.simulateConnect(user?.email || 'user.beta@gmail.com');
      setGmailState(gmailAuthService.getConnectionState());
      showToast('Connected to Gmail (Simulation Mode). Ready to sync receipts!', 'success');
      return;
    }
    const { authUrl } = gmailAuthService.initiateOAuthFlow();
    window.location.href = authUrl;
  }

  async function handleSyncGmail() {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      showToast('Network offline. Gmail sync requires an internet connection.', 'error');
      return;
    }

    setIsGmailSyncing(true);
    try {
      const res = await gmailAdapter.sync();
      setGmailState(gmailAuthService.getConnectionState());
      if (res.success) {
        showToast(`Gmail sync complete: ${res.candidatesFound} new candidates, ${res.duplicatesSkipped} duplicates skipped.`, 'success');
      } else {
        showToast(res.error || 'Gmail sync failed.', 'error');
      }
    } catch {
      showToast('Gmail sync failed unexpectedly.', 'error');
    } finally {
      setIsGmailSyncing(false);
    }
  }

  async function handleDisconnectGmail() {
    const confirmed = await confirm({
      title: 'Disconnect Gmail?',
      message: 'This will stop syncing receipts and invoices from Gmail. Existing accepted transactions and pending review candidates will not be deleted.',
      confirmLabel: 'Disconnect',
      danger: false,
    });
    if (!confirmed) return;

    await gmailAuthService.disconnect();
    setGmailState(gmailAuthService.getConnectionState());
    showToast('Gmail disconnected.', 'info');
  }

  // ── Bank Integration State (Account Aggregator) ──────────────────────
  const [bankState, setBankState] = useState(() => setuBankAuthService.getConnectionState());
  const [isBankSyncing, setIsBankSyncing] = useState(false);

  async function handleConnectBank() {
    setuBankAuthService.simulateConnect({
      fipName: 'State Bank of India',
      accountMask: 'XXXXXXXX4012',
    });
    setBankState(setuBankAuthService.getConnectionState());
    showToast('Connected to State Bank of India via Setu AA (Simulation Mode). Ready to sync!', 'success');
  }

  async function handleSyncBank() {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      showToast('Network offline. Bank sync requires an internet connection.', 'error');
      return;
    }

    setIsBankSyncing(true);
    try {
      const res = await bankAdapter.sync();
      setBankState(setuBankAuthService.getConnectionState());
      if (res.success) {
        showToast(`Bank sync complete: ${res.candidatesFound} new candidates, ${res.duplicatesSkipped} duplicates skipped.`, 'success');
      } else {
        showToast(res.error || 'Bank sync failed.', 'error');
      }
    } catch {
      showToast('Bank sync failed unexpectedly.', 'error');
    } finally {
      setIsBankSyncing(false);
    }
  }

  async function handleDisconnectBank() {
    const confirmed = await confirm({
      title: 'Disconnect Bank Account?',
      message: 'This will revoke consent with Setu Account Aggregator. Existing accepted transactions and pending review candidates will not be deleted.',
      confirmLabel: 'Disconnect',
      danger: false,
    });
    if (!confirmed) return;

    await setuBankAuthService.disconnect();
    setBankState(setuBankAuthService.getConnectionState());
    showToast('Bank account disconnected.', 'info');
  }

  async function resolveMigrationChoice(target: StorageMode) {
    await storageModeService.setMode(target);
    setStorageMode(target);
    setNeedsMigrationChoice(false);
  }

  function handleSelectStorage(target: StorageMode) {
    if (target === storageMode) return;
    if (target === 'custom_supabase' && !userConfig) {
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
      showToast(`Loaded sample "YouTube Channel" dataset (${res.itemsCount} items, ${res.relationsCount} relations).`, 'success');
    } catch (err) {
      console.error('Failed to load sample data', err);
      showToast('Failed to load sample dataset.', 'error');
    } finally {
      setSampleLoading(false);
    }
  }

  async function handleClearAllData() {
    const confirmed = await confirm({
      title: 'Clear ALL data?',
      message: 'This permanently deletes every task, note, tracker, budget, transaction, and link from both this device and your cloud storage. This cannot be undone.',
      confirmLabel: 'Clear everything',
      danger: true,
      requirePhrase: 'CLEAR',
    });
    if (!confirmed) return;

    setClearing(true);
    try {
      await dataService.clearAllData();
      await refreshItems();
      showToast('All data has been cleared.', 'success');
    } catch (err) {
      console.error('Clear error:', err);
      showToast('Failed to clear all data. Check console for details.', 'error');
    } finally {
      setClearing(false);
    }
  }

  async function handleDeleteAccount() {
    const confirmed = await confirm({
      title: 'Delete Account & All Cloud Data?',
      message: 'This permanently erases all your data from TRACKR Cloud and this device, cancels your session, and returns you to sign-in. This action CANNOT be undone.',
      confirmLabel: 'Delete My Account',
      danger: true,
      requirePhrase: 'DELETE',
    });
    if (!confirmed) return;

    setClearing(true);
    try {
      await dataService.deleteAccountData();
      await signOut();
      showToast('Your account and all associated data have been permanently deleted.', 'info');
      router.replace('/auth');
    } catch (err) {
      console.error('Account delete error:', err);
      showToast('Failed to complete account deletion. Please try again.', 'error');
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.subtitle}>System preferences, deterministic automation, data storage, and privacy.</p>
      </div>

      {/* Tabs Switcher */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px', marginBottom: '24px' }}>
        <button
          className={`btn ${activeTab === 'general' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveTab('general')}
          id="tab-btn-settings-general"
        >
          General & Storage
        </button>
        <button
          className={`btn ${activeTab === 'automation' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveTab('automation')}
          id="tab-btn-settings-automation"
        >
          <Sliders size={14} style={{ marginRight: 6 }} />
          Automation Rules
        </button>
      </div>

      {activeTab === 'automation' ? (
        <AutomationSettings />
      ) : (
        <div className={styles.sectionsList}>
        {/* 1. Account */}
        {user && (
          <section className={styles.section}>
            <h2 className={styles.sectionHeading}>Account</h2>
            <div className={styles.panel}>
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={signOut}
                  id="btn-sign-out"
                  className={styles.signOutBtn}
                >
                  <LogOut size={14} />
                  <span>Sign Out</span>
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* 2. Appearance */}
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Appearance</h2>
          <div className={styles.panel}>
            <div className={styles.settingRow}>
              <div className={styles.settingInfo}>
                {theme === 'dark' ? (
                  <Moon size={16} className={styles.settingIcon} />
                ) : (
                  <Sun size={16} className={styles.settingIcon} />
                )}
                <div>
                  <span className={styles.settingLabel}>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
                  <span className={styles.settingSubtitle}>Switch between calm dark and high-contrast light aesthetics</span>
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

        {/* 3. Storage */}
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Storage</h2>
          <div className={styles.panel}>
            {needsMigrationChoice && (
              <div className={styles.noticeBox} role="alert">
                <p className={styles.noticeTitle}>
                  We found data stored in your connected Supabase database.
                </p>
                <p className={styles.noticeText}>
                  Choose where TRACKR should store your future data.
                </p>
                <div className={styles.noticeActions}>
                  <Button variant="secondary" size="sm" onClick={() => resolveMigrationChoice('custom_supabase')} id="btn-migration-keep-custom">
                    Continue with my Supabase
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => resolveMigrationChoice('trackr_cloud')} id="btn-migration-move-cloud">
                    Move to TRACKR Cloud
                  </Button>
                </div>
              </div>
            )}

            {switchTarget && (
              <div className={styles.dangerNoticeBox} role="alertdialog" aria-label="Confirm storage change">
                <p className={styles.noticeTitle}>
                  Switch to {switchTarget === 'trackr_cloud' ? 'TRACKR Cloud' : 'my own Supabase'}?
                </p>
                <p className={styles.noticeText}>
                  Future data will be saved there instead. Your existing data isn&apos;t moved automatically.
                </p>
                <div className={styles.noticeActions}>
                  <Button variant="primary" size="sm" onClick={() => confirmSwitch(true)} id="btn-switch-move-data">
                    Move my existing data
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => confirmSwitch(false)} id="btn-switch-keep-data">
                    Keep existing data where it is
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSwitchTarget(null)} id="btn-switch-cancel">
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {migrating && (
              <div className={styles.statusRow}>
                <RefreshCw size={13} className={styles.spinIcon} />
                <span>Moving your data to active provider…</span>
              </div>
            )}
            {migrationDone && !migrating && (
              <div className={`${styles.statusRow} ${styles.statusSuccess}`}>
                <CheckCircle2 size={13} />
                <span>Your existing data has been queued to move — it will finish syncing shortly.</span>
              </div>
            )}

            <div className={styles.radioList}>
              <label
                className={`${styles.radioCard} ${storageMode === 'trackr_cloud' ? styles.radioCardActive : ''}`}
              >
                <input
                  type="radio"
                  name="storage-mode"
                  checked={storageMode === 'trackr_cloud'}
                  onChange={() => handleSelectStorage('trackr_cloud')}
                  id="radio-storage-trackr-cloud"
                  className={styles.radioInput}
                />
                <div className={styles.radioContent}>
                  <div className={styles.radioHeader}>
                    <div className={styles.radioTitleRow}>
                      <Cloud size={14} className={styles.radioIcon} />
                      <span className={styles.radioTitle}>TRACKR Cloud</span>
                    </div>
                    <Badge variant="success" size="sm">Recommended</Badge>
                  </div>
                  <span className={styles.radioSubtitle}>
                    Encrypted and isolated per user with Supabase Row-Level Security. Zero setup required.
                  </span>
                </div>
              </label>

              <label
                className={`${styles.radioCard} ${storageMode === 'custom_supabase' ? styles.radioCardActive : ''}`}
              >
                <input
                  type="radio"
                  name="storage-mode"
                  checked={storageMode === 'custom_supabase'}
                  onChange={() => handleSelectStorage('custom_supabase')}
                  id="radio-storage-custom"
                  className={styles.radioInput}
                />
                <div className={styles.radioContent}>
                  <div className={styles.radioHeader}>
                    <div className={styles.radioTitleRow}>
                      <Settings2 size={14} className={styles.radioIcon} />
                      <span className={styles.radioTitle}>Custom Supabase (BYODB)</span>
                    </div>
                    <Badge variant="default" size="sm">Advanced</Badge>
                  </div>
                  <span className={styles.radioSubtitle}>
                    {userConfig
                      ? `Connected to your project (${userConfig.supabase_url.replace('https://', '').split('.supabase')[0]}.supabase.co)`
                      : 'Connect your own dedicated Supabase database project.'}
                  </span>
                </div>
              </label>
            </div>

            {storageMode === 'custom_supabase' && (
              <div className={styles.panelFooter}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => router.push('/auth/setup')}
                  id="btn-manage-custom-storage"
                >
                  <RefreshCw size={13} />
                  <span>{userConfig ? 'Reconfigure Supabase Project' : 'Connect Supabase Project'}</span>
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* 4. Connections & Integrations */}
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Connections</h2>
          <div className={styles.panel}>
            <div className={styles.settingRow}>
              <div className={styles.settingInfo}>
                <Mail size={16} className={styles.settingIcon} />
                <div>
                  <span className={styles.settingLabel}>Gmail</span>
                  <span className={styles.settingSubtitle}>
                    {gmailState.connected
                      ? `Connected as ${gmailState.email || 'Google Account'} · Last synced: ${gmailState.lastSyncAt ? new Date(gmailState.lastSyncAt).toLocaleTimeString() : 'Never'}`
                      : 'Connect Gmail to detect receipts, invoices, and payments directly into Financial Inbox'}
                  </span>
                </div>
              </div>
              <div className={styles.settingActions}>
                {gmailState.connected ? (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleSyncGmail}
                      disabled={isGmailSyncing}
                      id="btn-sync-gmail"
                    >
                      <RefreshCw size={13} className={isGmailSyncing ? styles.spinIcon : ''} />
                      <span>{isGmailSyncing ? 'Syncing…' : 'Sync now'}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDisconnectGmail}
                      id="btn-disconnect-gmail"
                    >
                      <Unlink size={13} />
                      <span>Disconnect</span>
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleConnectGmail}
                    id="btn-connect-gmail"
                  >
                    <Link2 size={13} />
                    <span>Connect Gmail</span>
                  </Button>
                )}
              </div>
            </div>
            {gmailState.connected && gmailState.stats && (
              <div className={styles.metaRow}>
                <span>Messages checked: {gmailState.stats.messagesChecked}</span>
                <span>· Candidates found: {gmailState.stats.candidatesFound}</span>
                <span>· Duplicates skipped: {gmailState.stats.duplicatesSkipped}</span>
              </div>
            )}

            {/* Indian Bank Accounts (Account Aggregator) */}
            <div className={styles.divider} />
            <div className={styles.settingRow}>
              <div className={styles.settingInfo}>
                <Building2 size={16} className={styles.settingIcon} />
                <div>
                  <span className={styles.settingLabel}>Indian Bank Accounts (Account Aggregator)</span>
                  <span className={styles.settingSubtitle}>
                    {bankState.connected
                      ? `Connected via Setu AA (${bankState.fipName || 'State Bank of India'} ···${bankState.accountMask?.slice(-4) || '4012'}) · Last synced: ${bankState.lastSyncAt ? new Date(bankState.lastSyncAt).toLocaleTimeString() : 'Never'}`
                      : 'Connect your Indian bank account via RBI Account Aggregator to import UPI, POS, and statement transactions'}
                  </span>
                </div>
              </div>
              <div className={styles.settingActions}>
                {bankState.connected ? (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleSyncBank}
                      disabled={isBankSyncing}
                      id="btn-sync-bank"
                    >
                      <RefreshCw size={13} className={isBankSyncing ? styles.spinIcon : ''} />
                      <span>{isBankSyncing ? 'Syncing…' : 'Sync now'}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDisconnectBank}
                      id="btn-disconnect-bank"
                    >
                      <Unlink size={13} />
                      <span>Disconnect</span>
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleConnectBank}
                    id="btn-connect-bank"
                  >
                    <Link2 size={13} />
                    <span>Connect Bank</span>
                  </Button>
                )}
              </div>
            </div>
            {bankState.connected && bankState.stats && (
              <div className={styles.metaRow}>
                <span>Transactions checked: {bankState.stats.transactionsChecked}</span>
                <span>· Candidates found: {bankState.stats.candidatesFound}</span>
                <span>· Duplicates skipped: {bankState.stats.duplicatesSkipped}</span>
              </div>
            )}
          </div>
        </section>

        {/* 5. Sync & Status */}
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Sync</h2>
          <div className={styles.panel}>
            <div className={styles.infoRow}>
              <div className={styles.infoIconWrap}>
                <Zap size={15} className={styles.infoIcon} />
              </div>
              <div className={styles.infoBody}>
                <span className={styles.infoTitle}>Deterministic Offline-First Sync</span>
                <span className={styles.infoText}>
                  All changes are immediately committed to your local IndexedDB storage. Sync operations are queued and replay deterministically whenever network connectivity is verified.
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Privacy & Security */}
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Privacy & Security</h2>
          <div className={styles.panel}>
            <div className={styles.infoRow}>
              <div className={styles.infoIconWrap}>
                <Lock size={15} className={styles.infoIcon} />
              </div>
              <div className={styles.infoBody}>
                <span className={styles.infoTitle}>Zero Telemetry & Private by Design</span>
                <span className={styles.infoText}>
                  TRACKR does not run external AI scraping, behavioral telemetry, or third-party ad networks. Your financial transactions, notes, habits, and tasks remain strictly private to your device and authorized database.
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 6. Data Management */}
        <section className={styles.section}>
          <h2 className={styles.sectionHeading}>Data Management</h2>
          <div className={styles.panel}>
            {/* Export */}
            <button className={styles.actionRow} onClick={handleExport} id="btn-export-data">
              <Download size={16} className={styles.settingIcon} />
              <div className={styles.actionRowInfo}>
                <span className={styles.settingLabel}>Export Full Backup</span>
                <span className={styles.settingSubtitle}>Download all items, relations, context links, and history as JSON</span>
              </div>
              <ChevronRight size={14} className={styles.chevron} />
            </button>

            <div className={styles.divider} />

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
              <Upload size={16} className={styles.settingIcon} />
              <div className={styles.actionRowInfo}>
                <span className={styles.settingLabel}>
                  {importing ? 'Importing…' : 'Import Data Backup'}
                </span>
                <span className={styles.settingSubtitle}>
                  Restore from a verified TRACKR JSON backup file
                </span>
              </div>
              <ChevronRight size={14} className={styles.chevron} />
            </button>

            {importFeedback && (
              <div
                className={`${styles.feedbackBox} ${
                  importFeedback.success ? styles.feedbackSuccess : styles.feedbackError
                }`}
              >
                {importFeedback.success ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                <span>{importFeedback.message}</span>
              </div>
            )}

            <div className={styles.divider} />

            {/* Load Sample Data */}
            <button
              className={styles.actionRow}
              onClick={handleLoadSample}
              disabled={sampleLoading}
              id="btn-load-sample-data"
            >
              <Package size={16} className={styles.settingIcon} />
              <div className={styles.actionRowInfo}>
                <span className={styles.settingLabel}>
                  {sampleLoading ? 'Loading…' : 'Load Sample Project & Data'}
                </span>
                <span className={styles.settingSubtitle}>
                  Explore the &quot;YouTube Channel&quot; demonstration with connected tasks, notes, expenses & graph
                </span>
              </div>
              <ChevronRight size={14} className={styles.chevron} />
            </button>
          </div>
        </section>

        {/* 7. Integrations (Planned) */}
        <section className={styles.section}>
          <div className={styles.sectionHeadingRow}>
            <h2 className={styles.sectionHeading}>Integrations</h2>
            <Badge variant="default" size="sm">Phase 5+</Badge>
          </div>
          <div className={styles.panel}>
            <div className={styles.infoRow}>
              <div className={styles.infoIconWrap}>
                <Plug size={15} className={styles.infoIcon} />
              </div>
              <div className={styles.infoBody}>
                <span className={styles.infoTitle}>Deterministic Email & Financial Connectors</span>
                <span className={styles.infoText}>
                  Bank connections, broker sync, and Financial Inbox rules are scheduled for future phases. Core personal operating system features remain fully local.
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* 8. Danger Zone */}
        <section className={styles.section}>
          <h2 className={`${styles.sectionHeading} ${styles.dangerHeading}`}>Danger Zone</h2>
          <div className={`${styles.panel} ${styles.dangerPanel}`}>
            <button
              className={styles.actionRow}
              onClick={handleClearAllData}
              disabled={clearing}
              id="btn-clear-all-data"
            >
              <Trash2 size={16} className={styles.dangerIcon} />
              <div className={styles.actionRowInfo}>
                <span className={`${styles.settingLabel} ${styles.dangerLabel}`}>
                  {clearing ? 'Clearing Local Data…' : 'Reset Local Database'}
                </span>
                <span className={styles.settingSubtitle}>
                  Wipes local device IndexedDB storage without deleting remote cloud backups
                </span>
              </div>
              <ChevronRight size={14} className={styles.chevron} />
            </button>

            {user && (
              <button
                className={styles.actionRow}
                onClick={handleDeleteAccount}
                disabled={clearing}
                id="btn-delete-account-data"
                style={{ borderTop: '1px solid rgba(239, 68, 68, 0.15)' }}
              >
                <Trash2 size={16} style={{ color: '#ef4444' }} />
                <div className={styles.actionRowInfo}>
                  <span className={`${styles.settingLabel} ${styles.dangerLabel}`} style={{ color: '#ef4444' }}>
                    {clearing ? 'Deleting Account…' : 'Delete Account & Cloud Data'}
                  </span>
                  <span className={styles.settingSubtitle}>
                    Permanently delete all personal records from TRACKR Cloud, clear this device, and sign out
                  </span>
                </div>
                <ChevronRight size={14} className={styles.chevron} />
              </button>
            )}
          </div>
        </section>

        {/* About */}
        <section className={styles.aboutSection}>
          <span className={styles.appName}>TRACKR</span>
          <span className={styles.tagline}>Connected Personal Operating System</span>
          <span className={styles.version}>v1.0.0 · Local-first architecture</span>
        </section>
      </div>
      )}
    </div>
  );
}
