import { getUserSupabase } from '@/lib/supabase';
import { Item, ItemRelation, ItemType } from '@/types';
import { RemoteStorageProvider } from './RemoteStorageProvider';

function toRow(item: Item): Record<string, unknown> {
  return {
    id: item.id,
    type: item.type,
    title: item.title,
    content: item.content ?? '',
    metadata: item.metadata ?? {},
    tags: item.tags ?? [],
    pinned: item.pinned ?? false,
    archived: item.archived ?? false,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

function fromRow(row: Record<string, unknown>): Item {
  return {
    id: row.id as string,
    type: row.type as ItemType,
    title: row.title as string,
    content: (row.content as string) ?? '',
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    tags: (row.tags as string[]) ?? [],
    pinned: (row.pinned as boolean) ?? false,
    archived: (row.archived as boolean) ?? false,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function toRelationRow(relation: ItemRelation): Record<string, unknown> {
  return {
    id: relation.id,
    source_id: relation.sourceId,
    target_id: relation.targetId,
    relation_type: relation.relationType,
    created_at: relation.createdAt,
  };
}

/**
 * "Bring your own database" — an advanced, explicitly opted-into option
 * (Settings → Data & Storage → Advanced) where the user's data lives in a
 * Supabase project *they* own and control. There is exactly one tenant per
 * project here, so unlike TrackrSupabaseProvider there is no `user_id`
 * column to stamp — isolation is "it's a different database entirely,"
 * enforced by the user holding their own project's keys.
 */
type SupabaseLike = ReturnType<typeof getUserSupabase>;

export class CustomSupabaseProvider implements RemoteStorageProvider {
  readonly kind = 'custom_supabase' as const;

  /** Test seam only — see TrackrSupabaseProvider's constructor comment. */
  constructor(private readonly injectedClient?: SupabaseLike) {}

  private client() {
    const sb = this.injectedClient ?? getUserSupabase();
    if (!sb) throw new Error('Custom Supabase storage is not connected.');
    return sb;
  }

  async upsertItem(item: Item): Promise<void> {
    const sb = this.client();
    const { error } = await sb.from('items').upsert(toRow(item), { onConflict: 'id' });
    if (error) throw error;
  }

  async deleteItem(id: string): Promise<void> {
    const sb = this.client();
    const { error } = await sb.from('items').delete().eq('id', id);
    if (error) throw error;
    await sb.from('item_relations').delete().or(`source_id.eq.${id},target_id.eq.${id}`);
  }

  async upsertRelation(relation: ItemRelation): Promise<void> {
    const sb = this.client();
    const { error } = await sb.from('item_relations').upsert(toRelationRow(relation), { onConflict: 'id' });
    if (error) throw error;
  }

  async deleteRelation(id: string): Promise<void> {
    const sb = this.client();
    const { error } = await sb.from('item_relations').delete().eq('id', id);
    if (error) throw error;
  }

  async clearAll(): Promise<void> {
    const sb = this.client();
    await sb.from('items').delete().neq('id', '0');
    await sb.from('item_relations').delete().neq('id', '0');
    await sb.from('activity_events').delete().neq('id', '0');
  }

  async pullItems(): Promise<Item[]> {
    const sb = this.client();
    const { data, error } = await sb
      .from('items')
      .select('*')
      .eq('archived', false)
      .order('updated_at', { ascending: false });
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map(fromRow);
  }
}
