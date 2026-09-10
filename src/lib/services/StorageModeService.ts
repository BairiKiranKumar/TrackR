import { StorageMode } from '@/types';
import { getSetting, setSetting } from '@/lib/db/localDb';
import { RemoteStorageProvider } from '@/lib/storage/RemoteStorageProvider';
import { TrackrSupabaseProvider } from '@/lib/storage/TrackrSupabaseProvider';
import { CustomSupabaseProvider } from '@/lib/storage/CustomSupabaseProvider';

const STORAGE_MODE_KEY = 'storage-mode';

/**
 * Resolves which RemoteStorageProvider is active for the signed-in user,
 * and owns the one piece of policy that isn't a pure lookup: a user who
 * already had BYODB configured (from before TRACKR Cloud existed) must
 * keep working exactly as before until they explicitly choose otherwise —
 * we never auto-migrate anyone. See needsMigrationChoice().
 *
 * `storage-mode` is a local, per-device setting (IndexedDB `settings`
 * store) rather than a server-side flag — consistent with local-first: the
 * app should never need a network round-trip just to know where to sync.
 */
class StorageModeService {
  private currentUserId: string | null = null;
  private customConfigured = false;
  private testProviderOverride: RemoteStorageProvider | null = null;

  /**
   * Test seam only: force getActiveProvider() to return this exact instance
   * (e.g. one built with an injected fake Supabase client) instead of
   * constructing a real provider. Pass null to clear the override.
   */
  setProviderOverrideForTesting(provider: RemoteStorageProvider | null): void {
    this.testProviderOverride = provider;
  }

  /** Called by AuthProvider on sign-in/sign-out. */
  setActiveUser(userId: string | null): void {
    this.currentUserId = userId;
  }

  /** Called by AuthProvider (and the BYODB setup flow) once it knows whether custom Supabase config exists. */
  setCustomConfigured(configured: boolean): void {
    this.customConfigured = configured;
  }

  isCustomConfigured(): boolean {
    return this.customConfigured;
  }

  async getStoredMode(): Promise<StorageMode | undefined> {
    return getSetting<StorageMode>(STORAGE_MODE_KEY);
  }

  /**
   * The mode actually in effect right now. A user who has never made an
   * explicit choice defaults to 'trackr_cloud' — UNLESS they already have
   * legacy custom config, in which case the pre-existing behavior
   * (custom_supabase) is preserved until they say otherwise.
   */
  async getEffectiveMode(): Promise<StorageMode> {
    const stored = await this.getStoredMode();
    if (stored) return stored;
    return this.customConfigured ? 'custom_supabase' : 'trackr_cloud';
  }

  /**
   * True when there's legacy custom-Supabase config but no explicit
   * storage-mode choice has been recorded yet — Settings should show the
   * "we found existing data" migration prompt in this state.
   */
  async needsMigrationChoice(): Promise<boolean> {
    if (!this.customConfigured) return false;
    const stored = await this.getStoredMode();
    return !stored;
  }

  async setMode(mode: StorageMode): Promise<void> {
    await setSetting(STORAGE_MODE_KEY, mode);
  }

  async getActiveProvider(): Promise<RemoteStorageProvider | null> {
    if (this.testProviderOverride) return this.testProviderOverride;
    const mode = await this.getEffectiveMode();
    if (mode === 'custom_supabase' && this.customConfigured) {
      return new CustomSupabaseProvider();
    }
    if (mode === 'trackr_cloud' && this.currentUserId) {
      return new TrackrSupabaseProvider(this.currentUserId);
    }
    return null; // not signed in, or custom mode selected but not connected — local-only.
  }
}

export const storageModeService = new StorageModeService();
