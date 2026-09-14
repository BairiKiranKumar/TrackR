import { AutomationCondition } from '@/types/automation';

export interface ConditionEvaluationResult {
  matches: boolean;
  field: string;
  actualValue: unknown;
  expectedValue: unknown;
  operator: string;
  explanation: string;
}

/**
 * Deterministic condition evaluator for automation rules.
 * Pure logic without external or AI dependencies.
 */
export class AutomationConditionEvaluator {

  /** Extract a field value from an entity using dot notation or common aliases */
  static extractFieldValue(entity: Record<string, unknown>, field: string): unknown {
    if (!entity || typeof entity !== 'object') return undefined;

    // Direct property access
    if (field in entity) {
      return entity[field];
    }

    // Common entity aliases
    if (field === 'usagePercentage' && 'percentage' in entity) {
      return entity['percentage'];
    }
    if (field === 'priority' && entity.metadata && typeof entity.metadata === 'object') {
      return (entity.metadata as Record<string, unknown>).priority;
    }
    if (field === 'status' && entity.metadata && typeof entity.metadata === 'object') {
      return (entity.metadata as Record<string, unknown>).status;
    }
    if (field === 'dueDate' && entity.metadata && typeof entity.metadata === 'object') {
      return (entity.metadata as Record<string, unknown>).dueDate;
    }
    if (field === 'projectId' && entity.metadata && typeof entity.metadata === 'object') {
      return (entity.metadata as Record<string, unknown>).projectId;
    }

    // Nested dot notation: "metadata.priority"
    if (field.includes('.')) {
      const parts = field.split('.');
      let current: unknown = entity;
      for (const p of parts) {
        if (current && typeof current === 'object' && p in current) {
          current = (current as Record<string, unknown>)[p];
        } else {
          return undefined;
        }
      }
      return current;
    }

    return undefined;
  }

  /** Evaluate a single condition against an entity */
  static evaluateCondition(entity: Record<string, unknown>, condition: AutomationCondition): ConditionEvaluationResult {
    const rawVal = this.extractFieldValue(entity, condition.field);
    const op = condition.operator;
    const expected = condition.value;

    let matches = false;
    let explanation = '';

    // Existence checks
    if (op === 'exists') {
      matches = rawVal !== undefined && rawVal !== null && rawVal !== '';
      explanation = matches
        ? `Field '${condition.field}' exists`
        : `Field '${condition.field}' does not exist`;
      return { matches, field: condition.field, actualValue: rawVal, expectedValue: expected, operator: op, explanation };
    }

    if (op === 'not_exists') {
      matches = rawVal === undefined || rawVal === null || rawVal === '';
      explanation = matches
        ? `Field '${condition.field}' does not exist`
        : `Field '${condition.field}' exists with value '${String(rawVal)}'`;
      return { matches, field: condition.field, actualValue: rawVal, expectedValue: expected, operator: op, explanation };
    }

    // String / text checks
    const strActual = rawVal !== undefined && rawVal !== null ? String(rawVal).toLowerCase().trim() : '';
    const strExpected = String(expected).toLowerCase().trim();

    // Numeric checks
    const numActual = typeof rawVal === 'number' ? rawVal : parseFloat(strActual);
    const numExpected = typeof expected === 'number' ? expected : parseFloat(strExpected);
    const isNumeric = !isNaN(numActual) && !isNaN(numExpected);

    switch (op) {
      case 'contains': {
        // Support array of labels/tags
        if (Array.isArray(rawVal)) {
          matches = rawVal.some(item => String(item).toLowerCase().includes(strExpected));
        } else {
          matches = strActual.includes(strExpected);
        }
        explanation = matches
          ? `'${condition.field}' ('${String(rawVal)}') contains '${strExpected}'`
          : `'${condition.field}' does not contain '${strExpected}'`;
        break;
      }
      case 'not_contains': {
        if (Array.isArray(rawVal)) {
          matches = !rawVal.some(item => String(item).toLowerCase().includes(strExpected));
        } else {
          matches = !strActual.includes(strExpected);
        }
        explanation = matches
          ? `'${condition.field}' does not contain '${strExpected}'`
          : `'${condition.field}' contains '${strExpected}'`;
        break;
      }
      case 'equals': {
        if (isNumeric) {
          matches = numActual === numExpected;
        } else {
          matches = strActual === strExpected;
        }
        explanation = matches
          ? `'${condition.field}' equals '${expected}'`
          : `'${condition.field}' ('${String(rawVal)}') does not equal '${expected}'`;
        break;
      }
      case 'not_equals': {
        if (isNumeric) {
          matches = numActual !== numExpected;
        } else {
          matches = strActual !== strExpected;
        }
        explanation = matches
          ? `'${condition.field}' does not equal '${expected}'`
          : `'${condition.field}' equals '${expected}'`;
        break;
      }
      case 'starts_with': {
        matches = strActual.startsWith(strExpected);
        explanation = matches
          ? `'${condition.field}' starts with '${strExpected}'`
          : `'${condition.field}' does not start with '${strExpected}'`;
        break;
      }
      case 'ends_with': {
        matches = strActual.endsWith(strExpected);
        explanation = matches
          ? `'${condition.field}' ends with '${strExpected}'`
          : `'${condition.field}' does not end with '${strExpected}'`;
        break;
      }
      case 'gt': {
        matches = isNumeric && numActual > numExpected;
        explanation = matches
          ? `'${condition.field}' (${numActual}) > ${numExpected}`
          : `'${condition.field}' (${numActual}) is not > ${numExpected}`;
        break;
      }
      case 'gte': {
        matches = isNumeric && numActual >= numExpected;
        explanation = matches
          ? `'${condition.field}' (${numActual}) >= ${numExpected}`
          : `'${condition.field}' (${numActual}) is not >= ${numExpected}`;
        break;
      }
      case 'lt': {
        matches = isNumeric && numActual < numExpected;
        explanation = matches
          ? `'${condition.field}' (${numActual}) < ${numExpected}`
          : `'${condition.field}' (${numActual}) is not < ${numExpected}`;
        break;
      }
      case 'lte': {
        matches = isNumeric && numActual <= numExpected;
        explanation = matches
          ? `'${condition.field}' (${numActual}) <= ${numExpected}`
          : `'${condition.field}' (${numActual}) is not <= ${numExpected}`;
        break;
      }
      default:
        matches = false;
        explanation = `Unsupported condition operator '${op}'`;
    }

    return {
      matches,
      field: condition.field,
      actualValue: rawVal,
      expectedValue: expected,
      operator: op,
      explanation,
    };
  }

  /** Check if all conditions of a rule match an entity (AND logic) */
  static evaluateAllConditions(
    entity: Record<string, unknown>,
    conditions: AutomationCondition[]
  ): { matches: boolean; explanations: string[] } {
    if (!conditions || conditions.length === 0) {
      return { matches: false, explanations: ['Rule has no conditions'] };
    }

    const explanations: string[] = [];
    for (const cond of conditions) {
      const res = this.evaluateCondition(entity, cond);
      explanations.push(res.explanation);
      if (!res.matches) {
        return { matches: false, explanations };
      }
    }

    return { matches: true, explanations };
  }
}
