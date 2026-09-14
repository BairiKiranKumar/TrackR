import { AutomationRule, AutomationAction, RuleSimulationResult } from '@/types/automation';
import { AutomationConditionEvaluator } from './AutomationConditionEvaluator';

/**
 * AutomationRuleSimulator:
 * Runs dry-run simulations against rules without database mutations.
 * Supports "Test rule" user preview.
 */
export class AutomationRuleSimulator {

  /**
   * Apply an action to an entity clone in memory.
   * Pure memory operation.
   */
  static applyActionToPreview(
    entity: Record<string, unknown>,
    action: AutomationAction
  ): Record<string, unknown> {
    const updated = { ...entity };

    switch (action.type) {
      case 'assign_category':
        updated.categoryId = String(action.value);
        break;

      case 'add_label': {
        const currentLabels = Array.isArray(updated.labels) ? [...updated.labels] : [];
        const toAdd = Array.isArray(action.value)
          ? action.value.map(String)
          : [String(action.value)];
        updated.labels = Array.from(new Set([...currentLabels, ...toAdd]));
        break;
      }

      case 'assign_project':
        updated.projectId = String(action.value);
        if (updated.metadata && typeof updated.metadata === 'object') {
          updated.metadata = { ...(updated.metadata as Record<string, unknown>), projectId: String(action.value) };
        }
        break;

      case 'assign_goal':
        updated.goalId = String(action.value);
        if (updated.metadata && typeof updated.metadata === 'object') {
          updated.metadata = { ...(updated.metadata as Record<string, unknown>), goalId: String(action.value) };
        }
        break;

      case 'add_note':
        updated.note = updated.note ? `${updated.note}; ${String(action.value)}` : String(action.value);
        break;

      case 'set_task_priority':
        if (updated.metadata && typeof updated.metadata === 'object') {
          updated.metadata = { ...(updated.metadata as Record<string, unknown>), priority: String(action.value) };
        }
        updated.priority = String(action.value);
        break;

      case 'set_task_status':
        if (updated.metadata && typeof updated.metadata === 'object') {
          updated.metadata = { ...(updated.metadata as Record<string, unknown>), status: String(action.value) };
        }
        updated.status = String(action.value);
        break;

      case 'generate_attention':
        // Simulation preview for attention event
        updated._simulatedAttention = String(action.value);
        break;
    }

    return updated;
  }

  /**
   * Simulate a list of rules on a candidate or entity.
   * Sorts rules by priority DESC, createdAt ASC.
   * Higher priority rules win if action targets conflict.
   */
  static simulate(
    rules: AutomationRule[],
    entity: Record<string, unknown>
  ): RuleSimulationResult {
    // Deterministic priority ordering: highest priority first
    const sortedRules = [...rules]
      .filter(r => r.enabled)
      .sort((a, b) => b.priority - a.priority || a.createdAt.localeCompare(b.createdAt));

    const matchedRules: RuleSimulationResult['matchedRules'] = [];
    const allActions: AutomationAction[] = [];
    const explanations: string[] = [];
    let preview = { ...entity };

    // Set of applied action types to ensure higher priority rule wins on conflict
    const appliedActionTypes = new Set<string>();

    for (const rule of sortedRules) {
      const evalRes = AutomationConditionEvaluator.evaluateAllConditions(preview, rule.conditions);
      if (evalRes.matches) {
        matchedRules.push({
          ruleId: rule.id,
          ruleName: rule.name,
          priority: rule.priority,
          actions: rule.actions,
        });

        explanations.push(`Matched '${rule.name}': ${evalRes.explanations.join(' AND ')}`);

        for (const action of rule.actions) {
          // If a conflicting action type was already applied by a higher-priority rule, skip
          if (['assign_category', 'assign_project', 'assign_goal', 'set_task_priority', 'set_task_status'].includes(action.type)) {
            if (appliedActionTypes.has(action.type)) {
              explanations.push(`Action '${action.type}' superseded by higher priority rule`);
              continue;
            }
          }

          appliedActionTypes.add(action.type);
          allActions.push(action);
          preview = this.applyActionToPreview(preview, action);
        }
      }
    }

    return {
      matchedRules,
      wouldApplyActions: allActions,
      preview,
      explanation: explanations,
    };
  }
}
