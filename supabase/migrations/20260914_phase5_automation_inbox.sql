-- ─────────────────────────────────────────────────────────────────────────
-- TRACKR — Phase 5: Deterministic Automation + Financial Inbox Migration
-- ─────────────────────────────────────────────────────────────────────────
-- Tables:
-- 1. financial_candidates (Financial Inbox review queue)
-- 2. automation_rules (Deterministic Rule Engine)
-- 3. automation_executions (Execution History & Audit Trail)
--
-- Multi-tenant isolation: every table contains user_id referencing auth.users(id)
-- with cascading deletes and strict Row Level Security (RLS) policies.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. financial_candidates ───────────────────────────────────────────────

create table if not exists public.financial_candidates (
  id                 text primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  source             text not null default 'manual',
  detected_at        timestamptz default now(),
  amount             numeric not null,
  currency           text not null default 'INR',
  payee              text not null,
  date               date not null,
  suggested_category text,
  suggested_account  text,
  suggested_project  text,
  suggested_goal     text,
  confidence         numeric default 1.0,
  reason             text,
  source_reference   text,
  status             text not null default 'pending',
  notes              text,
  duplicate_of_id    text,
  rule_id            text,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create index if not exists fin_candidates_user_status_idx on public.financial_candidates(user_id, status);
create index if not exists fin_candidates_user_date_idx on public.financial_candidates(user_id, date desc);
create index if not exists fin_candidates_user_updated_idx on public.financial_candidates(user_id, updated_at desc);

alter table public.financial_candidates enable row level security;

drop policy if exists "fin_candidates_select_own" on public.financial_candidates;
create policy "fin_candidates_select_own" on public.financial_candidates for select using (auth.uid() = user_id);

drop policy if exists "fin_candidates_insert_own" on public.financial_candidates;
create policy "fin_candidates_insert_own" on public.financial_candidates for insert with check (auth.uid() = user_id);

drop policy if exists "fin_candidates_update_own" on public.financial_candidates;
create policy "fin_candidates_update_own" on public.financial_candidates for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "fin_candidates_delete_own" on public.financial_candidates;
create policy "fin_candidates_delete_own" on public.financial_candidates for delete using (auth.uid() = user_id);

-- ── 2. automation_rules ───────────────────────────────────────────────────

create table if not exists public.automation_rules (
  id                 text primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  name               text not null,
  description        text,
  trigger            text not null,
  conditions         jsonb not null default '[]'::jsonb,
  actions            jsonb not null default '[]'::jsonb,
  priority           integer not null default 10,
  enabled            boolean not null default true,
  execution_count    integer not null default 0,
  last_executed_at   timestamptz,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create index if not exists auto_rules_user_trigger_idx on public.automation_rules(user_id, trigger, priority desc);
create index if not exists auto_rules_user_enabled_idx on public.automation_rules(user_id, enabled);
create index if not exists auto_rules_user_updated_idx on public.automation_rules(user_id, updated_at desc);

alter table public.automation_rules enable row level security;

drop policy if exists "auto_rules_select_own" on public.automation_rules;
create policy "auto_rules_select_own" on public.automation_rules for select using (auth.uid() = user_id);

drop policy if exists "auto_rules_insert_own" on public.automation_rules;
create policy "auto_rules_insert_own" on public.automation_rules for insert with check (auth.uid() = user_id);

drop policy if exists "auto_rules_update_own" on public.automation_rules;
create policy "auto_rules_update_own" on public.automation_rules for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "auto_rules_delete_own" on public.automation_rules;
create policy "auto_rules_delete_own" on public.automation_rules for delete using (auth.uid() = user_id);

-- ── 3. automation_executions ──────────────────────────────────────────────

create table if not exists public.automation_executions (
  id                 text primary key,
  user_id            uuid not null references auth.users(id) on delete cascade,
  rule_id            text not null,
  target_entity_id   text not null,
  target_entity_type text not null,
  executed_at        timestamptz default now(),
  status             text not null default 'success',
  before_state       jsonb,
  after_state        jsonb,
  actions_taken      jsonb not null default '[]'::jsonb,
  error              text,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

create index if not exists auto_exec_user_rule_idx on public.automation_executions(user_id, rule_id);
create index if not exists auto_exec_user_target_idx on public.automation_executions(user_id, target_entity_id);
create index if not exists auto_exec_user_executed_idx on public.automation_executions(user_id, executed_at desc);

alter table public.automation_executions enable row level security;

drop policy if exists "auto_exec_select_own" on public.automation_executions;
create policy "auto_exec_select_own" on public.automation_executions for select using (auth.uid() = user_id);

drop policy if exists "auto_exec_insert_own" on public.automation_executions;
create policy "auto_exec_insert_own" on public.automation_executions for insert with check (auth.uid() = user_id);

drop policy if exists "auto_exec_update_own" on public.automation_executions;
create policy "auto_exec_update_own" on public.automation_executions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "auto_exec_delete_own" on public.automation_executions;
create policy "auto_exec_delete_own" on public.automation_executions for delete using (auth.uid() = user_id);
