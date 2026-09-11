import { getMasterSupabase } from '@/lib/supabase';
import { Item, ItemRelation, ItemType } from '@/types';
import { RemoteStorageProvider } from './RemoteStorageProvider';

function toRow(item: Item, userId: string): Record<string, unknown> {
  return {
    id: item.id,
    user_id: userId,
    type: item.type,
    title: item.title,
    content: item.content ?? '',
    metadata: item.metadata ?? {},
    tags: item.tags ?? [],
    pinned: item.pinned ?? false,
    archived: item.archived ?? false,
    version: item.version ?? 1,
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
    version: typeof row.version === 'number' ? row.version : 1,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function toRelationRow(relation: ItemRelation, userId: string): Record<string, unknown> {
  return {
    id: relation.id,
    user_id: userId,
    source_id: relation.sourceId,
    target_id: relation.targetId,
    relation_type: relation.relationType,
    created_at: relation.createdAt,
  };
}

function fromRelationRow(row: Record<string, unknown>): ItemRelation {
  return {
    id: row.id as string,
    sourceId: row.source_id as string,
    targetId: row.target_id as string,
    relationType: (row.relation_type as ItemRelation['relationType']) ?? 'linked',
    createdAt: row.created_at as string,
  };
}

/**
 * TRACKR's default, managed cloud backend — one shared Supabase project
 * ("TRACKR Cloud") holding every user's data, isolated by a `user_id`
 * column plus Row Level Security (`auth.uid() = user_id`). This is what a
 * new user gets automatically; no configuration step, no Supabase
 * terminology surfaced to them. See supabase/trackr-cloud-schema.sql for
 * the schema and policies this provider assumes are in place.
 *
 * `user_id` is stamped on every write from here (not trusted from the
 * client alone) — RLS is what actually enforces isolation at the database
 * level; this is defense-in-depth so a row is never even attempted for the
 * wrong user.
 */
type SupabaseLike = ReturnType<typeof getMasterSupabase>;

export class TrackrSupabaseProvider implements RemoteStorageProvider {
  readonly kind = 'trackr_cloud' as const;

  /**
   * `injectedClient` is a test seam only — production code always omits it
   * and gets the real, lazily-created master client. Letting tests supply a
   * fake client here avoids depending on env-var timing/module-load order.
   */
  constructor(private readonly userId: string, private readonly injectedClient?: SupabaseLike) {}

  private client() {
    const sb = this.injectedClient ?? getMasterSupabase();
    if (!sb) throw new Error('TRACKR Cloud is not available (not signed in).');
    return sb;
  }

  async upsertItem(item: Item): Promise<void> {
    const sb = this.client();
    const { error } = await sb.from('items').upsert(toRow(item, this.userId), { onConflict: 'id' });
    if (error) throw error;
  }

  async deleteItem(id: string): Promise<void> {
    const sb = this.client();
    const { error } = await sb.from('items').delete().eq('id', id).eq('user_id', this.userId);
    if (error) throw error;
    // The schema's ON DELETE CASCADE handles this too — deleted explicitly
    // here as well so behavior doesn't silently depend on that being set up
    // correctly in every deployment of the schema.
    await sb.from('item_relations').delete()
      .or(`source_id.eq.${id},target_id.eq.${id}`)
      .eq('user_id', this.userId);
  }

  async upsertRelation(relation: ItemRelation): Promise<void> {
    const sb = this.client();
    const { error } = await sb.from('item_relations').upsert(toRelationRow(relation, this.userId), { onConflict: 'id' });
    if (error) throw error;
  }

  async deleteRelation(id: string): Promise<void> {
    const sb = this.client();
    const { error } = await sb.from('item_relations').delete().eq('id', id).eq('user_id', this.userId);
    if (error) throw error;
  }

  async clearAll(): Promise<void> {
    const sb = this.client();
    await sb.from('item_relations').delete().eq('user_id', this.userId);
    await sb.from('items').delete().eq('user_id', this.userId);
    await sb.from('activity_events').delete().eq('user_id', this.userId);
  }

  async pullItems(): Promise<Item[]> {
    const sb = this.client();
    const { data, error } = await sb
      .from('items')
      .select('*')
      .eq('user_id', this.userId)
      .eq('archived', false)
      .order('updated_at', { ascending: false });
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map(fromRow);
  }

  async pullRelations(): Promise<ItemRelation[]> {
    const sb = this.client();
    const { data, error } = await sb
      .from('item_relations')
      .select('*')
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map(fromRelationRow);
  }
}
