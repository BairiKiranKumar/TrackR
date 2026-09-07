import { getMasterSupabase } from '@/lib/supabase';

export interface UserConfig {
  user_id: string;
  supabase_url: string;
  supabase_anon_key: string;
  display_name?: string;
}

// ─── Fetch user's Supabase config from master DB ─────────────────────────────

export async function getUserConfig(userId: string): Promise<UserConfig | null> {
  const sb = getMasterSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from('user_configs')
    .select('user_id, supabase_url, supabase_anon_key, display_name')
    .eq('user_id', userId)
    .single();

  if (error || !data) return null;
  return data as UserConfig;
}

// ─── Save / update user's Supabase config in master DB ───────────────────────

export async function saveUserConfig(config: UserConfig): Promise<void> {
  const sb = getMasterSupabase();
  if (!sb) throw new Error('Master Supabase not configured.');

  const { error } = await sb
    .from('user_configs')
    .upsert({
      user_id: config.user_id,
      supabase_url: config.supabase_url,
      supabase_anon_key: config.supabase_anon_key,
      display_name: config.display_name,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (error) throw error;
}

// ─── Delete user's config (e.g. when they want to disconnect) ────────────────

export async function deleteUserConfig(userId: string): Promise<void> {
  const sb = getMasterSupabase();
  if (!sb) return;
  await sb.from('user_configs').delete().eq('user_id', userId);
}

// ─── Initialize user's Supabase DB schema ─────────────────────────────────────
// Uses the service_role key to create tables in the user's project.
// The service_role key is NEVER saved — only used for this one operation.

export const USER_DB_SCHEMA_SQL = `
-- TRACKR schema — run this in your Supabase SQL editor
-- Or let TRACKR auto-create it using your service_role key (one-time, never saved)

CREATE TABLE IF NOT EXISTS items (
  id text PRIMARY KEY,
  type text NOT NULL,
  title text NOT NULL,
  content text DEFAULT '',
  metadata jsonb DEFAULT '{}',
  tags text[] DEFAULT '{}',
  pinned boolean DEFAULT false,
  archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS item_relations (
  id text PRIMARY KEY,
  source_id text REFERENCES items(id) ON DELETE CASCADE,
  target_id text REFERENCES items(id) ON DELETE CASCADE,
  relation_type text DEFAULT 'mention',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activity_events (
  id text PRIMARY KEY,
  item_id text,
  item_title text,
  type text NOT NULL,
  description text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb
);
`;

export async function initUserDbSchema(
  url: string,
  serviceRoleKey: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Create a temporary admin client using service_role key
    const { createClient } = await import('@supabase/supabase-js');
    const adminClient = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Run the schema SQL via the REST API
    // Supabase REST API supports running SQL via the `rpc` function if you have a helper
    // or via the management API. We use a simpler approach: create tables one by one.

    const tables = [
      `CREATE TABLE IF NOT EXISTS items (
        id text PRIMARY KEY,
        type text NOT NULL,
        title text NOT NULL,
        content text DEFAULT '',
        metadata jsonb DEFAULT '{}',
        tags text[] DEFAULT '{}',
        pinned boolean DEFAULT false,
        archived boolean DEFAULT false,
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS item_relations (
        id text PRIMARY KEY,
        source_id text,
        target_id text,
        relation_type text DEFAULT 'mention',
        created_at timestamptz DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS activity_events (
        id text PRIMARY KEY,
        item_id text,
        item_title text,
        type text NOT NULL,
        description text,
        metadata jsonb DEFAULT '{}',
        created_at timestamptz DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS app_settings (
        key text PRIMARY KEY,
        value jsonb
      )`,
    ];

    // Try inserting a test row to check if items table exists
    const { error: checkError } = await adminClient
      .from('items')
      .select('id')
      .limit(1);

    if (!checkError) {
      // Tables already exist
      return { success: true };
    }

    // Tables don't exist — use the SQL editor API endpoint
    for (const sql of tables) {
      const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sql }),
      });

      if (!res.ok) {
        // If exec_sql doesn't exist, try the pg endpoint
        const res2 = await fetch(`${url}/pg`, {
          method: 'POST',
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: sql }),
        });

        if (!res2.ok) {
          // Cannot auto-create — user must run SQL manually
          return {
            success: false,
            error: 'Could not auto-create tables. Please run the SQL script manually in your Supabase SQL editor.',
          };
        }
      }
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error during schema creation.',
    };
  }
}

// ─── Test user DB connection ──────────────────────────────────────────────────

export async function testUserDbConnection(
  url: string,
  anonKey: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const client = createClient(url, anonKey, {
      auth: { persistSession: false },
    });

    // Try selecting from items table — three possible outcomes:
    // 1. Success (data returned or empty) → tables exist
    // 2. Error code 42P01 (table not found) → connected but tables missing
    // 3. Any other error → bad URL or key
    const { error } = await client.from('items').select('id').limit(1);

    if (!error) {
      return { success: true };
    }

    if (error.code === '42P01' || error.message?.includes('does not exist')) {
      // Connected fine, tables just don't exist yet
      return { success: true, error: 'TABLES_MISSING' };
    }

    // PGRST errors mean we reached Supabase — connection works, but maybe RLS issue
    if (error.code?.startsWith('PGRST') || error.message?.includes('PGRST')) {
      return { success: true, error: 'TABLES_MISSING' };
    }

    return { success: false, error: error.message ?? 'Connection failed.' };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not reach Supabase. Check the URL.',
    };
  }
}

