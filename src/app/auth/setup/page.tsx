'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Database, CheckCircle2, ArrowRight, Loader2, ExternalLink, Copy } from 'lucide-react';
import { useAuth } from '@/components/providers/AuthProvider';
import {
  saveUserConfig,
  testUserDbConnection,
  USER_DB_SCHEMA_SQL,
} from '@/lib/services/UserConfigService';
import { initUserSupabase } from '@/lib/supabase';
import styles from './page.module.css';

type Step = 'connect' | 'schema' | 'done';

export default function SetupPage() {
  const router = useRouter();
  const { user, refreshUserConfig } = useAuth();

  const [step, setStep] = useState<Step>('connect');
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [sqlCopied, setSqlCopied] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');

  // Extract project ID from URL for direct links
  const projectId = url.replace('https://', '').split('.')[0];
  const sqlEditorUrl = `https://supabase.com/dashboard/project/${projectId}/sql/new`;

  async function handleConnect() {
    if (!url.trim() || !anonKey.trim()) {
      setError('Please enter both your Supabase project URL and anon key.');
      return;
    }
    if (!url.startsWith('https://')) {
      setError('URL must start with https://');
      return;
    }

    setTesting(true);
    setError('');

    const result = await testUserDbConnection(url.trim(), anonKey.trim());

    if (!result.success) {
      setError(`Connection failed: ${result.error}`);
      setTesting(false);
      return;
    }

    if (result.error === 'TABLES_MISSING') {
      setTesting(false);
      setStep('schema');
      return;
    }

    // Connected and tables exist
    await finishSetup();
    setTesting(false);
  }

  async function finishSetup() {
    if (!user) return;
    try {
      await saveUserConfig({
        user_id: user.id,
        supabase_url: url.trim(),
        supabase_anon_key: anonKey.trim(),
        display_name: user.email?.split('@')[0],
      });
      initUserSupabase(url.trim(), anonKey.trim());
      await refreshUserConfig();
      setStep('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration.');
    }
  }

  async function copySql() {
    await navigator.clipboard.writeText(USER_DB_SCHEMA_SQL);
    setSqlCopied(true);
    setTimeout(() => setSqlCopied(false), 2500);
  }

  return (
    <div className={styles.page}>
      <div className={styles.content}>
        {/* Logo */}
        <div className={styles.logo}>T</div>

        {/* Step indicators */}
        <div className={styles.steps}>
          <div className={`${styles.step} ${step !== 'done' ? styles.stepActive : styles.stepDone}`}>
            <span className={styles.stepNum}>1</span>
            <span>Connect</span>
          </div>
          <div className={styles.stepLine} />
          <div className={`${styles.step} ${step === 'schema' ? styles.stepActive : step === 'done' ? styles.stepDone : styles.stepPending}`}>
            <span className={styles.stepNum}>2</span>
            <span>Schema</span>
          </div>
          <div className={styles.stepLine} />
          <div className={`${styles.step} ${step === 'done' ? styles.stepDone : styles.stepPending}`}>
            <span className={styles.stepNum}>3</span>
            <span>Done</span>
          </div>
        </div>

        {/* ─── Step 1: Connect ─────────────────────────────────────────── */}
        {step === 'connect' && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <Database size={22} className={styles.cardIcon} />
              <div>
                <h1 className={styles.cardTitle}>Connect your Supabase</h1>
                <p className={styles.cardSub}>
                  This is your personal database where all your TRACKR data will live. You only set this up once.
                </p>
              </div>
            </div>

            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.supabaseLink}
              id="link-supabase-dashboard"
            >
              <span>Open Supabase Dashboard</span>
              <ExternalLink size={14} />
            </a>

            <div className={styles.fields}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="input-setup-url">
                  Project URL
                  <span className={styles.hint}> (Settings → API → Project URL)</span>
                </label>
                <input
                  id="input-setup-url"
                  className={styles.input}
                  type="url"
                  placeholder="https://xxxxx.supabase.co"
                  value={url}
                  onChange={e => { setUrl(e.target.value); setError(''); }}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="input-setup-anon">
                  Anon / Publishable Key
                  <span className={styles.hint}> (Settings → API → anon public)</span>
                </label>
                <input
                  id="input-setup-anon"
                  className={styles.input}
                  type="password"
                  placeholder="eyJ... or sb_publishable_..."
                  value={anonKey}
                  onChange={e => { setAnonKey(e.target.value); setError(''); }}
                />
                <p className={styles.securityNote}>
                  🔒 Only paste the <strong>anon/public</strong> key. Never use your service_role key here.
                </p>
              </div>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <button
              id="btn-setup-connect"
              className={styles.primaryBtn}
              onClick={handleConnect}
              disabled={testing}
            >
              {testing
                ? <><Loader2 size={18} className={styles.spin} /> Testing connection…</>
                : <><ArrowRight size={18} /> Test &amp; Connect</>
              }
            </button>
          </div>
        )}

        {/* ─── Step 2: Schema ──────────────────────────────────────────── */}
        {step === 'schema' && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <Database size={22} className={styles.cardIcon} />
              <div>
                <h1 className={styles.cardTitle}>Create Tables</h1>
                <p className={styles.cardSub}>
                  Connected to <strong>{projectId}</strong> ✓ — now run this SQL in your Supabase SQL Editor to create the 4 tables TRACKR needs.
                </p>
              </div>
            </div>

            {/* 3-step visual guide */}
            <div className={styles.sqlSteps}>
              <div className={styles.sqlStep}>
                <span className={styles.sqlStepNum}>1</span>
                <div className={styles.sqlStepContent}>
                  <span className={styles.sqlStepLabel}>Copy the SQL script</span>
                  <button className={styles.copyBtnLarge} onClick={copySql} id="btn-copy-sql">
                    <Copy size={14} />
                    {sqlCopied ? '✓ Copied!' : 'Copy SQL'}
                  </button>
                </div>
              </div>
              <div className={styles.sqlStep}>
                <span className={styles.sqlStepNum}>2</span>
                <div className={styles.sqlStepContent}>
                  <span className={styles.sqlStepLabel}>Open SQL Editor and paste</span>
                  <a
                    href={sqlEditorUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.openEditorBtn}
                    id="link-open-sql-editor"
                  >
                    Open SQL Editor ↗
                  </a>
                </div>
              </div>
              <div className={styles.sqlStep}>
                <span className={styles.sqlStepNum}>3</span>
                <div className={styles.sqlStepContent}>
                  <span className={styles.sqlStepLabel}>Click <strong>Run</strong> in Supabase, then come back here</span>
                </div>
              </div>
            </div>

            {/* SQL preview */}
            <div className={styles.sqlBox}>
              <div className={styles.sqlHeader}>
                <span className={styles.sqlTitle}>SQL Script</span>
                <button className={styles.copyBtn} onClick={copySql} id="btn-copy-sql-2">
                  <Copy size={12} />
                  {sqlCopied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <pre className={styles.sqlCode}>{USER_DB_SCHEMA_SQL.trim()}</pre>
            </div>

            {error && <div className={styles.error}>{error}</div>}

            <button
              id="btn-setup-manual-done"
              className={styles.primaryBtn}
              onClick={finishSetup}
            >
              <CheckCircle2 size={18} /> Done — I ran the SQL
            </button>
          </div>
        )}

        {/* ─── Step 3: Done ────────────────────────────────────────────── */}
        {step === 'done' && (
          <div className={styles.card}>
            <div className={styles.successIcon}>✅</div>
            <h1 className={styles.successTitle}>You&apos;re all set!</h1>
            <p className={styles.successSub}>
              Your personal Supabase database is connected. All your TRACKR data will sync there automatically. Next time you log in, it connects automatically — no setup needed.
            </p>
            <button
              id="btn-setup-done"
              className={styles.primaryBtn}
              onClick={() => router.replace('/')}
            >
              <ArrowRight size={18} /> Go to TRACKR
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
