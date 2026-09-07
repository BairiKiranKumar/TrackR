import { MoneyDetection } from '@/types';

// ─── Money Parser ──────────────────────────────────────────────────────────

/**
 * Detect currency amounts in text.
 * Supports: ₹450, ₹1,200, Rs 450, 450 INR, 450 inr
 */
export function detectMoneyAmounts(text: string): MoneyDetection[] {
  const results: MoneyDetection[] = [];
  const patterns = [
    // ₹1,234 or ₹1234 or ₹12.50
    /₹\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g,
    // Rs 1234 or Rs. 1234
    /[Rr]s\.?\s+(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)/g,
    // 1234 INR or 1234 inr
    /(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)\s+[Ii][Nn][Rr]/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      // Extract numeric string from the capture group
      const numStr = (match[1] ?? match[0]).replace(/,/g, '');
      const amount = parseFloat(numStr);
      if (!isNaN(amount) && amount > 0) {
        results.push({
          amount,
          rawText: match[0],
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        });
      }
    }
  }

  // Deduplicate by startIndex
  const seen = new Set<number>();
  return results.filter(r => {
    if (seen.has(r.startIndex)) return false;
    seen.add(r.startIndex);
    return true;
  });
}

/**
 * Format a number as Indian currency string.
 */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format a raw amount with ₹ symbol (shorter form).
 */
export function formatAmount(amount: number): string {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${amount.toLocaleString('en-IN')}`;
}
