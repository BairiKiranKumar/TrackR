/**
 * Phase 5 — Deterministic Automation Engine Test Suite
 *
 * Tests:
 * 1. Rule creation, priority ordering, enable/disable
 * 2. Deterministic conditions (operators, existence, numeric)
 * 3. Priority resolution and action conflict handling
 * 4. "Test rule" simulation sandbox (no mutations)
 * 5. Execution and idempotency (duplicate delivery safety)
 * 6. Execution history and inspection ("Why was this transaction categorized?")
 */

import 'fake-indexeddb/auto';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Navigator mock for Node
const nav = globalThis.navigator as unknown as { onLine: boolean };
if (typeof nav === 'object' && nav !== null) {
  Object.defineProperty(nav, 'onLine', { value: true, writable: true, configurable: true });
} else {
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, writable: true, configurable: true });
}

import { clearAllData } from '@/lib/db/localDb';
import { automationEngine } from '@/lib/services/automation/AutomationEngine';
import { AutomationConditionEvaluator } from '@/lib/services/automation/AutomationConditionEvaluator';
import { STARTER_AUTOMATION_TEMPLATES, createRuleFromTemplate } from '@/lib/services/automation/AutomationTemplates';

describe('Phase 5 — Generic Deterministic Automation Engine', () => {

  beforeEach(async () => {
    await clearAllData();
  });

  describe('1. Deterministic Condition Evaluation', () => {
    it('evaluates string conditions (contains, equals, starts_with, ends_with)', () => {
      const entity = { payee: 'Swiggy Bangalore Order #123' };

      const c1 = AutomationConditionEvaluator.evaluateCondition(entity, {
        field: 'payee',
        operator: 'contains',
        value: 'swiggy',
      });
      assert.equal(c1.matches, true);

      const c2 = AutomationConditionEvaluator.evaluateCondition(entity, {
        field: 'payee',
        operator: 'starts_with',
        value: 'swiggy',
      });
      assert.equal(c2.matches, true);

      const c3 = AutomationConditionEvaluator.evaluateCondition(entity, {
        field: 'payee',
        operator: 'equals',
        value: 'swiggy',
      });
      assert.equal(c3.matches, false);
    });

    it('evaluates numeric comparisons (gt, gte, lt, lte, equals)', () => {
      const entity = { amount: 545.5 };

      const c1 = AutomationConditionEvaluator.evaluateCondition(entity, {
        field: 'amount',
        operator: 'gt',
        value: 500,
      });
      assert.equal(c1.matches, true);

      const c2 = AutomationConditionEvaluator.evaluateCondition(entity, {
        field: 'amount',
        operator: 'lte',
        value: 545.5,
      });
      assert.equal(c2.matches, true);

      const c3 = AutomationConditionEvaluator.evaluateCondition(entity, {
        field: 'amount',
        operator: 'lt',
        value: 100,
      });
      assert.equal(c3.matches, false);
    });

    it('evaluates existence and field aliases', () => {
      const task = {
        title: 'Submit report',
        metadata: { priority: 'urgent', status: 'todo' },
      };

      const c1 = AutomationConditionEvaluator.evaluateCondition(task, {
        field: 'priority',
        operator: 'equals',
        value: 'urgent',
      });
      assert.equal(c1.matches, true);

      const c2 = AutomationConditionEvaluator.evaluateCondition(task, {
        field: 'projectId',
        operator: 'not_exists',
        value: true,
      });
      assert.equal(c2.matches, true);
    });
  });

  describe('2. Rule Priority and Simulation Sandbox', () => {
    it('simulates rules without mutating data, correctly prioritizing higher-priority rules', async () => {
      // Create two rules:
      // Rule 1: Swiggy -> Food (Priority: 10)
      // Rule 2: Swiggy + Project Goa -> Project Goa (Priority: 50)
      const rule1 = await automationEngine.createRule({
        name: 'Swiggy -> Food',
        trigger: 'transaction_created',
        priority: 10,
        conditions: [{ field: 'payee', operator: 'contains', value: 'swiggy' }],
        actions: [
          { type: 'assign_category', value: 'cat_food' },
          { type: 'add_label', value: 'delivery' },
        ],
      });

      await automationEngine.createRule({
        name: 'Swiggy Goa Trip',
        trigger: 'transaction_created',
        priority: 50,
        conditions: [
          { field: 'payee', operator: 'contains', value: 'swiggy' },
          { field: 'note', operator: 'contains', value: 'goa' },
        ],
        actions: [
          { type: 'assign_category', value: 'cat_travel' },
          { type: 'assign_project', value: 'proj_goa' },
        ],
      });

      // Simulation 1: Standard Swiggy transaction
      const mockTxn1 = { payee: 'SWIGGY ORDER', amount: 545, accountId: 'acc_1' };
      const sim1 = await automationEngine.simulate(mockTxn1, 'transaction_created');

      assert.equal(sim1.matchedRules.length, 1);
      assert.equal(sim1.matchedRules[0].ruleId, rule1.id);
      assert.equal(sim1.preview.categoryId, 'cat_food');
      assert.ok(Array.isArray(sim1.preview.labels));
      assert.ok((sim1.preview.labels as string[]).includes('delivery'));
      assert.equal((mockTxn1 as Record<string, unknown>).categoryId, undefined, 'Original mock entity must NOT be mutated');

      // Simulation 2: Swiggy with Goa note -> Rule 2 has priority 50, so category should become cat_travel
      const mockTxn2 = { payee: 'SWIGGY ORDER', note: 'Dinner in Goa', amount: 1200, accountId: 'acc_1' };
      const sim2 = await automationEngine.simulate(mockTxn2, 'transaction_created');

      assert.equal(sim2.matchedRules.length, 2, 'Both rules match');
      // Rule 2 has priority 50 > Rule 1 priority 10
      assert.equal(sim2.preview.categoryId, 'cat_travel', 'Higher priority rule category must prevail');
      assert.equal(sim2.preview.projectId, 'proj_goa');
      assert.ok((sim2.preview.labels as string[]).includes('delivery'), 'Non-conflicting actions from both rules apply');
    });
  });

  describe('3. Deterministic Execution & Idempotency', () => {
    it('executes matching rules and logs before/after execution history', async () => {
      const rule = await automationEngine.createRule({
        name: 'Netflix Subscription Categorizer',
        trigger: 'transaction_created',
        priority: 30,
        conditions: [{ field: 'payee', operator: 'contains', value: 'netflix' }],
        actions: [
          { type: 'assign_category', value: 'cat_entertainment_subscriptions' },
          { type: 'add_label', value: 'subscription' },
        ],
      });

      const txn: Record<string, unknown> = {
        id: 'txn_netflix_1',
        payee: 'Netflix India',
        amount: 649,
        labels: [] as string[],
      };

      const result = await automationEngine.evaluateAndExecute('transaction_created', txn, 'transaction');
      assert.equal(result.appliedRules.length, 1);
      assert.equal(result.entity.categoryId, 'cat_entertainment_subscriptions');
      assert.deepEqual(result.entity.labels, ['subscription']);

      // Verify execution history was logged
      const history = await automationEngine.getExecutionHistory(String(txn.id));
      assert.equal(history.length, 1);
      assert.equal(history[0].ruleId, rule.id);
      assert.equal(history[0].ruleName, rule.name);
      assert.equal(history[0].status, 'success');
      assert.ok(history[0].explanation.includes('contains'));

      // Verify rule execution stats were updated
      const updatedRule = await automationEngine.getRuleById(rule.id);
      assert.equal(updatedRule?.executionCount, 1);
      assert.ok(updatedRule?.lastExecutedAt);
    });

    it('is strictly idempotent — duplicate trigger delivery skips redundant mutation', async () => {
      await automationEngine.createRule({
        name: 'Zomato Categorizer',
        trigger: 'transaction_created',
        priority: 20,
        conditions: [{ field: 'payee', operator: 'contains', value: 'zomato' }],
        actions: [
          { type: 'assign_category', value: 'cat_food_delivery' },
          { type: 'add_label', value: 'food' },
        ],
      });

      const txn = {
        id: 'txn_zomato_1',
        payee: 'Zomato Gold Order',
        amount: 320,
        labels: [] as string[],
      };

      // First run: applies rule
      const firstRun = await automationEngine.evaluateAndExecute('transaction_created', txn, 'transaction');
      assert.equal(firstRun.appliedRules.length, 1);

      // Second run with same transaction ID: idempotent skip
      const secondRun = await automationEngine.evaluateAndExecute('transaction_created', firstRun.entity, 'transaction');
      assert.equal(secondRun.appliedRules.length, 0, 'Duplicate delivery must not re-execute rule');

      const history = await automationEngine.getExecutionHistory(txn.id);
      assert.equal(history.length, 1, 'Only 1 execution record should exist');
    });
  });

  describe('4. Starter Automation Templates', () => {
    it('instantiates functional rules from built-in starter templates', async () => {
      assert.ok(STARTER_AUTOMATION_TEMPLATES.length >= 4);

      const fuelTemplate = STARTER_AUTOMATION_TEMPLATES.find(t => t.id === 'tpl_fuel');
      assert.ok(fuelTemplate);

      const rule = createRuleFromTemplate('tpl_fuel', 25);
      assert.ok(rule);
      assert.equal(rule.priority, 25);
      assert.equal(rule.trigger, 'transaction_created');

      await automationEngine.createRule(rule);

      // Test against IndianOil transaction
      const txn = { payee: 'IndianOil Pump Indiranagar', amount: 2500 };
      const sim = await automationEngine.simulate(txn, 'transaction_created');
      assert.equal(sim.matchedRules.length, 1);
      assert.equal(sim.preview.categoryId, 'cat_transport_fuel');
      assert.ok((sim.preview.labels as string[]).includes('fuel'));
    });
  });
});
