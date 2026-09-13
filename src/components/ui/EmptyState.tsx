'use client';

import React from 'react';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  className?: string;
  id?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
  id,
}: EmptyStateProps) {
  return (
    <div className={`${styles.container} ${className || ''}`} id={id}>
      {icon && <div className={styles.iconWrap}>{icon}</div>}
      <h4 className={styles.title}>{title}</h4>
      {description && <p className={styles.description}>{description}</p>}
      {(action || secondaryAction) && (
        <div className={styles.actions}>
          {secondaryAction}
          {action}
        </div>
      )}
    </div>
  );
}
