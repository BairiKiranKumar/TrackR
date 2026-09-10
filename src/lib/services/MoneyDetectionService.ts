import { MoneyDetectionResult, MoneyDetector } from '@/types';

export class MoneyDetectionService implements MoneyDetector {
  /**
   * Detect currency amounts and financial intents in unstructured text.
   * Deterministic regex parsing covering:
   * - Symbol prefixes: ₹500, ₹ 1,500, $60, $ 2,500.50
   * - Word prefixes: Rs 450, Rs. 1200, spent 1200, paid 3,500, cost 800, cost me 800
   * - Postfix currency codes: 450 INR, 1200 inr, 60 USD
   */
  public detect(text: string): MoneyDetectionResult[] {
    if (!text || typeof text !== 'string') return [];

    const results: MoneyDetectionResult[] = [];

    const patterns = [
      // ₹1,234.50 or ₹ 1234 or ₹500
      {
        regex: /₹\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/gi,
        currency: 'INR',
      },
      // $1,234.50 or $ 60
      {
        regex: /\$\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/gi,
        currency: 'USD',
      },
      // Rs 1234 or Rs. 1,234
      {
        regex: /\b(?:rs\.?|inr)\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/gi,
        currency: 'INR',
      },
      // 1234 INR or 1234 inr
      {
        regex: /(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*(?:inr|rs\.?)/gi,
        currency: 'INR',
      },
      // 60 USD
      {
        regex: /(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s*usd/gi,
        currency: 'USD',
      },
      // spent 1200 / paid 3,500 / cost me 800 / cost 800
      {
        regex: /\b(?:spent|paid|cost(?:\s+me)?)\s*(?:₹|\$|rs\.?)?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/gi,
        currency: 'INR',
      },
    ];

    for (const { regex, currency } of patterns) {
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const rawNumber = match[1];
        if (!rawNumber) continue;

        const normalizedStr = rawNumber.replace(/,/g, '');
        const amount = parseFloat(normalizedStr);

        if (!isNaN(amount) && amount > 0) {
          results.push({
            amount,
            currency,
            rawText: match[0].trim(),
            startIndex: match.index,
            endIndex: match.index + match[0].length,
          });
        }
      }
    }

    // Deduplicate overlapping detections by position, keeping the one with larger extent or earlier index
    const sorted = results.sort((a, b) => (a.startIndex ?? 0) - (b.startIndex ?? 0));
    const deduped: MoneyDetectionResult[] = [];

    for (const item of sorted) {
      const isOverlapping = deduped.some(
        existing =>
          (item.startIndex! >= existing.startIndex! && item.startIndex! < existing.endIndex!) ||
          (item.endIndex! > existing.startIndex! && item.endIndex! <= existing.endIndex!)
      );
      if (!isOverlapping) {
        deduped.push(item);
      }
    }

    return deduped;
  }

  public formatINR(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  public formatAmount(amount: number, currency = 'INR'): string {
    const symbol = currency === 'USD' ? '$' : '₹';
    if (amount >= 100000) return `${symbol}${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000) return `${symbol}${(amount / 1000).toFixed(1)}K`;
    return `${symbol}${amount.toLocaleString('en-IN')}`;
  }
}

export const moneyDetectionService = new MoneyDetectionService();

// Standalone function exports — this is the single canonical money
// parsing/formatting implementation (see §8 audit: MoneyParser.ts was a
// second, less capable duplicate of this same responsibility and has been
// removed; every caller now imports from here).
export function formatINR(amount: number): string {
  return moneyDetectionService.formatINR(amount);
}

export function formatAmount(amount: number, currency = 'INR'): string {
  return moneyDetectionService.formatAmount(amount, currency);
}
