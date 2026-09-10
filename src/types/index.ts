// ─── Item Types ────────────────────────────────────────────────────────────

export type ItemType =
  | 'note'
  | 'task'
  | 'tracker'
  | 'tracker_day'
  | 'habit'
  | 'goal'
  | 'project'
  | 'expense'
  | 'income'
  | 'budget'
  | 'journal';

export type TrackerType = 'series' | 'streak' | 'goal';

export type TaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled';

export type TransactionCategory =
  | 'food'
  | 'transport'
  | 'bills'
  | 'shopping'
  | 'entertainment'
  | 'subscriptions'
  | 'health'
  | 'education'
  | 'work'
  | 'gaming'
  | 'content_creation'
  | 'other';

export type IncomeCategory =
  | 'salary'
  | 'youtube'
  | 'freelance'
  | 'business'
  | 'investment'
  | 'other';

// ─── Metadata by type ──────────────────────────────────────────────────────

export interface NoteMetadata {
  pinned?: boolean;
  wordCount?: number;
  [key: string]: unknown;
}

export interface TaskMetadata {
  status: TaskStatus;
  dueDate?: string;
  priority?: 'low' | 'medium' | 'high';
  completedAt?: string;
  [key: string]: unknown;
}

export interface TrackerMetadata {
  trackerType: TrackerType;
  totalDays?: number;       // for series
  completedDays?: number[]; // indices completed (0-based) for series
  completedDates?: string[]; // ISO dates for streaks
  currentStreak?: number;
  longestStreak?: number;
  unit?: string;            // for goal: 'hours', '₹', 'km', etc.
  target?: number;          // for goal
  current?: number;         // for goal
  emoji?: string;
  color?: string;           // accent color hex
  startDate?: string;       // ISO date
  [key: string]: unknown;
}

export interface TrackerDayMetadata {
  trackerId: string;
  dayIndex?: number;        // 0-based for series
  date?: string;            // ISO date for streaks
  timeSpent?: number;       // minutes
  value?: number;           // numeric value if applicable
  completedAt?: string;
  [key: string]: unknown;
}

export interface TransactionMetadata {
  amount: number;
  currency: string;         // 'INR'
  category: TransactionCategory | IncomeCategory;
  account?: string;
  date: string;             // ISO date
  isIncome: boolean;
  [key: string]: unknown;
}

export interface BudgetMetadata {
  limit: number;
  currency: string;
  period: 'monthly' | 'weekly' | 'custom';
  category?: TransactionCategory;
  startDate: string;
  endDate?: string;
  [key: string]: unknown;
}

/** Consecutive local calendar days on which the signed-in user opened TRACKR. */
export interface DailyStreakState {
  openedDates: string[];
  currentStreak: number;
  longestStreak: number;
  lastOpenedDate: string;
  endedStreak?: number;
  endedOn?: string;
  milestoneReached?: 7 | 30 | 100;
  milestoneReachedOn?: string;
}

export interface GoalMetadata {
  targetAmount: number;
  currentAmount: number;
  currency: string;
  deadline?: string;
  isFinancial: boolean;
  [key: string]: unknown;
}

export interface ProjectMetadata {
  emoji?: string;
  color?: string;
  status?: 'active' | 'completed' | 'paused';
  [key: string]: unknown;
}

export type ItemMetadata =
  | NoteMetadata
  | TaskMetadata
  | TrackerMetadata
  | TrackerDayMetadata
  | TransactionMetadata
  | BudgetMetadata
  | GoalMetadata
  | ProjectMetadata
  | Record<string, unknown>;

// ─── Core Item ─────────────────────────────────────────────────────────────

export interface Item {
  id: string;
  type: ItemType;
  title: string;
  content?: string;         // rich text content (markdown-ish / plain)
  tags: string[];
  archived: boolean;
  pinned?: boolean;
  createdAt: string;        // ISO
  updatedAt: string;        // ISO
  metadata: ItemMetadata;
}

// ─── Relations ─────────────────────────────────────────────────────────────

export type RelationType = 'references' | 'contains' | 'linked';

export interface ItemRelation {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: RelationType;
  createdAt: string;
}

// ─── Activity ──────────────────────────────────────────────────────────────

export type ActivityEventType =
  | 'item_created'
  | 'item_updated'
  | 'task_completed'
  | 'tracker_day_completed'
  | 'expense_added'
  | 'income_added'
  | 'note_saved';

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  itemId: string;
  itemTitle: string;
  itemType: ItemType;
  description?: string;
  amount?: number;
  createdAt: string;
}

// ─── Search ────────────────────────────────────────────────────────────────

export interface SearchResult {
  item: Item;
  relevance: number;
  matchedField?: string;
  snippet?: string;
}

export interface GroupedSearchResults {
  trackers: SearchResult[];
  notes: SearchResult[];
  tasks: SearchResult[];
  money: SearchResult[];
  projects: SearchResult[];
  journals: SearchResult[];
  goals: SearchResult[];
  other: SearchResult[];
}

// ─── Reference parsing ─────────────────────────────────────────────────────

export interface MentionMatch {
  id: string;
  title: string;
  type: ItemType;
  startIndex: number;
  endIndex: number;
}

export interface MoneyDetection {
  amount: number;
  rawText: string;
  startIndex: number;
  endIndex: number;
}

// ─── UI state ──────────────────────────────────────────────────────────────

export interface QuickAddState {
  isOpen: boolean;
  defaultType?: ItemType;
}

export interface InAppNotification {
  id: string;
  kind: 'overdue_task' | 'streak_milestone' | 'budget_alert';
  title: string;
  description: string;
  href?: string;
}

export interface WeeklyDigestSummary {
  weekEnding: string;
  tasksCompleted: number;
  notesWritten: number;
  streakDays: number;
  income: number;
  expenses: number;
  topReferencedItem?: { title: string; references: number };
}

export type Theme = 'dark' | 'light';

// ─── Supabase sync ─────────────────────────────────────────────────────────

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export interface SyncStatus {
  connected: boolean;
  lastSyncedAt?: string;
  error?: string;
}

// ─── Helper / derived types ────────────────────────────────────────────────

export type TrackerItem = Item & { metadata: TrackerMetadata };
export type TaskItem = Item & { metadata: TaskMetadata };
export type NoteItem = Item & { metadata: NoteMetadata };
export type TransactionItem = Item & { metadata: TransactionMetadata };
export type BudgetItem = Item & { metadata: BudgetMetadata };
export type ProjectItem = Item & { metadata: ProjectMetadata };
export type GoalItem = Item & { metadata: GoalMetadata };

export interface BudgetProgress {
  budget: BudgetItem;
  spent: number;
  percentage: number;
  isAlert: boolean;
}

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  note: 'Note',
  task: 'Task',
  tracker: 'Tracker',
  tracker_day: 'Tracker Day',
  habit: 'Habit',
  goal: 'Goal',
  project: 'Project',
  expense: 'Expense',
  income: 'Income',
  budget: 'Budget',
  journal: 'Journal',
};

export const ITEM_TYPE_EMOJIS: Record<ItemType, string> = {
  note: '📝',
  task: '✅',
  tracker: '🎯',
  tracker_day: '📆',
  habit: '🔥',
  goal: '⭐',
  project: '📁',
  expense: '💸',
  income: '💵',
  budget: '📊',
  journal: '📖',
};

export const EXPENSE_CATEGORIES: { value: TransactionCategory; label: string; emoji: string }[] = [
  { value: 'food', label: 'Food', emoji: '🍔' },
  { value: 'transport', label: 'Transport', emoji: '🚗' },
  { value: 'bills', label: 'Bills', emoji: '📄' },
  { value: 'shopping', label: 'Shopping', emoji: '🛒' },
  { value: 'entertainment', label: 'Entertainment', emoji: '🎬' },
  { value: 'subscriptions', label: 'Subscriptions', emoji: '📱' },
  { value: 'health', label: 'Health', emoji: '💊' },
  { value: 'education', label: 'Education', emoji: '📚' },
  { value: 'work', label: 'Work', emoji: '💼' },
  { value: 'gaming', label: 'Gaming', emoji: '🎮' },
  { value: 'content_creation', label: 'Content', emoji: '🎥' },
  { value: 'other', label: 'Other', emoji: '💫' },
];

export const INCOME_CATEGORIES: { value: IncomeCategory; label: string; emoji: string }[] = [
  { value: 'salary', label: 'Salary', emoji: '💰' },
  { value: 'youtube', label: 'YouTube', emoji: '▶️' },
  { value: 'freelance', label: 'Freelance', emoji: '💻' },
  { value: 'business', label: 'Business', emoji: '🏢' },
  { value: 'investment', label: 'Investment', emoji: '📈' },
  { value: 'other', label: 'Other', emoji: '💫' },
];
