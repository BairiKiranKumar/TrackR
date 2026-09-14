'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Play, Plus, Trash2, Edit2, CheckCircle2, XCircle,
  Sparkles, History, Sliders, ToggleLeft, ToggleRight
} from 'lucide-react';
import {
  AutomationRule,
  AutomationTrigger,
  AutomationExecution,
  RuleSimulationResult,
  RuleConditionField,
  RuleConditionOperator,
  RuleActionType,
} from '@/types/automation';
import { automationEngine } from '@/lib/services/automation/AutomationEngine';
import { STARTER_TEMPLATES } from '@/lib/services/automation/AutomationTemplates';
import { Button, Modal, Badge } from '@/components/ui';
import styles from './AutomationSettings.module.css';

type SectionCategory = 'all' | 'transaction' | 'task' | 'budget' | 'planning';

export function AutomationSettings() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<SectionCategory>('all');
  const [loading, setLoading] = useState(true);

  // Modals
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [simulatingRule, setSimulatingRule] = useState<AutomationRule | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<AutomationExecution[]>([]);

  // Simulation state
  const [simPayee, setSimPayee] = useState('SWIGGY ORDER');
  const [simAmount, setSimAmount] = useState('545');
  const [simAccount, setSimAccount] = useState('HDFC');
  const [simulationResult, setSimulationResult] = useState<RuleSimulationResult | null>(null);

  // Form state for Add/Edit
  const [formName, setFormName] = useState('');
  const [formTrigger, setFormTrigger] = useState<AutomationTrigger>('transaction_created');
  const [formPriority, setFormPriority] = useState('10');
  const [formConditionField, setFormConditionField] = useState<RuleConditionField>('payee');
  const [formConditionOp, setFormConditionOp] = useState<RuleConditionOperator>('contains');
  const [formConditionVal, setFormConditionVal] = useState('');
  const [formActionType, setFormActionType] = useState<RuleActionType>('assign_category');
  const [formActionVal, setFormActionVal] = useState('');

  const loadRules = useCallback(async () => {
    try {
      setLoading(true);
      const all = await automationEngine.getAllRules();
      setRules(all.sort((a, b) => b.priority - a.priority));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const filteredRules = useMemo(() => {
    if (selectedCategory === 'all') return rules;
    if (selectedCategory === 'transaction') return rules.filter(r => r.trigger.startsWith('transaction_'));
    if (selectedCategory === 'task') return rules.filter(r => r.trigger.startsWith('task_'));
    if (selectedCategory === 'budget') return rules.filter(r => r.trigger.startsWith('budget_'));
    if (selectedCategory === 'planning') return rules.filter(r => r.trigger.startsWith('planned_payment_'));
    return rules;
  }, [rules, selectedCategory]);

  async function handleToggleRule(rule: AutomationRule) {
    await automationEngine.updateRule(rule.id, { enabled: !rule.enabled });
    await loadRules();
  }

  async function handleDeleteRule(id: string) {
    await automationEngine.deleteRule(id);
    await loadRules();
  }

  async function handleLoadStarterTemplates() {
    for (const t of STARTER_TEMPLATES) {
      const exists = rules.some(r => r.name === t.rule.name);
      if (!exists) {
        await automationEngine.createRule(t.rule);
      }
    }
    await loadRules();
  }

  function openEditModal(rule: AutomationRule) {
    setEditingRule(rule);
    setFormName(rule.name);
    setFormTrigger(rule.trigger);
    setFormPriority(rule.priority.toString());
    const c = rule.conditions[0];
    if (c) {
      setFormConditionField(c.field);
      setFormConditionOp(c.operator);
      setFormConditionVal(c.value?.toString() || '');
    }
    const a = rule.actions[0];
    if (a) {
      setFormActionType(a.type);
      setFormActionVal(a.value?.toString() || '');
    }
    setIsCreating(false);
  }

  function openCreateModal() {
    setEditingRule(null);
    setFormName('');
    setFormTrigger('transaction_created');
    setFormPriority('10');
    setFormConditionField('payee');
    setFormConditionOp('contains');
    setFormConditionVal('');
    setFormActionType('assign_category');
    setFormActionVal('');
    setIsCreating(true);
  }

  async function handleSaveForm(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;

    const conditions: AutomationRule['conditions'] = [
      {
        field: formConditionField,
        operator: formConditionOp,
        value: formConditionVal.trim(),
      },
    ];

    const actions: AutomationRule['actions'] = [
      {
        type: formActionType,
        value: formActionVal.trim(),
      },
    ];

    const prio = parseInt(formPriority, 10) || 10;

    if (isCreating) {
      await automationEngine.createRule({
        name: formName.trim(),
        trigger: formTrigger,
        conditions,
        actions,
        priority: prio,
        enabled: true,
      });
    } else if (editingRule) {
      await automationEngine.updateRule(editingRule.id, {
        name: formName.trim(),
        trigger: formTrigger,
        conditions,
        actions,
        priority: prio,
      });
    }

    setIsCreating(false);
    setEditingRule(null);
    await loadRules();
  }

  function openSimulateModal(rule: AutomationRule) {
    setSimulatingRule(rule);
    setSimPayee('SWIGGY ORDER');
    setSimAmount('545');
    setSimAccount('HDFC');
    runSimulation(rule, 'SWIGGY ORDER', '545', 'HDFC');
  }

  function runSimulation(rule: AutomationRule, payee: string, amount: string, account: string) {
    const mockTxn = {
      payee,
      amount: parseFloat(amount) || 0,
      accountName: account,
      account,
      date: new Date().toISOString().slice(0, 10),
    };
    const res = automationEngine.simulateRule(rule, mockTxn);
    setSimulationResult(res);
  }

  async function openExecutionHistory() {
    const hist = await automationEngine.getRecentExecutions(50);
    setHistoryItems(hist);
    setShowHistory(true);
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.headerRow}>
        <div>
          <h2 className={styles.headerTitle}>Deterministic Automation</h2>
          <p className={styles.headerSubtitle}>
            Define triggers, conditions, and actions that execute reliably without AI.
          </p>
        </div>
        <div className={styles.headerButtons}>
          <Button
            variant="secondary"
            size="sm"
            onClick={openExecutionHistory}
            id="btn-automation-history"
          >
            <History size={14} />
            <span>Execution History</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleLoadStarterTemplates}
            id="btn-load-automation-templates"
          >
            <Sparkles size={14} />
            <span>Starter Templates</span>
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={openCreateModal}
            id="btn-create-automation-rule"
          >
            <Plus size={14} />
            <span>New Rule</span>
          </Button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className={styles.categoryTabs}>
        <button
          className={`${styles.categoryTab} ${selectedCategory === 'all' ? styles.categoryTabActive : ''}`}
          onClick={() => setSelectedCategory('all')}
          id="tab-automation-all"
        >
          All Rules ({rules.length})
        </button>
        <button
          className={`${styles.categoryTab} ${selectedCategory === 'transaction' ? styles.categoryTabActive : ''}`}
          onClick={() => setSelectedCategory('transaction')}
          id="tab-automation-transaction"
        >
          Transaction Rules
        </button>
        <button
          className={`${styles.categoryTab} ${selectedCategory === 'task' ? styles.categoryTabActive : ''}`}
          onClick={() => setSelectedCategory('task')}
          id="tab-automation-task"
        >
          Task Rules
        </button>
        <button
          className={`${styles.categoryTab} ${selectedCategory === 'budget' ? styles.categoryTabActive : ''}`}
          onClick={() => setSelectedCategory('budget')}
          id="tab-automation-budget"
        >
          Budget Rules
        </button>
        <button
          className={`${styles.categoryTab} ${selectedCategory === 'planning' ? styles.categoryTabActive : ''}`}
          onClick={() => setSelectedCategory('planning')}
          id="tab-automation-planning"
        >
          Planning Rules
        </button>
      </div>

      {/* Rules List */}
      <div className={styles.rulesList}>
        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Loading rules…
          </div>
        ) : filteredRules.length === 0 ? (
          <div className={styles.emptyState}>
            <Sliders size={32} style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
            <div className={styles.emptyTitle}>No automation rules found</div>
            <div className={styles.emptySubtitle}>
              {selectedCategory === 'all'
                ? 'Create custom rules or load starter templates to automate repetitive categorizations.'
                : `No rules defined for ${selectedCategory}.`}
            </div>
            <Button variant="secondary" size="sm" onClick={handleLoadStarterTemplates}>
              Load Starter Templates
            </Button>
          </div>
        ) : (
          filteredRules.map(rule => (
            <div
              key={rule.id}
              className={`${styles.ruleCard} ${!rule.enabled ? styles.ruleCardDisabled : ''}`}
              id={`automation-rule-${rule.id}`}
            >
              <div className={styles.ruleMain}>
                <div className={styles.ruleHeader}>
                  <span className={styles.ruleName}>{rule.name}</span>
                  <span className={styles.rulePriority}>Priority: {rule.priority}</span>
                  {!rule.enabled && <Badge variant="default" size="sm">Disabled</Badge>}
                </div>
                <div className={styles.ruleDetails}>
                  <span className={styles.ruleTrigger}>On: {rule.trigger}</span>
                  <span className={styles.ruleConditions}>
                    If: {rule.conditions.map(c => `${c.field} ${c.operator} "${c.value}"`).join(' AND ')}
                  </span>
                  <span className={styles.ruleActions}>
                    Then: {rule.actions.map(a => `${a.type} → ${a.value || ''}`).join(', ')}
                  </span>
                </div>
              </div>

              <div className={styles.ruleActionsBar}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openSimulateModal(rule)}
                  title="Test rule (zero mutation)"
                  id={`btn-test-rule-${rule.id}`}
                >
                  <Play size={14} />
                  <span>Test</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openEditModal(rule)}
                  id={`btn-edit-rule-${rule.id}`}
                >
                  <Edit2 size={14} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToggleRule(rule)}
                  title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                  id={`btn-toggle-rule-${rule.id}`}
                >
                  {rule.enabled ? <ToggleRight size={18} color="var(--accent-primary)" /> : <ToggleLeft size={18} />}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteRule(rule.id)}
                  id={`btn-delete-rule-${rule.id}`}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Rule Add/Edit Modal */}
      {(isCreating || editingRule) && (
        <Modal
          isOpen={true}
          onClose={() => { setIsCreating(false); setEditingRule(null); }}
          title={isCreating ? 'New Automation Rule' : `Edit: ${editingRule?.name}`}
        >
          <form onSubmit={handleSaveForm} className={styles.modalForm}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Rule Name</label>
              <input
                className={styles.formInput}
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="e.g., Swiggy → Food / Delivery"
                required
                id="input-rule-name"
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Trigger</label>
              <select
                className={styles.formSelect}
                value={formTrigger}
                onChange={e => setFormTrigger(e.target.value as AutomationTrigger)}
                id="select-rule-trigger"
              >
                <optgroup label="Transactions">
                  <option value="transaction_created">Transaction Created</option>
                  <option value="transaction_updated">Transaction Updated</option>
                </optgroup>
                <optgroup label="Tasks">
                  <option value="task_due">Task Due</option>
                  <option value="task_overdue">Task Overdue</option>
                </optgroup>
                <optgroup label="Budgets">
                  <option value="budget_threshold_reached">Budget Threshold Reached</option>
                </optgroup>
                <optgroup label="Planning">
                  <option value="planned_payment_due">Planned Payment Due</option>
                </optgroup>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Condition (Deterministic)</label>
              <div className={styles.conditionRow}>
                <select
                  className={styles.formSelect}
                  value={formConditionField}
                  onChange={e => setFormConditionField(e.target.value as RuleConditionField)}
                >
                  <option value="payee">Payee</option>
                  <option value="amount">Amount</option>
                  <option value="account">Account</option>
                  <option value="category">Category</option>
                  <option value="priority">Priority</option>
                  <option value="status">Status</option>
                  <option value="usage_percentage">Budget Usage %</option>
                </select>

                <select
                  className={styles.formSelect}
                  value={formConditionOp}
                  onChange={e => setFormConditionOp(e.target.value as RuleConditionOperator)}
                >
                  <option value="contains">contains</option>
                  <option value="equals">equals</option>
                  <option value="gt">&gt;</option>
                  <option value="lt">&lt;</option>
                  <option value="starts_with">starts with</option>
                  <option value="ends_with">ends with</option>
                </select>

                <input
                  className={styles.formInput}
                  value={formConditionVal}
                  onChange={e => setFormConditionVal(e.target.value)}
                  placeholder="Value (e.g. Swiggy)"
                  required
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Action</label>
              <div className={styles.actionRow}>
                <select
                  className={styles.formSelect}
                  value={formActionType}
                  onChange={e => setFormActionType(e.target.value as RuleActionType)}
                >
                  <option value="assign_category">Assign Category</option>
                  <option value="add_label">Add Label</option>
                  <option value="add_note">Add Note</option>
                  <option value="change_priority">Change Priority</option>
                  <option value="generate_attention">Generate Attention</option>
                </select>

                <input
                  className={styles.formInput}
                  value={formActionVal}
                  onChange={e => setFormActionVal(e.target.value)}
                  placeholder="Target (e.g. Food / Delivery)"
                  required
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Priority (Higher numbers evaluate first)</label>
              <input
                type="number"
                className={styles.formInput}
                value={formPriority}
                onChange={e => setFormPriority(e.target.value)}
                min="1"
                max="1000"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
              <Button
                variant="secondary"
                type="button"
                onClick={() => { setIsCreating(false); setEditingRule(null); }}
              >
                Cancel
              </Button>
              <Button variant="primary" type="submit" id="btn-save-automation-rule">
                {isCreating ? 'Create Rule' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Simulation / Test Rule Modal */}
      {simulatingRule && (
        <Modal
          isOpen={true}
          onClose={() => setSimulatingRule(null)}
          title={`Test Rule: ${simulatingRule.name}`}
        >
          <div className={styles.modalForm}>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              Test this deterministic rule in a zero-mutation sandbox. No real entities will be modified.
            </p>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Payee</label>
              <input
                className={styles.formInput}
                value={simPayee}
                onChange={e => {
                  setSimPayee(e.target.value);
                  runSimulation(simulatingRule, e.target.value, simAmount, simAccount);
                }}
                id="input-sim-payee"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Amount (₹)</label>
                <input
                  className={styles.formInput}
                  value={simAmount}
                  onChange={e => {
                    setSimAmount(e.target.value);
                    runSimulation(simulatingRule, simPayee, e.target.value, simAccount);
                  }}
                  id="input-sim-amount"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Account</label>
                <input
                  className={styles.formInput}
                  value={simAccount}
                  onChange={e => {
                    setSimAccount(e.target.value);
                    runSimulation(simulatingRule, simPayee, simAmount, e.target.value);
                  }}
                  id="input-sim-account"
                />
              </div>
            </div>

            {simulationResult && (
              <div className={styles.simulationResult} id="simulation-output-box">
                <div className={styles.simulationHeader}>
                  Match Status:{' '}
                  {simulationResult.matched || simulationResult.matchedRules.length > 0 ? (
                    <span className={styles.simulationMatched} style={{ color: 'var(--status-success-text)' }}>
                      <CheckCircle2 size={14} style={{ display: 'inline', marginRight: 4 }} />
                      MATCHED
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-tertiary)' }}>
                      <XCircle size={14} style={{ display: 'inline', marginRight: 4 }} />
                      NO MATCH
                    </span>
                  )}
                </div>

                {simulationResult.matched || simulationResult.matchedRules.length > 0 ? (
                  <div>
                    <div className={styles.simulationApply}>
                      <strong>Would apply actions:</strong>
                      <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                        {simulationResult.wouldApplyActions.map((a, i) => (
                          <li key={i}>{a.type}: {String(a.value)}</li>
                        ))}
                      </ul>
                    </div>
                    {simulationResult.explanation && simulationResult.explanation.length > 0 && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 6 }}>
                        Reason: {simulationResult.explanation.join('; ')}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    None of the rule conditions evaluated to true for the input values.
                  </div>
                )}

                <div className={styles.simulationNotice}>
                  * Simulation completed deterministically. No data has been saved or modified.
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <Button variant="secondary" onClick={() => setSimulatingRule(null)}>
                Close Test
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Execution History Modal */}
      {showHistory && (
        <Modal
          isOpen={true}
          onClose={() => setShowHistory(false)}
          title="Automation Execution History"
        >
          <div className={styles.modalForm}>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              Audit trail of recent rule executions showing why transactions or entities were modified.
            </p>

            {historyItems.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                No execution records logged yet.
              </div>
            ) : (
              <div className={styles.historyList}>
                {historyItems.map(item => (
                  <div key={item.id} className={styles.historyItem}>
                    <div className={styles.historyDetails}>
                      <span style={{ fontWeight: 600 }}>Rule: {item.ruleId}</span>
                      <span className={styles.historyTarget}>
                        Entity: {item.targetEntityId} • {new Date(item.executedAt).toLocaleString()}
                      </span>
                    </div>
                    <Badge variant={item.status === 'success' ? 'success' : 'danger'} size="sm">
                      {item.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <Button variant="secondary" onClick={() => setShowHistory(false)}>
                Close History
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
