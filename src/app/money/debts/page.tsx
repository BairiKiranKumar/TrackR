'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, CheckCircle, X, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { FinanceDebt, DebtDirection } from '@/types/finance';
import { financeDebtService } from '@/lib/services/finance/FinanceDebtService';

export default function DebtsPage() {
  const [debts, setDebts] = useState<FinanceDebt[]>([]);
  const [summary, setSummary] = useState({ totalLent: 0, totalBorrowed: 0, net: 0 });
  const [filterDirection, setFilterDirection] = useState<'all' | DebtDirection>('all');
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [repayDebtId, setRepayDebtId] = useState<string | null>(null);
  const [repayAmount, setRepayAmount] = useState('');

  // Form states
  const [person, setPerson] = useState('');
  const [direction, setDirection] = useState<DebtDirection>('lent');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [allDebts, sum] = await Promise.all([
        financeDebtService.getAllDebts(),
        financeDebtService.getDebtSummary(),
      ]);
      setDebts(allDebts);
      setSummary({
        totalLent: sum.totalLent,
        totalBorrowed: sum.totalBorrowed,
        net: sum.netDebtPosition,
      });
    } catch (err) {
      console.error('Failed to load debts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    Promise.all([
      financeDebtService.getAllDebts(),
      financeDebtService.getDebtSummary(),
    ]).then(([allDebts, sum]) => {
      if (!ignore) {
        setDebts(allDebts);
        setSummary({
          totalLent: sum.totalLent,
          totalBorrowed: sum.totalBorrowed,
          net: sum.netDebtPosition,
        });
        setLoading(false);
      }
    }).catch(err => {
      console.error('Failed to load debts:', err);
      if (!ignore) setLoading(false);
    });
    return () => { ignore = true; };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const numAmt = parseFloat(amount);
    if (!person.trim() || isNaN(numAmt) || numAmt <= 0) return;

    await financeDebtService.createDebt({
      person: person.trim(),
      direction,
      amount: numAmt,
      dueDate: dueDate || undefined,
      note: notes.trim() || undefined,
    });

    setPerson('');
    setAmount('');
    setDueDate('');
    setNotes('');
    setShowAddModal(false);
    await loadData();
  }

  async function handleAddRepayment(e: React.FormEvent) {
    e.preventDefault();
    if (!repayDebtId) return;
    const numAmt = parseFloat(repayAmount);
    if (isNaN(numAmt) || numAmt <= 0) return;

    await financeDebtService.addRepayment(repayDebtId, numAmt);
    setRepayDebtId(null);
    setRepayAmount('');
    await loadData();
  }

  const filtered = debts.filter(d => {
    if (filterDirection === 'all') return true;
    return d.direction === filterDirection;
  });

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/money" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
            <ArrowLeft size={18} />
          </Link>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            Debts & Loans
          </h1>
        </div>

        <button className="btn btn-primary" onClick={() => setShowAddModal(true)} id="btn-add-debt">
          <Plus size={16} />
          <span>Record Debt</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <div style={{ background: 'var(--bg-card)', padding: 20, borderRadius: 16, border: '1px solid var(--border-default)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>People Owe You (Lent)</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-success, #10b981)', marginTop: 4 }}>
            ₹{summary.totalLent.toLocaleString()}
          </div>
        </div>

        <div style={{ background: 'var(--bg-card)', padding: 20, borderRadius: 16, border: '1px solid var(--border-default)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>You Owe (Borrowed)</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-danger, #ef4444)', marginTop: 4 }}>
            ₹{summary.totalBorrowed.toLocaleString()}
          </div>
        </div>

        <div style={{ background: 'var(--bg-card)', padding: 20, borderRadius: 16, border: '1px solid var(--border-default)' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Net Balance</span>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: summary.net >= 0 ? 'var(--color-success)' : 'var(--color-danger)', marginTop: 4 }}>
            ₹{summary.net.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 8 }}>
        {(['all', 'lent', 'borrowed'] as const).map(dir => (
          <button
            key={dir}
            onClick={() => setFilterDirection(dir)}
            className={`btn ${filterDirection === dir ? 'btn-primary' : 'btn-secondary'}`}
            style={{ textTransform: 'capitalize' }}
          >
            {dir}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)', background: 'var(--bg-card)', borderRadius: 16 }}>
          <p>Loading debt records...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)', background: 'var(--bg-card)', borderRadius: 16 }}>
          <p>No debt records found.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(d => {
            const isLent = d.direction === 'lent';
            const repaid = d.repayments.reduce((sum, r) => sum + r.amount, 0);
            const remaining = Math.max(0, d.amount - repaid);
            const isPaid = d.status === 'paid' || remaining <= 0;

            return (
              <div
                key={d.id}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 14,
                  padding: '18px 20px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 16,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: isLent ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isLent ? 'var(--color-success)' : 'var(--color-danger)',
                    }}
                  >
                    {isLent ? <ArrowUpRight size={20} /> : <ArrowDownLeft size={20} />}
                  </div>

                  <div>
                    <span style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {d.person}
                    </span>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
                      {isLent ? 'Lent to' : 'Borrowed from'} • {d.date} {d.dueDate ? `• Due: ${d.dueDate}` : ''}
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 700 }}>
                      Remaining: ₹{remaining.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                      Original: ₹{d.amount.toLocaleString()} (Repaid: ₹{repaid.toLocaleString()})
                    </div>
                  </div>

                  {!isPaid && (
                    <button
                      className="btn btn-secondary"
                      onClick={() => setRepayDebtId(d.id)}
                      style={{ fontSize: '0.85rem' }}
                    >
                      Record Repayment
                    </button>
                  )}
                  {isPaid && (
                    <span style={{ color: 'var(--color-success)', fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle size={16} /> Paid
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
          onClick={() => setShowAddModal(false)}
        >
          <div style={{ background: 'var(--bg-card)', padding: 24, borderRadius: 16, border: '1px solid var(--border-default)', maxWidth: 440, width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Record Debt</h3>
              <button className="btn btn-icon btn-ghost" onClick={() => setShowAddModal(false)}><X size={18} /></button>
            </div>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Person Name</label>
                <input type="text" placeholder="e.g. Rahul, John" value={person} onChange={e => setPerson(e.target.value)} className="input" required />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Direction</label>
                <select value={direction} onChange={e => setDirection(e.target.value as DebtDirection)} className="input">
                  <option value="lent">I Lent Money (They owe me)</option>
                  <option value="borrowed">I Borrowed Money (I owe them)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Amount (₹)</label>
                <input type="number" step="any" placeholder="5000" value={amount} onChange={e => setAmount(e.target.value)} className="input" required />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Due Date (Optional)</label>
                <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="input" />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Debt</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Repay Modal */}
      {repayDebtId && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
          onClick={() => setRepayDebtId(null)}
        >
          <div style={{ background: 'var(--bg-card)', padding: 24, borderRadius: 16, border: '1px solid var(--border-default)', maxWidth: 400, width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Record Repayment</h3>
              <button className="btn btn-icon btn-ghost" onClick={() => setRepayDebtId(null)}><X size={18} /></button>
            </div>

            <form onSubmit={handleAddRepayment} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Repayment Amount (₹)</label>
                <input type="number" step="any" placeholder="1000" value={repayAmount} onChange={e => setRepayAmount(e.target.value)} className="input" autoFocus required />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setRepayDebtId(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Repayment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
