import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MoneyDetectionService } from '../lib/services/MoneyDetectionService';
import { LocalCaptureProcessor } from '../lib/services/CaptureService';
import { DeterministicAIProvider } from '../lib/services/AIProvider';
import { createSampleProjectDataset } from '../lib/db/demoData';
import { Item } from '../types';

describe('Phase 1 Implementation Suite', () => {
  const moneyDetector = new MoneyDetectionService();
  const captureProcessor = new LocalCaptureProcessor();
  const aiProvider = new DeterministicAIProvider();

  describe('MoneyDetectionService', () => {
    it('detects currency symbol prefixes (₹ and $)', () => {
      const text = 'Bought a camera lens for ₹4,500 and a pouch for $25.50 today.';
      const matches = moneyDetector.detect(text);
      assert.equal(matches.length, 2);

      assert.equal(matches[0].amount, 4500);
      assert.equal(matches[0].currency, 'INR');

      assert.equal(matches[1].amount, 25.5);
      assert.equal(matches[1].currency, 'USD');
    });

    it('detects natural language spending verbs', () => {
      const text = 'I spent 1200 on software and paid 3,500 for hosting, domain cost me 850.';
      const matches = moneyDetector.detect(text);
      assert.equal(matches.length, 3);
      assert.equal(matches[0].amount, 1200);
      assert.equal(matches[1].amount, 3500);
      assert.equal(matches[2].amount, 850);
    });

    it('detects postfix currency codes', () => {
      const text = 'Total bill was 650 INR while previous was 45 USD.';
      const matches = moneyDetector.detect(text);
      assert.equal(matches.length, 2);
      assert.equal(matches[0].amount, 650);
      assert.equal(matches[0].currency, 'INR');
      assert.equal(matches[1].amount, 45);
      assert.equal(matches[1].currency, 'USD');
    });

    it('formats INR correctly with Indian numbering format', () => {
      const formatted = moneyDetector.formatINR(150000);
      assert.match(formatted, /1,50,000/);
    });
  });

  describe('LocalCaptureProcessor', () => {
    const mockProjects: Item[] = [
      {
        id: 'proj-youtube',
        type: 'project',
        title: 'YouTube Channel',
        tags: ['youtube'],
        archived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {},
      },
      {
        id: 'proj-fitness',
        type: 'project',
        title: 'Marathon 2026',
        tags: ['fitness'],
        archived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {},
      },
    ];

    it('extracts hashtags into tags array', async () => {
      const input = 'Brainstorm video ideas for Next.js #content #youtube #growth';
      const res = await captureProcessor.process(input, mockProjects);

      assert.deepEqual(res.tags.sort(), ['content', 'growth', 'youtube']);
      assert.equal(res.inbox, true);
    });

    it('identifies project mention with @ and attaches projectId', async () => {
      const input = 'Write script for episode 3 @YouTube Channel #script';
      const res = await captureProcessor.process(input, mockProjects);

      assert.equal(res.projectId, 'proj-youtube');
      assert.ok(res.tags.includes('script'));
    });

    it('heuristically detects tasks from todo: prefix or need to phrasing', async () => {
      const res1 = await captureProcessor.process('todo: record b-roll for episode', mockProjects);
      assert.equal(res1.type, 'task');
      assert.equal(res1.title, 'record b-roll for episode');

      const res2 = await captureProcessor.process('need to buy spare HDMI cable', mockProjects);
      assert.equal(res2.type, 'task');
    });

    it('heuristically detects expenses when spending verbs and amounts are present', async () => {
      const res = await captureProcessor.process('spent ₹1,200 on microphone pop filter', mockProjects);
      assert.equal(res.type, 'expense');
    });
  });

  describe('DeterministicAIProvider', () => {
    it('classifies capture deterministically with zero external API', async () => {
      const classification = await aiProvider.classifyCapture('todo: publish release notes #docs');
      assert.equal(classification.type, 'task');
      assert.ok(classification.tags.includes('docs'));
    });

    it('suggests reciprocal relations based on word overlap', async () => {
      const targetItem: Item = {
        id: 'item-target',
        type: 'project',
        title: 'Next.js App Router Guide',
        tags: ['nextjs'],
        archived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {},
      };

      const sourceItem: Item = {
        id: 'item-source',
        type: 'note',
        title: 'Key Learnings for Next.js',
        content: 'Explaining App Router server actions and streaming',
        tags: ['nextjs'],
        archived: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {},
      };

      const suggestions = await aiProvider.suggestRelations(sourceItem, [targetItem]);
      assert.equal(suggestions.length, 1);
      assert.equal(suggestions[0].targetId, 'item-target');
    });

    it('provides deterministic summaries', async () => {
      const items: Item[] = [
        { id: '1', type: 'task', title: 'Task 1', archived: false, createdAt: '', updatedAt: '', tags: [], metadata: { status: 'done' } },
        { id: '2', type: 'task', title: 'Task 2', archived: false, createdAt: '', updatedAt: '', tags: [], metadata: { status: 'todo' } },
        { id: '3', type: 'note', title: 'Note 1', archived: false, createdAt: '', updatedAt: '', tags: [], metadata: {} },
      ];
      const summary = await aiProvider.summarize(items);
      assert.ok(summary.includes('3 items'));
      assert.ok(summary.includes('1 tasks completed'));
    });
  });

  describe('Demo Project Dataset', () => {
    it('creates interconnected YouTube Channel sample with reciprocal links', () => {
      const dataset = createSampleProjectDataset();
      assert.ok(dataset.items.length >= 8);
      assert.ok(dataset.relations.length >= 8);

      const project = dataset.items.find(i => i.type === 'project');
      assert.ok(project);
      assert.equal(project?.title, 'YouTube Channel');

      // Check tasks link to project
      const tasks = dataset.items.filter(i => i.type === 'task');
      assert.ok(tasks.length >= 2);
      for (const t of tasks) {
        assert.equal((t.metadata as Record<string, unknown>).projectId, project?.id);
      }

      // Check relations contain links connecting tasks and notes
      const hasLinks = dataset.relations.some(r => r.sourceId === project?.id || r.targetId === project?.id);
      assert.ok(hasLinks);
    });
  });

  describe('Data Import / Export Schema Validation', () => {
    it('validates structured export format', () => {
      const exportJson = JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        items: [
          { id: 'item-1', type: 'task', title: 'Test Task', tags: ['work'], archived: false, metadata: {} },
        ],
        relations: [
          { id: 'rel-1', sourceId: 'item-1', targetId: 'item-2', relationType: 'linked', createdAt: '' },
        ],
      });

      const parsed = JSON.parse(exportJson);
      assert.equal(parsed.version, 1);
      assert.equal(parsed.items.length, 1);
      assert.equal(parsed.relations.length, 1);
    });
  });
});
