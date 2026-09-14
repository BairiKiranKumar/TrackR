import {
  RebitDepositTransaction,
  RebitDepositAccount,
} from '@/types/finance';
import { CandidateDraft } from '@/lib/services/inbox/ExternalSourceAdapter';

export interface ParsedNarration {
  payee: string;
  categoryHint?: string;
  confidence: number;
  reason: string;
  vpa?: string;
}

/**
 * RebitBankNormalizer:
 * Deterministic normalizer for ReBIT Account Aggregator DEPOSIT schema.
 *
 * Implements strict, zero-AI, explainable extraction rules for Indian banking
 * narrations (UPI, POS, IMPS, NEFT, ATM, CARD).
 */
export class RebitBankNormalizer {
  /**
   * Normalizes a ReBIT deposit transaction into a TRACKR CandidateDraft.
   */
  public static normalizeTransaction(
    txn: RebitDepositTransaction,
    account: Pick<RebitDepositAccount, 'maskedAccNumber' | 'currency' | 'fipName' | 'fipId'>,
    suggestedAccountId?: string
  ): CandidateDraft {
    const parsed = this.parseNarration(txn.narration, txn.mode, txn.type);
    const date = txn.transactionTimestamp
      ? txn.transactionTimestamp.split('T')[0]
      : txn.valueDate;

    // sourceReference format: bank:<accountMask>:<txnId>
    const sourceReference = `bank:${account.maskedAccNumber}:${txn.txnId}`;

    return {
      source: 'bank',
      detectedAt: new Date().toISOString(),
      amount: Math.abs(txn.amount),
      currency: account.currency || 'INR',
      payee: parsed.payee,
      date,
      suggestedCategory: parsed.categoryHint,
      suggestedAccount: suggestedAccountId,
      confidence: parsed.confidence,
      reason: parsed.reason,
      sourceReference,
      rawPayload: {
        txnId: txn.txnId,
        mode: txn.mode,
        type: txn.type,
        rawNarration: txn.narration,
        accountMask: account.maskedAccNumber,
        fipName: account.fipName || 'Bank',
        currentBalance: txn.currentBalance,
        reference: txn.reference,
        vpa: parsed.vpa,
      },
    };
  }

  /**
   * Normalizes all transactions within a ReBIT deposit account.
   */
  public static normalizeAccount(
    account: RebitDepositAccount,
    suggestedAccountId?: string
  ): CandidateDraft[] {
    return (account.transactions || []).map(txn =>
      this.normalizeTransaction(txn, account, suggestedAccountId)
    );
  }

  /**
   * Parses raw Indian banking narration based on payment rail (UPI, POS, IMPS, NEFT, ATM).
   */
  public static parseNarration(
    narration: string,
    mode: RebitDepositTransaction['mode'],
    type: RebitDepositTransaction['type']
  ): ParsedNarration {
    const raw = narration.trim();

    // 1. ATM Cash Withdrawal
    if (mode === 'ATM' || /ATM\s*(WDL|CASH|W\/D)/i.test(raw)) {
      return {
        payee: 'ATM Cash Withdrawal',
        categoryHint: undefined,
        confidence: 0.95,
        reason: 'Detected ATM cash withdrawal',
      };
    }

    // 2. UPI Payments
    if (mode === 'UPI' || /^UPI[\/-]/i.test(raw)) {
      const upiResult = this.parseUpiNarration(raw, type);
      if (upiResult) return upiResult;
    }

    // 3. POS Card Swipes
    if (mode === 'POS' || /^POS\s+/i.test(raw)) {
      const posResult = this.parsePosNarration(raw);
      if (posResult) return posResult;
    }

    // 4. IMPS Transfers
    if (mode === 'IMPS' || /^IMPS[\/-]/i.test(raw)) {
      const impsResult = this.parseImpsNarration(raw);
      if (impsResult) return impsResult;
    }

    // 5. NEFT / RTGS Transfers
    if (mode === 'NEFT' || mode === 'RTGS' || /^(NEFT|RTGS)[\/-]/i.test(raw)) {
      const neftResult = this.parseNeftNarration(raw, type);
      if (neftResult) return neftResult;
    }

    // 6. Generic Fallback
    return this.parseGenericNarration(raw, type);
  }

  /**
   * UPI Narration Parser:
   * Handles patterns like:
   * - `UPI/<rrn>/<merchant>/<vpa>/<desc>`
   * - `UPI/<rrn>/<merchant>/<desc>`
   * - `UPI/P2A/<rrn>/<merchant>/<vpa>`
   * - `UPI/P2P/<rrn>/<merchant>`
   */
  private static parseUpiNarration(
    raw: string,
    type: RebitDepositTransaction['type']
  ): ParsedNarration | null {
    const parts = raw.split(/[/\\-]/).map(p => p.trim()).filter(Boolean);

    // Remove leading 'UPI' or 'UPI/P2A' or 'UPI/P2P'
    const cleanParts = parts.filter(
      p => !/^(UPI|P2A|P2P|CR|DR|PAYMENT)$/i.test(p)
    );

    let candidatePayee = '';
    let candidateVpa: string | undefined;

    // Look for VPA handle (e.g. user@icici, swiggy@hdfcbank)
    for (const part of cleanParts) {
      if (part.includes('@') && !candidateVpa) {
        candidateVpa = part;
      }
    }

    // Identify merchant candidate
    for (const part of cleanParts) {
      // Skip numbers/RRNs
      if (/^\d{8,}$/.test(part)) continue;
      if (part === candidateVpa) continue;
      if (/^(PAYMENT|TRANSFER|SPLIT|ORDER|BILL)$/i.test(part)) continue;

      if (part.length >= 2) {
        candidatePayee = part;
        break;
      }
    }

    // If no candidate payee found but VPA exists, derive from VPA prefix
    if (!candidatePayee && candidateVpa) {
      const prefix = candidateVpa.split('@')[0];
      candidatePayee = this.cleanMerchantName(prefix);
    }

    if (!candidatePayee && cleanParts.length > 0) {
      candidatePayee = cleanParts[0];
    }

    const cleanPayee = this.cleanMerchantName(candidatePayee || 'UPI Transfer');
    const categoryHint = this.guessCategory(cleanPayee, type);

    return {
      payee: cleanPayee,
      vpa: candidateVpa,
      categoryHint,
      confidence: candidateVpa ? 0.9 : 0.85,
      reason: `Extracted from UPI narration (${cleanPayee}${candidateVpa ? ' · ' + candidateVpa : ''})`,
    };
  }

  /**
   * POS Narration Parser:
   * Handles patterns like:
   * - `POS 401234XXXXXX4012 RELIANCE RETAIL HYDERABAD`
   * - `POS SHELL FUEL STATION BANGALORE`
   */
  private static parsePosNarration(raw: string): ParsedNarration | null {
    // Strip leading POS keyword and card masks (e.g. 401234XXXXXX4012)
    let cleaned = raw
      .replace(/^POS\s+/i, '')
      .replace(/\b\d{4,6}[X*]+\d{4}\b/gi, '')
      .replace(/\b\d{10,}\b/g, '')
      .trim();

    // Strip common Indian city names from the tail of POS narrations
    cleaned = cleaned
      .replace(/\s+(HYDERABAD|BANGALORE|BENGALURU|MUMBAI|DELHI|CHENNAI|PUNE|KOLKATA|NOIDA|GURGAON|GURUGRAM)$/i, '')
      .trim();

    const cleanPayee = this.cleanMerchantName(cleaned || 'Card Purchase');
    const categoryHint = this.guessCategory(cleanPayee, 'DEBIT');

    return {
      payee: cleanPayee,
      categoryHint,
      confidence: 0.85,
      reason: `Parsed from card POS terminal payment (${cleanPayee})`,
    };
  }

  /**
   * IMPS Narration Parser:
   * Handles patterns like:
   * - `IMPS-425112345678-NETFLIX INDIA-HDFC`
   * - `IMPS/425112345678/AMAZON/ICICI`
   */
  private static parseImpsNarration(raw: string): ParsedNarration | null {
    const parts = raw.split(/[/\\-]/).map(p => p.trim()).filter(Boolean);
    const cleanParts = parts.filter(
      p => !/^(IMPS|P2A|CR|DR|TRANSFER)$/i.test(p) && !/^\d{8,}$/.test(p)
    );

    // Remove bank identifiers like HDFC, ICICI, SBI from the end
    const filtered = cleanParts.filter(
      p => !/^(HDFC|ICICI|SBIN?|AXIS|KOTAK|PNB|BOB|CANARA|YESB|IDFC)$/i.test(p)
    );

    const payeeCandidate = filtered[0] || cleanParts[0] || 'IMPS Transfer';
    const cleanPayee = this.cleanMerchantName(payeeCandidate);
    const categoryHint = this.guessCategory(cleanPayee, 'DEBIT');

    return {
      payee: cleanPayee,
      categoryHint,
      confidence: 0.8,
      reason: `Extracted from IMPS narration (${cleanPayee})`,
    };
  }

  /**
   * NEFT Narration Parser:
   * Handles patterns like:
   * - `NEFT CR-HDFC0000060-ACME CORP SALARY-AUG26`
   * - `NEFT-AXIS001-KIRAN KUMAR RENT-AUG26`
   */
  private static parseNeftNarration(
    raw: string,
    type: RebitDepositTransaction['type']
  ): ParsedNarration | null {
    let cleaned = raw
      .replace(/^(NEFT|RTGS)\s*(CR|DR)?[-/:]/i, '')
      .replace(/[A-Z]{4}0[A-Z0-9]{6}/gi, '') // IFSC codes
      .replace(/[A-Z]{3,4}\d{3,}/gi, '') // Short branch codes like AXIS001
      .replace(/^[-\/:_\s]+|[-\/:_\s]+$/g, '') // Strip leading/trailing delimiters
      .trim();

    // Strip reference suffixes like -AUG26
    cleaned = cleaned.replace(/[-_][A-Z]{3}\d{2}$/i, '').trim();
    cleaned = cleaned.replace(/^[-\/:_\s]+|[-\/:_\s]+$/g, '').trim();

    const cleanPayee = this.cleanMerchantName(cleaned || 'NEFT Transfer');
    const categoryHint = this.guessCategory(cleanPayee, type);

    return {
      payee: cleanPayee,
      categoryHint,
      confidence: 0.8,
      reason: `Extracted from NEFT transfer (${cleanPayee})`,
    };
  }

  /**
   * Generic Fallback Parser.
   */
  private static parseGenericNarration(
    raw: string,
    type: RebitDepositTransaction['type']
  ): ParsedNarration {
    const clean = this.cleanMerchantName(raw);
    const categoryHint = this.guessCategory(clean, type);

    return {
      payee: clean || 'Bank Transaction',
      categoryHint,
      confidence: 0.6,
      reason: 'Extracted from raw bank statement narration',
    };
  }

  /**
   * Clean merchant name:
   * Trims whitespace, removes technical noise codes, title-cases if all uppercase or lowercase.
   */
  private static cleanMerchantName(name: string): string {
    if (!name) return 'Unknown Payee';

    let cleaned = name
      .replace(/[_]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Remove common suffixes like "LTD", "PVT LTD", "INDIA" if appended
    cleaned = cleaned.replace(/\s+(PVT\s+LTD|PRIVATE\s+LIMITED|LTD|LIMITED)$/i, '');

    // Title Case if fully UPPERCASE or fully lowercase
    if ((cleaned === cleaned.toUpperCase() || cleaned === cleaned.toLowerCase()) && cleaned.length > 2) {
      cleaned = cleaned
        .toLowerCase()
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }

    return cleaned;
  }

  /**
   * Deterministic category hinting based on prominent Indian merchants.
   */
  private static guessCategory(
    payee: string,
    type: RebitDepositTransaction['type']
  ): string | undefined {
    const lower = payee.toLowerCase();

    if (type === 'CREDIT') {
      if (lower.includes('salary') || lower.includes('payroll') || lower.includes('stipend')) {
        return 'Salary';
      }
      return 'Income';
    }

    // Food & Dining
    if (
      lower.includes('swiggy') ||
      lower.includes('zomato') ||
      lower.includes('chai point') ||
      lower.includes('starbucks') ||
      lower.includes('mcdonald') ||
      lower.includes('kfc') ||
      lower.includes('domino') ||
      lower.includes('pizza') ||
      lower.includes('restaurant')
    ) {
      return 'cat_food';
    }

    // Groceries
    if (
      lower.includes('blinkit') ||
      lower.includes('zepto') ||
      lower.includes('instamart') ||
      lower.includes('bigbasket') ||
      lower.includes('reliance retail') ||
      lower.includes('dmart') ||
      lower.includes('grocery')
    ) {
      return 'cat_food_groceries';
    }

    // Transport & Fuel
    if (
      lower.includes('uber') ||
      lower.includes('ola') ||
      lower.includes('rapido') ||
      lower.includes('shell') ||
      lower.includes('hpcl') ||
      lower.includes('bpcl') ||
      lower.includes('petrol') ||
      lower.includes('fuel')
    ) {
      return 'cat_transport';
    }

    // Housing & Utilities
    if (
      lower.includes('rent') ||
      lower.includes('tsspdcl') ||
      lower.includes('bescom') ||
      lower.includes('electricity') ||
      lower.includes('act fibernet') ||
      lower.includes('airtel') ||
      lower.includes('jio')
    ) {
      return 'cat_housing';
    }

    // Shopping
    if (
      lower.includes('amazon') ||
      lower.includes('flipkart') ||
      lower.includes('myntra') ||
      lower.includes('nykaa') ||
      lower.includes('ajio')
    ) {
      return 'cat_shopping';
    }

    // Entertainment & Subscriptions
    if (
      lower.includes('netflix') ||
      lower.includes('hotstar') ||
      lower.includes('prime video') ||
      lower.includes('spotify') ||
      lower.includes('youtube')
    ) {
      return 'cat_entertainment';
    }

    return undefined;
  }
}
