'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, RefreshCw, Download, Home, RotateCcw } from 'lucide-react';
import { formatUserFriendlyError } from '@/lib/utils/errorUtils';
import { dataService } from '@/lib/services/DataService';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const formatted = formatUserFriendlyError(error);

  useEffect(() => {
    // Log privately without leaking PII
    console.error('[TRACKR Error Boundary caught]:', error.name, formatted.code, error.message);
  }, [error, formatted]);

  async function handleExportBackup() {
    try {
      const data = await dataService.exportFullData();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trackr-recovery-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Unable to export backup automatically. Please reload the app.');
    }
  }

  return (
    <div style={{
      minHeight: '80vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      background: '#0A0A0F',
      fontFamily: 'var(--font-family, system-ui, sans-serif)',
      color: '#EDEDEF',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 480,
        background: 'rgba(18, 18, 26, 0.9)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 16,
        padding: '28px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'rgba(239, 68, 68, 0.15)',
            color: '#f87171',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <AlertTriangle size={22} />
          </div>
          <div>
            <h2 style={{ margin: '0 0 6px 0', fontSize: '1.25rem', fontWeight: 600, color: '#EDEDEF' }}>
              {formatted.title}
            </h2>
            <p style={{ margin: 0, fontSize: '0.875rem', color: '#9E9EA8', lineHeight: 1.5 }}>
              {formatted.message}
            </p>
            {formatted.code && (
              <span style={{
                display: 'inline-block',
                marginTop: 8,
                fontSize: '0.6875rem',
                color: '#6366f1',
                background: 'rgba(99, 102, 241, 0.1)',
                padding: '2px 8px',
                borderRadius: 6,
                fontFamily: 'monospace',
              }}>
                {formatted.code}
              </span>
            )}
          </div>
        </div>

        <div style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.05)',
          borderRadius: 10,
          padding: '12px 14px',
          fontSize: '0.8125rem',
          color: '#9E9EA8',
          lineHeight: 1.4,
        }}>
          💡 <strong>Your data is safe:</strong> TRACKR keeps a full copy of your items and records locally on this device.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => reset()}
              id="btn-error-retry"
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '10px 16px',
                background: 'var(--accent-primary, #6366f1)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={16} /> Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              id="btn-error-reload"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '10px 14px',
                background: 'rgba(255, 255, 255, 0.06)',
                color: '#EDEDEF',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 8,
                fontWeight: 500,
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              <RotateCcw size={16} /> Reload
            </button>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleExportBackup}
              id="btn-error-export-backup"
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '9px 14px',
                background: 'transparent',
                color: '#34d399',
                border: '1px solid rgba(52, 211, 153, 0.25)',
                borderRadius: 8,
                fontWeight: 500,
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              <Download size={15} /> Export Local Backup
            </button>

            <button
              onClick={() => router.push('/')}
              id="btn-error-home"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '9px 14px',
                background: 'transparent',
                color: '#9E9EA8',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 8,
                fontWeight: 500,
                fontSize: '0.8125rem',
                cursor: 'pointer',
              }}
            >
              <Home size={15} /> Overview
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
