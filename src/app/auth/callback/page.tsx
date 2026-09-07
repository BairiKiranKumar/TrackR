'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

// Handles the OAuth redirect from Supabase after Google sign-in.
export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) {
      router.replace('/auth');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: { subscription } } = sb.auth.onAuthStateChange((event: string, session: any) => {
      if (event === 'SIGNED_IN' && session) {
        router.replace('/');
      } else if (event === 'SIGNED_OUT' || !session) {
        router.replace('/auth');
      }
    });

    // Also try to get session directly
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sb.auth.getSession().then(({ data }: { data: any }) => {
      if (data.session) {
        router.replace('/');
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100dvh',
      background: '#0A0A0F',
      gap: 16,
      fontFamily: 'var(--font-family)',
      color: 'var(--text-secondary)',
    }}>
      <div style={{
        width: 56,
        height: 56,
        borderRadius: 16,
        background: 'var(--accent-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 24,
        fontWeight: 900,
        color: 'white',
      }}>
        T
      </div>
      <Loader2 size={20} style={{ animation: 'spin 0.8s linear infinite', color: 'var(--accent-secondary)' }} />
      <p style={{ fontSize: 'var(--font-size-sm)' }}>Signing you in…</p>
    </div>
  );
}
