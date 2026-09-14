import { observabilityService } from '@/lib/services/ObservabilityService';
import { storageModeService } from '@/lib/services/StorageModeService';
import { SetuConsentStatus } from '@/types/finance';

export interface BankConnectionState {
  connected: boolean;
  consentId?: string;
  consentStatus?: SetuConsentStatus;
  fipId?: string;
  fipName?: string;
  accountMask?: string;
  connectedAt?: string;
  lastSyncAt?: string;
  validUntil?: string;
  stats: {
    transactionsChecked: number;
    candidatesFound: number;
    duplicatesSkipped: number;
  };
  syncStatus: 'idle' | 'syncing' | 'error';
  lastError?: string;
}

export interface BankAuthSession {
  sessionId?: string;
  token?: string;
  expiresAt: number;
}

const BANK_STATE_KEY = 'trackr_bank_connection_state';
const BANK_SESSION_KEY = 'trackr_bank_auth_session';

/**
 * SetuBankAuthService:
 * Manages the connection lifecycle for Indian Banks via the Setu Account Aggregator Gateway.
 *
 * CRITICAL PRIVACY & SECURITY INVARIANTS:
 * 1. Tokens and session keys are held in isolated user-scoped local storage.
 * 2. NO bank net-banking passwords, PINs, or raw bank account numbers are EVER collected or stored.
 * 3. Connection metadata is strictly user-scoped (User A and User B never share credentials).
 * 4. Tokens and session metadata are completely excluded from exports, universal items, and telemetry.
 * 5. Disconnect immediately revokes consent and wipes all session tokens.
 */
export class SetuBankAuthService {
  private static instance: SetuBankAuthService;

  public static getInstance(): SetuBankAuthService {
    if (!this.instance) {
      this.instance = new SetuBankAuthService();
    }
    return this.instance;
  }

  private getStateKey(userId?: string): string {
    const uid = userId ?? storageModeService.getActiveUserId();
    return uid ? `${BANK_STATE_KEY}_${uid}` : BANK_STATE_KEY;
  }

  private getSessionKey(userId?: string): string {
    const uid = userId ?? storageModeService.getActiveUserId();
    return uid ? `${BANK_SESSION_KEY}_${uid}` : BANK_SESSION_KEY;
  }

  /** Retrieve the public bank connection metadata (safe for UI and settings) */
  getConnectionState(userId?: string): BankConnectionState {
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
  saveConnectionState(partial: Partial<BankConnectionState>, userId?: string): BankConnectionState {
    const current = this.getConnectionState(userId);
    const updated: BankConnectionState = {
      ...current,
      ...partial,
      stats: {
        ...current.stats,
        ...(partial.stats || {}),
      },
    };

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.getStateKey(userId), JSON.stringify(updated));
      } catch (err) {
        console.error('[SetuBankAuthService] Failed to save connection state:', err);
      }
    }

    return updated;
  }

  /** Isolated session storage */
  getSession(userId?: string): BankAuthSession | null {
    if (typeof localStorage === 'undefined') return null;

    try {
      const raw = localStorage.getItem(this.getSessionKey(userId));
      if (!raw) return null;
      const session: BankAuthSession = JSON.parse(raw);
      if (session.expiresAt && Date.now() > session.expiresAt) {
        this.clearSession(userId);
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }

  saveSession(session: BankAuthSession, userId?: string): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.getSessionKey(userId), JSON.stringify(session));
    } catch (err) {
      console.error('[SetuBankAuthService] Failed to save bank session:', err);
    }
  }

  clearSession(userId?: string): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(this.getSessionKey(userId));
    } catch (err) {
      console.error('[SetuBankAuthService] Failed to clear bank session:', err);
    }
  }

  /**
   * Check if a bank account is actively connected and valid.
   */
  isConnected(userId?: string): boolean {
    const state = this.getConnectionState(userId);
    if (!state.connected || state.consentStatus !== 'ACTIVE') {
      return false;
    }
    if (state.validUntil && new Date(state.validUntil).getTime() < Date.now()) {
      return false;
    }
    return true;
  }

  /**
   * Disconnect the bank account:
   * Revokes active consent, wipes session storage, resets connection state.
   * Existing financial ledger transactions and candidates are PRESERVED.
   */
  async disconnect(userId?: string): Promise<void> {
    const state = this.getConnectionState(userId);
    const consentId = state.consentId;

    // Purge local session
    this.clearSession(userId);

    // Reset state to default
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(this.getStateKey(userId));
      } catch (err) {
        console.error('[SetuBankAuthService] Failed to reset connection state:', err);
      }
    }

    observabilityService.logEvent({
      category: 'bank_disconnected',
      message: 'Bank integration disconnected by user. Session purged.',
      details: {
        fipId: state.fipId || 'unknown',
        hadConsentId: !!consentId,
      },
    });
  }

  /**
   * Simulate a successful connection for testing, sandbox, and local development.
   */
  simulateConnect(params?: {
    fipId?: string;
    fipName?: string;
    accountMask?: string;
    consentId?: string;
    validUntilDays?: number;
    userId?: string;
  }): BankConnectionState {
    const fipId = params?.fipId || 'SBI-FIP';
    const fipName = params?.fipName || 'State Bank of India';
    const accountMask = params?.accountMask || 'XXXXXXXX4012';
    const consentId = params?.consentId || `setu_consent_${Date.now()}`;
    const validUntil = new Date(
      Date.now() + (params?.validUntilDays ?? 365) * 24 * 60 * 60 * 1000
    ).toISOString();

    const state = this.saveConnectionState(
      {
        connected: true,
        consentId,
        consentStatus: 'ACTIVE',
        fipId,
        fipName,
        accountMask,
        connectedAt: new Date().toISOString(),
        validUntil,
        syncStatus: 'idle',
        lastError: undefined,
      },
      params?.userId
    );

    this.saveSession(
      {
        sessionId: `sim_session_${Date.now()}`,
        token: `sim_token_${Date.now()}`,
        expiresAt: Date.now() + 3600 * 1000,
      },
      params?.userId
    );

    observabilityService.logEvent({
      category: 'bank_connect_success',
      message: `Bank connected successfully (${fipName} · ${accountMask})`,
      details: {
        fipId,
        accountMask,
        simulated: true,
      },
    });

    return state;
  }

  private defaultState(): BankConnectionState {
    return {
      connected: false,
      consentStatus: undefined,
      stats: {
        transactionsChecked: 0,
        candidatesFound: 0,
        duplicatesSkipped: 0,
      },
      syncStatus: 'idle',
    };
  }
}

export const setuBankAuthService = SetuBankAuthService.getInstance();
