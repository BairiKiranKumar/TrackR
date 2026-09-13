import React from 'react';

export interface StatusIndicatorProps {
  status: 'todo' | 'in_progress' | 'waiting' | 'done' | 'urgent' | 'offline' | 'syncing' | 'synced' | 'error';
  label?: string;
  size?: number;
  className?: string;
}

const STATUS_COLORS: Record<StatusIndicatorProps['status'], string> = {
  todo: 'var(--text-tertiary)',
  in_progress: 'var(--accent-primary)',
  waiting: 'var(--color-warning)',
  done: 'var(--color-success)',
  urgent: 'var(--color-danger)',
  offline: 'var(--color-warning)',
  syncing: 'var(--accent-primary)',
  synced: 'var(--color-success)',
  error: 'var(--color-danger)',
};

export function StatusIndicator({
  status,
  label,
  size = 7,
  className,
}: StatusIndicatorProps) {
  const color = STATUS_COLORS[status] || 'var(--text-tertiary)';

  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 'var(--font-size-xs)',
        color: 'var(--text-secondary)',
      }}
    >
      <span
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          backgroundColor: color,
          display: 'inline-block',
          flexShrink: 0,
        }}
        aria-hidden="true"
      />
      {label && <span>{label}</span>}
    </span>
  );
}
