import { FinanceCategory, CategoryDirection, DEFAULT_CATEGORIES } from '@/types/finance';
import {
  getAllCategories, getCategoryById, saveCategory, deleteCategory,
  getAllTransactions, genFinanceId, saveTransaction,
} from '@/lib/db/localDb';

export class FinanceCategoryService {

  async getAllCategories(): Promise<FinanceCategory[]> {
    return getAllCategories();
  }

  async getActiveCategories(direction?: CategoryDirection): Promise<FinanceCategory[]> {
    const all = await getAllCategories();
    return all
      .filter(c => !c.archived)
      .filter(c => !direction || c.direction === direction || c.direction === 'both')
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getCategoryById(id: string): Promise<FinanceCategory | undefined> {
    return getCategoryById(id);
  }

  /** Returns tree structure: root categories with children nested */
  async getCategoryTree(direction?: CategoryDirection): Promise<{ category: FinanceCategory; children: FinanceCategory[] }[]> {
    const all = await this.getActiveCategories(direction);
    const roots = all.filter(c => !c.parentId);
    return roots.map(root => ({
      category: root,
      children: all.filter(c => c.parentId === root.id),
    }));
  }

  async createCategory(partial: {
    name: string;
    direction: CategoryDirection;
    parentId?: string;
    icon?: string;
    color?: string;
  }): Promise<FinanceCategory> {
    const all = await getAllCategories();
    const maxOrder = all.reduce((max, c) => Math.max(max, c.sortOrder), 0);
    const now = new Date().toISOString();
    const category: FinanceCategory = {
      id: genFinanceId(),
      name: partial.name,
      direction: partial.direction,
      parentId: partial.parentId,
      icon: partial.icon,
      color: partial.color,
      sortOrder: maxOrder + 10,
      archived: false,
      isDefault: false,
      createdAt: now,
      updatedAt: now,
    };
    await saveCategory(category);
    return category;
  }

  async updateCategory(id: string, updates: Partial<Omit<FinanceCategory, 'id' | 'createdAt' | 'isDefault'>>): Promise<FinanceCategory | null> {
    const existing = await getCategoryById(id);
    if (!existing) return null;
    const updated: FinanceCategory = {
      ...existing,
      ...updates,
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await saveCategory(updated);
    return updated;
  }

  async archiveCategory(id: string): Promise<{ success: boolean; transactionCount: number }> {
    const txns = await getAllTransactions();
    const linked = txns.filter(t => t.categoryId === id);
    await this.updateCategory(id, { archived: true });
    return { success: true, transactionCount: linked.length };
  }

  async reassignCategory(fromId: string, toId: string): Promise<number> {
    const txns = await getAllTransactions();
    const toUpdate = txns.filter(t => t.categoryId === fromId);
    const now = new Date().toISOString();
    for (const t of toUpdate) {
      await saveTransaction({ ...t, categoryId: toId, updatedAt: now });
    }
    return toUpdate.length;
  }

  /** Safe delete: if transactions exist, require reassignment first */
  async deleteCategory(id: string): Promise<{ success: boolean; error?: string; transactionCount?: number }> {
    const txns = await getAllTransactions();
    const linked = txns.filter(t => t.categoryId === id);
    if (linked.length > 0) {
      return {
        success: false,
        error: `${linked.length} transaction${linked.length === 1 ? '' : 's'} use this category. Reassign them before deleting.`,
        transactionCount: linked.length,
      };
    }
    await deleteCategory(id);
    return { success: true };
  }

  /** Ensure default categories exist (idempotent) */
  async ensureDefaultCategories(): Promise<void> {
    const existing = await getAllCategories();
    const existingIds = new Set(existing.map(c => c.id));
    const now = new Date().toISOString();
    for (const cat of DEFAULT_CATEGORIES) {
      if (!existingIds.has(cat.id)) {
        await saveCategory({ ...cat, createdAt: now, updatedAt: now });
      }
    }
  }
}

export const financeCategoryService = new FinanceCategoryService();
