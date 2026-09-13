'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Bold, Italic, Hash, AtSign, Check, IndianRupee, ArrowLeft, MoreVertical, Type, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { dataService } from '@/lib/services/DataService';
import { Item } from '@/types';
import { AtMention } from './AtMention';
import { MoneyDetector } from './MoneyDetector';
import { moneyDetectionService } from '@/lib/services/MoneyDetectionService';
import styles from './NoteEditor.module.css';
import { useAppContext } from '@/components/providers/AppProvider';
import { useConfirm } from '@/components/providers/ConfirmDialogProvider';
import { format } from 'date-fns';
import { ContextPanel } from '@/components/context/ContextPanel';

interface NoteEditorProps {
  item: Item;
  onSaved?: (item: Item) => void;
}

export function NoteEditor({ item, onSaved }: NoteEditorProps) {
  const router = useRouter();
  const { items, refreshItems } = useAppContext();
  const confirm = useConfirm();
  const editorRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [title, setTitle] = useState(item.title || '');
  const [content, setContent] = useState(item.content || '');
  const [saved, setSaved] = useState(true);

  // @ mention state
  const [atQuery, setAtQuery] = useState('');
  const [showAtMenu, setShowAtMenu] = useState(false);
  const [atPosition, setAtPosition] = useState<{ x: number; y: number } | null>(null);
  const [atTriggerRange, setAtTriggerRange] = useState<{ start: number; end: number } | null>(null);

  // Money detection
  const [moneyDetections, setMoneyDetections] = useState<{ amount: number; rawText: string }[]>([]);

  // Set initial content
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerText = item.content || '';
    }
  }, []);

  const autoSave = useCallback(async (newTitle: string, newContent: string) => {
    setSaved(false);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const updated = await dataService.updateItem(item.id, {
          title: newTitle || 'Untitled',
          content: newContent,
        });
        if (updated) {
          await refreshItems();
          if (onSaved) onSaved(updated);
        }
        setSaved(true);
      } catch (err) {
        console.error('Save error:', err);
      }
    }, 600);
  }, [item.id, refreshItems, onSaved]);

  function handleInput() {
    const text = editorRef.current?.innerText ?? '';
    setContent(text);
    setSaved(false);
    autoSave(title, text);

    // Detect money amounts
    const detections = moneyDetectionService.detect(text);
    setMoneyDetections(detections.slice(0, 1)); // show top 1 suggestion

    // Detect @ trigger
    detectAtMention();
  }

  function detectAtMention() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    const text = editorRef.current?.innerText ?? '';
    const offset = getCaretOffset();

    // Find @ before cursor
    const textBeforeCursor = text.slice(0, offset);
    const atIdx = textBeforeCursor.lastIndexOf('@');

    if (atIdx === -1) {
      setShowAtMenu(false);
      return;
    }

    const afterAt = textBeforeCursor.slice(atIdx + 1);
    // Stop if there's a space in the query (unless it's short)
    if (afterAt.includes('\n') || afterAt.length > 50) {
      setShowAtMenu(false);
      return;
    }

    setAtQuery(afterAt);

    // Get position for dropdown
    const rect = range.getBoundingClientRect();
    setAtPosition({ x: rect.left, y: rect.bottom });
    setAtTriggerRange({ start: atIdx, end: offset });
    setShowAtMenu(true);
  }

  function getCaretOffset(): number {
    const el = editorRef.current;
    if (!el) return 0;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return 0;
    const range = sel.getRangeAt(0).cloneRange();
    range.selectNodeContents(el);
    range.setEnd(sel.getRangeAt(0).endContainer, sel.getRangeAt(0).endOffset);
    return range.toString().length;
  }

  function insertAtMention(selectedItem: Item) {
    if (!editorRef.current || !atTriggerRange) return;

    const text = editorRef.current.innerText;
    const before = text.slice(0, atTriggerRange.start);
    const after = text.slice(atTriggerRange.end);
    const mention = `@${selectedItem.title} `;

    editorRef.current.innerText = before + mention + after;

    // Move caret after mention
    const newOffset = before.length + mention.length;
    setCaretAt(editorRef.current, newOffset);

    const newContent = editorRef.current.innerText;
    setContent(newContent);
    autoSave(title, newContent);
    setShowAtMenu(false);
  }

  function setCaretAt(el: HTMLElement, offset: number) {
    const range = document.createRange();
    const sel = window.getSelection();
    if (!sel) return;

    let charCount = 0;
    function findNode(node: ChildNode): boolean {
      if (node.nodeType === Node.TEXT_NODE) {
        const len = node.textContent?.length ?? 0;
        if (charCount + len >= offset) {
          range.setStart(node, offset - charCount);
          range.setEnd(node, offset - charCount);
          return true;
        }
        charCount += len;
      } else {
        for (const child of Array.from(node.childNodes)) {
          if (findNode(child)) return true;
        }
      }
      return false;
    }

    if (!findNode(el)) {
      range.selectNodeContents(el);
      range.collapse(false);
    }

    sel.removeAllRanges();
    sel.addRange(range);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (showAtMenu && (e.key === 'Escape' || e.key === 'Tab')) {
      setShowAtMenu(false);
    }
  }

  async function handleMoneyAccept(amount: number) {
    const expense = await dataService.createItem({
      type: 'expense',
      title: `₹${amount.toLocaleString('en-IN')} expense`,
      content: `Expense noted from "${title || 'Note'}"`,
      metadata: {
        amount,
        currency: 'INR',
        category: 'other',
        isIncome: false,
        date: new Date().toISOString().split('T')[0],
      },
    });
    await dataService.linkItems(item.id, expense.id, 'references');
    await refreshItems();
    setMoneyDetections([]);
  }

  function insertAtCaret(text: string) {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand('insertText', false, text);
  }

  const formattedDate = format(new Date(item.createdAt), 'MMMM d, yyyy');

  async function handleDeleteNote() {
    const confirmed = await confirm({
      title: `Delete "${title || 'Untitled'}"?`,
      message: 'This can’t be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await dataService.deleteItem(item.id);
      await refreshItems();
      router.push('/notes');
    } catch (err) {
      console.error('Delete error:', err);
    }
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <button
          className="btn btn-icon btn-ghost"
          onClick={() => router.back()}
          id="btn-note-back"
          aria-label="Go back"
        >
          <ArrowLeft size={20} />
        </button>
        <div className={styles.saveStatus}>
          {saved ? (
            <span className={styles.saved}>
              <Check size={12} /> Saved
            </span>
          ) : (
            <span className={styles.saving}>Saving…</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            className="btn btn-icon btn-ghost"
            onClick={handleDeleteNote}
            id="btn-note-delete"
            aria-label="Delete note"
            title="Delete note"
            style={{ color: 'var(--color-danger)' }}
          >
            <Trash2 size={18} />
          </button>
          <button className="btn btn-icon btn-ghost" id="btn-note-more" aria-label="More options">
            <MoreVertical size={20} />
          </button>
        </div>
      </div>

      {/* Editor area */}
      <div className={styles.editorArea}>
        <div className={styles.meta}>
          <span className={styles.itemType}>
            {item.type === 'journal' ? '📖 Journal' : item.type === 'note' ? '📝 Note' : '✅ Task'}
          </span>
          <span className={styles.date}>{formattedDate}</span>
        </div>

        <input
          ref={titleRef}
          className={styles.titleInput}
          placeholder="Title"
          value={title}
          onChange={e => {
            setTitle(e.target.value);
            autoSave(e.target.value, content);
          }}
          id="input-note-title"
        />

        <div
          ref={editorRef}
          id="note-editor-body"
          className={styles.editor}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          data-placeholder="Start writing… type @ to reference anything"
          role="textbox"
          aria-multiline="true"
          aria-label="Note content"
        />

        {/* Universal Context Panel */}
        <div style={{ marginTop: '2.5rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1.5rem' }}>
          <ContextPanel
            entityId={item.id}
            entityType="note"
            entityTitle={title || item.title || 'Untitled Note'}
            onLinkChanged={refreshItems}
          />
        </div>
      </div>

      {/* Money detection banner */}
      {moneyDetections.length > 0 && (
        <MoneyDetector
          detection={moneyDetections[0]}
          onAccept={handleMoneyAccept}
          onDismiss={() => setMoneyDetections([])}
        />
      )}

      {/* @ Autocomplete */}
      {showAtMenu && (
        <AtMention
          query={atQuery}
          items={items}
          position={atPosition}
          onSelect={insertAtMention}
          onClose={() => setShowAtMenu(false)}
        />
      )}

      {/* Bottom toolbar */}
      <div className={styles.toolbar}>
        <button
          className={styles.toolBtn}
          onClick={() => insertAtCaret('**')}
          title="Bold"
          id="btn-note-bold"
        >
          <Bold size={18} />
        </button>
        <button
          className={styles.toolBtn}
          onClick={() => insertAtCaret('_')}
          title="Italic"
          id="btn-note-italic"
        >
          <Italic size={18} />
        </button>
        <button
          className={styles.toolBtn}
          onClick={() => insertAtCaret('@')}
          title="Reference"
          id="btn-note-at"
        >
          <AtSign size={18} />
        </button>
        <button
          className={styles.toolBtn}
          onClick={() => insertAtCaret('☐ ')}
          title="Checkbox"
          id="btn-note-check"
        >
          <Check size={18} />
        </button>
        <button
          className={styles.toolBtn}
          onClick={() => insertAtCaret('₹')}
          title="Rupee"
          id="btn-note-rupee"
        >
          <IndianRupee size={18} />
        </button>
        <button
          className={styles.toolBtn}
          onClick={() => insertAtCaret('#')}
          title="Tag"
          id="btn-note-hash"
        >
          <Hash size={18} />
        </button>
        <button
          className={styles.toolBtn}
          onClick={() => insertAtCaret('# ')}
          title="Heading"
          id="btn-note-heading"
        >
          <Type size={18} />
        </button>
      </div>
    </div>
  );
}
