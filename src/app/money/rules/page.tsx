'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, Power, X } from 'lucide-react';
import { FinanceRule, FinanceCategory, RuleConditionField, RuleConditionOperator } from '@/types/finance';
import { financeRulesService } from '@/lib/services/finance/FinanceRulesService';
import { financeCategoryService } from '@/lib/services/finance/FinanceCategoryService';
import { CategorySelect } from '@/components/money/CategorySelect';

export default function RulesPage() {
  const [rules, setRules] = useState<FinanceRule[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  // New rule state
  const [name, setName] = useState('');
  const [field, setField] = useState<RuleConditionField>('payee');
  const [operator, setOperator] = useState<RuleConditionOperator>('contains');
  const [conditionValue, setConditionValue] = useState('');
  const [actionCategory, setActionCategory] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [allRules, cats] = await Promise.all([
        financeRulesService.getAllRules(),
        financeCategoryService.getAllCategories(),
      ]);
      setRules(allRules);
      setCategories(cats);
    } catch (err) {
      console.error('Failed to load rules:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    Promise.all([
      financeRulesService.getAllRules(),
      financeCategoryService.getAllCategories(),
    ]).then(([allRules, cats]) => {
      if (!ignore) {
        setRules(allRules);
        setCategories(cats);
        setLoading(false);
      }
    }).catch(err => {
      console.error('Failed to load rules:', err);
      if (!ignore) setLoading(false);
    });
    return () => { ignore = true; };
  }, []);

  async function handleToggle(rule: FinanceRule) {
    await financeRulesService.updateRule(rule.id, { enabled: !rule.enabled });
    await loadData();
  }

  async function handleDelete(id: string) {
    await financeRulesService.deleteRule(id);
    await loadData();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !conditionValue.trim() || !actionCategory) return;

    await financeRulesService.createRule({
      name: name.trim(),
      conditions: [
        {
          field,
          operator,
          value: conditionValue.trim(),
        },
      ],
      actions: [
        {
          type: 'set_category',
          value: actionCategory,
        },
      ],
      priority: rules.length + 1,
    });

    setName('');
    setConditionValue('');
    setActionCategory('');
    setShowAddModal(false);
    await loadData();
  }

  const categoryMap = new Map(categories.map(c => [c.id, c.name]));

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/money" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
            <ArrowLeft size={18} />
          </Link>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            Automatic Rules
          </h1>
        </div>

        <button className="btn btn-primary" onClick={() => setShowAddModal(true)} id="btn-add-rule">
          <Plus size={16} />
          <span>New Rule</span>
        </button>
      </div>

      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
        Rules automatically apply when new transactions are created or imported, auto-categorizing and tagging transactions deterministically.
      </p>

      {/* Rules List */}
      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)', background: 'var(--bg-card)', borderRadius: 16 }}>
          <p>Loading rules...</p>
        </div>
      ) : rules.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)', background: 'var(--bg-card)', borderRadius: 16 }}>
          <p>No automatic rules configured. Create a rule to auto-categorize recurring payees like Uber, Swiggy, or Netflix!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rules.map((rule, idx) => {
            const cond = rule.conditions[0];
            const act = rule.actions[0];
            const catName = act && act.type === 'set_category' ? categoryMap.get(act.value as string) : undefined;

            return (
              <div
                key={rule.id}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 14,
                  padding: '16px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  opacity: rule.enabled ? 1 : 0.6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-tertiary)' }}>#{idx + 1}</span>
                  <div>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {rule.name}
                    </span>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                      If <strong>{cond?.field}</strong> {cond?.operator} <em>&ldquo;{cond?.value}&rdquo;</em> → Set category to <strong>{catName || 'category'}</strong>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button
                    className="btn btn-ghost btn-icon"
                    onClick={() => handleToggle(rule)}
                    title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                  >
                    <Power size={18} color={rule.enabled ? 'var(--color-success)' : 'var(--text-tertiary)'} />
                  </button>
                  <button
                    className="btn btn-ghost btn-icon"
                    onClick={() => handleDelete(rule.id)}
                    title="Delete rule"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Rule Modal */}
      {showAddModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
          onClick={() => setShowAddModal(false)}
        >
          <div style={{ background: 'var(--bg-card)', padding: 24, borderRadius: 16, border: '1px solid var(--border-default)', maxWidth: 440, width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Create Rule</h3>
              <button className="btn btn-icon btn-ghost" onClick={() => setShowAddModal(false)}><X size={18} /></button>
            </div>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Rule Name</label>
                <input type="text" placeholder="e.g. Categorize Swiggy as Food" value={name} onChange={e => setName(e.target.value)} className="input" required />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Field</label>
                  <select value={field} onChange={e => setField(e.target.value as RuleConditionField)} className="input">
                    <option value="payee">Payee</option>
                    <option value="note">Note</option>
                    <option value="amount">Amount</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Condition</label>
                  <select value={operator} onChange={e => setOperator(e.target.value as RuleConditionOperator)} className="input">
                    <option value="contains">Contains</option>
                    <option value="equals">Equals</option>
                    <option value="starts_with">Starts With</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Match Keyword</label>
                <input type="text" placeholder="e.g. Swiggy, Zomato, Uber" value={conditionValue} onChange={e => setConditionValue(e.target.value)} className="input" required />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Set Category To</label>
                <CategorySelect
                  value={actionCategory}
                  onChange={setActionCategory}
                  placeholder="Select target category…"
                  allowNone={false}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={!actionCategory || !conditionValue || !name}>Create Rule</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
