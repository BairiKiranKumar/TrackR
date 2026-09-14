import {
  AutomationRule,
  AutomationTrigger,
  AutomationExecution,
  AutomationAction,
  RuleSimulationResult,
} from '@/types/automation';
import {
  getAllAutomationRules,
  getAutomationRuleById,
  saveAutomationRule,
  deleteAutomationRule,
  saveAutomationExecution,
  getExecutionsForEntity,
  getAllAutomationExecutions,
  genFinanceId,
} from '@/lib/db/localDb';
import { AutomationConditionEvaluator } from './AutomationConditionEvaluator';
import { AutomationRuleSimulator } from './AutomationRuleSimulator';
import { syncQueueService } from '../SyncQueueService';

export interface AutomationExecutionResult<T = Record<string, unknown>> {
  entity: T;
  appliedRules: {
    ruleId: string;
    ruleName: string;
    actions: AutomationAction[];
  }[];
  executions: AutomationExecution[];
  explanations: string[];
}

export class AutomationEngine {

  // ─── Rule Management CRUD ─────────────────────────────────────────────────

  async getAllRules(): Promise<AutomationRule[]> {
    return getAllAutomationRules();
  }

  async getRuleById(id: string): Promise<AutomationRule | undefined> {
    return getAutomationRuleById(id);
  }

  async getRulesByTrigger(trigger: AutomationTrigger): Promise<AutomationRule[]> {
    const all = await this.getAllRules();
    return all.filter(r => r.trigger === trigger && r.enabled);
  }

  async createRule(partial: {
    name: string;
    description?: string;
    trigger: AutomationTrigger;
    conditions: AutomationRule['conditions'];
    actions: AutomationRule['actions'];
    priority?: number;
    enabled?: boolean;
  }): Promise<AutomationRule> {
    const existing = await this.getAllRules();
    const maxPriority = existing.reduce((max, r) => Math.max(max, r.priority), 0);
    const now = new Date().toISOString();

    const rule: AutomationRule = {
      id: genFinanceId(),
      name: partial.name,
      description: partial.description,
      trigger: partial.trigger,
      conditions: partial.conditions,
      actions: partial.actions,
      priority: partial.priority ?? maxPriority + 10,
      enabled: partial.enabled ?? true,
      executionCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    await saveAutomationRule(rule);
    await syncQueueService.enqueue('fa_automation', rule.id, 'upsert', rule);
    return rule;
  }

  async updateRule(id: string, updates: Partial<Omit<AutomationRule, 'id' | 'createdAt'>>): Promise<AutomationRule | null> {
    const existing = await getAutomationRuleById(id);
    if (!existing) return null;

    const updated: AutomationRule = {
      ...existing,
      ...updates,
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    await saveAutomationRule(updated);
    await syncQueueService.enqueue('fa_automation', updated.id, 'upsert', updated);
    return updated;
  }

  async deleteRule(id: string): Promise<void> {
    await deleteAutomationRule(id);
    await syncQueueService.enqueue('fa_automation', id, 'delete');
  }

  async reorderRules(ids: string[]): Promise<void> {
    for (let i = 0; i < ids.length; i++) {
      const rule = await getAutomationRuleById(ids[i]);
      if (rule) {
        await saveAutomationRule({
          ...rule,
          priority: (ids.length - i) * 10,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }

  // ─── Simulation Sandbox ("Test Rule") ─────────────────────────────────────

  async simulate(
    entity: Record<string, unknown>,
    trigger?: AutomationTrigger
  ): Promise<RuleSimulationResult> {
    let rules = await this.getAllRules();
    if (trigger) {
      rules = rules.filter(r => r.trigger === trigger);
    }
    return AutomationRuleSimulator.simulate(rules, entity);
  }

  // ─── Deterministic Execution Engine ───────────────────────────────────────

  /**
   * Evaluate and execute all matching rules on an entity.
   * - Sorted strictly by priority DESC, createdAt ASC.
   * - Idempotent: checks previous execution history for entity to prevent re-execution loops.
   * - Safe: strictly non-destructive (no deletes, no automated bank withdrawals).
   * - Logs execution records with before/after diffs and human-readable explanation.
   */
  async evaluateAndExecute<T extends Record<string, unknown>>(
    trigger: AutomationTrigger,
    entity: T,
    entityType: AutomationExecution['targetEntityType']
  ): Promise<AutomationExecutionResult<T>> {
    const entityId = String(entity.id || '');
    const rules = await this.getRulesByTrigger(trigger);

    // Sort deterministically: highest priority first
    const sortedRules = rules.sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt));

    let modified = { ...entity } as T;
    const appliedRules: AutomationExecutionResult['appliedRules'] = [];
    const executions: AutomationExecution[] = [];
    const explanations: string[] = [];

    // Prior executions for idempotency check
    const priorExecutions = entityId ? await getExecutionsForEntity(entityId) : [];
    const alreadyAppliedRuleIds = new Set(
      priorExecutions
        .filter(e => e.status === 'success')
        .map(e => e.ruleId)
    );

    // Track conflict resolution: higher priority rule wins
    const appliedActionTypes = new Set<string>();

    for (const rule of sortedRules) {
      // Idempotency: skip if already applied to this specific entity instance
      if (entityId && alreadyAppliedRuleIds.has(rule.id)) {
        continue;
      }

      const matchRes = AutomationConditionEvaluator.evaluateAllConditions(modified, rule.conditions);
      if (!matchRes.matches) {
        continue;
      }

      const beforeSnapshot = { ...modified };
      const ruleActionsToApply: AutomationAction[] = [];
      const ruleExplanation = `Matched '${rule.name}': ${matchRes.explanations.join(' AND ')}`;

      for (const action of rule.actions) {
        // Resolve action conflicts: higher priority wins
        if (['assign_category', 'assign_project', 'assign_goal', 'set_task_priority', 'set_task_status'].includes(action.type)) {
          if (appliedActionTypes.has(action.type)) {
            continue;
          }
        }

        appliedActionTypes.add(action.type);
        ruleActionsToApply.push(action);
        modified = AutomationRuleSimulator.applyActionToPreview(modified, action) as T;
      }

      if (ruleActionsToApply.length > 0) {
        appliedRules.push({
          ruleId: rule.id,
          ruleName: rule.name,
          actions: ruleActionsToApply,
        });

        explanations.push(ruleExplanation);

        // Record execution history
        const execution: AutomationExecution = {
          id: genFinanceId(),
          ruleId: rule.id,
          ruleName: rule.name,
          targetEntityId: entityId,
          targetEntityType: entityType,
          trigger,
          executedAt: new Date().toISOString(),
          status: 'success',
          changes: {
            before: beforeSnapshot,
            after: { ...modified },
          },
          explanation: ruleExplanation,
        };

        await saveAutomationExecution(execution);
        await syncQueueService.enqueue('fa_automation_history', execution.id, 'upsert', execution);
        executions.push(execution);

        // Update rule execution count
        await saveAutomationRule({
          ...rule,
          executionCount: rule.executionCount + 1,
          lastExecutedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    }

    return {
      entity: modified,
      appliedRules,
      executions,
      explanations,
    };
  }

  simulateRule(rule: AutomationRule, target: Record<string, unknown>): RuleSimulationResult {
    const res = AutomationRuleSimulator.simulate([rule], target);
    return {
      ...res,
      matched: res.matchedRules.length > 0,
    };
  }

  // ─── Execution History Inspection ─────────────────────────────────────────

  async getExecutionHistory(entityId: string): Promise<AutomationExecution[]> {
    return getExecutionsForEntity(entityId);
  }

  async getRecentExecutions(limit = 50): Promise<AutomationExecution[]> {
    return getAllAutomationExecutions(limit);
  }
}

export const automationEngine = new AutomationEngine();
