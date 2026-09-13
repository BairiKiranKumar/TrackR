'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, X } from 'lucide-react';
import { FinanceInvestment, InvestmentAssetType } from '@/types/finance';
import { financeInvestmentService } from '@/lib/services/finance/FinanceInvestmentService';

export default function InvestmentsPage() {
  const [portfolio, setPortfolio] = useState<{
    totalInvested: number;
    currentValue: number;
    gainLoss: number;
    gainLossPercent: number;
    investments: FinanceInvestment[];
  }>({ totalInvested: 0, currentValue: 0, gainLoss: 0, gainLossPercent: 0, investments: [] });

  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  // New investment form state
  const [assetName, setAssetName] = useState('');
  const [assetType, setAssetType] = useState<InvestmentAssetType>('stock');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');

  const loadData = useCallback(async () => {
    try {
      const summary = await financeInvestmentService.getPortfolioSummary();
      setPortfolio(summary);
    } catch (err) {
      console.error('Failed to load investment portfolio:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    financeInvestmentService.getPortfolioSummary().then(summary => {
      if (!ignore) {
        setPortfolio(summary);
        setLoading(false);
      }
    }).catch(err => {
      console.error('Failed to load investment portfolio:', err);
      if (!ignore) setLoading(false);
    });
    return () => { ignore = true; };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const q = parseFloat(quantity);
    const p = parseFloat(price);
    if (!assetName.trim() || isNaN(q) || q <= 0 || isNaN(p) || p <= 0) return;

    await financeInvestmentService.createInvestment({
      name: assetName.trim(),
      assetType,
      quantity: q,
      averagePrice: p,
      currentPrice: p,
    });

    setAssetName('');
    setQuantity('');
    setPrice('');
    setShowModal(false);
    await loadData();
  }

  const isProfitable = portfolio.gainLoss >= 0;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/money" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}>
            <ArrowLeft size={18} />
          </Link>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            Investments Portfolio
          </h1>
        </div>

        <button className="btn btn-primary" onClick={() => setShowModal(true)} id="btn-add-investment">
          <Plus size={16} />
          <span>Add Asset</span>
        </button>
      </div>

      {/* Portfolio Summary Card */}
      <div
        style={{
          background: 'var(--bg-card, #131317)',
          border: '1px solid var(--border-default, rgba(255,255,255,0.1))',
          borderRadius: 20,
          padding: 24,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
        }}
      >
        <div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Portfolio Value</span>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            ₹{portfolio.currentValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Total Invested</span>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            ₹{portfolio.totalInvested.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Total Returns</span>
          <div
            style={{
              fontSize: '1.8rem',
              fontWeight: 800,
              color: isProfitable ? 'var(--color-success, #10b981)' : 'var(--color-danger, #ef4444)',
            }}
          >
            {isProfitable ? '+' : ''}₹{portfolio.gainLoss.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span style={{ fontSize: '0.9rem', fontWeight: 600, marginLeft: 8 }}>
              ({portfolio.gainLossPercent.toFixed(2)}%)
            </span>
          </div>
        </div>
      </div>

      {/* Asset List */}
      <div>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 14 }}>Assets ({portfolio.investments.length})</h3>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)' }}>
            <p>Loading investment portfolio...</p>
          </div>
        ) : portfolio.investments.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)' }}>
            <p>No investments tracked yet. Add your stocks, mutual funds, gold, or crypto assets!</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {portfolio.investments.map(inv => {
              const invested = inv.quantity * inv.averagePrice;
              const current = inv.quantity * inv.currentPrice;
              const diff = current - invested;
              const pct = invested > 0 ? (diff / invested) * 100 : 0;
              const gain = diff >= 0;
              return (
                <div
                  key={inv.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px 20px',
                    background: 'var(--bg-card, #131317)',
                    border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
                    borderRadius: 14,
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                      {inv.name}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                      {inv.assetType.toUpperCase()} • {inv.quantity} units @ ₹{inv.averagePrice.toLocaleString()} avg
                    </span>
                  </div>

                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                      ₹{current.toLocaleString()}
                    </span>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: gain ? 'var(--color-success)' : 'var(--color-danger)' }}>
                      {gain ? '+' : ''}₹{diff.toLocaleString()} ({pct.toFixed(2)}%)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 16,
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            style={{
              background: 'var(--bg-card)',
              padding: 24,
              borderRadius: 16,
              border: '1px solid var(--border-default)',
              maxWidth: 440,
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>Add Investment</h3>
              <button className="btn btn-icon btn-ghost" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Asset Name</label>
                <input
                  type="text"
                  placeholder="e.g. NIFTY 50 Index, Apple Inc, Gold ETF"
                  value={assetName}
                  onChange={e => setAssetName(e.target.value)}
                  className="input"
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Asset Type</label>
                <select
                  value={assetType}
                  onChange={e => setAssetType(e.target.value as InvestmentAssetType)}
                  className="input"
                >
                  <option value="stock">Stock / Equity</option>
                  <option value="mutual_fund">Mutual Fund</option>
                  <option value="etf">ETF</option>
                  <option value="crypto">Crypto</option>
                  <option value="bond">Bond</option>
                  <option value="fd">Fixed Deposit (FD)</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Quantity</label>
                <input
                  type="number"
                  step="any"
                  placeholder="10"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  className="input"
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Purchase Price (₹)</label>
                <input
                  type="number"
                  step="any"
                  placeholder="250.00"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  className="input"
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Asset</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
