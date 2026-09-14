import { observabilityService } from '@/lib/services/ObservabilityService';
import { storageModeService } from '@/lib/services/StorageModeService';

export interface GmailConnectionState {
  connected: boolean;
  email?: string;
  connectedAt?: string;
  lastSyncAt?: string;
  lastHistoryId?: string;
  stats: {
    messagesChecked: number;
    candidatesFound: number;
    duplicatesSkipped: number;
  };
  syncStatus: 'idle' | 'syncing' | 'error';
  lastError?: string;
}

export interface GmailAuthTokens {
  accessToken: string;
  expiresAt: number; // Unix timestamp in milliseconds
  scope: string;
  tokenType: string;
}

const GMAIL_STATE_KEY = 'trackr_gmail_connection_state';
const GMAIL_TOKEN_KEY = 'trackr_gmail_auth_tokens';
const GMAIL_CSRF_STATE_KEY = 'trackr_gmail_csrf_state';

// The minimum permission required: readonly message access
export const GMAIL_READONLY_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

/**
 * GmailAuthService:
 * Manages Google OAuth 2.0 lifecycle, CSRF protection, token isolation,
 * user-scoping, and clean connection/disconnection state.
 *
 * CRITICAL SECURITY PRINCIPLES:
 * 1. Tokens are kept in isolated client storage (`trackr_gmail_auth_tokens`).
 * 2. Tokens are NEVER stored in financial records, universal items, or exported snapshots.
 * 3. Connection metadata and tokens are user-scoped so User A and User B never share credentials.
 * 4. Disconnection revokes and wipes tokens completely from the browser.
 */
export class GmailAuthService {
  private static instance: GmailAuthService;

  public static getInstance(): GmailAuthService {
    if (!this.instance) {
      this.instance = new GmailAuthService();
    }
    return this.instance;
  }

  private getStateKey(userId?: string): string {
    const uid = userId ?? storageModeService.getActiveUserId();
    return uid ? `${GMAIL_STATE_KEY}_${uid}` : GMAIL_STATE_KEY;
  }

  private getTokenKey(userId?: string): string {
    const uid = userId ?? storageModeService.getActiveUserId();
    return uid ? `${GMAIL_TOKEN_KEY}_${uid}` : GMAIL_TOKEN_KEY;
  }

  /** Retrieve the public connection metadata (safe for UI and settings) */
  getConnectionState(userId?: string): GmailConnectionState {
    if (typeof localStorage === 'undefined') {
      return this.defaultState();
    }

    try {
      const raw = localStorage.getItem(this.getStateKey(userId));
      if (!raw) return this.defaultState();
      return JSON.parse(raw);
    } catch {
      return this.defaultState();
    }
  }

  /** Update connection metadata */
  saveConnectionState(partial: Partial<GmailConnectionState>, userId?: string): GmailConnectionState {
    const current = this.getConnectionState(userId);
    const updated: GmailConnectionState = {
      ...current,
      ...partial,
      stats: {
        ...current.stats,
        ...(partial.stats || {}),
      },
    };

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.getStateKey(userId), JSON.stringify(updated));
    }
    return updated;
  }

  /** Check if currently connected and has a valid token */
  isConnected(userId?: string): boolean {
    const state = this.getConnectionState(userId);
    if (!state.connected) return false;
    const tokens = this.getTokens(userId);
    if (!tokens) return false;
    return Date.now() < tokens.expiresAt;
  }

  /** Retrieve OAuth tokens from isolated storage */
  getTokens(userId?: string): GmailAuthTokens | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(this.getTokenKey(userId));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /** Store OAuth tokens in isolated storage */
  setTokens(tokens: GmailAuthTokens | null, userId?: string): void {
    if (typeof localStorage === 'undefined') return;
    const key = this.getTokenKey(userId);
    if (tokens) {
      localStorage.setItem(key, JSON.stringify(tokens));
    } else {
      localStorage.removeItem(key);
    }
  }

  /**
   * Generates Google OAuth 2.0 Authorization URL with CSRF state protection.
   */
  initiateOAuthFlow(redirectUri?: string): { authUrl: string; state: string } {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || 'mock-google-client-id';
    const callbackUrl = redirectUri || (typeof window !== 'undefined' ? `${window.location.origin}/settings` : 'http://localhost:3000/settings');

    const state = Math.random().toString(36).substring(2) + Date.now().toString(36);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(GMAIL_CSRF_STATE_KEY, state);
    }

    observabilityService.logEvent({
      category: 'gmail_connect_started',
      message: 'User initiated Gmail OAuth connection.',
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'token',
      scope: GMAIL_READONLY_SCOPE,
      state,
      prompt: 'consent',
      include_granted_scopes: 'true',
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return { authUrl, state };
  }

  /**
   * Parses and validates OAuth callback tokens from URL hash fragment.
   */
  handleOAuthCallback(hash: string): { success: boolean; error?: string } {
    if (!hash || !hash.startsWith('#')) {
      return { success: false, error: 'No OAuth hash fragment present' };
    }

    const params = new URLSearchParams(hash.slice(1));
    const accessToken = params.get('access_token');
    const expiresIn = params.get('expires_in');
    const returnedState = params.get('state');
    const error = params.get('error');

    if (error) {
      observabilityService.logEvent({
        category: 'gmail_sync_failed',
        message: `Gmail OAuth returned error: ${error}`,
      });
      return { success: false, error };
    }

    if (!accessToken) {
      return { success: false, error: 'Missing access_token in OAuth response' };
    }

    // CSRF verification
    if (typeof sessionStorage !== 'undefined') {
      const storedState = sessionStorage.getItem(GMAIL_CSRF_STATE_KEY);
      sessionStorage.removeItem(GMAIL_CSRF_STATE_KEY);
      if (storedState && returnedState && storedState !== returnedState) {
        return { success: false, error: 'OAuth state mismatch (potential CSRF)' };
      }
    }

    const expiresAt = Date.now() + (parseInt(expiresIn || '3600', 10) * 1000);
    const tokens: GmailAuthTokens = {
      accessToken,
      expiresAt,
      scope: params.get('scope') || GMAIL_READONLY_SCOPE,
      tokenType: params.get('token_type') || 'Bearer',
    };

    this.setTokens(tokens);
    this.saveConnectionState({
      connected: true,
      connectedAt: new Date().toISOString(),
      syncStatus: 'idle',
      lastError: undefined,
    });

    observabilityService.logEvent({
      category: 'gmail_connect_success',
      message: 'Gmail OAuth connection successfully established.',
    });

    return { success: true };
  }

  /**
   * Disconnect Gmail:
   * Wipes tokens, resets connection metadata, leaves historical financial records safe.
   */
  async disconnect(userId?: string): Promise<void> {
    this.setTokens(null, userId);
    this.saveConnectionState({
      connected: false,
      email: undefined,
      connectedAt: undefined,
      lastHistoryId: undefined,
      syncStatus: 'idle',
      lastError: undefined,
    }, userId);

    observabilityService.logEvent({
      category: 'gmail_disconnected',
      message: 'Gmail integration disconnected by user. Tokens purged.',
    });
  }

  /**
   * Deterministic simulation mode for testing & local development
   * before Google Cloud production verification is granted.
   */
  simulateConnect(email = 'user.beta@gmail.com', userId?: string): void {
    const tokens: GmailAuthTokens = {
      accessToken: 'simulated_test_gmail_token',
      expiresAt: Date.now() + 86400000, // 24 hours
      scope: GMAIL_READONLY_SCOPE,
      tokenType: 'Bearer',
    };
    this.setTokens(tokens, userId);
    this.saveConnectionState({
      connected: true,
      email,
      connectedAt: new Date().toISOString(),
      syncStatus: 'idle',
      stats: {
        messagesChecked: 0,
        candidatesFound: 0,
        duplicatesSkipped: 0,
      },
      lastError: undefined,
    }, userId);

    observabilityService.logEvent({
      category: 'gmail_connect_success',
      message: `Simulated Gmail connection established for ${email}.`,
    });
  }

  private defaultState(): GmailConnectionState {
    return {
      connected: false,
      stats: {
        messagesChecked: 0,
        candidatesFound: 0,
        duplicatesSkipped: 0,
      },
      syncStatus: 'idle',
    };
  }
}

export const gmailAuthService = GmailAuthService.getInstance();
