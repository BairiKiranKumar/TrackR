import { FinanceInvestment, InvestmentAssetType, InvestmentTransaction, DEFAULT_CURRENCY } from '@/types/finance';
import { getAllInvestments, getInvestmentById, saveInvestment, deleteInvestment, genFinanceId } from '@/lib/db/localDb';

export class FinanceInvestmentService {

  async getAllInvestments(): Promise<FinanceInvestment[]> {
    const all = await getAllInvestments();
    return all.filter(i => !i.archived);
  }

  async getInvestmentById(id: string): Promise<FinanceInvestment | undefined> {
    return getInvestmentById(id);
  }

  async createInvestment(partial: {
    name: string;
    ticker?: string;
    assetType: InvestmentAssetType;
    accountId?: string;
    currency?: string;
    quantity?: number;
    averagePrice?: number;
    currentPrice?: number;
    notes?: string;
  }): Promise<FinanceInvestment> {
    const now = new Date().toISOString();
    const qty = partial.quantity ?? 0;
    const price = partial.averagePrice ?? 0;
    const investment: FinanceInvestment = {
      id: genFinanceId(),
      name: partial.name,
      ticker: partial.ticker,
      assetType: partial.assetType,
      accountId: partial.accountId,
      currency: partial.currency ?? DEFAULT_CURRENCY,
      quantity: qty,
      averagePrice: price,
      currentPrice: partial.currentPrice ?? price,
      transactions: qty > 0 && price > 0 ? [{
        id: genFinanceId(),
        date: now.slice(0, 10),
        type: 'buy',
        quantity: qty,
        price,
        fees: 0,
        createdAt: now,
      }] : [],
      notes: partial.notes,
      archived: false,
      createdAt: now,
      updatedAt: now,
    };
    await saveInvestment(investment);
    return investment;
  }

  async addTransaction(investmentId: string, txn: {
    type: InvestmentTransaction['type'];
    quantity: number;
    price: number;
    fees?: number;
    date?: string;
    note?: string;
  }): Promise<FinanceInvestment | null> {
    const investment = await getInvestmentById(investmentId);
    if (!investment) return null;

    const now = new Date().toISOString();
    const newTxn: InvestmentTransaction = {
      id: genFinanceId(),
      date: txn.date ?? now.slice(0, 10),
      type: txn.type,
      quantity: txn.quantity,
      price: txn.price,
      fees: txn.fees ?? 0,
      note: txn.note,
      createdAt: now,
    };

    const updatedTransactions = [...investment.transactions, newTxn];

    // Recalculate quantity and average price
    let totalQty = 0;
    let totalCost = 0;
    for (const t of updatedTransactions) {
      if (t.type === 'buy') {
        totalQty += t.quantity;
        totalCost += t.quantity * t.price + t.fees;
      } else if (t.type === 'sell') {
        totalQty -= t.quantity;
        // Note: we keep totalCost unchanged (FIFO/average cost approach)
      }
    }
    const avgPrice = totalQty > 0 ? totalCost / totalQty : 0;

    const updated: FinanceInvestment = {
      ...investment,
      transactions: updatedTransactions,
      quantity: totalQty,
      averagePrice: avgPrice,
      updatedAt: now,
    };

    await saveInvestment(updated);
    return updated;
  }

  async updateCurrentPrice(investmentId: string, currentPrice: number): Promise<FinanceInvestment | null> {
    const investment = await getInvestmentById(investmentId);
    if (!investment) return null;
    const updated = {
      ...investment,
      currentPrice,
      currentPriceUpdatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveInvestment(updated);
    return updated;
  }

  async updateInvestment(id: string, updates: Partial<Omit<FinanceInvestment, 'id' | 'createdAt' | 'transactions'>>): Promise<FinanceInvestment | null> {
    const existing = await getInvestmentById(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
    await saveInvestment(updated);
    return updated;
  }

  async archiveInvestment(id: string): Promise<FinanceInvestment | null> {
    return this.updateInvestment(id, { archived: true });
  }

  async deleteInvestment(id: string): Promise<void> {
    await deleteInvestment(id);
  }

  /** Portfolio summary: total invested, current value, gain/loss */
  async getPortfolioSummary(): Promise<{
    totalInvested: number;
    currentValue: number;
    gainLoss: number;
    gainLossPercent: number;
    investments: FinanceInvestment[];
    lastUpdated?: string;
  }> {
    const investments = await this.getAllInvestments();

    let totalInvested = 0;
    let currentValue = 0;
    let lastUpdated: string | undefined;

    for (const inv of investments) {
      const invested = inv.quantity * inv.averagePrice;
      const current = inv.quantity * inv.currentPrice;
      totalInvested += invested;
      currentValue += current;

      if (inv.currentPriceUpdatedAt && (!lastUpdated || inv.currentPriceUpdatedAt > lastUpdated)) {
        lastUpdated = inv.currentPriceUpdatedAt;
      }
    }

    const gainLoss = currentValue - totalInvested;
    const gainLossPercent = totalInvested > 0 ? (gainLoss / totalInvested) * 100 : 0;

    return { totalInvested, currentValue, gainLoss, gainLossPercent, investments, lastUpdated };
  }
}

export const financeInvestmentService = new FinanceInvestmentService();
