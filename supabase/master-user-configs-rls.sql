-- ─────────────────────────────────────────────────────────────────────────
-- REQUIRED: Row Level Security for the master project's `user_configs` table
-- ─────────────────────────────────────────────────────────────────────────
--
-- Context (see UserConfigService.ts / AuthProvider.tsx):
-- TRACKR isolates each user's app data by giving them their OWN Supabase
-- project. The master project is shared across all users and holds exactly
-- one sensitive table: `user_configs`, which stores each user's per-project
-- `supabase_url` and `supabase_anon_key`.
--
-- The app only ever queries this table with `.eq('user_id', <session user>)`
-- (UserConfigService.getUserConfig), but that is an APPLICATION-LEVEL filter.
-- The Supabase client used for it is the public anon key, so if this table
-- does not also have Row Level Security enabled, anyone holding that anon
-- key (i.e. anyone who loaded the app) can query `user_configs` directly via
-- the PostgREST API with no `user_id` filter at all, and read every other
-- user's `supabase_anon_key` — which hands them full read/write access to
-- that user's entire personal TRACKR database (all items, notes, expenses).
--
-- This was not verifiable or fixable from the application code during the
-- Phase 1 audit (it requires running SQL against the live master project,
-- which this environment has no credentials for). Run the statements below
-- in the master project's SQL editor before shipping to more than one user.

alter table public.user_configs enable row level security;

drop policy if exists "user_configs_select_own" on public.user_configs;
create policy "user_configs_select_own"
  on public.user_configs
  for select
  using (auth.uid() = user_id::uuid);

drop policy if exists "user_configs_upsert_own" on public.user_configs;
create policy "user_configs_upsert_own"
  on public.user_configs
  for insert
  with check (auth.uid() = user_id::uuid);

drop policy if exists "user_configs_update_own" on public.user_configs;
create policy "user_configs_update_own"
  on public.user_configs
  for update
  using (auth.uid() = user_id::uuid)
  with check (auth.uid() = user_id::uuid);

drop policy if exists "user_configs_delete_own" on public.user_configs;
create policy "user_configs_delete_own"
  on public.user_configs
  for delete
  using (auth.uid() = user_id::uuid);

-- Verify (run as an authenticated non-owner or via `supabase db test`):
--   select * from user_configs; -- must return only the caller's own row.
