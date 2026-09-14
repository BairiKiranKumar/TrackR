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
    const tables = [
      'automation_executions',
      'automation_rules',
      'financial_candidates',
      'fa_transactions',
      'fa_budgets',
      'fa_planned_payments',
      'fa_investments',
      'fa_debts',
      'fa_accounts',
      'fa_categories',
      'fa_labels',
      'item_relations',
      'items',
      'activity_events',
      'diagnostic_events',
    ];
    for (const t of tables) {
      await sb.from(t).delete().eq('user_id', this.userId);
    }
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

  async upsertFinanceEntity(entityType: string, payload: unknown): Promise<void> {
    const mapping = getFinanceTableAndRow(entityType, payload, this.userId);
    if (!mapping) return;
    const sb = this.client();
    const { error } = await sb.from(mapping.table).upsert(mapping.row, { onConflict: 'id' });
    if (error) throw error;
  }

  async deleteFinanceEntity(entityType: string, id: string): Promise<void> {
    const table = getFinanceTable(entityType);
    if (!table) return;
    const sb = this.client();
    const { error } = await sb.from(table).delete().eq('id', id).eq('user_id', this.userId);
    if (error) throw error;
  }
}

function getFinanceTable(entityType: string): string | null {
  const map: Record<string, string> = {
    fa_account: 'fa_accounts',
    fa_transaction: 'fa_transactions',
    fa_category: 'fa_categories',
    fa_budget: 'fa_budgets',
    fa_planned: 'fa_planned_payments',
    fa_investment: 'fa_investments',
    fa_debt: 'fa_debts',
    fa_label: 'fa_labels',
    fa_candidate: 'financial_candidates',
    fa_automation: 'automation_rules',
    fa_automation_history: 'automation_executions',
  };
  return map[entityType] ?? null;
}

function getFinanceTableAndRow(entityType: string, payload: unknown, userId: string): { table: string; row: Record<string, unknown> } | null {
  const p = payload as Record<string, unknown>;
  switch (entityType) {
    case 'fa_account':
      return {
        table: 'fa_accounts',
        row: {
          id: p.id,
          user_id: userId,
          name: p.name,
          institution: p.institution ?? null,
          type: p.type,
          currency: p.currency ?? 'INR',
          opening_balance: p.openingBalance ?? 0,
          current_balance: p.currentBalance ?? 0,
          notes: p.notes ?? null,
          archived: p.archived ?? false,
          created_at: p.createdAt ?? new Date().toISOString(),
          updated_at: p.updatedAt ?? new Date().toISOString(),
        },
      };
    case 'fa_transaction':
      return {
        table: 'fa_transactions',
        row: {
          id: p.id,
          user_id: userId,
          account_id: p.accountId,
          date: p.date,
          amount: p.amount,
          currency: p.currency ?? 'INR',
          type: p.type,
          category_id: p.categoryId ?? null,
          payee: p.payee ?? null,
          note: p.note ?? null,
          labels: p.labels ?? [],
          project_id: p.projectId ?? null,
          goal_id: p.goalId ?? null,
          recurring_id: p.recurringId ?? null,
          transfer_id: p.transferId ?? null,
          source: p.source ?? 'manual',
          rule_executions: p.ruleExecutions ?? [],
          created_at: p.createdAt ?? new Date().toISOString(),
          updated_at: p.updatedAt ?? new Date().toISOString(),
        },
      };
    case 'fa_category':
      return {
        table: 'fa_categories',
        row: {
          id: p.id,
          user_id: userId,
          name: p.name,
          parent_id: p.parentId ?? null,
          type: p.type ?? p.direction ?? 'expense',
          icon: p.icon ?? null,
          archived: p.archived ?? false,
          sort_order: p.sortOrder ?? 0,
          created_at: p.createdAt ?? new Date().toISOString(),
          updated_at: p.updatedAt ?? new Date().toISOString(),
        },
      };
    case 'fa_budget':
      return {
        table: 'fa_budgets',
        row: {
          id: p.id,
          user_id: userId,
          name: p.name,
          category_id: p.categoryId ?? null,
          period: p.period ?? 'monthly',
          target: p.target,
          currency: p.currency ?? 'INR',
          rollover: p.rollover ?? false,
          start_date: p.startDate ?? null,
          end_date: p.endDate ?? null,
          archived: p.archived ?? false,
          created_at: p.createdAt ?? new Date().toISOString(),
          updated_at: p.updatedAt ?? new Date().toISOString(),
        },
      };
    case 'fa_planned':
      return {
        table: 'fa_planned_payments',
        row: {
          id: p.id,
          user_id: userId,
          account_id: p.accountId,
          name: p.name,
          amount: p.amount,
          currency: p.currency ?? 'INR',
          type: p.type ?? 'expense',
          category_id: p.categoryId ?? null,
          recurrence_rule: p.recurrenceRule ?? p.recurrence ?? null,
          next_due_date: p.nextDueDate ?? p.dueDate ?? null,
          auto_create: p.autoCreate ?? false,
          notes: p.notes ?? null,
          archived: p.archived ?? false,
          created_at: p.createdAt ?? new Date().toISOString(),
          updated_at: p.updatedAt ?? new Date().toISOString(),
        },
      };
    case 'fa_investment':
      return {
        table: 'fa_investments',
        row: {
          id: p.id,
          user_id: userId,
          account_id: p.accountId ?? null,
          name: p.name,
          symbol: p.symbol ?? null,
          type: p.type ?? 'mutual_fund',
          quantity: p.quantity ?? 1,
          buy_price: p.buyPrice ?? 0,
          current_price: p.currentPrice ?? 0,
          currency: p.currency ?? 'INR',
          notes: p.notes ?? null,
          created_at: p.createdAt ?? new Date().toISOString(),
          updated_at: p.updatedAt ?? new Date().toISOString(),
        },
      };
    case 'fa_debt':
      return {
        table: 'fa_debts',
        row: {
          id: p.id,
          user_id: userId,
          name: p.name,
          type: p.type ?? 'loan',
          original_amount: p.originalAmount ?? 0,
          current_balance: p.currentBalance ?? 0,
          interest_rate: p.interestRate ?? 0,
          minimum_payment: p.minimumPayment ?? 0,
          due_day: p.dueDay ?? null,
          lender: p.lender ?? null,
          notes: p.notes ?? null,
          currency: p.currency ?? 'INR',
          created_at: p.createdAt ?? new Date().toISOString(),
          updated_at: p.updatedAt ?? new Date().toISOString(),
        },
      };
    case 'fa_label':
      return {
        table: 'fa_labels',
        row: {
          id: p.id,
          user_id: userId,
          name: p.name,
          color: p.color ?? null,
          created_at: p.createdAt ?? new Date().toISOString(),
        },
      };
    case 'fa_candidate':
      return {
        table: 'financial_candidates',
        row: {
          id: p.id,
          user_id: userId,
          source: p.source ?? 'manual',
          detected_at: p.detectedAt ?? new Date().toISOString(),
          amount: p.amount,
          currency: p.currency ?? 'INR',
          payee: p.payee,
          date: p.date,
          suggested_category: p.suggestedCategory ?? null,
          suggested_account: p.suggestedAccount ?? null,
          suggested_project: p.suggestedProject ?? null,
          suggested_goal: p.suggestedGoal ?? null,
          confidence: p.confidence ?? 1.0,
          reason: p.reason ?? null,
          source_reference: p.sourceReference ?? null,
          status: p.status ?? 'pending',
          notes: p.notes ?? null,
          duplicate_of_id: p.duplicateOfId ?? null,
          rule_id: p.ruleId ?? null,
          created_at: p.createdAt ?? new Date().toISOString(),
          updated_at: p.updatedAt ?? new Date().toISOString(),
        },
      };
    case 'fa_automation':
      return {
        table: 'automation_rules',
        row: {
          id: p.id,
          user_id: userId,
          name: p.name,
          description: p.description ?? null,
          trigger: p.trigger,
          conditions: p.conditions ?? [],
          actions: p.actions ?? [],
          priority: p.priority ?? 10,
          enabled: p.enabled ?? true,
          execution_count: p.executionCount ?? 0,
          last_executed_at: p.lastExecutedAt ?? null,
          created_at: p.createdAt ?? new Date().toISOString(),
          updated_at: p.updatedAt ?? new Date().toISOString(),
        },
      };
    case 'fa_automation_history':
      return {
        table: 'automation_executions',
        row: {
          id: p.id,
          user_id: userId,
          rule_id: p.ruleId,
          target_entity_id: p.targetEntityId,
          target_entity_type: p.targetEntityType,
          executed_at: p.executedAt ?? new Date().toISOString(),
          status: p.status ?? 'success',
          before_state: p.changes ? (p.changes as Record<string, unknown>).before ?? null : null,
          after_state: p.changes ? (p.changes as Record<string, unknown>).after ?? null : null,
          actions_taken: p.explanation ? [p.explanation] : [],
          error: p.status === 'failure' ? p.explanation : null,
          created_at: p.executedAt ?? new Date().toISOString(),
          updated_at: p.executedAt ?? new Date().toISOString(),
        },
      };
    default:
      return null;
  }
}
