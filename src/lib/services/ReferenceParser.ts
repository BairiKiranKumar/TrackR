import { Item, ItemRelation, MentionMatch, MoneyDetection } from '@/types';

// ─── @ Reference Parser ────────────────────────────────────────────────────

/**
 * Parse @mentions from text content and return matched items.
 * Matches patterns like "@BGMI Handcam" or "@JavaScript Challenge"
 */
export function parseReferences(content: string, allItems: Item[]): MentionMatch[] {
  const results: MentionMatch[] = [];
  // Match @Word or @Multi Word (up to 5 words, stops at punctuation/newline)
  const regex = /@([A-Za-z0-9₹][^\n@#]{0,60}?)(?=[\s,\.!\?;:\n]|$)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const raw = match[1].trim();
    // Try to find best matching item
    const found = findBestMatch(raw, allItems);
    if (found) {
      results.push({
        id: found.id,
        title: found.title,
        type: found.type,
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      });
    }
  }

  return results;
}

function findBestMatch(text: string, items: Item[]): Item | null {
  const lowerText = text.toLowerCase();
  // Exact match first
  let found = items.find(i => i.title.toLowerCase() === lowerText);
  if (found) return found;
  // Starts-with match
  found = items.find(i => i.title.toLowerCase().startsWith(lowerText));
  if (found) return found;
  // Contains match
  found = items.find(i => i.title.toLowerCase().includes(lowerText));
  return found ?? null;
}

/**
 * Build ItemRelation records for all @mentions found in the text.
 */
export function buildRelationsFromText(
  sourceId: string,
  content: string,
  allItems: Item[],
): ItemRelation[] {
  const mentions = parseReferences(content, allItems);
  const seen = new Set<string>();
  const relations: ItemRelation[] = [];

  for (const mention of mentions) {
    if (mention.id === sourceId) continue; // no self-reference
    if (seen.has(mention.id)) continue;
    seen.add(mention.id);

    relations.push({
      id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
      sourceId,
      targetId: mention.id,
      relationType: 'references',
      createdAt: new Date().toISOString(),
    });
  }

  return relations;
}

// ─── @ Autocomplete query ──────────────────────────────────────────────────

/**
 * Given partial text after @, return matching items sorted by relevance.
 */
export function getAtMentionSuggestions(query: string, allItems: Item[]): Item[] {
  if (!query) {
    // Show recent items
    return allItems.slice(0, 10);
  }

  const lowerQ = query.toLowerCase();
  const scored = allItems.map(item => {
    const title = item.title.toLowerCase();
    let score = 0;
    if (title === lowerQ) score = 100;
    else if (title.startsWith(lowerQ)) score = 80;
    else if (title.includes(lowerQ)) score = 60;
    // Bonus for popular types
    if (item.type === 'tracker' || item.type === 'project') score += 5;
    return { item, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(s => s.item);
}

// ─── Render references in content ─────────────────────────────────────────

/**
 * Tokenize content into segments: plain text and @reference segments.
 * Used by the note display components.
 */
export type ContentSegment =
  | { type: 'text'; text: string }
  | { type: 'mention'; itemId: string; title: string; itemType: Item['type'] };

export function tokenizeContent(content: string, allItems: Item[]): ContentSegment[] {
  const segments: ContentSegment[] = [];
  // Match @Word patterns
  const regex = /@([A-Za-z0-9₹][^\n@#]{0,60}?)(?=[\s,\.!\?;:\n]|$)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const raw = match[1].trim();
    const found = findBestMatch(raw, allItems);

    if (found) {
      // Push preceding text
      if (match.index > lastIndex) {
        segments.push({ type: 'text', text: content.slice(lastIndex, match.index) });
      }
      segments.push({ type: 'mention', itemId: found.id, title: found.title, itemType: found.type });
      lastIndex = match.index + match[0].length;
    }
  }

  if (lastIndex < content.length) {
    segments.push({ type: 'text', text: content.slice(lastIndex) });
  }

  return segments;
}
