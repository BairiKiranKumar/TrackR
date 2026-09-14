import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  RebitBankNormalizer,
} from '@/lib/services/integrations/bank/RebitBankNormalizer';
import {
  RebitDepositTransaction,
  RebitDepositAccount,
} from '@/types/finance';

describe('Phase 7: ReBIT Bank Normalizer & Indian Narration Parser', () => {
  const mockAccount: Pick<RebitDepositAccount, 'maskedAccNumber' | 'currency' | 'fipName' | 'fipId'> = {
    maskedAccNumber: 'XXXXXXXX4012',
    currency: 'INR',
    fipName: 'State Bank of India',
    fipId: 'SBI-FIP',
  };

  describe('UPI Narration Parsing', () => {
    it('1. Parses UPI narration with clean merchant display name and VPA', () => {
      const txn: RebitDepositTransaction = {
        txnId: 'TXN_UPI_01',
        type: 'DEBIT',
        mode: 'UPI',
        amount: 499.0,
        transactionTimestamp: '2026-09-12T14:22:10Z',
        valueDate: '2026-09-12',
        narration: 'UPI/425512984920/Swiggy/swiggy@icici/Payment',
      };

      const candidate = RebitBankNormalizer.normalizeTransaction(txn, mockAccount);
      assert.strictEqual(candidate.payee, 'Swiggy');
      assert.strictEqual(candidate.amount, 499.0);
      assert.strictEqual(candidate.currency, 'INR');
      assert.strictEqual(candidate.date, '2026-09-12');
      assert.strictEqual(candidate.suggestedCategory, 'cat_food');
      assert.strictEqual(candidate.sourceReference, 'bank:XXXXXXXX4012:TXN_UPI_01');
      assert.ok(candidate.confidence && candidate.confidence >= 0.85);
      assert.ok(candidate.reason?.includes('Swiggy'));
    });

    it('2. Parses UPI narration with corporate merchant suffix (Zomato Ltd)', () => {
      const txn: RebitDepositTransaction = {
        txnId: 'TXN_UPI_02',
        type: 'DEBIT',
        mode: 'UPI',
        amount: 350.0,
        transactionTimestamp: '2026-09-11T19:40:00Z',
        valueDate: '2026-09-11',
        narration: 'UPI/425689123412/Zomato Ltd/paytm-1234@paytm',
      };

      const candidate = RebitBankNormalizer.normalizeTransaction(txn, mockAccount);
      assert.strictEqual(candidate.payee, 'Zomato');
      assert.strictEqual(candidate.amount, 350.0);
      assert.strictEqual(candidate.suggestedCategory, 'cat_food');
    });

    it('3. Derives payee from VPA handle prefix when merchant name is absent', () => {
      const txn: RebitDepositTransaction = {
        txnId: 'TXN_UPI_03',
        type: 'DEBIT',
        mode: 'UPI',
        amount: 149.0,
        transactionTimestamp: '2026-09-10T08:15:00Z',
        valueDate: '2026-09-10',
        narration: 'UPI/425998124512/blinkit@hdfcbank',
      };

      const candidate = RebitBankNormalizer.normalizeTransaction(txn, mockAccount);
      assert.strictEqual(candidate.payee, 'Blinkit');
      assert.strictEqual(candidate.suggestedCategory, 'cat_food_groceries');
    });

    it('4. Parses peer-to-peer UPI transfer with personal name', () => {
      const txn: RebitDepositTransaction = {
        txnId: 'TXN_UPI_04',
        type: 'CREDIT',
        mode: 'UPI',
        amount: 2000.0,
        transactionTimestamp: '2026-09-08T12:00:00Z',
        valueDate: '2026-09-08',
        narration: 'UPI/426334567890/Rahul Sharma/rahul@upi/Split dinner',
      };

      const candidate = RebitBankNormalizer.normalizeTransaction(txn, mockAccount);
      assert.strictEqual(candidate.payee, 'Rahul Sharma');
      assert.strictEqual(candidate.amount, 2000.0);
      assert.strictEqual(candidate.suggestedCategory, 'Income');
    });
  });

  describe('Card POS & IMPS Narration Parsing', () => {
    it('5. Parses POS card swipe narration, removing card mask and city name', () => {
      const txn: RebitDepositTransaction = {
        txnId: 'TXN_POS_01',
        type: 'DEBIT',
        mode: 'POS',
        amount: 2450.0,
        transactionTimestamp: '2026-09-09T17:30:00Z',
        valueDate: '2026-09-09',
        narration: 'POS 401234XXXXXX4012 RELIANCE RETAIL HYDERABAD',
      };

      const candidate = RebitBankNormalizer.normalizeTransaction(txn, mockAccount);
      assert.strictEqual(candidate.payee, 'Reliance Retail');
      assert.strictEqual(candidate.suggestedCategory, 'cat_food_groceries');
      assert.strictEqual(candidate.amount, 2450.0);
    });

    it('6. Parses POS fuel station transaction into Transport category', () => {
      const txn: RebitDepositTransaction = {
        txnId: 'TXN_POS_02',
        type: 'DEBIT',
        mode: 'POS',
        amount: 1800.0,
        transactionTimestamp: '2026-09-07T11:20:00Z',
        valueDate: '2026-09-07',
        narration: 'POS 401234XXXXXX4012 SHELL FUEL STATION BANGALORE',
      };

      const candidate = RebitBankNormalizer.normalizeTransaction(txn, mockAccount);
      assert.strictEqual(candidate.payee, 'Shell Fuel Station');
      assert.strictEqual(candidate.suggestedCategory, 'cat_transport');
    });

    it('7. Parses IMPS subscription payment (Netflix India)', () => {
      const txn: RebitDepositTransaction = {
        txnId: 'TXN_IMPS_01',
        type: 'DEBIT',
        mode: 'IMPS',
        amount: 649.0,
        transactionTimestamp: '2026-09-05T09:10:00Z',
        valueDate: '2026-09-05',
        narration: 'IMPS-425112345678-NETFLIX INDIA-HDFC',
      };

      const candidate = RebitBankNormalizer.normalizeTransaction(txn, mockAccount);
      assert.strictEqual(candidate.payee, 'Netflix India');
      assert.strictEqual(candidate.suggestedCategory, 'cat_entertainment');
      assert.strictEqual(candidate.amount, 649.0);
    });
  });

  describe('NEFT, ATM & Utility Parsing', () => {
    it('8. Parses NEFT credit salary transaction into Salary category', () => {
      const txn: RebitDepositTransaction = {
        txnId: 'TXN_NEFT_01',
        type: 'CREDIT',
        mode: 'NEFT',
        amount: 85000.0,
        transactionTimestamp: '2026-09-01T06:00:00Z',
        valueDate: '2026-09-01',
        narration: 'NEFT CR-HDFC0000060-ACME CORP SALARY-AUG26',
      };

      const candidate = RebitBankNormalizer.normalizeTransaction(txn, mockAccount);
      assert.strictEqual(candidate.payee, 'Acme Corp Salary');
      assert.strictEqual(candidate.suggestedCategory, 'Salary');
      assert.strictEqual(candidate.amount, 85000.0);
    });

    it('9. Parses NEFT debit rent transaction into Housing / Rent', () => {
      const txn: RebitDepositTransaction = {
        txnId: 'TXN_NEFT_02',
        type: 'DEBIT',
        mode: 'NEFT',
        amount: 15000.0,
        transactionTimestamp: '2026-09-02T10:00:00Z',
        valueDate: '2026-09-02',
        narration: 'NEFT-AXIS001-KIRAN KUMAR RENT-AUG26',
      };

      const candidate = RebitBankNormalizer.normalizeTransaction(txn, mockAccount);
      assert.strictEqual(candidate.payee, 'Kiran Kumar Rent');
      assert.strictEqual(candidate.suggestedCategory, 'cat_housing');
      assert.strictEqual(candidate.amount, 15000.0);
    });

    it('10. Classifies ATM cash withdrawal with high confidence', () => {
      const txn: RebitDepositTransaction = {
        txnId: 'TXN_ATM_01',
        type: 'DEBIT',
        mode: 'ATM',
        amount: 5000.0,
        transactionTimestamp: '2026-09-03T15:45:00Z',
        valueDate: '2026-09-03',
        narration: 'ATM WDL/HDFC/BANJARA HILLS/140926',
      };

      const candidate = RebitBankNormalizer.normalizeTransaction(txn, mockAccount);
      assert.strictEqual(candidate.payee, 'ATM Cash Withdrawal');
      assert.strictEqual(candidate.amount, 5000.0);
      assert.ok(candidate.confidence && candidate.confidence >= 0.9);
    });

    it('11. Parses electricity utility bill payment (TSSPDCL)', () => {
      const txn: RebitDepositTransaction = {
        txnId: 'TXN_UTIL_01',
        type: 'DEBIT',
        mode: 'UPI',
        amount: 850.0,
        transactionTimestamp: '2026-08-25T14:10:00Z',
        valueDate: '2026-08-25',
        narration: 'UPI/426445678901/TSSPDCL/tsspdcl@billdesk/Electricity',
      };

      const candidate = RebitBankNormalizer.normalizeTransaction(txn, mockAccount);
      assert.strictEqual(candidate.payee, 'Tsspdcl');
      assert.strictEqual(candidate.suggestedCategory, 'cat_housing');
    });

    it('12. Parses broadband internet payment (ACT Fibernet)', () => {
      const txn: RebitDepositTransaction = {
        txnId: 'TXN_UTIL_02',
        type: 'DEBIT',
        mode: 'UPI',
        amount: 699.0,
        transactionTimestamp: '2026-08-28T18:22:00Z',
        valueDate: '2026-08-28',
        narration: 'UPI/426556789012/ACT Fibernet/act@paytm/Internet',
      };

      const candidate = RebitBankNormalizer.normalizeTransaction(txn, mockAccount);
      assert.strictEqual(candidate.payee, 'ACT Fibernet');
      assert.strictEqual(candidate.suggestedCategory, 'cat_housing');
    });
  });

  describe('Account Normalization & Metadata Mapping', () => {
    it('13. Normalizes an entire ReBIT deposit account with multiple transactions', () => {
      const fullAccount: RebitDepositAccount = {
        accountType: 'SAVINGS',
        maskedAccNumber: 'XXXXXXXX4012',
        currentBalance: 120500.0,
        currency: 'INR',
        branch: 'Banjara Hills',
        ifsc: 'SBIN0000847',
        fipId: 'SBI-FIP',
        fipName: 'State Bank of India',
        transactions: [
          {
            txnId: 'TXN_1',
            type: 'DEBIT',
            mode: 'UPI',
            amount: 75.0,
            transactionTimestamp: '2026-09-13T10:00:00Z',
            valueDate: '2026-09-13',
            narration: 'UPI/426001234567/Chai Point/chaipoint@axl/Tea',
          },
          {
            txnId: 'TXN_2',
            type: 'DEBIT',
            mode: 'UPI',
            amount: 299.0,
            transactionTimestamp: '2026-09-13T12:00:00Z',
            valueDate: '2026-09-13',
            narration: 'UPI/426112345678/Uber India/uber@icici/Trip',
          },
        ],
      };

      const drafts = RebitBankNormalizer.normalizeAccount(fullAccount, 'acc_sbi_local');
      assert.strictEqual(drafts.length, 2);
      assert.strictEqual(drafts[0].payee, 'Chai Point');
      assert.strictEqual(drafts[0].suggestedCategory, 'cat_food');
      assert.strictEqual(drafts[0].suggestedAccount, 'acc_sbi_local');
      assert.strictEqual(drafts[0].sourceReference, 'bank:XXXXXXXX4012:TXN_1');

      assert.strictEqual(drafts[1].payee, 'Uber India');
      assert.strictEqual(drafts[1].suggestedCategory, 'cat_transport');
      assert.strictEqual(drafts[1].sourceReference, 'bank:XXXXXXXX4012:TXN_2');
    });

    it('14. Falls back gracefully for unstructured or non-standard narrations', () => {
      const txn: RebitDepositTransaction = {
        txnId: 'TXN_RAW_01',
        type: 'DEBIT',
        mode: 'OTHERS',
        amount: 120.0,
        transactionTimestamp: '2026-09-10T12:00:00Z',
        valueDate: '2026-09-10',
        narration: 'MISC CHG SVR MAINTENANCE FEE',
      };

      const candidate = RebitBankNormalizer.normalizeTransaction(txn, mockAccount);
      assert.strictEqual(candidate.payee, 'Misc Chg Svr Maintenance Fee');
      assert.strictEqual(candidate.confidence, 0.6);
      assert.ok(candidate.reason?.includes('raw bank statement narration'));
    });
  });
});
