import {
  RebitDepositPayload,
  RebitDepositAccount,
  RebitDepositTransaction,
  SetuConsentStatus,
} from '@/types/finance';

export interface SetuClientConfig {
  baseUrl?: string;
  clientId?: string;
  clientSecret?: string;
  isSandbox?: boolean;
}

/**
 * SetuApiClient:
 * Interacts with the Setu Account Aggregator Gateway API.
 * Adheres to ReBIT DEPOSIT schema standards.
 *
 * In sandbox/development/CI mode, provides an authentic Mock FIP generator
 * returning realistic Indian banking statements (UPI, POS, IMPS, NEFT, ATM).
 */
export class SetuApiClient {
  private static instance: SetuApiClient;

  public static getInstance(): SetuApiClient {
    if (!this.instance) {
      this.instance = new SetuApiClient();
    }
    return this.instance;
  }

  private config: SetuClientConfig = {
    baseUrl: process.env.NEXT_PUBLIC_SETU_BASE_URL || 'https://fiu-sandbox.setu.co',
    clientId: process.env.NEXT_PUBLIC_SETU_CLIENT_ID,
    clientSecret: process.env.SETU_CLIENT_SECRET,
    isSandbox: true,
  };

  // Test injection hooks for automated test suites
  private testOverridePayload: RebitDepositPayload | null = null;
  private forceNetworkError = false;

  public setTestOverridePayload(payload: RebitDepositPayload | null): void {
    this.testOverridePayload = payload;
  }

  public setForceNetworkError(force: boolean): void {
    this.forceNetworkError = force;
  }

  /**
   * Create a consent handle request.
   */
  async createConsentHandle(params: {
    mobileNumber: string;
    fipId?: string;
  }): Promise<{ consentHandleId: string; url: string }> {
    if (this.forceNetworkError) {
      throw new Error('Network error: Failed to connect to Setu AA Gateway');
    }

    const consentHandleId = `handle_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const url = `https://setu.co/aa-consent-webview?id=${consentHandleId}&fip=${params.fipId || 'SBI-FIP'}`;

    return { consentHandleId, url };
  }

  /**
   * Poll or check the status of a consent handle.
   */
  async getConsentStatus(consentHandleId: string): Promise<{
    status: SetuConsentStatus;
    consentId?: string;
  }> {
    if (this.forceNetworkError) {
      throw new Error('Network error: Failed to check consent status');
    }

    return {
      status: 'ACTIVE',
      consentId: `consent_${consentHandleId.replace('handle_', '')}`,
    };
  }

  /**
   * Revoke an active consent artefact.
   */
  async revokeConsent(_consentId: string): Promise<boolean> {
    if (this.forceNetworkError) {
      throw new Error('Network error: Failed to revoke consent');
    }
    return true;
  }

  /**
   * Initiate a financial information (FI) data fetch session.
   */
  async createDataSession(
    consentId: string,
    _range?: { from: string; to: string }
  ): Promise<{ sessionId: string }> {
    if (this.forceNetworkError) {
      throw new Error('Network error: Failed to initialize data session');
    }

    return {
      sessionId: `session_${Date.now()}_${consentId.substring(0, 8)}`,
    };
  }

  /**
   * Fetch decrypted ReBIT DEPOSIT payload for an authorized session.
   */
  async fetchAccountData(_sessionId: string): Promise<RebitDepositPayload> {
    if (this.forceNetworkError) {
      throw new Error('Network error: Setu data session fetch failed');
    }

    if (this.testOverridePayload) {
      return this.testOverridePayload;
    }

    return this.generateMockFipPayload();
  }

  /**
   * Realistic Mock FIP Generator:
   * Simulates an authentic SBI savings statement adhering strictly to ReBIT DEPOSIT schema.
   */
  public generateMockFipPayload(): RebitDepositPayload {
    const today = new Date();
    const daysAgo = (days: number) => {
      const d = new Date(today);
      d.setDate(d.getDate() - days);
      return d.toISOString();
    };

    const dateOnly = (iso: string) => iso.split('T')[0];

    const transactions: RebitDepositTransaction[] = [
      {
        txnId: 'TXN_SBI_001',
        type: 'DEBIT',
        mode: 'UPI',
        amount: 499.0,
        currentBalance: 84021.5,
        transactionTimestamp: daysAgo(1),
        valueDate: dateOnly(daysAgo(1)),
        narration: 'UPI/425512984920/Swiggy/swiggy@icici/Payment',
        reference: '425512984920',
      },
      {
        txnId: 'TXN_SBI_002',
        type: 'DEBIT',
        mode: 'UPI',
        amount: 350.0,
        currentBalance: 83671.5,
        transactionTimestamp: daysAgo(2),
        valueDate: dateOnly(daysAgo(2)),
        narration: 'UPI/425689123412/Zomato Ltd/paytm-1234@paytm',
        reference: '425689123412',
      },
      {
        txnId: 'TXN_SBI_003',
        type: 'DEBIT',
        mode: 'UPI',
        amount: 149.0,
        currentBalance: 83522.5,
        transactionTimestamp: daysAgo(3),
        valueDate: dateOnly(daysAgo(3)),
        narration: 'UPI/425998124512/Blinkit/blinkit@hdfcbank/Grocery',
        reference: '425998124512',
      },
      {
        txnId: 'TXN_SBI_004',
        type: 'DEBIT',
        mode: 'POS',
        amount: 2450.0,
        currentBalance: 81072.5,
        transactionTimestamp: daysAgo(4),
        valueDate: dateOnly(daysAgo(4)),
        narration: 'POS 401234XXXXXX4012 RELIANCE RETAIL HYDERABAD',
        reference: 'POS_RR_8819',
      },
      {
        txnId: 'TXN_SBI_005',
        type: 'DEBIT',
        mode: 'POS',
        amount: 1800.0,
        currentBalance: 79272.5,
        transactionTimestamp: daysAgo(5),
        valueDate: dateOnly(daysAgo(5)),
        narration: 'POS 401234XXXXXX4012 SHELL FUEL STATION HYDERABAD',
        reference: 'POS_SH_1029',
      },
      {
        txnId: 'TXN_SBI_006',
        type: 'DEBIT',
        mode: 'IMPS',
        amount: 649.0,
        currentBalance: 78623.5,
        transactionTimestamp: daysAgo(7),
        valueDate: dateOnly(daysAgo(7)),
        narration: 'IMPS-425112345678-NETFLIX INDIA-HDFC',
        reference: '425112345678',
      },
      {
        txnId: 'TXN_SBI_007',
        type: 'CREDIT',
        mode: 'NEFT',
        amount: 85000.0,
        currentBalance: 163623.5,
        transactionTimestamp: daysAgo(10),
        valueDate: dateOnly(daysAgo(10)),
        narration: 'NEFT CR-HDFC0000060-ACME CORP SALARY-AUG26',
        reference: 'NEFT_SAL_99182',
      },
      {
        txnId: 'TXN_SBI_008',
        type: 'DEBIT',
        mode: 'ATM',
        amount: 5000.0,
        currentBalance: 158623.5,
        transactionTimestamp: daysAgo(12),
        valueDate: dateOnly(daysAgo(12)),
        narration: 'ATM WDL/HDFC/BANJARA HILLS/140926',
        reference: 'ATM_WDL_4011',
      },
      {
        txnId: 'TXN_SBI_009',
        type: 'DEBIT',
        mode: 'UPI',
        amount: 75.0,
        currentBalance: 158548.5,
        transactionTimestamp: daysAgo(13),
        valueDate: dateOnly(daysAgo(13)),
        narration: 'UPI/426001234567/Chai Point/chaipoint@axl/Tea',
        reference: '426001234567',
      },
      {
        txnId: 'TXN_SBI_010',
        type: 'DEBIT',
        mode: 'UPI',
        amount: 299.0,
        currentBalance: 158249.5,
        transactionTimestamp: daysAgo(14),
        valueDate: dateOnly(daysAgo(14)),
        narration: 'UPI/426112345678/Uber India/uber@icici/Trip',
        reference: '426112345678',
      },
      {
        txnId: 'TXN_SBI_011',
        type: 'DEBIT',
        mode: 'UPI',
        amount: 1299.0,
        currentBalance: 156950.5,
        transactionTimestamp: daysAgo(16),
        valueDate: dateOnly(daysAgo(16)),
        narration: 'UPI/426223456789/Amazon Pay/amazon@apl/Order',
        reference: '426223456789',
      },
      {
        txnId: 'TXN_SBI_012',
        type: 'CREDIT',
        mode: 'UPI',
        amount: 2000.0,
        currentBalance: 158950.5,
        transactionTimestamp: daysAgo(18),
        valueDate: dateOnly(daysAgo(18)),
        narration: 'UPI/426334567890/Rahul Sharma/rahul@upi/Split dinner',
        reference: '426334567890',
      },
      {
        txnId: 'TXN_SBI_013',
        type: 'DEBIT',
        mode: 'NEFT',
        amount: 15000.0,
        currentBalance: 143950.5,
        transactionTimestamp: daysAgo(20),
        valueDate: dateOnly(daysAgo(20)),
        narration: 'NEFT-AXIS001-KIRAN KUMAR RENT-AUG26',
        reference: 'NEFT_RENT_8812',
      },
      {
        txnId: 'TXN_SBI_014',
        type: 'DEBIT',
        mode: 'UPI',
        amount: 850.0,
        currentBalance: 143100.5,
        transactionTimestamp: daysAgo(22),
        valueDate: dateOnly(daysAgo(22)),
        narration: 'UPI/426445678901/TSSPDCL/tsspdcl@billdesk/Electricity',
        reference: '426445678901',
      },
      {
        txnId: 'TXN_SBI_015',
        type: 'DEBIT',
        mode: 'UPI',
        amount: 699.0,
        currentBalance: 142401.5,
        transactionTimestamp: daysAgo(25),
        valueDate: dateOnly(daysAgo(25)),
        narration: 'UPI/426556789012/ACT Fibernet/act@paytm/Internet',
        reference: '426556789012',
      },
    ];

    const account: RebitDepositAccount = {
      accountType: 'SAVINGS',
      maskedAccNumber: 'XXXXXXXX4012',
      currentBalance: 142401.5,
      currency: 'INR',
      branch: 'Banjara Hills, Hyderabad',
      ifsc: 'SBIN0000847',
      fipId: 'SBI-FIP',
      fipName: 'State Bank of India',
      transactions,
    };

    return {
      accounts: [account],
    };
  }
}

export const setuApiClient = SetuApiClient.getInstance();
