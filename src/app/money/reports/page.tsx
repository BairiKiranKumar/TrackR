'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { financeReportService } from '@/lib/services/finance/FinanceReportService';

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [activeReport, setActiveReport] = useState<number>(1);

  // Report states
  const [incVsExp, setIncVsExp] = useState<{ income: number; expenses: number; net: number; months: { month: string; income: number; expenses: number; net: number }[] }>({ income: 0, expenses: 0, net: 0, months: [] });
  const [spendingByCat, setSpendingByCat] = useState<{ categoryId: string; categoryName: string; amount: number; percentage: number; icon?: string }[]>([]);
  const [spendingByAcc, setSpendingByAcc] = useState<{ accountId: string; accountName: string; expenses: number; income: number; net: number }[]>([]);
  const [spendingByLabel, setSpendingByLabel] = useState<{ labelId: string; amount: number; count: number }[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<{ month: string; income: number; expenses: number; net: number }[]>([]);
  const [cashFlow, setCashFlow] = useState<{ totalIncome: number; totalExpenses: number; netCashFlow: number }>({ totalIncome: 0, totalExpenses: 0, netCashFlow: 0 });
  const [netWorth, setNetWorth] = useState<{ totalAssets: number; totalLiabilities: number; netWorth: number }>({ totalAssets: 0, totalLiabilities: 0, netWorth: 0 });
  const [topPayees, setTopPayees] = useState<{ payee: string; amount: number; count: number }[]>([]);
  const [recurring, setRecurring] = useState<{ recurringId: string; name: string; totalSpent: number; count: number; lastDate: string }[]>([]);

  const loadReports = useCallback(async () => {
    try {
      const now = new Date();
      const startOfYear = `${now.getFullYear()}-01-01`;
      const endOfYear = `${now.getFullYear()}-12-31`;
      const dateRange = { start: startOfYear, end: endOfYear };

      const [r1, r2, r3, r4, r5, r6, r7, r9, r10] = await Promise.all([
        financeReportService.getIncomeVsExpenses(dateRange),
        financeReportService.getSpendingByCategory(dateRange),
        financeReportService.getSpendingByAccount(dateRange),
        financeReportService.getSpendingByLabel(dateRange),
        financeReportService.getMonthlyTrend(12),
        financeReportService.getCashFlow(dateRange),
        financeReportService.getNetWorth(),
        financeReportService.getTopPayees(dateRange, 10),
        financeReportService.getRecurringExpenses(),
      ]);

      setIncVsExp(r1);
      setSpendingByCat(r2);
      setSpendingByAcc(r3);
      setSpendingByLabel(r4);
      setMonthlyTrend(r5);
      setCashFlow(r6);
      setNetWorth({
        totalAssets: r7.totalAssets,
        totalLiabilities: r7.totalLiabilities,
        netWorth: r7.netWorth,
      });
      setTopPayees(r9);
      setRecurring(r10);
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    const now = new Date();
    const startOfYear = `${now.getFullYear()}-01-01`;
    const endOfYear = `${now.getFullYear()}-12-31`;
    const dateRange = { start: startOfYear, end: endOfYear };

    Promise.all([
      financeReportService.getIncomeVsExpenses(dateRange),
      financeReportService.getSpendingByCategory(dateRange),
      financeReportService.getSpendingByAccount(dateRange),
      financeReportService.getSpendingByLabel(dateRange),
      financeReportService.getMonthlyTrend(12),
      financeReportService.getCashFlow(dateRange),
      financeReportService.getNetWorth(),
      financeReportService.getTopPayees(dateRange, 10),
      financeReportService.getRecurringExpenses(),
    ]).then(([r1, r2, r3, r4, r5, r6, r7, r9, r10]) => {
      if (!ignore) {
        setIncVsExp(r1);
        setSpendingByCat(r2);
        setSpendingByAcc(r3);
        setSpendingByLabel(r4);
        setMonthlyTrend(r5);
        setCashFlow(r6);
        setNetWorth({
          totalAssets: r7.totalAssets,
          totalLiabilities: r7.totalLiabilities,
          netWorth: r7.netWorth,
        });
        setTopPayees(r9);
        setRecurring(r10);
        setLoading(false);
      }
    }).catch(err => {
      console.error('Failed to load reports:', err);
      if (!ignore) setLoading(false);
    });
    return () => { ignore = true; };
  }, []);

  const reportList = [
    { id: 1, title: 'Income vs Expenses' },
    { id: 2, title: 'Spending by Category' },
    { id: 3, title: 'Spending by Account' },
    { id: 4, title: 'Spending by Label' },
    { id: 5, title: '12-Month Trend' },
    { id: 6, title: 'Cash Flow' },
    { id: 7, title: 'Net Worth' },
    { id: 8, title: 'Top Payees' },
    { id: 9, title: 'Recurring Expenses' },
  ];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/money" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
            <ArrowLeft size={18} />
          </Link>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            Financial Reports
          </h1>
        </div>
        <button className="btn btn-secondary" onClick={() => loadReports()} title="Refresh Reports">
          <RefreshCw size={16} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Report Selector Pills */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {reportList.map(rep => (
          <button
            key={rep.id}
            id={`btn-report-${rep.id}`}
            onClick={() => setActiveReport(rep.id)}
            style={{
              padding: '8px 14px',
              borderRadius: 10,
              background: activeReport === rep.id ? 'var(--accent-primary, #6366f1)' : 'var(--bg-card, #131317)',
              color: activeReport === rep.id ? '#ffffff' : 'var(--text-secondary, #9e9ead)',
              border: '1px solid var(--border-default, rgba(255,255,255,0.1))',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {rep.title}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, color: 'var(--text-secondary)' }}>Generating reports…</div>
      ) : (
        <div
          style={{
            background: 'var(--bg-card, #131317)',
            border: '1px solid var(--border-default, rgba(255,255,255,0.1))',
            borderRadius: 16,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          {/* Report 1: Income vs Expenses */}
          {activeReport === 1 && (
            <div>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', fontWeight: 700 }}>Income vs Expenses (Year to Date)</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
                <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 12 }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Total Income</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-success, #10b981)' }}>
                    ₹{incVsExp.income.toLocaleString()}
                  </div>
                </div>
                <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 12 }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Total Expenses</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-danger, #ef4444)' }}>
                    ₹{incVsExp.expenses.toLocaleString()}
                  </div>
                </div>
                <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 12 }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Net Savings</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: incVsExp.net >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    ₹{incVsExp.net.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Monthly list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {incVsExp.months.map(m => (
                  <div key={m.month} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                    <span style={{ fontWeight: 600 }}>{m.month}</span>
                    <span>
                      <span style={{ color: 'var(--color-success)' }}>+₹{m.income.toLocaleString()}</span>
                      &nbsp;|&nbsp;
                      <span style={{ color: 'var(--color-danger)' }}>-₹{m.expenses.toLocaleString()}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Report 2: Spending by Category */}
          {activeReport === 2 && (
            <div>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', fontWeight: 700 }}>Spending by Category</h3>
              {spendingByCat.length === 0 ? (
                <p style={{ color: 'var(--text-tertiary)' }}>No expenses recorded yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {spendingByCat.map(cat => (
                    <div key={cat.categoryId} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                        <span>{cat.icon ? `${cat.icon} ` : ''}{cat.categoryName}</span>
                        <span style={{ fontWeight: 700 }}>₹{cat.amount.toLocaleString()} ({Math.round(cat.percentage)}%)</span>
                      </div>
                      <div style={{ height: 6, background: 'var(--bg-secondary)', borderRadius: 9999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${cat.percentage}%`, background: 'var(--accent-primary, #6366f1)', borderRadius: 9999 }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Report 3: Spending by Account */}
          {activeReport === 3 && (
            <div>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', fontWeight: 700 }}>Spending by Account</h3>
              {spendingByAcc.length === 0 ? (
                <p style={{ color: 'var(--text-tertiary)' }}>No expense records found.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {spendingByAcc.map(acc => (
                    <div key={acc.accountId} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                        <span>{acc.accountName}</span>
                        <span style={{ fontWeight: 700 }}>Expenses: ₹{acc.expenses.toLocaleString()} | Net: ₹{acc.net.toLocaleString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Report 4: Spending by Label */}
          {activeReport === 4 && (
            <div>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', fontWeight: 700 }}>Spending by Label</h3>
              {spendingByLabel.length === 0 ? (
                <p style={{ color: 'var(--text-tertiary)' }}>No tagged expenses found.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {spendingByLabel.map(l => (
                    <div key={l.labelId} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                      <span>Label #{l.labelId} ({l.count} transactions)</span>
                      <span style={{ fontWeight: 700 }}>₹{l.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Report 5: 12-Month Trend */}
          {activeReport === 5 && (
            <div>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', fontWeight: 700 }}>12-Month Rolling Trend</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {monthlyTrend.map(m => (
                  <div key={m.month} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                    <span>{m.month}</span>
                    <span style={{ fontWeight: 600 }}>
                      Net: <span style={{ color: m.net >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>₹{m.net.toLocaleString()}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Report 6: Cash Flow */}
          {activeReport === 6 && (
            <div>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', fontWeight: 700 }}>Net Cash Flow Summary</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ padding: 18, background: 'var(--bg-secondary)', borderRadius: 12 }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>Total Inflow</span>
                  <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--color-success)' }}>
                    ₹{cashFlow.totalIncome.toLocaleString()}
                  </div>
                </div>
                <div style={{ padding: 18, background: 'var(--bg-secondary)', borderRadius: 12 }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>Total Outflow</span>
                  <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--color-danger)' }}>
                    ₹{cashFlow.totalExpenses.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Report 7: Net Worth */}
          {activeReport === 7 && (
            <div>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', fontWeight: 700 }}>Net Worth Snapshot</h3>
              <div style={{ padding: 20, background: 'var(--bg-secondary)', borderRadius: 12 }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>Current Net Worth</span>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: netWorth.netWorth >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                  ₹{netWorth.netWorth.toLocaleString()}
                </div>
              </div>
            </div>
          )}

          {/* Report 8: Top Payees */}
          {activeReport === 8 && (
            <div>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', fontWeight: 700 }}>Top Payees by Total Spend</h3>
              {topPayees.length === 0 ? (
                <p style={{ color: 'var(--text-tertiary)' }}>No payees recorded yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {topPayees.map((p, i) => (
                    <div key={p.payee} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                      <span><strong>#{i + 1}</strong> {p.payee} ({p.count} transactions)</span>
                      <span style={{ fontWeight: 700 }}>₹{p.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Report 9: Recurring */}
          {activeReport === 9 && (
            <div>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', fontWeight: 700 }}>Recurring Expenses</h3>
              {recurring.length === 0 ? (
                <p style={{ color: 'var(--text-tertiary)' }}>No recurring expenses recorded.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recurring.map(r => (
                    <div key={r.recurringId} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-secondary)', borderRadius: 8 }}>
                      <span>{r.name}</span>
                      <span style={{ fontWeight: 700 }}>Total Spent: ₹{r.totalSpent.toLocaleString()} ({r.count} payments)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
