'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Moon, Sun, Database, RefreshCw, Wifi,
  Download, ChevronRight, LogOut,
} from 'lucide-react';
import { useAppContext } from '@/components/providers/AppProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { dataService } from '@/lib/services/DataService';
import styles from './page.module.css';

export default function SettingsPage() {
  const router = useRouter();
  const { theme, toggleTheme } = useAppContext();
  const { user, userConfig, signOut } = useAuth();

  async function handleExport() {
    const items = await dataService.getAllItems();
    const data = JSON.stringify({ items, exportedAt: new Date().toISOString() }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trackr-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
                {user.user_metadata?.avatar_url
                  ? <img src={user.user_metadata.avatar_url} alt="Avatar" className={styles.avatarImg} />
                  : <span className={styles.avatarInitial}>{user.email?.[0]?.toUpperCase() ?? 'U'}</span>
                }
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
          <button className={styles.actionRow} onClick={handleExport} id="btn-export-data">
            <Download size={18} className={styles.settingIcon} />
            <div className={styles.settingInfo2}>
              <span className={styles.settingLabel}>Export Data</span>
              <span className={styles.settingSubtitle}>Download all your items as JSON</span>
            </div>
            <ChevronRight size={16} className={styles.chevron} />
          </button>
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
