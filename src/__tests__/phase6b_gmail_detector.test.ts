import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FinancialActivityDetector,
  EmailFinancialMessage,
} from '@/lib/services/inbox/FinancialActivityDetector';

describe('Phase 6B: Deterministic Financial Activity Detector', () => {

  // ─── 1. Currency & Amount Extraction ────────────────────────────────────────
  describe('Multi-Currency & Amount Parsing', () => {
    it('1. Detects Indian Rupee with symbol (₹499, ₹1,299.50)', () => {
      const msg1: EmailFinancialMessage = {
        id: 'msg_inr_01',
        from: 'Swiggy <order@swiggy.in>',
        subject: 'Order Delivered! ₹499 charged to your card',
        date: '2026-09-14',
      };
      const res1 = FinancialActivityDetector.detectFromEmail(msg1);
      assert.ok(res1 !== null);
      assert.equal(res1?.amount, 499);
      assert.equal(res1?.currency, 'INR');
      assert.equal(res1?.payee, 'Swiggy');

      const msg2: EmailFinancialMessage = {
        id: 'msg_inr_02',
        from: 'Amazon.in <shipment@amazon.in>',
        subject: 'Your Amazon order details',
        snippet: 'Grand Total: ₹ 1,299.50 paid via UPI',
        date: '2026-09-14',
      };
      const res2 = FinancialActivityDetector.detectFromEmail(msg2);
      assert.ok(res2 !== null);
      assert.equal(res2?.amount, 1299.50);
      assert.equal(res2?.currency, 'INR');
      assert.equal(res2?.payee, 'Amazon');
    });

    it('2. Detects Indian Rupee with Rs. and INR text (Rs. 450, INR 1299)', () => {
      const msg1: EmailFinancialMessage = {
        id: 'msg_rs_01',
        from: 'Zomato Orders <noreply@zomato.com>',
        subject: 'Payment of Rs. 450 received',
        date: '2026-09-14',
      };
      const res1 = FinancialActivityDetector.detectFromEmail(msg1);
      assert.ok(res1 !== null);
      assert.equal(res1?.amount, 450);
      assert.equal(res1?.currency, 'INR');
      assert.equal(res1?.payee, 'Zomato');

      const msg2: EmailFinancialMessage = {
        id: 'msg_inr_text',
        from: 'Uber Receipts <receipts@uber.com>',
        subject: 'Your trip with Uber',
        snippet: 'Total fare: INR 349 debited from PayTM',
        date: '2026-09-14',
      };
      const res2 = FinancialActivityDetector.detectFromEmail(msg2);
      assert.ok(res2 !== null);
      assert.equal(res2?.amount, 349);
      assert.equal(res2?.currency, 'INR');
      assert.equal(res2?.payee, 'Uber');
    });

    it('3. Detects US Dollar ($49.99, USD 150)', () => {
      const msg: EmailFinancialMessage = {
        id: 'msg_usd_01',
        from: 'GitHub Billing <billing@github.com>',
        subject: 'Payment receipt for GitHub Copilot',
        snippet: 'We charged $49.99 to your credit card.',
        date: '2026-09-14',
      };
      const res = FinancialActivityDetector.detectFromEmail(msg);
      assert.ok(res !== null);
      assert.equal(res?.amount, 49.99);
      assert.equal(res?.currency, 'USD');
      assert.equal(res?.payee, 'GitHub');
    });

    it('4. Detects Euro (€35.50, EUR 90) and British Pound (£25.00, GBP 75)', () => {
      const msgEur: EmailFinancialMessage = {
        id: 'msg_eur_01',
        from: 'Hetzner Cloud <billing@hetzner.com>',
        subject: 'Invoice R12345: €35.50 paid',
        date: '2026-09-14',
      };
      const resEur = FinancialActivityDetector.detectFromEmail(msgEur);
      assert.ok(resEur !== null);
      assert.equal(resEur?.amount, 35.50);
      assert.equal(resEur?.currency, 'EUR');

      const msgGbp: EmailFinancialMessage = {
        id: 'msg_gbp_01',
        from: 'Economist Subscription <subs@economist.com>',
        subject: 'Subscription confirmation',
        snippet: 'Monthly recurring charge of £25.00 processed successfully',
        date: '2026-09-14',
      };
      const resGbp = FinancialActivityDetector.detectFromEmail(msgGbp);
      assert.ok(resGbp !== null);
      assert.equal(resGbp?.amount, 25);
      assert.equal(resGbp?.currency, 'GBP');
    });

    it('5. Detects contextual number pattern: "Subscription renewed for ₹699"', () => {
      const msg: EmailFinancialMessage = {
        id: 'msg_sub_01',
        from: 'Netflix India <info@netflix.com>',
        subject: 'Subscription renewed for ₹699',
        snippet: 'Thanks for using Netflix. Next billing date is Oct 14.',
        date: '2026-09-14',
      };
      const res = FinancialActivityDetector.detectFromEmail(msg);
      assert.ok(res !== null);
      assert.equal(res?.amount, 699);
      assert.equal(res?.currency, 'INR');
      assert.equal(res?.payee, 'Netflix');
      assert.equal(res?.categoryHint, 'Entertainment & Subscriptions');
    });
  });

  // ─── 2. Merchant Extraction & Fallbacks ─────────────────────────────────────
  describe('Merchant Extraction Logic', () => {
    it('1. Resolves clean merchant from sender display name', () => {
      const msg: EmailFinancialMessage = {
        id: 'msg_disp_01',
        from: '"Blue Tokai Coffee" <orders@bluetokaicoffee.com>',
        subject: 'Order #9872 confirmed',
        snippet: 'Total: ₹540 paid online',
        date: '2026-09-14',
      };
      const res = FinancialActivityDetector.detectFromEmail(msg);
      assert.ok(res !== null);
      assert.equal(res?.payee, 'Blue Tokai Coffee');
    });

    it('2. Filters common email noise words like "Receipts", "Notifications", "Team"', () => {
      const msg: EmailFinancialMessage = {
        id: 'msg_noise_01',
        from: '"Dunzo Support Team" <no-reply@dunzo.com>',
        subject: 'Your delivery receipt',
        snippet: 'Total amount: ₹180',
        date: '2026-09-14',
      };
      const res = FinancialActivityDetector.detectFromEmail(msg);
      assert.ok(res !== null);
      assert.equal(res?.payee, 'Dunzo');
    });

    it('3. Falls back to capitalized domain when display name is missing', () => {
      const msg: EmailFinancialMessage = {
        id: 'msg_domain_01',
        from: 'billing@figma.com',
        subject: 'Monthly subscription invoiced',
        snippet: 'Total charged: $12.00',
        date: '2026-09-14',
      };
      const res = FinancialActivityDetector.detectFromEmail(msg);
      assert.ok(res !== null);
      assert.equal(res?.payee, 'Figma');
    });

    it('4. Handles completely unknown or generic sender gracefully', () => {
      const msg: EmailFinancialMessage = {
        id: 'msg_anon_01',
        from: 'anonymous@gmail.com',
        subject: 'Payment receipt',
        snippet: 'Total: ₹1,500',
        date: '2026-09-14',
      };
      const res = FinancialActivityDetector.detectFromEmail(msg);
      assert.ok(res !== null);
      assert.equal(res?.payee, 'Unknown Merchant');
      assert.equal(res?.confidence, 0.4);
      assert.ok(res?.reason.includes('manual review'));
    });
  });

  // ─── 3. Non-Financial & Missing Fields Handling ─────────────────────────────
  describe('Non-Financial Message Filtering', () => {
    it('1. Returns null for newsletters or non-financial messages', () => {
      const msg: EmailFinancialMessage = {
        id: 'msg_news_01',
        from: 'Substack <writer@substack.com>',
        subject: 'Weekly Tech Digest: Issue #42',
        snippet: 'Here is what happened in software engineering this week...',
        date: '2026-09-14',
      };
      const res = FinancialActivityDetector.detectFromEmail(msg);
      assert.equal(res, null, 'Newsletters without financial amounts must be ignored');
    });

    it('2. Returns null when subject and snippet are empty', () => {
      const msg: EmailFinancialMessage = {
        id: 'msg_empty_01',
        from: 'sender@example.com',
        subject: '',
        snippet: '',
      };
      const res = FinancialActivityDetector.detectFromEmail(msg);
      assert.equal(res, null);
    });
  });

  // ─── 4. Explainable Confidence & Reason ─────────────────────────────────────
  describe('Explainable Confidence Ratings', () => {
    it('1. Verified known merchant + currency symbol gives HIGH confidence (>= 0.85)', () => {
      const msg: EmailFinancialMessage = {
        id: 'msg_conf_high',
        from: 'Swiggy <no-reply@swiggy.in>',
        subject: 'Order confirmation - ₹350',
        date: '2026-09-14',
      };
      const res = FinancialActivityDetector.detectFromEmail(msg);
      assert.ok(res !== null);
      assert.ok(res?.confidence >= 0.85, `Confidence ${res?.confidence} must be >= 0.85`);
      assert.ok(res?.reason.includes('Swiggy'));
    });

    it('2. Amount with inferred domain merchant gives MEDIUM confidence (0.7 - 0.85)', () => {
      const msg: EmailFinancialMessage = {
        id: 'msg_conf_med',
        from: 'billing@notion.so',
        subject: 'Your Notion invoice: $10.00',
        date: '2026-09-14',
      };
      const res = FinancialActivityDetector.detectFromEmail(msg);
      assert.ok(res !== null);
      assert.ok(res?.confidence >= 0.70 && res?.confidence <= 0.85);
      assert.ok(res?.reason.includes('Notion'));
    });

    it('3. Missing merchant identity gives LOW confidence (0.4)', () => {
      const msg: EmailFinancialMessage = {
        id: 'msg_conf_low',
        from: 'info@mail.com',
        subject: 'Payment receipt: ₹750',
        date: '2026-09-14',
      };
      const res = FinancialActivityDetector.detectFromEmail(msg);
      assert.ok(res !== null);
      assert.equal(res?.confidence, 0.4);
    });
  });

  // ─── 5. Backward Compatibility ──────────────────────────────────────────────
  describe('Backward Compatibility for Existing Interfaces', () => {
    it('Preserves FinancialActivityDetector.detect for manual and CSV input', () => {
      const legacy = FinancialActivityDetector.detect({
        source: 'manual',
        payee: 'Manual Grocery Store',
        amount: '150.75',
        date: '2026-09-14',
        currency: 'INR',
      });
      assert.ok(legacy !== null);
      assert.equal(legacy?.payee, 'Manual Grocery Store');
      assert.equal(legacy?.amount, 150.75);
      assert.equal(legacy?.currency, 'INR');
    });

    it('Preserves parseAmount and parseDate utility functions', () => {
      assert.equal(FinancialActivityDetector.parseAmount('₹ 1,500.50'), 1500.5);
      assert.equal(FinancialActivityDetector.parseAmount('$25'), 25);
      assert.equal(FinancialActivityDetector.parseDate('14/09/2026'), '2026-09-14');
      assert.equal(FinancialActivityDetector.parseDate('2026-09-14'), '2026-09-14');
    });
  });
});
