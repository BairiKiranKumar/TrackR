'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { dataService } from '@/lib/services/DataService';
import { Item } from '@/types';
import { NoteEditor } from '@/components/editor/NoteEditor';

export default function NoteEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { id } = await params;
      const found = await dataService.getItemById(id);
      if (!found) {
        router.replace('/notes');
        return;
      }
      setItem(found);
      setLoading(false);
    }
    load();
  }, [params]);

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100dvh',
        color: 'var(--text-tertiary)',
        fontFamily: 'var(--font-family)',
      }}>
        Loading…
      </div>
    );
  }

  if (!item) return null;
  return <NoteEditor item={item} />;
}
