-- ─────────────────────────────────────────────────────────────────────────
-- TRACKR Cloud — managed multi-tenant schema (run on the MASTER project)
-- ─────────────────────────────────────────────────────────────────────────
--
-- This is the default remote destination for a new user's data (see
-- src/lib/storage/TrackrSupabaseProvider.ts) — ONE shared Supabase project,
-- every row tagged with the owning user's id, isolated by Row Level
-- Security. This is NOT what §11/BYODB users connect to; their own project
-- still uses the untagged single-tenant schema in
-- supabase/../UserConfigService.ts (USER_DB_SCHEMA_SQL) unchanged.
--
-- NOT APPLIED — authored during this pass but never run against the live
-- project (no service-role/CLI credentials were available in that
-- environment). Run this in the master project's SQL editor before routing
-- any real user through TrackrSupabaseProvider.

-- ── items ───────────────────────────────────────────────────────────────

create table if not exists public.items (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  type         text not null,
  title        text not null,
  content      text default '',
  metadata     jsonb default '{}',
  tags         text[] default '{}',
  pinned       boolean default false,
  archived     boolean default false,
  version      integer default 1,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists items_user_id_idx on public.items(user_id);
create index if not exists items_user_id_type_idx on public.items(user_id, type);
create index if not exists items_user_id_updated_at_idx on public.items(user_id, updated_at desc);

alter table public.items enable row level security;

drop policy if exists "items_select_own" on public.items;
create policy "items_select_own" on public.items for select using (auth.uid() = user_id);

drop policy if exists "items_insert_own" on public.items;
create policy "items_insert_own" on public.items for insert with check (auth.uid() = user_id);

drop policy if exists "items_update_own" on public.items;
create policy "items_update_own" on public.items for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "items_delete_own" on public.items;
create policy "items_delete_own" on public.items for delete using (auth.uid() = user_id);

-- ── item_relations ──────────────────────────────────────────────────────
-- `user_id` is denormalized onto the relation itself (not derived by
-- joining `items`) so RLS can check it directly without a subquery on
-- every row — and so a relation can never "belong" to nobody. The trigger
-- below adds defense-in-depth: even if a client sent a relation whose
-- user_id matched the caller but whose source/target pointed at another
-- user's item, the insert is rejected.

create table if not exists public.item_relations (
  id             text primary key,
  user_id        uuid not null references auth.users(id) on delete cascade,
  source_id      text not null references public.items(id) on delete cascade,
  target_id      text not null references public.items(id) on delete cascade,
  relation_type  text default 'linked',
  created_at     timestamptz default now()
);

create index if not exists item_relations_user_id_idx on public.item_relations(user_id);
create index if not exists item_relations_source_idx on public.item_relations(source_id);
create index if not exists item_relations_target_idx on public.item_relations(target_id);

alter table public.item_relations enable row level security;

drop policy if exists "item_relations_select_own" on public.item_relations;
create policy "item_relations_select_own" on public.item_relations for select using (auth.uid() = user_id);

drop policy if exists "item_relations_insert_own" on public.item_relations;
create policy "item_relations_insert_own" on public.item_relations for insert with check (auth.uid() = user_id);

drop policy if exists "item_relations_delete_own" on public.item_relations;
create policy "item_relations_delete_own" on public.item_relations for delete using (auth.uid() = user_id);

drop policy if exists "item_relations_update_own" on public.item_relations;
create policy "item_relations_update_own" on public.item_relations for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Defense-in-depth: reject a relation whose source or target item belongs
-- to a different user than the relation's own user_id, even though RLS on
-- `items` already means a user can't normally *see* another user's item id
-- to reference it in the first place.
create or replace function public.trackr_check_relation_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.items
    where id = new.source_id and user_id = new.user_id
  ) or not exists (
    select 1 from public.items
    where id = new.target_id and user_id = new.user_id
  ) then
    raise exception 'item_relations: source and target must belong to the same user as the relation';
  end if;
  return new;
end;
$$;

drop trigger if exists trackr_check_relation_owner_trigger on public.item_relations;
create trigger trackr_check_relation_owner_trigger
  before insert or update on public.item_relations
  for each row execute function public.trackr_check_relation_owner();

-- ── activity_events ─────────────────────────────────────────────────────

create table if not exists public.activity_events (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  item_id      text,
  item_title   text,
  item_type    text,
  type         text not null,
  description  text,
  amount       numeric,
  created_at   timestamptz default now()
);

create index if not exists activity_events_user_id_idx on public.activity_events(user_id);

alter table public.activity_events enable row level security;

drop policy if exists "activity_events_select_own" on public.activity_events;
create policy "activity_events_select_own" on public.activity_events for select using (auth.uid() = user_id);

drop policy if exists "activity_events_insert_own" on public.activity_events;
create policy "activity_events_insert_own" on public.activity_events for insert with check (auth.uid() = user_id);

drop policy if exists "activity_events_update_own" on public.activity_events;
create policy "activity_events_update_own" on public.activity_events for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "activity_events_delete_own" on public.activity_events;
create policy "activity_events_delete_own" on public.activity_events for delete using (auth.uid() = user_id);

-- ── diagnostic_events (observability & audit telemetry) ──────────────────

create table if not exists public.diagnostic_events (
  id           text primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  category     text not null,
  message      text not null,
  entity_type  text,
  entity_id    text,
  details      jsonb default '{}',
  created_at   timestamptz default now()
);

create index if not exists diagnostic_events_user_id_idx on public.diagnostic_events(user_id);
create index if not exists diagnostic_events_category_idx on public.diagnostic_events(category);

alter table public.diagnostic_events enable row level security;

drop policy if exists "diagnostic_events_select_own" on public.diagnostic_events;
create policy "diagnostic_events_select_own" on public.diagnostic_events for select using (auth.uid() = user_id);

drop policy if exists "diagnostic_events_insert_own" on public.diagnostic_events;
create policy "diagnostic_events_insert_own" on public.diagnostic_events for insert with check (auth.uid() = user_id);

drop policy if exists "diagnostic_events_delete_own" on public.diagnostic_events;
create policy "diagnostic_events_delete_own" on public.diagnostic_events for delete using (auth.uid() = user_id);

-- ── user_settings ───────────────────────────────────────────────────────
-- Reserved for future use (e.g. syncing non-sensitive preferences across
-- devices). Not currently written to by the app — storage-mode and other
-- settings stay local-only (IndexedDB) by design; see StorageModeService.

create table if not exists public.user_settings (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  key         text not null default 'default',
  value       jsonb default '{}',
  updated_at  timestamptz default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "user_settings_all_own" on public.user_settings;
create policy "user_settings_all_own" on public.user_settings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Finance Tables (Phase 2) ──────────────────────────────────────────────

-- fa_accounts
create table if not exists public.fa_accounts (
  id              text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  institution     text,
  type            text not null,
  currency        text not null default 'INR',
  opening_balance numeric not null default 0,
  current_balance numeric not null default 0,
  notes           text,
  archived        boolean default false,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists fa_accounts_user_id_idx on public.fa_accounts(user_id);
alter table public.fa_accounts enable row level security;
create policy "fa_accounts_own" on public.fa_accounts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- fa_transactions
create table if not exists public.fa_transactions (
  id              text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  account_id      text not null references public.fa_accounts(id) on delete cascade,
  date            date not null,
  amount          numeric not null,
  currency        text not null default 'INR',
  type            text not null,
  category_id     text,
  payee           text,
  note            text,
  labels          text[] default '{}',
  project_id      text,
  goal_id         text,
  recurring_id    text,
  transfer_id     text,
  source          text default 'manual',
  rule_executions jsonb default '[]',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists fa_transactions_user_id_idx on public.fa_transactions(user_id);
create index if not exists fa_transactions_account_idx on public.fa_transactions(user_id, account_id);
create index if not exists fa_transactions_date_idx on public.fa_transactions(user_id, date desc);
create index if not exists fa_transactions_cat_idx on public.fa_transactions(user_id, category_id);
alter table public.fa_transactions enable row level security;
create policy "fa_transactions_own" on public.fa_transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- fa_categories
create table if not exists public.fa_categories (
  id              text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  parent_id       text references public.fa_categories(id) on delete set null,
  type            text not null,
  icon            text,
  archived        boolean default false,
  sort_order      integer default 0,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists fa_categories_user_id_idx on public.fa_categories(user_id);
alter table public.fa_categories enable row level security;
create policy "fa_categories_own" on public.fa_categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- fa_budgets
create table if not exists public.fa_budgets (
  id              text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  target          numeric not null,
  period          text not null,
  category_id     text,
  rollover        boolean default false,
  alert_threshold numeric default 0.8,
  start_date      date,
  end_date        date,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists fa_budgets_user_id_idx on public.fa_budgets(user_id);
alter table public.fa_budgets enable row level security;
create policy "fa_budgets_own" on public.fa_budgets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- fa_rules
create table if not exists public.fa_rules (
  id              text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  conditions      jsonb not null default '[]',
  actions         jsonb not null default '[]',
  priority        integer default 0,
  enabled         boolean default true,
  execution_count integer default 0,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists fa_rules_user_id_idx on public.fa_rules(user_id);
alter table public.fa_rules enable row level security;
create policy "fa_rules_own" on public.fa_rules for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- fa_planned_payments
create table if not exists public.fa_planned_payments (
  id              text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  amount          numeric not null,
  currency        text not null default 'INR',
  account_id      text not null references public.fa_accounts(id) on delete cascade,
  category_id     text,
  due_date        date not null,
  recurrence      jsonb,
  status          text not null default 'pending',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists fa_planned_user_id_idx on public.fa_planned_payments(user_id);
alter table public.fa_planned_payments enable row level security;
create policy "fa_planned_own" on public.fa_planned_payments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- fa_investments
create table if not exists public.fa_investments (
  id              text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  asset_name      text not null,
  asset_type      text not null,
  quantity        numeric not null default 0,
  avg_price       numeric not null default 0,
  current_price   numeric not null default 0,
  currency        text not null default 'INR',
  account_id      text references public.fa_accounts(id) on delete set null,
  last_updated_at timestamptz default now(),
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists fa_investments_user_id_idx on public.fa_investments(user_id);
alter table public.fa_investments enable row level security;
create policy "fa_investments_own" on public.fa_investments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- fa_debts
create table if not exists public.fa_debts (
  id              text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  person          text not null,
  direction       text not null,
  amount          numeric not null,
  currency        text not null default 'INR',
  date            date not null,
  due_date        date,
  repayments      jsonb default '[]',
  status          text not null default 'active',
  notes           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists fa_debts_user_id_idx on public.fa_debts(user_id);
alter table public.fa_debts enable row level security;
create policy "fa_debts_own" on public.fa_debts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- fa_labels
create table if not exists public.fa_labels (
  id              text primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  color           text not null,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists fa_labels_user_id_idx on public.fa_labels(user_id);
alter table public.fa_labels enable row level security;
create policy "fa_labels_own" on public.fa_labels for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
