'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Plus, Pin, BookOpen, FileText } from 'lucide-react';
import { useAppContext } from '@/components/providers/AppProvider';
import { Item } from '@/types';
import { format } from 'date-fns';
import { dataService } from '@/lib/services/DataService';
import styles from './page.module.css';

export default function NotesPage() {
  const router = useRouter();
  const { items, refreshItems } = useAppContext();
  const [query, setQuery] = useState('');

  const noteItems = items.filter(i => i.type === 'note' || i.type === 'journal');

  const filtered = query
    ? noteItems.filter(n =>
        n.title.toLowerCase().includes(query.toLowerCase()) ||
        n.content?.toLowerCase().includes(query.toLowerCase())
      )
    : noteItems;

  const pinned = filtered.filter(n => n.pinned);
  const rest = filtered.filter(n => !n.pinned);

  async function createNote() {
    const item = await dataService.createItem({
      type: 'note',
      title: '',
      content: '',
      metadata: {},
    });
    await refreshItems();
    router.push(`/notes/${item.id}`);
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Notes</h1>
        <button
          className="btn btn-primary btn-icon btn-round"
          onClick={createNote}
          id="btn-notes-new"
          aria-label="New note"
        >
          <Plus size={20} />
        </button>
      </div>

      {/* Search */}
      <div className={styles.searchBar}>
        <Search size={16} className={styles.searchIcon} />
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search notes…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          id="input-notes-search"
        />
      </div>

      {/* Quick new note prompt */}
      <button
        className={styles.quickNote}
        onClick={createNote}
        id="btn-quick-note-prompt"
      >
        <span className={styles.quickNotePlaceholder}>
          ✍️ What are you thinking about?
        </span>
      </button>

      {filtered.length === 0 && (
        <div className="empty-state">
          <span className="empty-state__icon">📝</span>
          <span className="empty-state__title">No notes yet</span>
          <span className="empty-state__subtitle">
            Tap the + button to start your first note. Use @mentions to link everything.
          </span>
        </div>
      )}

      {pinned.length > 0 && (
        <>
          <div className="section-header" style={{ marginBottom: 8 }}>
            <span className="section-title"><Pin size={11} style={{ display: 'inline', marginRight: 4 }} />Pinned</span>
          </div>
          <div className={styles.noteList}>
            {pinned.map(note => <NoteCard key={note.id} note={note} />)}
          </div>
        </>
      )}

      {rest.length > 0 && (
        <>
          {pinned.length > 0 && (
            <div className="section-header" style={{ margin: '20px 0 8px' }}>
              <span className="section-title">All Notes</span>
            </div>
          )}
          <div className={styles.noteList}>
            {rest.map(note => <NoteCard key={note.id} note={note} />)}
          </div>
        </>
      )}
    </div>
  );
}

function NoteCard({ note }: { note: Item }) {
  const preview = note.content?.replace(/\n/g, ' ').slice(0, 80) || 'Empty note';
  const isJournal = note.type === 'journal';

  return (
    <Link
      href={`/notes/${note.id}`}
      className={styles.noteCard}
      id={`link-note-${note.id}`}
    >
      <div className={styles.noteTop}>
        <span className={styles.noteIcon}>
          {isJournal ? <BookOpen size={15} /> : <FileText size={15} />}
        </span>
        <span className={styles.noteTitle}>{note.title || 'Untitled'}</span>
        {note.pinned && <Pin size={12} className={styles.pinIcon} />}
      </div>
      <p className={styles.notePreview}>{preview}</p>
      <div className={styles.noteMeta}>
        <span className={styles.noteDate}>
          {format(new Date(note.updatedAt), 'MMM d')}
        </span>
        {note.tags.length > 0 && (
          <div className={styles.noteTags}>
            {note.tags.slice(0, 2).map(t => (
              <span key={t} className={styles.noteTag}>#{t}</span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
