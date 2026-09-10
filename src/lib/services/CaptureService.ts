import { CaptureProcessor, CaptureResult, Item, ItemType } from '@/types';
import { moneyDetectionService } from './MoneyDetectionService';

export class LocalCaptureProcessor implements CaptureProcessor {
  public async process(input: string, allProjects: Item[] = []): Promise<CaptureResult> {
    const raw = input.trim();
    if (!raw) {
      return {
        title: '',
        type: 'note',
        tags: [],
        inbox: true,
      };
    }

    // 1. Extract Tags (#tag)
    const tagMatches = raw.match(/#([a-zA-Z0-9_-]+)/g) ?? [];
    const tags = Array.from(new Set(tagMatches.map(t => t.slice(1).toLowerCase())));

    // 2. Extract Project mentions (@Project)
    let projectId: string | undefined;
    for (const p of allProjects) {
      const escaped = p.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`@${escaped}(?=[\\s#,\\.\\?!]|$)`, 'i');
      if (regex.test(raw)) {
        projectId = p.id;
        break;
      }
    }
    if (!projectId) {
      const projectMatches = raw.match(/@([a-zA-Z0-9_-]+)/);
      if (projectMatches && allProjects.length > 0) {
        const q = projectMatches[1].trim().toLowerCase();
        const matchedProj = allProjects.find(p => p.title.toLowerCase().includes(q));
        if (matchedProj) projectId = matchedProj.id;
      }
    }

    // 3. Heuristic Type Detection
    let detectedType: ItemType = 'note';
    const lower = raw.toLowerCase();

    if (/^(?:todo:|task:|\[\s*\])\s*/i.test(raw) || lower.includes('need to ') || lower.includes('remind me to')) {
      detectedType = 'task';
    } else if (/^(?:project:)/i.test(raw)) {
      detectedType = 'project';
    } else if (/^(?:journal:|log:)/i.test(raw)) {
      detectedType = 'journal';
    } else if (/^(?:tracker:|habit:)/i.test(raw) || lower.includes('day streak') || lower.includes('challenge')) {
      detectedType = 'tracker';
    } else if (/^(?:goal:)/i.test(raw)) {
      detectedType = 'goal';
    } else {
      // Check if financial
      const money = moneyDetectionService.detect(raw);
      if (money.length > 0 && (lower.includes('spent') || lower.includes('paid') || lower.includes('bought') || lower.includes('cost') || lower.includes('fee'))) {
        detectedType = 'expense';
      }
    }

    // 4. Clean title: remove prefix flags
    let title = raw
      .replace(/^(?:todo|task|note|journal|project|tracker|habit|expense|income|goal):\s*/i, '')
      .replace(/^\[\s*\]\s*/, '');

    // Truncate to reasonable title length if very long
    let content: string | undefined;
    if (title.length > 100) {
      const firstLineEnd = title.indexOf('\n');
      if (firstLineEnd > 0 && firstLineEnd < 100) {
        content = title.slice(firstLineEnd + 1).trim();
        title = title.slice(0, firstLineEnd).trim();
      } else {
        content = title;
        title = title.slice(0, 97) + '…';
      }
    }

    return {
      title,
      content,
      type: detectedType,
      projectId,
      tags,
      inbox: true,
      metadata: {
        inbox: true,
        capturedVia: 'quick_add',
        originalInput: raw,
        projectId,
      },
    };
  }
}

export const captureProcessor = new LocalCaptureProcessor();
export const localCaptureProcessor = captureProcessor;
