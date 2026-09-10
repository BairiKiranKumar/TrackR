import { Item, ItemRelation } from '@/types';

export function createSampleProjectDataset(): { items: Item[]; relations: ItemRelation[] } {
  const now = new Date();
  const dateStr = now.toISOString();
  const yesterday = new Date(now.getTime() - 86400000).toISOString();
  const twoDaysAgo = new Date(now.getTime() - 172800000).toISOString();

  // IDs
  const projId = 'demo-proj-youtube';
  const task1Id = 'demo-task-edit-short';
  const task2Id = 'demo-task-publish-video';
  const note1Id = 'demo-note-video-ideas';
  const note2Id = 'demo-note-thumbnail-strategy';
  const expId = 'demo-exp-microphone';
  const trackerId = 'demo-track-30-days-content';
  const goalId = 'demo-goal-10k-subscribers';

  const items: Item[] = [
    // 1. Project
    {
      id: projId,
      type: 'project',
      title: 'YouTube Channel',
      content: 'Building a developer education and tech career YouTube channel from 0 to 10k subscribers.',
      tags: ['content', 'youtube', 'growth'],
      archived: false,
      pinned: true,
      createdAt: twoDaysAgo,
      updatedAt: dateStr,
      metadata: {
        emoji: '🎥',
        color: '#EF4444',
        status: 'active',
        description: 'Developer education & tech insights channel',
      },
    },

    // 2. Tasks
    {
      id: task1Id,
      type: 'task',
      title: 'Edit Short: 5 Next.js 16 Features',
      content: 'Cut down the 3-minute recording into a 58-second punchy vertical short with captions.',
      tags: ['video', 'editing', 'nextjs'],
      archived: false,
      createdAt: yesterday,
      updatedAt: dateStr,
      metadata: {
        status: 'todo',
        priority: 'high',
        dueDate: now.toISOString().slice(0, 10),
        projectId: projId,
      },
    },
    {
      id: task2Id,
      type: 'task',
      title: 'Publish full video: Local-First Architecture',
      content: 'Schedule video release for 6 PM, add timestamps, links, and pinned comment.',
      tags: ['youtube', 'publishing'],
      archived: false,
      createdAt: yesterday,
      updatedAt: dateStr,
      metadata: {
        status: 'todo',
        priority: 'medium',
        dueDate: now.toISOString().slice(0, 10),
        projectId: projId,
      },
    },

    // 3. Notes
    {
      id: note1Id,
      type: 'note',
      title: 'Virat & Tech Video Ideas',
      content: 'Concepts for upcoming videos:\n1. Why Local-First beats Cloud-Only for personal apps\n2. Next.js 16 breaking changes and proxy migration\n3. Interview prep strategies\n\nLinked to @YouTube Channel and @Edit Short: 5 Next.js 16 Features.',
      tags: ['ideas', 'youtube', 'script'],
      archived: false,
      pinned: true,
      createdAt: twoDaysAgo,
      updatedAt: yesterday,
      metadata: {
        projectId: projId,
      },
    },
    {
      id: note2Id,
      type: 'note',
      title: 'Thumbnail & Title Strategy',
      content: 'Best performing thumbnail formulas:\n- High contrast font with 3 words max\n- Emotion or curiosity gap\n- Clean dark mode aesthetics matching developer vibes',
      tags: ['design', 'growth'],
      archived: false,
      createdAt: yesterday,
      updatedAt: yesterday,
      metadata: {
        projectId: projId,
      },
    },

    // 4. Expense
    {
      id: expId,
      type: 'expense',
      title: 'USB Microphone Setup',
      content: 'Purchased dynamic microphone and boom arm for crystal-clear voiceover recording for @YouTube Channel.',
      tags: ['hardware', 'audio', 'setup'],
      archived: false,
      createdAt: twoDaysAgo,
      updatedAt: twoDaysAgo,
      metadata: {
        amount: 2500,
        currency: 'INR',
        category: 'content_creation',
        isIncome: false,
        date: twoDaysAgo.slice(0, 10),
        projectId: projId,
      },
    },

    // 5. Tracker
    {
      id: trackerId,
      type: 'tracker',
      title: '30 Days Content Creation',
      content: 'Upload 1 short or long-form video daily for 30 consecutive days.',
      tags: ['challenge', 'consistency'],
      archived: false,
      createdAt: twoDaysAgo,
      updatedAt: dateStr,
      metadata: {
        trackerType: 'series',
        totalDays: 30,
        completedDays: [0, 1, 2],
        color: '#F59E0B',
        emoji: '🎯',
        projectId: projId,
      },
    },

    // 6. Goal
    {
      id: goalId,
      type: 'goal',
      title: '10,000 Subscribers',
      content: 'Reach 10,000 active subscribers on the channel.',
      tags: ['milestone', 'growth'],
      archived: false,
      createdAt: twoDaysAgo,
      updatedAt: dateStr,
      metadata: {
        targetAmount: 10000,
        currentAmount: 1850,
        currency: 'Subs',
        isFinancial: false,
        projectId: projId,
      },
    },
  ];

  // Bidirectional Relationships
  const relations: ItemRelation[] = [
    // Project contains tasks
    { id: 'rel-1', sourceId: projId, targetId: task1Id, relationType: 'contains', createdAt: yesterday },
    { id: 'rel-2', sourceId: projId, targetId: task2Id, relationType: 'contains', createdAt: yesterday },
    // Project contains notes
    { id: 'rel-3', sourceId: projId, targetId: note1Id, relationType: 'contains', createdAt: twoDaysAgo },
    { id: 'rel-4', sourceId: projId, targetId: note2Id, relationType: 'contains', createdAt: yesterday },
    // Project contains expense
    { id: 'rel-5', sourceId: projId, targetId: expId, relationType: 'contains', createdAt: twoDaysAgo },
    // Project contains tracker & goal
    { id: 'rel-6', sourceId: projId, targetId: trackerId, relationType: 'contains', createdAt: twoDaysAgo },
    { id: 'rel-7', sourceId: projId, targetId: goalId, relationType: 'contains', createdAt: twoDaysAgo },
    // Note references task
    { id: 'rel-8', sourceId: note1Id, targetId: task1Id, relationType: 'references', createdAt: yesterday },
  ];

  return { items, relations };
}
