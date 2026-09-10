import React from 'react';
import {
  FileText,
  CheckSquare,
  Target,
  Folder,
  DollarSign,
  TrendingUp,
  BookOpen,
  Flame,
  Layers,
} from 'lucide-react';
import { ItemType, ITEM_TYPE_LABELS } from '@/types';
import styles from './ItemTypeBadge.module.css';

interface ItemTypeBadgeProps {
  type: ItemType | string;
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}

export function getItemTypeIcon(type: string, iconSize = 13) {
  switch (type) {
    case 'note':
      return <FileText size={iconSize} />;
    case 'task':
      return <CheckSquare size={iconSize} />;
    case 'tracker':
      return <Target size={iconSize} />;
    case 'project':
      return <Folder size={iconSize} />;
    case 'expense':
      return <DollarSign size={iconSize} />;
    case 'income':
      return <TrendingUp size={iconSize} />;
    case 'journal':
      return <BookOpen size={iconSize} />;
    case 'habit':
      return <Flame size={iconSize} />;
    case 'goal':
      return <Target size={iconSize} />;
    default:
      return <Layers size={iconSize} />;
  }
}

export function ItemTypeBadge({
  type,
  size = 'md',
  showLabel = true,
  className = '',
}: ItemTypeBadgeProps) {
  const iconSize = size === 'sm' ? 11 : 13;
  const label = ITEM_TYPE_LABELS[type as ItemType] || type;

  return (
    <span
      className={`${styles.badge} ${styles[type] || styles.default} ${size === 'sm' ? styles.sm : ''} ${className}`}
    >
      <span className={styles.icon}>{getItemTypeIcon(type, iconSize)}</span>
      {showLabel && <span className={styles.label}>{label}</span>}
    </span>
  );
}
