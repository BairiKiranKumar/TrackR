'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, Eye, EyeOff, ArrowRight, CheckCircle2, Loader2, KeyRound } from 'lucide-react';
import { updatePassword } from '@/lib/auth/AuthService';
import styles from './page.module.css';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!password) {
      setError('Please enter a new password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await updatePassword(password);
      setSuccess(true);
      setTimeout(() => {
        router.replace('/');
      }, 2500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update password.';
      if (msg.includes('Auth session missing') || msg.includes('token is expired')) {
        setError('Your password reset link is invalid or has expired. Please request a new one from the sign-in page.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.bg} />
      <div className={styles.content}>
        <div className={styles.card}>
          <div className={styles.header}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'rgba(99, 102, 241, 0.15)',
              color: 'var(--accent-secondary)',
              margin: '0 auto 8px auto',
            }}>
              <KeyRound size={22} />
            </div>
            <h1 className={styles.title}>Reset Password</h1>
            <p className={styles.subtitle}>
              Enter a secure new password for your TRACKR account.
            </p>
          </div>

          {error && <div className={styles.errorBanner}>{error}</div>}

          {success ? (
            <div className={styles.successBanner}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                <CheckCircle2 size={18} /> Password updated successfully!
              </div>
              <p style={{ margin: 0, color: 'var(--text-secondary)' }}>
                Redirecting you to your workspace in a moment…
              </p>
              <div style={{ marginTop: 8 }}>
                <Link href="/" className={styles.actionLink}>
                  Continue to Workspace <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="new-password">New Password</label>
                <div className={styles.inputWrap}>
                  <Lock size={16} className={styles.inputIcon} />
                  <input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    className={styles.input}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className={styles.eyeBtn}
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="confirm-password">Confirm Password</label>
                <div className={styles.inputWrap}>
                  <Lock size={16} className={styles.inputIcon} />
                  <input
                    id="confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    className={styles.input}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    autoComplete="new-password"
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <button
                type="submit"
                className={styles.submitBtn}
                disabled={loading}
                id="btn-update-password"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className={styles.spinner} />
                    Updating Password…
                  </>
                ) : (
                  <>
                    Update Password <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          )}

          <div style={{ textAlign: 'center', marginTop: 8 }}>
            <Link href="/auth" className={styles.actionLink}>
              ← Back to Sign In
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
