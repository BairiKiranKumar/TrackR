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

export type TrackerType = 'series' | 'streak' | 'goal' | 'numeric' | 'boolean' | 'duration';

export type TaskStatus = 'inbox' | 'todo' | 'in_progress' | 'waiting' | 'done' | 'archived' | 'cancelled';

export type TaskPriority = 'none' | 'low' | 'medium' | 'high' | 'urgent';

export interface TaskRecurrence {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
  interval?: number;
  daysOfWeek?: number[];
}

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
  inbox?: boolean;
  processed?: boolean;
  projectId?: string;
  [key: string]: unknown;
}

export interface TaskMetadata {
  status: TaskStatus;
  priority?: TaskPriority;
  startDate?: string;
  dueDate?: string;
  recurrence?: TaskRecurrence;
  completedAt?: string;
  inbox?: boolean;
  processed?: boolean;
  projectId?: string;
  goalId?: string;
  labels?: string[];
  [key: string]: unknown;
}

export interface JournalMetadata {
  mood?: 'great' | 'good' | 'okay' | 'down' | 'stressed';
  date?: string;
  weather?: string;
  location?: string;
  inbox?: boolean;
  processed?: boolean;
  projectId?: string;
  [key: string]: unknown;
}

export interface InboxMetadata {
  inbox?: boolean;
  processed?: boolean;
  capturedVia?: 'quick_add' | 'shortcut' | 'manual';
  originalInput?: string;
  projectId?: string;
  [key: string]: unknown;
}

export interface TrackerMetadata {
  trackerType: TrackerType;
  totalDays?: number;       // for series
  completedDays?: number[]; // indices completed (0-based) for series
  completedDates?: string[]; // ISO dates for streaks
  currentStreak?: number;
  longestStreak?: number;
  unit?: string;            // 'hours', '₹', 'km', 'kg', 'min', 'pages', etc.
  target?: number;          // for goal / numeric / duration
  current?: number;         // current/latest numeric value
  frequency?: 'daily' | 'weekly' | 'custom';
  emoji?: string;
  color?: string;           // accent color hex
  startDate?: string;       // ISO date
  projectId?: string;
  goalId?: string;
  entries?: TrackerDayMetadata[];
  [key: string]: unknown;
}

export interface TrackerDayMetadata {
  trackerId: string;
  dayIndex?: number;        // 0-based for series
  date?: string;            // ISO date for streaks
  timeSpent?: number;       // minutes
  value?: number;           // numeric value if applicable
  note?: string;
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
  inbox?: boolean;
  processed?: boolean;
  projectId?: string;
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
  projectId?: string;
  [key: string]: unknown;
}

export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'archived' | 'paused';

export interface ProjectMetadata {
  emoji?: string;
  color?: string;
  status?: ProjectStatus;
  targetDate?: string;
  startDate?: string;
  description?: string;
  [key: string]: unknown;
}

export type ItemMetadata =
  | NoteMetadata
  | TaskMetadata
  | JournalMetadata
  | InboxMetadata
  | TrackerMetadata
  | TrackerDayMetadata
  | TransactionMetadata
  | BudgetMetadata
  | GoalMetadata
  | ProjectMetadata
  | Record<string, unknown>;

// ─── Sync Queue ────────────────────────────────────────────────────────────

export type SyncOperationType =
  | 'create'
  | 'update'
  | 'delete'
  | 'upsert'
  | 'archive'
  | 'clear'
  | 'relation_create'
  | 'relation_delete'
  | 'clear_all';

export type SyncStatus = 'idle' | 'pending' | 'syncing' | 'failed' | 'synced' | 'offline' | 'needs_attention';

export interface SyncOperation {
  id: string;
  entityType: 'item' | 'item_relation' | 'database';
  entityId: string;
  operation: SyncOperationType;
  payload?: unknown;
  createdAt: string;
  retryCount: number;
  lastAttemptAt?: string;
  lastError?: string;
  status: SyncStatus;
}

// ─── Observability & Conflict Resolution ───────────────────────────────────

export type DiagnosticCategory =
  | 'sync_failure'
  | 'auth_failure'
  | 'storage_failure'
  | 'import_failure'
  | 'export_failure'
  | 'integration_failure'
  | 'conflict_detected';

export interface DiagnosticEvent {
  id: string;
  category: DiagnosticCategory;
  message: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface ConflictResolution {
  itemId: string;
  localVersion?: number;
  remoteVersion?: number;
  localUpdatedAt: string;
  remoteUpdatedAt: string;
  strategy: 'remote_applied' | 'local_retained' | 'merged';
  backupCreated: boolean;
  timestamp: string;
}

// ─── Capability & Extension Interfaces ─────────────────────────────────────

export interface CaptureResult {
  title: string;
  type: ItemType;
  content?: string;
  projectId?: string;
  tags: string[];
  inbox: boolean;
  metadata?: Record<string, unknown>;
}

export interface CaptureProcessor {
  process(rawInput: string, allProjects?: Item[]): Promise<CaptureResult>;
}

export interface MoneyDetectionResult {
  amount: number;
  currency: string;
  rawText: string;
  startIndex?: number;
  endIndex?: number;
}

export interface MoneyDetector {
  detect(text: string): MoneyDetectionResult[];
}

export interface AIProvider {
  classifyCapture(input: string): Promise<{ type: ItemType; tags: string[] }>;
  suggestRelations(item: Item, existingItems: Item[]): Promise<{ targetId: string; reason: string }[]>;
  summarize(items: Item[]): Promise<string>;
  semanticSearch(query: string, items: Item[]): Promise<Item[]>;
}

// ─── Project Context Aggregation ───────────────────────────────────────────

export interface ProjectContextSummary {
  project: Item;
  tasks: Item[];
  openTasksCount: number;
  completedTasksCount: number;
  progressPercentage: number | null; // null when 0 tasks ("No tasks yet")
  nextActions: Item[];              // uncompleted tasks not blocked by any incomplete dependencies
  notes: Item[];
  trackers: Item[];
  expenses: Item[];
  totalExpenses: number;
  goals: Item[];
  linkedItems: Item[];
  recentActivity: ActivityEvent[];
  relations: ItemRelation[];
}

// ─── Core Item ─────────────────────────────────────────────────────────────

export interface Item {
  id: string;
  type: ItemType;
  title: string;
  content?: string;         // rich text content (markdown-ish / plain)
  tags: string[];
  archived: boolean;
  pinned?: boolean;
  version?: number;         // monotonic version counter for deterministic conflict resolution
  createdAt: string;        // ISO
  updatedAt: string;        // ISO
  metadata: ItemMetadata;
}

// ─── Relations ─────────────────────────────────────────────────────────────

export type RelationType =
  | 'references'
  | 'contains'
  | 'linked'
  | 'parent'
  | 'child'
  | 'depends_on'
  | 'blocks'
  | 'belongs_to'
  | 'related_to';

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

export interface SupabaseSyncState {
  connected: boolean;
  lastSyncedAt?: string;
  error?: string;
}

// ─── Storage mode ──────────────────────────────────────────────────────────
// Where a signed-in user's data syncs to. New users default to 'trackr_cloud'
// automatically — no setup step. 'custom_supabase' (BYODB) is an advanced,
// explicitly-opted-into setting managed from Settings → Data & Storage.

export type StorageMode = 'trackr_cloud' | 'custom_supabase';

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
