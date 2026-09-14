import { DEFAULT_CURRENCY } from '@/types/finance';

export interface RawFinancialActivity {
  source: string;
  text?: string;
  payee?: string;
  amount?: number | string;
  date?: string;
  currency?: string;
  reference?: string;
  categoryHint?: string;
  note?: string;
  accountId?: string;
}

export interface DetectedFinancialActivity {
  payee: string;
  amount: number;
  date: string;
  currency: string;
  sourceReference?: string;
  categoryHint?: string;
  note?: string;
  accountId?: string;
}

export interface EmailFinancialMessage {
  id: string;              // Gmail message ID
  from: string;            // e.g. "Swiggy <no-reply@swiggy.in>"
  subject: string;         // e.g. "Your order from Swiggy - ₹499"
  date?: string;           // RFC 2822 or ISO date string
  snippet?: string;        // Sanitized email snippet (first ~150 chars)
}

export interface DetectedEmailActivity {
  payee: string;
  amount: number;
  currency: string;
  date: string;
  sourceReference: string; // "gmail:<messageId>"
  confidence: number;      // 0.9 = high, 0.7 = medium, 0.4 = low
  reason: string;          // Explainable reasoning
  snippet?: string;
  categoryHint?: string;
}

// Known common financial / subscription merchant domains and cues
const KNOWN_MERCHANT_PATTERNS: Array<{ pattern: RegExp; name: string; categoryHint?: string }> = [
  { pattern: /\bswiggy\b/i, name: 'Swiggy', categoryHint: 'Dining & Food' },
  { pattern: /\bzomato\b/i, name: 'Zomato', categoryHint: 'Dining & Food' },
  { pattern: /\buber\b/i, name: 'Uber', categoryHint: 'Transit & Travel' },
  { pattern: /\bola\b/i, name: 'Ola Cabs', categoryHint: 'Transit & Travel' },
  { pattern: /\bnetflix\b/i, name: 'Netflix', categoryHint: 'Entertainment & Subscriptions' },
  { pattern: /\bspotify\b/i, name: 'Spotify', categoryHint: 'Entertainment & Subscriptions' },
  { pattern: /\bamazon\b/i, name: 'Amazon', categoryHint: 'Shopping' },
  { pattern: /\bflipkart\b/i, name: 'Flipkart', categoryHint: 'Shopping' },
  { pattern: /\bapple\b/i, name: 'Apple Services', categoryHint: 'Software & Cloud' },
  { pattern: /\bgoogle\b/i, name: 'Google Play / Cloud', categoryHint: 'Software & Cloud' },
  { pattern: /\bgithub\b/i, name: 'GitHub', categoryHint: 'Software & Cloud' },
  { pattern: /\bzepto\b/i, name: 'Zepto', categoryHint: 'Groceries' },
  { pattern: /\bblinkit\b/i, name: 'Blinkit', categoryHint: 'Groceries' },
  { pattern: /\binstamart\b/i, name: 'Swiggy Instamart', categoryHint: 'Groceries' },
  { pattern: /\bairtel\b/i, name: 'Airtel', categoryHint: 'Utilities & Bills' },
  { pattern: /\bjio\b/i, name: 'Jio', categoryHint: 'Utilities & Bills' },
];

/**
 * Deterministic Financial Activity Detector:
 * Standardized parsing interface for external sources (Manual, CSV, Gmail, Bank).
 * Strictly deterministic — pure regex, format sanitization, and structured heuristics.
 * Zero AI / LLM hallucination risk.
 */
export class FinancialActivityDetector {

  static parseAmount(raw: unknown): number | null {
    if (typeof raw === 'number' && !isNaN(raw) && raw > 0) return raw;
    if (typeof raw !== 'string') return null;

    // Clean currency symbols, spaces, parentheses
    const cleaned = raw.replace(/[₹$€£¥,\s]/g, '').replace(/[()]/g, '').trim();
    const num = parseFloat(cleaned);
    return !isNaN(num) && num > 0 ? num : null;
  }

  static parseDate(raw: unknown): string {
    if (!raw || typeof raw !== 'string') {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    const trimmed = raw.trim();
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
    // DD/MM/YYYY or DD-MM-YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (dmyMatch) {
      return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
    }

    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
    }

    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }

  /** Detect structured financial candidate from generic raw input */
  static detect(activity: RawFinancialActivity): DetectedFinancialActivity | null {
    const amount = this.parseAmount(activity.amount);
    if (!amount) return null;

    const payee = activity.payee?.trim() || activity.text?.slice(0, 50).trim() || 'Unknown Payee';
    const date = this.parseDate(activity.date);
    const currency = activity.currency?.trim().toUpperCase() || DEFAULT_CURRENCY;

    return {
      payee,
      amount,
      date,
      currency,
      sourceReference: activity.reference,
      categoryHint: activity.categoryHint,
      note: activity.note,
      accountId: activity.accountId,
    };
  }

  /**
   * Deterministically extracts financial information from an email message.
   * Scans Subject, From header, and Snippet for currency, amounts, and merchant cues.
   * Returns null if the message contains no identifiable financial activity.
   */
  static detectFromEmail(email: EmailFinancialMessage): DetectedEmailActivity | null {
    const textToScan = `${email.subject || ''} ${email.snippet || ''}`;
    if (!textToScan.trim()) return null;

    // 1. Extract Amount and Currency using deterministic regexes
    const extractedAmountInfo = this.extractAmountAndCurrency(textToScan);
    if (!extractedAmountInfo) {
      return null; // Not an actionable financial message
    }

    const { amount, currency, patternConfidence } = extractedAmountInfo;

    // 2. Extract Merchant / Payee
    const merchantInfo = this.extractMerchant(email.from || '', email.subject || '', email.snippet || '');

    // 3. Extract or fallback Date
    const date = this.parseDate(email.date);

    // 4. Calculate Explainable Confidence and Reason
    let confidence = patternConfidence;
    let reason = 'Payment amount detected from message content.';

    if (merchantInfo.isKnown) {
      confidence = Math.min(0.95, confidence + 0.2);
      reason = `Amount and verified merchant '${merchantInfo.name}' detected from payment notification.`;
    } else if (merchantInfo.name && merchantInfo.name !== 'Unknown Merchant') {
      confidence = Math.min(0.85, confidence + 0.1);
      reason = `Amount detected; merchant '${merchantInfo.name}' derived from email sender.`;
    } else {
      confidence = 0.4;
      reason = 'Financial amount detected, but merchant identity requires manual review.';
    }

    return {
      payee: merchantInfo.name || 'Unknown Merchant',
      amount,
      currency,
      date,
      sourceReference: `gmail:${email.id}`,
      confidence: Math.round(confidence * 100) / 100,
      reason,
      snippet: email.snippet ? email.snippet.slice(0, 150) : undefined,
      categoryHint: merchantInfo.categoryHint,
    };
  }

  /**
   * Scans text for multi-currency values:
   * - INR: ₹500, Rs. 450, Rs 450, INR 1,299
   * - USD: $49.99, USD 50
   * - EUR: €35.00, EUR 35
   * - GBP: £25.00, GBP 25
   */
  private static extractAmountAndCurrency(text: string): {
    amount: number;
    currency: string;
    patternConfidence: number;
  } | null {
    // 1. Indian Rupee Patterns
    // ₹499 or ₹ 1,299.50
    const inrSymbolMatch = text.match(/(?:₹)\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/);
    if (inrSymbolMatch) {
      const amt = this.parseAmount(inrSymbolMatch[1]);
      if (amt) return { amount: amt, currency: 'INR', patternConfidence: 0.85 };
    }

    // Rs. 450 or Rs 1,299
    const inrRsMatch = text.match(/(?:Rs\.?|INR)\s*([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i);
    if (inrRsMatch) {
      const amt = this.parseAmount(inrRsMatch[1]);
      if (amt) return { amount: amt, currency: 'INR', patternConfidence: 0.8 };
    }

    // 2. US Dollar Patterns ($50, USD 50)
    const usdSymbolMatch = text.match(/(?:\$)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/);
    if (usdSymbolMatch) {
      const amt = this.parseAmount(usdSymbolMatch[1]);
      if (amt) return { amount: amt, currency: 'USD', patternConfidence: 0.85 };
    }

    const usdCodeMatch = text.match(/\bUSD\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i);
    if (usdCodeMatch) {
      const amt = this.parseAmount(usdCodeMatch[1]);
      if (amt) return { amount: amt, currency: 'USD', patternConfidence: 0.8 };
    }

    // 3. Euro Patterns (€35, EUR 35)
    const eurSymbolMatch = text.match(/(?:€)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/);
    if (eurSymbolMatch) {
      const amt = this.parseAmount(eurSymbolMatch[1]);
      if (amt) return { amount: amt, currency: 'EUR', patternConfidence: 0.85 };
    }

    const eurCodeMatch = text.match(/\bEUR\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i);
    if (eurCodeMatch) {
      const amt = this.parseAmount(eurCodeMatch[1]);
      if (amt) return { amount: amt, currency: 'EUR', patternConfidence: 0.8 };
    }

    // 4. British Pound Patterns (£25, GBP 25)
    const gbpSymbolMatch = text.match(/(?:£)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/);
    if (gbpSymbolMatch) {
      const amt = this.parseAmount(gbpSymbolMatch[1]);
      if (amt) return { amount: amt, currency: 'GBP', patternConfidence: 0.85 };
    }

    const gbpCodeMatch = text.match(/\bGBP\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i);
    if (gbpCodeMatch) {
      const amt = this.parseAmount(gbpCodeMatch[1]);
      if (amt) return { amount: amt, currency: 'GBP', patternConfidence: 0.8 };
    }

    // 5. Contextual keyword + raw number: "charged 499", "total: 1299", "payment of 450"
    const contextMatch = text.match(/(?:charged|paid|debited|spent|total(?:\s*amount)?|renewed for|payment of)\s*(?:of\s*)?([0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i);
    if (contextMatch) {
      const amt = this.parseAmount(contextMatch[1]);
      if (amt && amt > 1) { // Avoid trivial match on e.g. "total 1 item"
        return { amount: amt, currency: DEFAULT_CURRENCY, patternConfidence: 0.65 };
      }
    }

    return null;
  }

  /**
   * Deterministically resolves merchant name from:
   * 1. Known high-frequency merchants in Subject / Snippet / From
   * 2. Sender display name: "Swiggy <no-reply@swiggy.in>" -> "Swiggy"
   * 3. Sender domain: "billing@zoom.us" -> "Zoom"
   */
  private static extractMerchant(
    fromHeader: string,
    subject: string,
    snippet: string
  ): { name: string; isKnown: boolean; categoryHint?: string } {
    const combined = `${fromHeader} ${subject} ${snippet}`;

    // 1. Check known merchant dictionary first
    for (const item of KNOWN_MERCHANT_PATTERNS) {
      if (item.pattern.test(combined)) {
        return { name: item.name, isKnown: true, categoryHint: item.categoryHint };
      }
    }

    // 2. Parse display name from `From: "Display Name" <email@domain.com>`
    const displayNameMatch = fromHeader.match(/^(?:["']?)([^"'<]+)(?:["']?)\s*<[^>]+>/);
    if (displayNameMatch) {
      const cleanDisplay = displayNameMatch[1]
        .replace(/\b(?:Receipts?|Team|Customer\s*Care|Billing|Support|Notifications?|Updates?|Alerts?|No-?reply)\b/gi, '')
        .trim();

      if (cleanDisplay.length >= 2 && !/@/.test(cleanDisplay)) {
        return { name: cleanDisplay, isKnown: false };
      }
    }

    // 3. Fallback to sender domain: `something@merchant.com` -> "Merchant"
    const emailMatch = fromHeader.match(/<([^>]+)>/) || fromHeader.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    if (emailMatch) {
      const email = emailMatch[1];
      const domainPart = email.split('@')[1];
      if (domainPart) {
        const rootDomain = domainPart.split('.')[0];
        if (rootDomain && rootDomain.length >= 3 && !['gmail', 'yahoo', 'outlook', 'hotmail', 'mail'].includes(rootDomain.toLowerCase())) {
          const capitalized = rootDomain.charAt(0).toUpperCase() + rootDomain.slice(1);
          return { name: capitalized, isKnown: false };
        }
      }
    }

    return { name: 'Unknown Merchant', isKnown: false };
  }
}
