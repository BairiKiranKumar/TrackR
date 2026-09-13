'use client';

import React, { useEffect, useState } from 'react';
import { FinanceCategory, CategoryDirection } from '@/types/finance';
import { financeCategoryService } from '@/lib/services/finance/FinanceCategoryService';

interface CategorySelectProps {
  value?: string;
  onChange: (categoryId: string) => void;
  direction?: CategoryDirection;
  placeholder?: string;
  allowNone?: boolean;
  className?: string;
  id?: string;
}

interface TreeItem {
  category: FinanceCategory;
  children: FinanceCategory[];
}

export function CategorySelect({
  value = '',
  onChange,
  direction,
  placeholder = 'Select category…',
  allowNone = true,
  className,
  id = 'category-select',
}: CategorySelectProps) {
  const [tree, setTree] = useState<TreeItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    financeCategoryService.getCategoryTree(direction).then(res => {
      if (!cancelled) setTree(res);
    });
    return () => { cancelled = true; };
  }, [direction]);

  return (
    <select
      id={id}
      value={value}
      onChange={e => onChange(e.target.value)}
      className={className || 'input'}
      style={{
        width: '100%',
        padding: '8px 12px',
        borderRadius: '8px',
        backgroundColor: 'var(--bg-input, #16161a)',
        color: 'var(--text-primary, #f4f4f6)',
        border: '1px solid var(--border-default, rgba(255,255,255,0.12))',
        fontSize: '0.9rem',
      }}
    >
      {allowNone && <option value="">{placeholder}</option>}
      {tree.map(node => (
        <React.Fragment key={node.category.id}>
          <option value={node.category.id} style={{ fontWeight: 'bold' }}>
            {node.category.icon ? `${node.category.icon} ` : ''}{node.category.name}
          </option>
          {node.children.map(child => (
            <option key={child.id} value={child.id}>
              &nbsp;&nbsp;&nbsp;↳ {child.icon ? `${child.icon} ` : ''}{child.name}
            </option>
          ))}
        </React.Fragment>
      ))}
    </select>
  );
}
