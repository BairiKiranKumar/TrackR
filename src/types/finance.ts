// ─── Finance Domain Types (Phase 2) ──────────────────────────────────────────
// Dedicated types for the finance subsystem. These are stored in dedicated
// IndexedDB stores (fa_*) rather than the Universal Items store, enabling
// efficient indexed queries across 10k+ transactions.

// ─── Accounts ────────────────────────────────────────────────────────────────

export type AccountType =
  | 'cash'
  | 'bank'
  | 'credit_card'
  | 'savings'
  | 'wallet'
  | 'loan'
  | 'investment'
  | 'other';

export interface FinanceAccount {
  id: string;
  name: string;
  institution?: string;
  type: AccountType;
  currency: string;         // ISO 4217 e.g. 'INR', 'USD'
  openingBalance: number;   // positive absolute value
  currentBalance: number;   // maintained by transaction service
  notes?: string;
  color?: string;           // hex accent
  icon?: string;
  archived: boolean;
  createdAt: string;        // ISO
  updatedAt: string;        // ISO
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export type TransactionType = 'expense' | 'income' | 'transfer';

/** Amount convention: always a positive absolute value. type determines direction. */
export interface FinanceTransaction {
  id: string;
  accountId: string;
  date: string;             // ISO date YYYY-MM-DD
  amount: number;           // positive absolute value
  currency: string;
  type: TransactionType;
  categoryId?: string;      // null for transfers
  payee?: string;
  note?: string;
  labels: string[];         // label ids
  projectId?: string;       // link to Universal Item project
  goalId?: string;          // link to Universal Item goal
  source?: 'manual' | 'csv_import' | 'recurring' | 'financial_inbox' | 'gmail';
  sourceReference?: string; // e.g. CSV filename, recurringId, gmail:<messageId>
  recurringId?: string;     // link to FinancePlannedPayment
  transferId?: string;      // pairs two transfer transactions
  ruleExecutions: RuleExecution[];
  // Multi-currency
  originalAmount?: number;
  originalCurrency?: string;
  exchangeRate?: number;    // rate at time of transaction
  createdAt: string;
  updatedAt: string;
}

export interface RuleExecution {
  ruleId: string;
  ruleName: string;
  appliedAt: string;
  changes: Record<string, unknown>;
}

// ─── Categories ───────────────────────────────────────────────────────────────

export type CategoryDirection = 'expense' | 'income' | 'both';

export interface FinanceCategory {
  id: string;
  name: string;
  parentId?: string;        // null = root category
  direction: CategoryDirection;
  icon?: string;
  color?: string;
  sortOrder: number;
  archived: boolean;
  isDefault: boolean;       // seeded default, shown with special treatment
  createdAt: string;
  updatedAt: string;
}

// ─── Labels ──────────────────────────────────────────────────────────────────

export interface FinanceLabel {
  id: string;
  name: string;
  color: string;            // hex
  createdAt: string;
  updatedAt: string;
}

// ─── Budgets ─────────────────────────────────────────────────────────────────

export type BudgetPeriod = 'weekly' | 'monthly' | 'yearly' | 'custom';

export interface FinanceBudget {
  id: string;
  name: string;
  target: number;           // budget limit
  currency: string;
  period: BudgetPeriod;
  startDate: string;        // ISO date
  endDate?: string;         // for 'custom' period
  categoryId?: string;      // budget for a specific category
  accountId?: string;       // budget for a specific account
  labelId?: string;         // budget for a specific label
  rollover: boolean;        // carry unused budget to next period
  alertThreshold: number;   // 0.8 = alert at 80%
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceBudgetProgress {
  budget: FinanceBudget;
  categoryName?: string;
  spent: number;
  remaining: number;
  percentage: number;
  projectedSpend: number;
  potentialOverspend?: number;
  daysRemaining?: number;
  daysTotal?: number;
  daysElapsed?: number;
  dailyRate?: number;
  rolloverAmount?: number;
  effectiveTarget?: number;
  periodStart?: string;
  periodEnd?: string;
  isAlert: boolean;
  isOver: boolean;
}

// ─── Rules ───────────────────────────────────────────────────────────────────

export type RuleConditionField =
  | 'payee'
  | 'amount'
  | 'account'
  | 'type'
  | 'category'
  | 'label'
  | 'note';

export type RuleConditionOperator =
  | 'contains'
  | 'not_contains'
  | 'equals'
  | 'not_equals'
  | 'gte'
  | 'lte'
  | 'starts_with'
  | 'ends_with';

export interface RuleCondition {
  field: RuleConditionField;
  operator: RuleConditionOperator;
  value: string;
}

export type RuleActionType =
  | 'set_category'
  | 'add_labels'
  | 'set_project'
  | 'append_note'
  | 'set_payee';

export interface RuleAction {
  type: RuleActionType;
  value: string | string[];
}

export interface FinanceRule {
  id: string;
  name: string;
  conditions: RuleCondition[];    // ALL conditions must match (AND)
  actions: RuleAction[];
  priority: number;               // lower = higher priority
  enabled: boolean;
  applyToExisting: boolean;       // whether to run on existing transactions
  executionCount: number;
  lastExecutedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Planned Payments ─────────────────────────────────────────────────────────

export type PlannedPaymentStatus = 'pending' | 'paid' | 'skipped' | 'cancelled';

export type RecurrenceFrequency = 'once' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export interface Recurrence {
  frequency: RecurrenceFrequency;
  interval?: number;            // every N units
  daysOfWeek?: number[];        // 0=Sun for weekly
  dayOfMonth?: number;          // for monthly
  endDate?: string;             // stop generating after this date
  maxOccurrences?: number;
}

export interface FinancePlannedPayment {
  id: string;
  name: string;
  amount: number;
  currency: string;
  accountId?: string;
  categoryId?: string;
  payee?: string;
  note?: string;
  dueDate: string;              // ISO date — next due date
  recurrence: Recurrence;
  autoCreate: boolean;          // if true, auto-create transaction on due date
  reminderDays: number;         // alert N days before due
  status: PlannedPaymentStatus;
  lastTransactionId?: string;   // most recently created transaction
  createdAt: string;
  updatedAt: string;
}

// ─── Investments ──────────────────────────────────────────────────────────────

export type InvestmentAssetType = 'stock' | 'etf' | 'mutual_fund' | 'crypto' | 'bond' | 'fd' | 'other';

export type InvestmentTransactionType = 'buy' | 'sell' | 'dividend' | 'fee' | 'adjustment';

export interface InvestmentTransaction {
  id: string;
  date: string;
  type: InvestmentTransactionType;
  quantity: number;
  price: number;              // per unit
  fees: number;
  note?: string;
  createdAt: string;
}

export interface FinanceInvestment {
  id: string;
  name: string;                 // e.g. "Reliance Industries"
  ticker?: string;              // e.g. "RELIANCE"
  assetType: InvestmentAssetType;
  accountId?: string;
  currency: string;
  quantity: number;             // current quantity
  averagePrice: number;         // weighted average cost
  currentPrice: number;         // manually entered
  currentPriceUpdatedAt?: string;
  transactions: InvestmentTransaction[];
  notes?: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Debts ────────────────────────────────────────────────────────────────────

export type DebtDirection = 'lent' | 'borrowed';
export type DebtStatus = 'active' | 'partially_paid' | 'paid' | 'forgiven' | 'closed';

export interface DebtRepayment {
  id: string;
  amount: number;
  date: string;
  note?: string;
  transactionId?: string;   // linked transaction if payment was recorded
  createdAt: string;
}

export interface FinanceDebt {
  id: string;
  person: string;               // name of person/entity
  direction: DebtDirection;     // 'lent' = I gave money, 'borrowed' = I received money
  amount: number;               // original principal
  currency: string;
  date: string;                 // when the debt was created
  dueDate?: string;
  note?: string;
  repayments: DebtRepayment[];
  status: DebtStatus;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Currency ─────────────────────────────────────────────────────────────────

export interface CurrencyRate {
  id: string;                   // `${from}_${to}_${date}`
  from: string;                 // ISO 4217
  to: string;
  rate: number;                 // 1 `from` = `rate` `to`
  date: string;                 // ISO date
  source: 'manual';
  createdAt: string;
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export interface DateRange {
  start: string;  // ISO date
  end: string;    // ISO date
}

export interface CategoryTotal {
  categoryId: string;
  categoryName: string;
  parentId?: string;
  amount: number;
  count: number;
  percentage: number;
}

export interface MonthlyTotal {
  month: string;  // YYYY-MM
  income: number;
  expenses: number;
  net: number;
}

export interface AccountBalance {
  account: FinanceAccount;
  balance: number;
  isAsset: boolean;
  isLiability: boolean;
}

export interface NetWorthSnapshot {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  accountBalances: AccountBalance[];
  investmentValue: number;
  debtOutstanding: number;
  calculatedAt: string;
}

export interface CashFlowEntry {
  date: string;
  label: string;
  type: 'actual' | 'planned' | 'projected';
  amount: number;
  runningBalance: number;
  accountId?: string;
  category?: string;
}

// ─── Import / Export ──────────────────────────────────────────────────────────

export interface CsvColumnMap {
  date?: string;
  amount?: string;
  type?: string;
  payee?: string;
  category?: string;
  note?: string;
  currency?: string;
  labels?: string;
}

export interface CsvImportRow {
  rawRow: Record<string, string>;
  parsed: {
    date?: string;
    amount?: number;
    type?: TransactionType;
    payee?: string;
    categoryName?: string;
    note?: string;
    currency?: string;
  };
  errors: string[];
  isDuplicate: boolean;
  duplicateOf?: string;         // transaction id
}

export interface CsvImportResult {
  total: number;
  imported: number;
  skipped: number;
  errors: string[];
  duplicatesFound: number;
}

// ─── Finance Export Payload ───────────────────────────────────────────────────

export interface FinanceExportPayload {
  version: number;              // schema version for future migrations
  exportedAt: string;
  accounts: FinanceAccount[];
  transactions: FinanceTransaction[];
  categories: FinanceCategory[];
  labels: FinanceLabel[];
  budgets: FinanceBudget[];
  rules: FinanceRule[];
  plannedPayments: FinancePlannedPayment[];
  investments: FinanceInvestment[];
  debts: FinanceDebt[];
  currencyRates: CurrencyRate[];
  candidates?: FinancialCandidate[];
}

export const FINANCE_EXPORT_VERSION = 2;

// ─── Default Category Seed Data ───────────────────────────────────────────────

export const DEFAULT_CATEGORIES: Omit<FinanceCategory, 'createdAt' | 'updatedAt'>[] = [
  // ── Expense roots ─────────────────────────────────────────────────────
  { id: 'cat_food', name: 'Food & Dining', parentId: undefined, direction: 'expense', icon: '🍽️', color: '#f97316', sortOrder: 10, archived: false, isDefault: true },
  { id: 'cat_food_groceries', name: 'Groceries', parentId: 'cat_food', direction: 'expense', icon: '🛒', color: '#f97316', sortOrder: 11, archived: false, isDefault: true },
  { id: 'cat_food_restaurants', name: 'Restaurants', parentId: 'cat_food', direction: 'expense', icon: '🍴', color: '#f97316', sortOrder: 12, archived: false, isDefault: true },
  { id: 'cat_food_delivery', name: 'Food Delivery', parentId: 'cat_food', direction: 'expense', icon: '🛵', color: '#f97316', sortOrder: 13, archived: false, isDefault: true },
  { id: 'cat_food_coffee', name: 'Coffee & Tea', parentId: 'cat_food', direction: 'expense', icon: '☕', color: '#f97316', sortOrder: 14, archived: false, isDefault: true },

  { id: 'cat_transport', name: 'Transport', parentId: undefined, direction: 'expense', icon: '🚗', color: '#3b82f6', sortOrder: 20, archived: false, isDefault: true },
  { id: 'cat_transport_fuel', name: 'Fuel', parentId: 'cat_transport', direction: 'expense', icon: '⛽', color: '#3b82f6', sortOrder: 21, archived: false, isDefault: true },
  { id: 'cat_transport_taxi', name: 'Taxi & Rideshare', parentId: 'cat_transport', direction: 'expense', icon: '🚕', color: '#3b82f6', sortOrder: 22, archived: false, isDefault: true },
  { id: 'cat_transport_public', name: 'Public Transport', parentId: 'cat_transport', direction: 'expense', icon: '🚌', color: '#3b82f6', sortOrder: 23, archived: false, isDefault: true },
  { id: 'cat_transport_parking', name: 'Parking', parentId: 'cat_transport', direction: 'expense', icon: '🅿️', color: '#3b82f6', sortOrder: 24, archived: false, isDefault: true },

  { id: 'cat_housing', name: 'Housing', parentId: undefined, direction: 'expense', icon: '🏠', color: '#8b5cf6', sortOrder: 30, archived: false, isDefault: true },
  { id: 'cat_housing_rent', name: 'Rent', parentId: 'cat_housing', direction: 'expense', icon: '🏠', color: '#8b5cf6', sortOrder: 31, archived: false, isDefault: true },
  { id: 'cat_housing_electricity', name: 'Electricity', parentId: 'cat_housing', direction: 'expense', icon: '⚡', color: '#8b5cf6', sortOrder: 32, archived: false, isDefault: true },
  { id: 'cat_housing_internet', name: 'Internet', parentId: 'cat_housing', direction: 'expense', icon: '🌐', color: '#8b5cf6', sortOrder: 33, archived: false, isDefault: true },
  { id: 'cat_housing_maintenance', name: 'Maintenance', parentId: 'cat_housing', direction: 'expense', icon: '🔧', color: '#8b5cf6', sortOrder: 34, archived: false, isDefault: true },
  { id: 'cat_housing_gas', name: 'Gas & Water', parentId: 'cat_housing', direction: 'expense', icon: '🔥', color: '#8b5cf6', sortOrder: 35, archived: false, isDefault: true },

  { id: 'cat_shopping', name: 'Shopping', parentId: undefined, direction: 'expense', icon: '🛍️', color: '#ec4899', sortOrder: 40, archived: false, isDefault: true },
  { id: 'cat_shopping_clothing', name: 'Clothing', parentId: 'cat_shopping', direction: 'expense', icon: '👕', color: '#ec4899', sortOrder: 41, archived: false, isDefault: true },
  { id: 'cat_shopping_electronics', name: 'Electronics', parentId: 'cat_shopping', direction: 'expense', icon: '📱', color: '#ec4899', sortOrder: 42, archived: false, isDefault: true },
  { id: 'cat_shopping_household', name: 'Household', parentId: 'cat_shopping', direction: 'expense', icon: '🏡', color: '#ec4899', sortOrder: 43, archived: false, isDefault: true },

  { id: 'cat_entertainment', name: 'Entertainment', parentId: undefined, direction: 'expense', icon: '🎬', color: '#06b6d4', sortOrder: 50, archived: false, isDefault: true },
  { id: 'cat_entertainment_movies', name: 'Movies & OTT', parentId: 'cat_entertainment', direction: 'expense', icon: '🎥', color: '#06b6d4', sortOrder: 51, archived: false, isDefault: true },
  { id: 'cat_entertainment_games', name: 'Games', parentId: 'cat_entertainment', direction: 'expense', icon: '🎮', color: '#06b6d4', sortOrder: 52, archived: false, isDefault: true },
  { id: 'cat_entertainment_subscriptions', name: 'Subscriptions', parentId: 'cat_entertainment', direction: 'expense', icon: '📺', color: '#06b6d4', sortOrder: 53, archived: false, isDefault: true },

  { id: 'cat_health', name: 'Health', parentId: undefined, direction: 'expense', icon: '💊', color: '#10b981', sortOrder: 60, archived: false, isDefault: true },
  { id: 'cat_health_pharmacy', name: 'Pharmacy', parentId: 'cat_health', direction: 'expense', icon: '💊', color: '#10b981', sortOrder: 61, archived: false, isDefault: true },
  { id: 'cat_health_doctor', name: 'Doctor & Hospital', parentId: 'cat_health', direction: 'expense', icon: '🏥', color: '#10b981', sortOrder: 62, archived: false, isDefault: true },
  { id: 'cat_health_fitness', name: 'Fitness & Gym', parentId: 'cat_health', direction: 'expense', icon: '💪', color: '#10b981', sortOrder: 63, archived: false, isDefault: true },

  { id: 'cat_travel', name: 'Travel', parentId: undefined, direction: 'expense', icon: '✈️', color: '#f59e0b', sortOrder: 70, archived: false, isDefault: true },
  { id: 'cat_travel_flights', name: 'Flights', parentId: 'cat_travel', direction: 'expense', icon: '✈️', color: '#f59e0b', sortOrder: 71, archived: false, isDefault: true },
  { id: 'cat_travel_hotels', name: 'Hotels & Stay', parentId: 'cat_travel', direction: 'expense', icon: '🏨', color: '#f59e0b', sortOrder: 72, archived: false, isDefault: true },
  { id: 'cat_travel_local', name: 'Local Transport', parentId: 'cat_travel', direction: 'expense', icon: '🚶', color: '#f59e0b', sortOrder: 73, archived: false, isDefault: true },

  { id: 'cat_personal', name: 'Personal', parentId: undefined, direction: 'expense', icon: '👤', color: '#6366f1', sortOrder: 80, archived: false, isDefault: true },
  { id: 'cat_personal_education', name: 'Education', parentId: 'cat_personal', direction: 'expense', icon: '📚', color: '#6366f1', sortOrder: 81, archived: false, isDefault: true },
  { id: 'cat_personal_gifts', name: 'Gifts & Donations', parentId: 'cat_personal', direction: 'expense', icon: '🎁', color: '#6366f1', sortOrder: 82, archived: false, isDefault: true },
  { id: 'cat_personal_grooming', name: 'Grooming', parentId: 'cat_personal', direction: 'expense', icon: '💈', color: '#6366f1', sortOrder: 83, archived: false, isDefault: true },

  { id: 'cat_fees', name: 'Fees & Charges', parentId: undefined, direction: 'expense', icon: '📄', color: '#64748b', sortOrder: 90, archived: false, isDefault: true },
  { id: 'cat_fees_bank', name: 'Bank Charges', parentId: 'cat_fees', direction: 'expense', icon: '🏦', color: '#64748b', sortOrder: 91, archived: false, isDefault: true },
  { id: 'cat_fees_taxes', name: 'Taxes', parentId: 'cat_fees', direction: 'expense', icon: '📋', color: '#64748b', sortOrder: 92, archived: false, isDefault: true },
  { id: 'cat_fees_insurance', name: 'Insurance', parentId: 'cat_fees', direction: 'expense', icon: '🛡️', color: '#64748b', sortOrder: 93, archived: false, isDefault: true },

  { id: 'cat_expense_other', name: 'Other Expense', parentId: undefined, direction: 'expense', icon: '💸', color: '#94a3b8', sortOrder: 99, archived: false, isDefault: true },

  // ── Income roots ──────────────────────────────────────────────────────
  { id: 'cat_income_salary', name: 'Salary', parentId: undefined, direction: 'income', icon: '💰', color: '#22c55e', sortOrder: 110, archived: false, isDefault: true },
  { id: 'cat_income_freelance', name: 'Freelance', parentId: undefined, direction: 'income', icon: '💻', color: '#22c55e', sortOrder: 120, archived: false, isDefault: true },
  { id: 'cat_income_business', name: 'Business', parentId: undefined, direction: 'income', icon: '🏢', color: '#22c55e', sortOrder: 130, archived: false, isDefault: true },
  { id: 'cat_income_investment', name: 'Investment Returns', parentId: undefined, direction: 'income', icon: '📈', color: '#22c55e', sortOrder: 140, archived: false, isDefault: true },
  { id: 'cat_income_interest', name: 'Interest', parentId: 'cat_income_investment', direction: 'income', icon: '🏦', color: '#22c55e', sortOrder: 141, archived: false, isDefault: true },
  { id: 'cat_income_dividends', name: 'Dividends', parentId: 'cat_income_investment', direction: 'income', icon: '💹', color: '#22c55e', sortOrder: 142, archived: false, isDefault: true },
  { id: 'cat_income_rental', name: 'Rental Income', parentId: undefined, direction: 'income', icon: '🏘️', color: '#22c55e', sortOrder: 150, archived: false, isDefault: true },
  { id: 'cat_income_gifts', name: 'Gifts Received', parentId: undefined, direction: 'income', icon: '🎁', color: '#22c55e', sortOrder: 160, archived: false, isDefault: true },
  { id: 'cat_income_other', name: 'Other Income', parentId: undefined, direction: 'income', icon: '💵', color: '#22c55e', sortOrder: 199, archived: false, isDefault: true },
];

// ─── Currency Configuration ───────────────────────────────────────────────────

export const SUPPORTED_CURRENCIES = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
  { code: 'CAD', symbol: 'CA$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
];

export const DEFAULT_CURRENCY = 'INR';
export const DEFAULT_BASE_CURRENCY = 'INR';

export function getCurrencySymbol(code: string): string {
  return SUPPORTED_CURRENCIES.find(c => c.code === code)?.symbol ?? code;
}

export function formatFinanceAmount(amount: number, currency = 'INR'): string {
  const symbol = getCurrencySymbol(currency);
  if (currency === 'INR') {
    // Indian number formatting
    if (amount >= 10000000) return `${symbol}${(amount / 10000000).toFixed(2)}Cr`;
    if (amount >= 100000) return `${symbol}${(amount / 100000).toFixed(2)}L`;
    if (amount >= 1000) return `${symbol}${(amount / 1000).toFixed(1)}K`;
    return `${symbol}${amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }
  if (amount >= 1000000) return `${symbol}${(amount / 1000000).toFixed(2)}M`;
  if (amount >= 1000) return `${symbol}${(amount / 1000).toFixed(1)}K`;
  return `${symbol}${amount.toFixed(2)}`;
}

export function formatFinanceAmountFull(amount: number, currency = 'INR'): string {
  const symbol = getCurrencySymbol(currency);
  if (currency === 'INR') {
    return `${symbol}${amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }
  return `${symbol}${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// ─── Account type helpers ─────────────────────────────────────────────────────

export function isAssetAccount(type: AccountType): boolean {
  return ['cash', 'bank', 'savings', 'wallet', 'investment'].includes(type);
}

export function isLiabilityAccount(type: AccountType): boolean {
  return ['credit_card', 'loan'].includes(type);
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: 'Cash',
  bank: 'Bank Account',
  credit_card: 'Credit Card',
  savings: 'Savings',
  wallet: 'Digital Wallet',
  loan: 'Loan',
  investment: 'Investment',
  other: 'Other',
};

export const ACCOUNT_TYPE_ICONS: Record<AccountType, string> = {
  cash: '💵',
  bank: '🏦',
  credit_card: '💳',
  savings: '🏧',
  wallet: '👛',
  loan: '📋',
  investment: '📈',
  other: '💰',
};

// ─── Period helpers ───────────────────────────────────────────────────────────

export function getPeriodDateRange(period: BudgetPeriod, referenceDate = new Date()): { start: string; end: string } {
  const y = referenceDate.getFullYear();
  const m = referenceDate.getMonth();
  const d = referenceDate.getDate();

  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

  switch (period) {
    case 'weekly': {
      // ISO 8601 week: Monday (1) to Sunday (7 / 0 in JS Date)
      const dayOfWeek = referenceDate.getDay();
      const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
      const monday = new Date(y, m, d + diffToMonday);
      const sunday = new Date(y, m, d + diffToMonday + 6);
      return { start: fmt(monday), end: fmt(sunday) };
    }
    case 'monthly':
      return {
        start: `${y}-${pad(m + 1)}-01`,
        end: fmt(new Date(y, m + 1, 0)), // last day of month
      };
    case 'yearly':
      return {
        start: `${y}-01-01`,
        end: `${y}-12-31`,
      };
    case 'custom':
      return { start: fmt(referenceDate), end: fmt(referenceDate) };
  }
}

// ─── Financial Inbox Candidates ──────────────────────────────────────────────

export type FinancialCandidateSource =
  | 'manual'
  | 'csv'
  | 'gmail'
  | 'bank'
  | 'sms'
  | 'notification'
  | 'import';

export type FinancialCandidateStatus = 'pending' | 'accepted' | 'rejected' | 'ignored';

export interface FinancialCandidate {
  id: string;
  source: FinancialCandidateSource;
  detectedAt: string;
  amount: number;
  currency: string;
  payee: string;
  date: string;
  suggestedCategory?: string;
  suggestedAccount?: string;
  suggestedProject?: string;
  suggestedGoal?: string;
  suggestedLabels?: string[];
  confidence?: number;
  reason?: string;
  sourceReference?: string;
  status: FinancialCandidateStatus;
  duplicateOf?: string; // id of existing transaction or candidate
  transactionId?: string; // created transaction if accepted
  rawPayload?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
