import { AIProvider, Item, ItemType, TaskMetadata } from '@/types';
import { localCaptureProcessor } from './CaptureService';

/**
 * Phase 1 Deterministic / Local AI Provider.
 * Zero external AI API calls. Zero paid dependencies.
 * Establishes the interface contract so Phase 2 AI capabilities can be plugged in
 * without altering UI or database service layers.
 */
export class DeterministicAIProvider implements AIProvider {
  public async classifyCapture(input: string): Promise<{ type: ItemType; tags: string[] }> {
    const res = await localCaptureProcessor.process(input);
    return { type: res.type, tags: res.tags };
  }

  public async suggestRelations(item: Item, existingItems: Item[]): Promise<{ targetId: string; reason: string }[]> {
    const suggestions: { targetId: string; reason: string }[] = [];
    const itemText = `${item.title} ${item.content ?? ''}`.toLowerCase();

    for (const other of existingItems) {
      if (other.id === item.id) continue;

      // 1. Mentions other item title
      if (other.title && itemText.includes(other.title.toLowerCase())) {
        suggestions.push({
          targetId: other.id,
          reason: `Mentions "${other.title}"`,
        });
        continue;
      }

      // 2. Shares tags
      const sharedTags = (other.tags || []).filter(t => (item.tags || []).includes(t));
      if (sharedTags.length > 0) {
        suggestions.push({
          targetId: other.id,
          reason: `Shares #${sharedTags.join(' #')}`,
        });
        continue;
      }
    }

    return suggestions.slice(0, 5);
  }

  public async summarize(items: Item[]): Promise<string> {
    const completedTasks = items.filter(
      i => i.type === 'task' && (i.metadata as TaskMetadata)?.status === 'done'
    ).length;
    const notes = items.filter(i => i.type === 'note' || i.type === 'journal').length;
    return `Summary of ${items.length} items (${completedTasks} tasks completed, ${notes} notes).`;
  }

  public async semanticSearch(query: string, items: Item[]): Promise<Item[]> {
    // Falls back to keyword search in Phase 1
    const q = query.toLowerCase();
    return items.filter(i =>
      i.title.toLowerCase().includes(q) ||
      (i.content && i.content.toLowerCase().includes(q)) ||
      i.tags.some(t => t.toLowerCase().includes(q))
    );
  }
}

export const aiProvider = new DeterministicAIProvider();
