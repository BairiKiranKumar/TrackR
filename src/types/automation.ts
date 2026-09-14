export type AutomationTrigger =
  | 'transaction_created'
  | 'transaction_updated'
  | 'planned_payment_due'
  | 'budget_threshold_reached'
  | 'task_due'
  | 'task_overdue'
  | 'goal_threshold_reached'
  | 'tracker_entry_created';

export type ConditionOperator =
  | 'contains'
  | 'not_contains'
  | 'equals'
  | 'not_equals'
  | 'starts_with'
  | 'ends_with'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'exists'
  | 'not_exists';

export interface AutomationCondition {
  field: string;          // e.g. 'payee', 'amount', 'accountId', 'categoryId', 'priority', 'status', 'usagePercentage', etc.
  operator: ConditionOperator;
  value: string | number | boolean;
}

export type ActionType =
  | 'assign_category'
  | 'add_label'
  | 'assign_project'
  | 'assign_goal'
  | 'add_note'
  | 'set_task_priority'
  | 'set_task_status'
  | 'generate_attention';

export interface AutomationAction {
  type: ActionType;
  value: string | number | boolean | string[];
}

export interface AutomationRule {
  id: string;
  name: string;
  description?: string;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  priority: number;        // Higher number = higher priority
  enabled: boolean;
  executionCount: number;
  lastExecutedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type AutomationExecutionStatus = 'success' | 'failure' | 'skipped';

export interface AutomationExecution {
  id: string;
  ruleId: string;
  ruleName: string;
  targetEntityId: string;
  targetEntityType: 'transaction' | 'task' | 'budget' | 'planned_payment' | 'goal' | 'candidate';
  trigger: AutomationTrigger;
  executedAt: string;
  status: AutomationExecutionStatus;
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };
  explanation: string;
  error?: string;
}

export interface RuleSimulationResult {
  matched?: boolean;
  matchedRules: {
    ruleId: string;
    ruleName: string;
    priority: number;
    actions: AutomationAction[];
  }[];
  wouldApplyActions: AutomationAction[];
  preview: Record<string, unknown>;
  explanation: string[];
}

export type { FinancialCandidate } from './finance';
export type RuleConditionField = string;
export type RuleConditionOperator = ConditionOperator;
export type RuleActionType = ActionType;
