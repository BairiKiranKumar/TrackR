import { FinanceLabel } from '@/types/finance';
import { getAllLabels, getLabelById, saveLabel, deleteLabel, genFinanceId } from '@/lib/db/localDb';

export class FinanceLabelService {
  async getAllLabels(): Promise<FinanceLabel[]> {
    return getAllLabels();
  }

  async getLabelById(id: string): Promise<FinanceLabel | undefined> {
    return getLabelById(id);
  }

  async createLabel(name: string, color = '#8b5cf6'): Promise<FinanceLabel> {
    const now = new Date().toISOString();
    const label: FinanceLabel = {
      id: genFinanceId(),
      name,
      color,
      createdAt: now,
      updatedAt: now,
    };
    await saveLabel(label);
    return label;
  }

  async updateLabel(id: string, updates: Partial<Pick<FinanceLabel, 'name' | 'color'>>): Promise<FinanceLabel | null> {
    const existing = await getLabelById(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, id, updatedAt: new Date().toISOString() };
    await saveLabel(updated);
    return updated;
  }

  async deleteLabel(id: string): Promise<void> {
    await deleteLabel(id);
  }
}

export const financeLabelService = new FinanceLabelService();
