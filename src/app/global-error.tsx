'use client';

import React from 'react';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{
        margin: 0,
        padding: '24px 16px',
        minHeight: '100vh',
        background: '#0A0A0F',
        color: '#EDEDEF',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          width: '100%',
          maxWidth: 440,
          background: '#12121A',
          border: '1px solid #272733',
          borderRadius: 16,
          padding: 24,
          textAlign: 'center',
          boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
        }}>
          <div style={{
            width: 48,
            height: 48,
            margin: '0 auto 16px auto',
            borderRadius: 12,
            background: 'rgba(239, 68, 68, 0.15)',
            color: '#f87171',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            fontWeight: 'bold',
          }}>
            !
          </div>

          <h1 style={{ fontSize: '1.25rem', margin: '0 0 8px 0', fontWeight: 600 }}>
            Application Error
          </h1>

          <p style={{ fontSize: '0.875rem', color: '#9E9EA8', margin: '0 0 20px 0', lineHeight: 1.5 }}>
            TRACKR encountered a critical layout issue. Your data stored on this device is safe.
          </p>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button
              onClick={() => reset()}
              style={{
                padding: '10px 18px',
                background: '#6366f1',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 18px',
                background: 'rgba(255, 255, 255, 0.08)',
                color: '#EDEDEF',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: 8,
                fontWeight: 500,
                fontSize: '0.875rem',
                cursor: 'pointer',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
