import { AutomationRule } from '@/types/automation';
import { genFinanceId } from '@/lib/db/localDb';

export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  category: 'finance' | 'tasks' | 'planning';
  rule: Omit<AutomationRule, 'id' | 'createdAt' | 'updatedAt' | 'executionCount'>;
}

export const STARTER_AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  {
    id: 'tpl_food_delivery',
    name: 'Categorize Food Delivery',
    description: 'Automatically assigns Food Delivery category and Food label when payee mentions Swiggy, Zomato, or Zepto',
    category: 'finance',
    rule: {
      name: 'Food Delivery: Swiggy / Zomato',
      description: 'Match Swiggy, Zomato or Zepto orders',
      trigger: 'transaction_created',
      conditions: [
        { field: 'payee', operator: 'contains', value: 'swiggy' },
      ],
      actions: [
        { type: 'assign_category', value: 'cat_food_delivery' },
        { type: 'add_label', value: 'food' },
      ],
      priority: 20,
      enabled: true,
    },
  },
  {
    id: 'tpl_subscriptions',
    name: 'Categorize Subscriptions',
    description: 'Tags entertainment subscriptions for Netflix, Spotify, or Prime Video',
    category: 'finance',
    rule: {
      name: 'Subscriptions: Netflix / OTT',
      description: 'Match Netflix or Spotify subscription payments',
      trigger: 'transaction_created',
      conditions: [
        { field: 'payee', operator: 'contains', value: 'netflix' },
      ],
      actions: [
        { type: 'assign_category', value: 'cat_entertainment_subscriptions' },
        { type: 'add_label', value: 'subscription' },
      ],
      priority: 30,
      enabled: true,
    },
  },
  {
    id: 'tpl_fuel',
    name: 'Categorize Fuel Expenses',
    description: 'Tags fuel expenses when purchasing at IndianOil, BPCL, or HPCL petrol pumps',
    category: 'finance',
    rule: {
      name: 'Fuel: IndianOil / BPCL / HPCL',
      description: 'Match IndianOil, BPCL, HPCL fuel transactions',
      trigger: 'transaction_created',
      conditions: [
        { field: 'payee', operator: 'contains', value: 'indianoil' },
      ],
      actions: [
        { type: 'assign_category', value: 'cat_transport_fuel' },
        { type: 'add_label', value: 'fuel' },
      ],
      priority: 20,
      enabled: true,
    },
  },
  {
    id: 'tpl_work_expenses',
    name: 'Tag Work Expenses',
    description: 'Tags transactions containing Uber or Client as Work',
    category: 'finance',
    rule: {
      name: 'Work Expenses: Uber & Client',
      description: 'Tag work-related transport or meals',
      trigger: 'transaction_created',
      conditions: [
        { field: 'payee', operator: 'contains', value: 'uber' },
      ],
      actions: [
        { type: 'add_label', value: 'work' },
      ],
      priority: 10,
      enabled: true,
    },
  },
  {
    id: 'tpl_urgent_task',
    name: 'Urgent Task Detection',
    description: 'Promotes tasks containing "ASAP" or "URGENT" to Urgent priority',
    category: 'tasks',
    rule: {
      name: 'Urgent Priority for ASAP Tasks',
      description: 'Auto-promote ASAP tasks',
      trigger: 'task_due',
      conditions: [
        { field: 'title', operator: 'contains', value: 'asap' },
      ],
      actions: [
        { type: 'set_task_priority', value: 'urgent' },
      ],
      priority: 50,
      enabled: true,
    },
  },
];

export const STARTER_TEMPLATES = STARTER_AUTOMATION_TEMPLATES;

export function createRuleFromTemplate(templateId: string, customPriority?: number): AutomationRule | null {
  const tpl = STARTER_AUTOMATION_TEMPLATES.find(t => t.id === templateId);
  if (!tpl) return null;

  const now = new Date().toISOString();
  return {
    id: genFinanceId(),
    ...tpl.rule,
    priority: customPriority ?? tpl.rule.priority,
    executionCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}
