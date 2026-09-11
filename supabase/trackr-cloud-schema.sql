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

-- ── Verification ─────────────────────────────────────────────────────────
-- As User A (signed in via the app, browser devtools):
--   await supabase.from('items').select('*')            -- only A's rows
--   await supabase.from('items').select('*').eq('user_id', '<B's uuid>')  -- empty, not an error
--   await supabase.from('items').insert({ id: 'x', user_id: '<B's uuid>', type: 'note', title: 'hi' })
--     -- must be REJECTED (RLS insert policy requires auth.uid() = user_id)
