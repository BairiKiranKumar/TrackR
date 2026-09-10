'use client';

import { useEffect, useRef, useState } from 'react';
import { Item, ITEM_TYPE_EMOJIS } from '@/types';
import { getAtMentionSuggestions } from '@/lib/services/ReferenceParser';
import styles from './AtMention.module.css';

interface AtMentionProps {
  query: string;
  items: Item[];
  position: { x: number; y: number } | null;
  onSelect: (item: Item) => void;
  onClose: () => void;
}

export function AtMention({ query, items, position, onSelect, onClose }: AtMentionProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [prevQuery, setPrevQuery] = useState(query);
  const listRef = useRef<HTMLDivElement>(null);

  const suggestions = getAtMentionSuggestions(query, items);

  // Reset selection when suggestions change
  if (prevQuery !== query) {
    setPrevQuery(query);
    setSelectedIndex(0);
  }

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (!suggestions.length) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, suggestions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onSelect(suggestions[selectedIndex]);
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [suggestions, selectedIndex, onSelect]);

  if (!suggestions.length) return null;

  // Position the dropdown near the @ cursor
  const top = position ? Math.min(position.y + 4, window.innerHeight - 280) : 100;
  const left = position ? Math.max(8, Math.min(position.x, window.innerWidth - 280)) : 16;

  return (
    <>
      <div className="overlay" onClick={onClose} style={{ background: 'transparent' }} />
      <div
        id="at-mention-dropdown"
        className={styles.dropdown}
        style={{ top, left }}
        ref={listRef}
        role="listbox"
        aria-label="Reference suggestions"
      >
        {query && (
          <div className={styles.header}>
            Linking <span className={styles.query}>@{query}</span>
          </div>
        )}
        {suggestions.map((item, i) => (
          <button
            key={item.id}
            className={`${styles.item} ${i === selectedIndex ? styles.selected : ''}`}
            onClick={() => onSelect(item)}
            role="option"
            aria-selected={i === selectedIndex}
            id={`at-suggestion-${item.id}`}
          >
            <span className={styles.emoji}>{ITEM_TYPE_EMOJIS[item.type]}</span>
            <div className={styles.itemContent}>
              <span className={styles.itemTitle}>{item.title}</span>
              <span className={styles.itemType}>{item.type}</span>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
