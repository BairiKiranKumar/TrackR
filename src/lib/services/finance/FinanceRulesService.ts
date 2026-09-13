import {
  FinanceRule, FinanceTransaction, RuleCondition, RuleAction,
} from '@/types/finance';
import { getAllRules, getRuleById, saveRule, deleteRule, genFinanceId } from '@/lib/db/localDb';

// ─── Finance Rules Service ─────────────────────────────────────────────────
// Deterministic, AI-free rule engine. Rules are applied in priority order.
// Each rule execution is logged on the transaction — prevents re-application.

export class FinanceRulesService {

  async getAllRules(): Promise<FinanceRule[]> {
    const rules = await getAllRules();
    return rules.filter(r => !r.enabled === false); // return all, sorted by priority
  }

  async getEnabledRules(): Promise<FinanceRule[]> {
    const rules = await getAllRules();
    return rules.filter(r => r.enabled);
  }

  async getRuleById(id: string): Promise<FinanceRule | undefined> {
    return getRuleById(id);
  }

  async createRule(partial: {
    name: string;
    conditions: RuleCondition[];
    actions: RuleAction[];
    priority?: number;
    applyToExisting?: boolean;
  }): Promise<FinanceRule> {
    const existing = await getAllRules();
    const maxPriority = existing.reduce((max, r) => Math.max(max, r.priority), 0);
    const now = new Date().toISOString();
    const rule: FinanceRule = {
      id: genFinanceId(),
      name: partial.name,
      conditions: partial.conditions,
      actions: partial.actions,
      priority: partial.priority ?? maxPriority + 10,
      enabled: true,
      applyToExisting: partial.applyToExisting ?? false,
      executionCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    await saveRule(rule);
    return rule;
  }

  async updateRule(id: string, updates: Partial<Omit<FinanceRule, 'id' | 'createdAt'>>): Promise<FinanceRule | null> {
    const existing = await getRuleById(id);
    if (!existing) return null;
    const updated: FinanceRule = {
      ...existing,
      ...updates,
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await saveRule(updated);
    return updated;
  }

  async deleteRule(id: string): Promise<void> {
    await deleteRule(id);
  }

  async reorderRules(ids: string[]): Promise<void> {
    for (let i = 0; i < ids.length; i++) {
      const rule = await getRuleById(ids[i]);
      if (rule) {
        await saveRule({ ...rule, priority: (i + 1) * 10, updatedAt: new Date().toISOString() });
      }
    }
  }

  /** Evaluate a single condition against a transaction */
  matchesCondition(transaction: FinanceTransaction, condition: RuleCondition): boolean {
    let fieldValue = '';
    switch (condition.field) {
      case 'payee': fieldValue = transaction.payee ?? ''; break;
      case 'note': fieldValue = transaction.note ?? ''; break;
      case 'amount': fieldValue = String(transaction.amount); break;
      case 'account': fieldValue = transaction.accountId; break;
      case 'type': fieldValue = transaction.type; break;
      case 'category': fieldValue = transaction.categoryId ?? ''; break;
      case 'label': fieldValue = transaction.labels.join(','); break;
    }

    const val = condition.value.toLowerCase();
    const fv = fieldValue.toLowerCase();

    switch (condition.operator) {
      case 'contains': return fv.includes(val);
      case 'not_contains': return !fv.includes(val);
      case 'equals': return fv === val;
      case 'not_equals': return fv !== val;
      case 'starts_with': return fv.startsWith(val);
      case 'ends_with': return fv.endsWith(val);
      case 'gte': return parseFloat(fieldValue) >= parseFloat(condition.value);
      case 'lte': return parseFloat(fieldValue) <= parseFloat(condition.value);
    }
    return false;
  }

  /** Check if all conditions of a rule match (AND logic) */
  ruleMatches(transaction: FinanceTransaction, rule: FinanceRule): boolean {
    if (!rule.enabled) return false;
    if (rule.conditions.length === 0) return false;
    return rule.conditions.every(c => this.matchesCondition(transaction, c));
  }

  /** Apply a single action to a transaction */
  applyAction(transaction: FinanceTransaction, action: RuleAction): FinanceTransaction {
    const t = { ...transaction };
    switch (action.type) {
      case 'set_category':
        t.categoryId = action.value as string;
        break;
      case 'add_labels': {
        const newLabels = Array.isArray(action.value) ? action.value : [action.value];
        t.labels = Array.from(new Set([...t.labels, ...newLabels]));
        break;
      }
      case 'set_project':
        t.projectId = action.value as string;
        break;
      case 'append_note':
        t.note = t.note ? `${t.note}; ${action.value}` : (action.value as string);
        break;
      case 'set_payee':
        t.payee = action.value as string;
        break;
    }
    return t;
  }

  /**
   * Apply all matching enabled rules to a transaction.
   * Idempotent: if a rule has already been applied (tracked in ruleExecutions), skip it.
   * Returns a new transaction object with rule changes applied.
   */
  async applyRulesToTransaction(transaction: FinanceTransaction): Promise<FinanceTransaction> {
    const rules = await this.getEnabledRules();
    let result = { ...transaction };
    const alreadyApplied = new Set(transaction.ruleExecutions.map(e => e.ruleId));

    for (const rule of rules) {
      if (alreadyApplied.has(rule.id)) continue; // idempotent
      if (!this.ruleMatches(result, rule)) continue;

      const before = { categoryId: result.categoryId, labels: [...result.labels], projectId: result.projectId, note: result.note, payee: result.payee };

      for (const action of rule.actions) {
        result = this.applyAction(result, action);
      }

      const after = { categoryId: result.categoryId, labels: [...result.labels], projectId: result.projectId, note: result.note, payee: result.payee };

      result.ruleExecutions = [
        ...result.ruleExecutions,
        {
          ruleId: rule.id,
          ruleName: rule.name,
          appliedAt: new Date().toISOString(),
          changes: { before, after },
        },
      ];

      // Update rule execution stats
      await saveRule({
        ...rule,
        executionCount: rule.executionCount + 1,
        lastExecutedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    return result;
  }

  /** Dry-run: preview what a rule would do to a transaction without saving */
  previewRule(rule: FinanceRule, transaction: FinanceTransaction): {
    matches: boolean;
    preview: FinanceTransaction;
    changes: Record<string, unknown>;
  } {
    const matches = this.ruleMatches(transaction, rule);
    if (!matches) return { matches: false, preview: transaction, changes: {} };

    let preview = { ...transaction };
    for (const action of rule.actions) {
      preview = this.applyAction(preview, action);
    }

    return {
      matches: true,
      preview,
      changes: {
        categoryId: preview.categoryId !== transaction.categoryId ? { from: transaction.categoryId, to: preview.categoryId } : undefined,
        labels: JSON.stringify(preview.labels) !== JSON.stringify(transaction.labels) ? { from: transaction.labels, to: preview.labels } : undefined,
        projectId: preview.projectId !== transaction.projectId ? { from: transaction.projectId, to: preview.projectId } : undefined,
        note: preview.note !== transaction.note ? { from: transaction.note, to: preview.note } : undefined,
        payee: preview.payee !== transaction.payee ? { from: transaction.payee, to: preview.payee } : undefined,
      },
    };
  }
}

export const financeRulesService = new FinanceRulesService();
