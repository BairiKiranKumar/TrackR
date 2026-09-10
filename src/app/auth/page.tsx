'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';
import {
  signInWithEmail,
  signUpWithEmail,
  sendPasswordReset,
  isSupabaseConfigured,
  getSession,
} from '@/lib/auth/AuthService';
import styles from './page.module.css';

type Mode = 'signin' | 'signup' | 'forgot';

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [checking, setChecking] = useState(true);

  const configured = isSupabaseConfigured();

  // If already signed in → redirect to requested page or home
  useEffect(() => {
    getSession().then(s => {
      if (s) {
        const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        const dest = params?.get('redirect') || '/';
        router.replace(dest);
      } else {
        setChecking(false);
      }
    });
  }, [router]);

  function clearMessages() {
    setError('');
    setSuccess('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearMessages();

    if (!email.trim()) { setError('Please enter your email.'); return; }

    if (mode === 'forgot') {
      setLoading(true);
      try {
        await sendPasswordReset(email.trim());
        setSuccess('Password reset email sent! Check your inbox.');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to send reset email.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!password) { setError('Please enter your password.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (mode === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const data = await signUpWithEmail(email.trim(), password);
        if (data.user && !data.session) {
          // Email confirmation required
          setSuccess('Check your email to confirm your account, then sign in.');
          setMode('signin');
        } else {
          router.replace('/');
        }
      } else {
        await signInWithEmail(email.trim(), password);
        router.replace('/');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed.';
      setError(friendlyError(msg));
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.logoBox}>T</div>
        <Loader2 size={20} className={styles.spinner} />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Background */}
      <div className={styles.bg} aria-hidden />

      {/* Content */}
      <div className={styles.content}>
        {/* Logo + brand */}
        <div className={styles.brand}>
          <div className={styles.logoBox}>T</div>
          <h1 className={styles.appName}>TRACKR</h1>
          <p className={styles.tagline}>Write it. Track it. Link it.</p>
        </div>

        {/* Card */}
        <div className={styles.card}>
          {/* Tabs */}
          {mode !== 'forgot' && (
            <div className={styles.tabs}>
              <button
                id="tab-auth-signin"
                className={`${styles.tab} ${mode === 'signin' ? styles.tabActive : ''}`}
                onClick={() => { setMode('signin'); clearMessages(); }}
              >
                Sign In
              </button>
              <button
                id="tab-auth-signup"
                className={`${styles.tab} ${mode === 'signup' ? styles.tabActive : ''}`}
                onClick={() => { setMode('signup'); clearMessages(); }}
              >
                Sign Up
              </button>
            </div>
          )}

          {mode === 'forgot' && (
            <div className={styles.forgotHeader}>
              <button
                className={styles.backLink}
                onClick={() => { setMode('signin'); clearMessages(); }}
                id="btn-auth-back"
              >
                ← Back to sign in
              </button>
              <h2 className={styles.forgotTitle}>Reset Password</h2>
              <p className={styles.forgotSub}>
                Enter your email and we&apos;ll send you a reset link.
              </p>
            </div>
          )}

          {/* Not configured banner */}
          {!configured && (
            <div className={styles.notConfigured}>
              <span className={styles.notConfiguredIcon}>⚙️</span>
              <div>
                <p className={styles.notConfiguredTitle}>Supabase not configured</p>
                <p className={styles.notConfiguredText}>
                  Add your <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to <code>.env.local</code> then restart the dev server.
                </p>
              </div>
            </div>
          )}

          {/* Form */}
          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            {/* Email */}
            <div className={styles.field}>
              <label className={styles.label} htmlFor="input-auth-email">Email</label>
              <div className={styles.inputWrap}>
                <Mail size={16} className={styles.inputIcon} />
                <input
                  id="input-auth-email"
                  type="email"
                  autoComplete="email"
                  className={styles.input}
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  disabled={!configured}
                />
              </div>
            </div>

            {/* Password */}
            {mode !== 'forgot' && (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="input-auth-password">Password</label>
                <div className={styles.inputWrap}>
                  <Lock size={16} className={styles.inputIcon} />
                  <input
                    id="input-auth-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    className={`${styles.input} ${styles.inputWithToggle}`}
                    placeholder={mode === 'signup' ? 'Min. 6 characters' : 'Your password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    disabled={!configured}
                  />
                  <button
                    type="button"
                    className={styles.eyeBtn}
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            )}

            {/* Confirm password (signup only) */}
            {mode === 'signup' && (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="input-auth-confirm">Confirm Password</label>
                <div className={styles.inputWrap}>
                  <Lock size={16} className={styles.inputIcon} />
                  <input
                    id="input-auth-confirm"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    className={styles.input}
                    placeholder="Same password again"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    disabled={!configured}
                  />
                </div>
              </div>
            )}

            {/* Forgot password link */}
            {mode === 'signin' && (
              <button
                type="button"
                className={styles.forgotLink}
                onClick={() => { setMode('forgot'); clearMessages(); }}
                id="btn-auth-forgot"
              >
                Forgot password?
              </button>
            )}

            {/* Error / success messages */}
            {error && <div className={styles.errorMsg} role="alert">{error}</div>}
            {success && <div className={styles.successMsg} role="status">{success}</div>}

            {/* Submit */}
            <button
              id="btn-auth-submit"
              type="submit"
              className={styles.submitBtn}
              disabled={loading || !configured}
            >
              {loading ? (
                <Loader2 size={18} className={styles.spinner} />
              ) : (
                <>
                  {mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Send Reset Link'}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Terms */}
        <p className={styles.terms}>
          By continuing, you agree to our{' '}
          <span className={styles.termsLink}>Terms of Service</span> and{' '}
          <span className={styles.termsLink}>Privacy Policy</span>.
        </p>
      </div>
    </div>
  );
}

// ─── Friendly error messages ────────────────────────────────────────────────

function friendlyError(msg: string): string {
  if (msg.includes('Invalid login credentials')) return 'Incorrect email or password. Please try again.';
  if (msg.includes('Email not confirmed')) return 'Please confirm your email first. Check your inbox.';
  if (msg.includes('User already registered')) return 'An account with this email already exists. Try signing in.';
  if (msg.includes('Password should be at least')) return 'Password must be at least 6 characters.';
  if (msg.includes('rate limit')) return 'Too many attempts. Please wait a moment and try again.';
  return msg;
}
