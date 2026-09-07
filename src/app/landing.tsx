'use client';

import Link from 'next/link';
import {
  FileText, Target, DollarSign, Search, Zap, AtSign,
  ArrowRight, CheckCircle, Star
} from 'lucide-react';
import styles from './landing.module.css';

const FEATURES = [
  { icon: FileText, color: '#60A5FA', title: 'Notes & Docs', desc: 'Rich notes with @references. Everything connects.' },
  { icon: Target,   color: '#A78BFA', title: 'Track Anything', desc: 'Series, streaks, habits. Daily progress at a glance.' },
  { icon: DollarSign, color: '#34D399', title: 'Money Manager', desc: 'Income, expenses, budgets. Full financial clarity.' },
  { icon: AtSign,   color: '#FBBF24', title: '@References', desc: 'Link any item to any other. Your second brain.' },
  { icon: Search,   color: '#F87171', title: 'Instant Search', desc: 'Find anything across all your items in milliseconds.' },
  { icon: Zap,      color: '#FB923C', title: 'Quick Capture', desc: 'One tap to capture thoughts before you lose them.' },
];

const HOW_IT_WORKS = [
  { step: '01', title: 'Sign up free', desc: 'Create your account in 30 seconds with email or Google.' },
  { step: '02', title: 'Connect your database', desc: 'Link your personal Supabase project. Your data, your control.' },
  { step: '03', title: 'Start capturing', desc: 'Write notes, create tasks, track habits, log money. Everything in one place.' },
];

// Rendered by the root page (`app/page.tsx`) for signed-out visitors.
// Auth-state branching lives there — this component is pure presentation.
export default function LandingPage() {
  return (
    <div className={styles.page}>
      {/* Nav */}
      <nav className={styles.nav}>
        <div className={styles.navLogo}>
          <span className={styles.logoMark}>T</span>
          <span className={styles.logoText}>TRACKR</span>
        </div>
        <Link href="/auth" className={styles.navCta} id="btn-landing-signin">
          Sign in
        </Link>
      </nav>

      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.heroBadge}>
          <Star size={12} />
          <span>Personal operating system — built for focus</span>
        </div>
        <h1 className={styles.heroTitle}>
          Write it.{' '}
          <span className={styles.heroGradient}>Track it.</span>
          <br />
          Link it. Understand it.
        </h1>
        <p className={styles.heroSub}>
          Notes, tasks, habits, and money — all in one place, all connected with <strong className={styles.atHighlight}>@references</strong>. The second brain you&apos;ve always wanted.
        </p>
        <div className={styles.heroCtas}>
          <Link href="/auth" className={styles.ctaPrimary} id="btn-landing-start">
            Start for free <ArrowRight size={16} />
          </Link>
          <a href="#features" className={styles.ctaSecondary} id="btn-landing-features">
            See how it works
          </a>
        </div>
        <div className={styles.heroStats}>
          <div className={styles.stat}><span className={styles.statNum}>∞</span><span className={styles.statLabel}>Items</span></div>
          <div className={styles.statDivider} />
          <div className={styles.stat}><span className={styles.statNum}>0</span><span className={styles.statLabel}>Data shared</span></div>
          <div className={styles.statDivider} />
          <div className={styles.stat}><span className={styles.statNum}>100%</span><span className={styles.statLabel}>Your data</span></div>
        </div>
      </section>

      {/* App preview mockup */}
      <section className={styles.previewSection}>
        <div className={styles.preview}>
          <div className={styles.previewBar}>
            <div className={styles.previewDot} style={{ background: '#F87171' }} />
            <div className={styles.previewDot} style={{ background: '#FBBF24' }} />
            <div className={styles.previewDot} style={{ background: '#34D399' }} />
            <span className={styles.previewUrl}>trackr.app</span>
          </div>
          <div className={styles.previewBody}>
            <div className={styles.mockItem} style={{ '--clr': '#60A5FA' } as React.CSSProperties}>
              <span className={styles.mockIcon}>📝</span>
              <div>
                <div className={styles.mockTitle}>YouTube video ideas</div>
                <div className={styles.mockSub}>Linked to @BGMI Series</div>
              </div>
              <span className={styles.mockTag}>Note</span>
            </div>
            <div className={styles.mockItem} style={{ '--clr': '#A78BFA' } as React.CSSProperties}>
              <span className={styles.mockIcon}>🔥</span>
              <div>
                <div className={styles.mockTitle}>BGMI Handcam Series</div>
                <div className={styles.mockSub}>Day 12 / 30 · 12 day streak</div>
              </div>
              <span className={styles.mockTag}>Tracker</span>
            </div>
            <div className={styles.mockItem} style={{ '--clr': '#34D399' } as React.CSSProperties}>
              <span className={styles.mockIcon}>💰</span>
              <div>
                <div className={styles.mockTitle}>Brand deal — GodLike</div>
                <div className={styles.mockSub}>₹15,000 income · Sep 7</div>
              </div>
              <span className={styles.mockTag}>Income</span>
            </div>
            <div className={styles.mockItem} style={{ '--clr': '#FBBF24' } as React.CSSProperties}>
              <span className={styles.mockIcon}>✅</span>
              <div>
                <div className={styles.mockTitle}>Edit Day 5 handcam footage</div>
                <div className={styles.mockSub}>Due today · @BGMI Series</div>
              </div>
              <span className={styles.mockTag}>Task</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className={styles.featuresSection} id="features">
        <div className={styles.sectionLabel}>Features</div>
        <h2 className={styles.sectionTitle}>Everything connected. Nothing lost.</h2>
        <p className={styles.sectionSub}>Six pillars that work together as one unified system.</p>

        <div className={styles.featuresGrid}>
          {FEATURES.map(f => {
            const Icon = f.icon;
            return (
              <div key={f.title} className={styles.featureCard}>
                <div className={styles.featureIcon} style={{ background: `${f.color}18`, color: f.color }}>
                  <Icon size={20} />
                </div>
                <h3 className={styles.featureTitle}>{f.title}</h3>
                <p className={styles.featureDesc}>{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* How it works */}
      <section className={styles.howSection}>
        <div className={styles.sectionLabel}>How it works</div>
        <h2 className={styles.sectionTitle}>Set up in 3 minutes</h2>
        <div className={styles.howSteps}>
          {HOW_IT_WORKS.map(s => (
            <div key={s.step} className={styles.howStep}>
              <span className={styles.howStepNum}>{s.step}</span>
              <div>
                <h3 className={styles.howStepTitle}>{s.title}</h3>
                <p className={styles.howStepDesc}>{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA banner */}
      <section className={styles.ctaBanner}>
        <h2 className={styles.ctaBannerTitle}>Your life, organized.</h2>
        <p className={styles.ctaBannerSub}>Free forever. Your data stays yours.</p>
        <Link href="/auth" className={styles.ctaPrimary} id="btn-landing-start-2">
          Get started free <ArrowRight size={16} />
        </Link>
        <div className={styles.ctaBannerFeatures}>
          {['No credit card', 'Data portability', 'Works offline'].map(f => (
            <div key={f} className={styles.ctaFeature}>
              <CheckCircle size={13} />
              <span>{f}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <span className={styles.footerLogo}>T</span>
        <span>TRACKR · Write it. Track it. Link it.</span>
      </footer>
    </div>
  );
}
