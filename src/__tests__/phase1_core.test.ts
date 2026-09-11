import 'fake-indexeddb/auto';
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Node navigator mock for online state
const nav = globalThis.navigator as unknown as { onLine: boolean };
if (typeof nav === 'object' && nav !== null) {
  Object.defineProperty(nav, 'onLine', { value: true, writable: true, configurable: true });
} else {
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, writable: true, configurable: true });
}

import { dataService } from '../lib/services/DataService';
import { clearAllData } from '../lib/db/localDb';
import { TaskMetadata, TrackerMetadata, TaskRecurrence } from '../types';

describe('Phase 1 — Core UX & Data Lifecycle Suite', () => {
  beforeEach(async () => {
    await clearAllData();
  });

  // ─── STEP 2: Inbox Bulk Processing ───────────────────────────────────────
  describe('Inbox Bulk Processing', () => {
    it('supports bulk project assignment, tag manipulation, archive, and delete with relation cleanup', async () => {
      // 1. Create a project and 3 inbox items
      const project = await dataService.createItem({
        type: 'project',
        title: 'Q3 Mobile Launch',
        metadata: { status: 'active' },
      });

      const item1 = await dataService.createItem({ type: 'task', title: 'Task 1', tags: ['work'], metadata: {} });
      const item2 = await dataService.createItem({ type: 'task', title: 'Task 2', tags: ['personal'], metadata: {} });
      const item3 = await dataService.createItem({ type: 'note', title: 'Note 3', tags: ['draft'], metadata: {} });

      // Link item1 and item2 with a relation to test cleanup later
      await dataService.linkItems(item1.id, item2.id, 'related_to');

      // 2. Bulk assign project
      await dataService.bulkAssignProject([item1.id, item2.id], project.id);

      const refreshed1 = await dataService.getItemById(item1.id);
      const refreshed2 = await dataService.getItemById(item2.id);
      assert.equal((refreshed1?.metadata as Record<string, unknown>).projectId, project.id);
      assert.equal((refreshed2?.metadata as Record<string, unknown>).projectId, project.id);

      // Verify project context finds them
      const ctx = await dataService.getProjectContext(project.id);
      assert.ok(ctx);
      assert.equal(ctx.tasks.length, 2);

      // 3. Bulk add tags
      await dataService.bulkAddTags([item1.id, item2.id, item3.id], ['launch-ready', 'priority']);
      const tagged1 = await dataService.getItemById(item1.id);
      assert.ok(tagged1?.tags.includes('launch-ready'));
      assert.ok(tagged1?.tags.includes('priority'));
      assert.ok(tagged1?.tags.includes('work'));

      // 4. Bulk remove tags
      await dataService.bulkRemoveTags([item1.id, item2.id], ['priority']);
      const untagged1 = await dataService.getItemById(item1.id);
      assert.ok(!untagged1?.tags.includes('priority'));
      assert.ok(untagged1?.tags.includes('launch-ready'));

      // 5. Bulk archive
      await dataService.bulkArchive([item3.id]);
      const archived3 = await dataService.getItemById(item3.id);
      assert.equal(archived3?.archived, true);

      // 6. Bulk delete with relation cleanup
      const relationsBefore = await dataService.getBacklinks(item2.id);
      assert.equal(relationsBefore.length, 1);

      await dataService.bulkDelete([item1.id]);
      const deleted1 = await dataService.getItemById(item1.id);
      assert.ok(!deleted1);

      // Relations pointing to/from deleted item1 should be cleanly purged
      const relationsAfter = await dataService.getBacklinks(item2.id);
      assert.equal(relationsAfter.length, 0);
    });
  });

  // ─── STEP 3, 4, 5: Task Model, Dates & Views ──────────────────────────────
  describe('Task Model, Dates & Views', () => {
    it('supports full lifecycle statuses, priorities, dates, and view aggregations', async () => {
      const todayStr = new Date().toISOString().slice(0, 10);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().slice(0, 10);

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10);

      // Create tasks with different statuses, priorities, and dates
      const taskToday = await dataService.createItem({
        type: 'task',
        title: 'Review quarterly goals',
        metadata: {
          status: 'todo',
          priority: 'urgent',
          dueDate: `${todayStr}T18:00:00.000Z`,
        } as TaskMetadata,
      });

      const taskOverdue = await dataService.createItem({
        type: 'task',
        title: 'Submit compliance report',
        metadata: {
          status: 'in_progress',
          priority: 'high',
          dueDate: `${yesterdayStr}T10:00:00.000Z`,
        } as TaskMetadata,
      });

      const taskUpcoming = await dataService.createItem({
        type: 'task',
        title: 'Plan sprint',
        metadata: {
          status: 'todo',
          priority: 'medium',
          dueDate: `${tomorrowStr}T09:00:00.000Z`,
        } as TaskMetadata,
      });

      const taskCompleted = await dataService.createItem({
        type: 'task',
        title: 'Finish onboarding',
        metadata: {
          status: 'done',
          priority: 'low',
          completedAt: new Date().toISOString(),
        } as TaskMetadata,
      });

      // Verify /today view: should include tasks due today and overdue tasks
      const todayTasks = await dataService.getTasksByView('today');
      const todayIds = todayTasks.map(t => t.id);
      assert.ok(todayIds.includes(taskToday.id));
      assert.ok(todayIds.includes(taskOverdue.id));
      assert.ok(!todayIds.includes(taskUpcoming.id));

      // Verify /overdue view: only incomplete tasks with due dates in past
      const overdueTasks = await dataService.getTasksByView('overdue');
      const overdueIds = overdueTasks.map(t => t.id);
      assert.ok(overdueIds.includes(taskOverdue.id));
      assert.ok(!overdueIds.includes(taskToday.id));

      // Verify /upcoming view: only future incomplete tasks
      const upcomingTasks = await dataService.getTasksByView('upcoming');
      const upcomingIds = upcomingTasks.map(t => t.id);
      assert.ok(upcomingIds.includes(taskUpcoming.id));
      assert.ok(!upcomingIds.includes(taskToday.id));

      // Verify /completed view
      const completedTasks = await dataService.getTasksByView('completed');
      const completedIds = completedTasks.map(t => t.id);
      assert.ok(completedIds.includes(taskCompleted.id));
      assert.ok(!completedIds.includes(taskToday.id));
    });

    it('handles start date without due date, and start date with due date safely', async () => {
      const taskWithStartOnly = await dataService.createItem({
        type: 'task',
        title: 'Research architecture',
        metadata: {
          status: 'todo',
          startDate: '2026-09-01T00:00:00.000Z',
        } as TaskMetadata,
      });

      const taskBoth = await dataService.createItem({
        type: 'task',
        title: 'Build feature',
        metadata: {
          status: 'todo',
          startDate: '2026-09-01T00:00:00.000Z',
          dueDate: '2026-09-15T00:00:00.000Z',
        } as TaskMetadata,
      });

      const meta1 = taskWithStartOnly.metadata as TaskMetadata;
      const meta2 = taskBoth.metadata as TaskMetadata;
      assert.equal(meta1.startDate, '2026-09-01T00:00:00.000Z');
      assert.equal(meta1.dueDate, undefined);
      assert.equal(meta2.startDate, '2026-09-01T00:00:00.000Z');
      assert.equal(meta2.dueDate, '2026-09-15T00:00:00.000Z');
    });
  });

  // ─── STEP 6: Task Recurrence ─────────────────────────────────────────────
  describe('Deterministic Task Recurrence', () => {
    it('generates the next occurrence on task completion without uncontrolled duplicates', async () => {
      const baseDueDate = '2026-09-10T12:00:00.000Z';
      const recurringTask = await dataService.createItem({
        type: 'task',
        title: 'Take daily medication',
        metadata: {
          status: 'todo',
          recurrence: 'daily' as unknown as TaskRecurrence,
          dueDate: baseDueDate,
        } as TaskMetadata,
      });

      // Complete the current occurrence
      await dataService.completeTask(recurringTask.id);

      // Verify original task is marked done
      const completed = await dataService.getItemById(recurringTask.id);
      assert.equal((completed?.metadata as TaskMetadata).status, 'done');

      // Verify next occurrence was generated
      const allTasks = await dataService.getItemsByType('task');
      const nextTask = allTasks.find(t => t.id !== recurringTask.id && t.title === 'Take daily medication');
      assert.ok(nextTask, 'Next recurring task should be created');
      const nextMeta = nextTask.metadata as TaskMetadata;
      assert.equal(nextMeta.status, 'todo');
      assert.equal(nextMeta.recurrence, 'daily');
      assert.ok(nextMeta.dueDate?.startsWith('2026-09-11'), `Due date should be 2026-09-11, got ${nextMeta.dueDate}`);

      // Completing the original task a second time should NOT generate duplicate
      await dataService.completeTask(recurringTask.id);
      const afterSecondCall = await dataService.getItemsByType('task');
      const matching = afterSecondCall.filter(t => t.title === 'Take daily medication');
      assert.equal(matching.length, 2, 'Should not create duplicate occurrences');
    });

    it('supports weekly and monthly recurrence', async () => {
      const weeklyTask = await dataService.createItem({
        type: 'task',
        title: 'Weekly sync notes',
        metadata: {
          status: 'todo',
          recurrence: 'weekly' as unknown as TaskRecurrence,
          dueDate: '2026-09-01T10:00:00.000Z',
        } as TaskMetadata,
      });

      await dataService.completeTask(weeklyTask.id);
      const allTasks = await dataService.getItemsByType('task');
      const nextWeekly = allTasks.find(t => t.id !== weeklyTask.id && t.title === 'Weekly sync notes');
      assert.ok(nextWeekly);
      assert.ok((nextWeekly.metadata as TaskMetadata).dueDate?.startsWith('2026-09-08'));
    });
  });

  // ─── STEP 7: Task Dependencies & Cycle Prevention ────────────────────────
  describe('Task Dependencies & Circular Dependency Prevention', () => {
    it('manages task dependencies via ItemRelation and blocks/unblocks tasks', async () => {
      const taskA = await dataService.createItem({ type: 'task', title: 'Deploy to Prod', metadata: {} });
      const taskB = await dataService.createItem({ type: 'task', title: 'Pass QA tests', metadata: {} });

      // Task A depends on Task B
      await dataService.addTaskDependency(taskA.id, taskB.id);

      const depsA = await dataService.getTaskDependencies(taskA.id);
      assert.equal(depsA.blockedBy.length, 1);
      assert.equal(depsA.blockedBy[0].id, taskB.id);

      const depsB = await dataService.getTaskDependencies(taskB.id);
      assert.equal(depsB.blocking.length, 1);
      assert.equal(depsB.blocking[0].id, taskA.id);

      // Remove dependency
      await dataService.removeTaskDependency(taskA.id, taskB.id);
      const depsAfter = await dataService.getTaskDependencies(taskA.id);
      assert.equal(depsAfter.blockedBy.length, 0);
    });

    it('rejects self-dependencies and detects circular dependency chains', async () => {
      const taskA = await dataService.createItem({ type: 'task', title: 'Task A', metadata: {} });
      const taskB = await dataService.createItem({ type: 'task', title: 'Task B', metadata: {} });
      const taskC = await dataService.createItem({ type: 'task', title: 'Task C', metadata: {} });

      // 1. Self dependency must be rejected
      await assert.rejects(
        async () => {
          await dataService.addTaskDependency(taskA.id, taskA.id);
        },
        /cannot depend on itself/i
      );

      // 2. Chain: A depends on B, B depends on C
      await dataService.addTaskDependency(taskA.id, taskB.id);
      await dataService.addTaskDependency(taskB.id, taskC.id);

      // 3. Attempting C depends on A would form a cycle: A -> B -> C -> A
      await assert.rejects(
        async () => {
          await dataService.addTaskDependency(taskC.id, taskA.id);
        },
        /circular dependency detected/i
      );
    });
  });

  // ─── STEP 8, 9, 10: Projects as Context Containers ────────────────────────
  describe('Projects as Context Containers, Progress & Activity', () => {
    it('calculates real progress percentage and unblocked next actions', async () => {
      const project = await dataService.createItem({
        type: 'project',
        title: 'TRACKR v2 Launch',
        metadata: { status: 'active' },
      });

      // Initially 0 tasks: progressPercentage must be null ("No tasks yet")
      let ctx = await dataService.getProjectContext(project.id);
      assert.ok(ctx);
      assert.equal(ctx.progressPercentage, null);
      assert.equal(ctx.nextActions.length, 0);

      // Add 2 tasks to project
      const task1 = await dataService.createItem({
        type: 'task',
        title: 'Design tokens',
        metadata: { status: 'done', projectId: project.id } as TaskMetadata,
      });
      const task2 = await dataService.createItem({
        type: 'task',
        title: 'Component library',
        metadata: { status: 'todo', projectId: project.id } as TaskMetadata,
      });

      await dataService.linkItems(task1.id, project.id, 'child');
      await dataService.linkItems(task2.id, project.id, 'child');

      ctx = await dataService.getProjectContext(project.id);
      assert.ok(ctx);
      // 1 of 2 done -> 50%
      assert.equal(ctx.completedTasksCount, 1);
      assert.equal(ctx.tasks.length, 2);
      assert.equal(ctx.progressPercentage, 50);
      assert.equal(ctx.nextActions.length, 1);
      assert.equal(ctx.nextActions[0].id, task2.id);

      // If task2 is blocked by an incomplete task3, task2 is NOT in nextActions
      const task3 = await dataService.createItem({
        type: 'task',
        title: 'Design specs approval',
        metadata: { status: 'todo', projectId: project.id } as TaskMetadata,
      });
      await dataService.linkItems(task3.id, project.id, 'child');
      await dataService.addTaskDependency(task2.id, task3.id);

      ctx = await dataService.getProjectContext(project.id);
      assert.ok(ctx);
      // task3 is unblocked, task2 is blocked by task3
      assert.equal(ctx.nextActions.length, 1);
      assert.equal(ctx.nextActions[0].id, task3.id);
    });
  });

  // ─── STEP 11, 12, 13, 14: Trackers ───────────────────────────────────────
  describe('Trackers: Numeric, Boolean, Duration, Stats, Trends & Goals', () => {
    it('supports numeric, boolean, and duration tracker entries and calculates statistics', async () => {
      // 1. Numeric tracker
      const weightTracker = await dataService.createItem({
        type: 'tracker',
        title: 'Weight',
        metadata: {
          trackerType: 'numeric',
          unit: 'kg',
          target: 70,
        } as TrackerMetadata,
      });

      await dataService.addTrackerEntry(weightTracker.id, { date: '2026-09-08', value: 74.5 });
      await dataService.addTrackerEntry(weightTracker.id, { date: '2026-09-09', value: 74.2 });
      await dataService.addTrackerEntry(weightTracker.id, { date: '2026-09-10', value: 73.9 });

      const entries = await dataService.getTrackerEntries(weightTracker.id);
      assert.equal(entries.length, 3);
      assert.equal(entries[0].value, 73.9); // sorted descending by date

      const stats = await dataService.getTrackerStats(weightTracker.id);
      assert.ok(stats);
      assert.equal(stats.latestValue, 73.9);
      assert.equal(stats.minValue, 73.9);
      assert.equal(stats.maxValue, 74.5);
      // Downward trend from 74.5 to 73.9
      assert.equal(stats.trend, 'down');

      // 2. Goal connection
      const fitnessGoal = await dataService.createItem({
        type: 'goal',
        title: 'Reach 70kg Goal Weight',
        metadata: { targetAmount: 70 },
      });

      await dataService.connectTrackerToGoal(weightTracker.id, fitnessGoal.id);
      const updatedTracker = await dataService.getItemById(weightTracker.id);
      assert.equal((updatedTracker?.metadata as TrackerMetadata).goalId, fitnessGoal.id);

      // Verify backlink/relation
      const blinks = await dataService.getBacklinks(fitnessGoal.id);
      assert.ok(blinks.some(b => b.item.id === weightTracker.id));
    });

    it('deletes tracker entry and updates statistics safely', async () => {
      const readTracker = await dataService.createItem({
        type: 'tracker',
        title: 'Reading Duration',
        metadata: {
          trackerType: 'duration',
          unit: 'min',
        } as TrackerMetadata,
      });

      await dataService.addTrackerEntry(readTracker.id, { date: '2026-09-01', value: 30 });
      await dataService.addTrackerEntry(readTracker.id, { date: '2026-09-02', value: 45 });

      await dataService.deleteTrackerEntry(readTracker.id, '2026-09-01');
      const entries = await dataService.getTrackerEntries(readTracker.id);
      assert.equal(entries.length, 1);
      assert.equal(entries[0].date, '2026-09-02');
    });
  });

  // ─── STEP 18, 19: Cross-type Search & Context Recovery ───────────────────
  describe('Cross-type Search & Context Recovery', () => {
    it('searches across all entity types with partial, case-insensitive matches', async () => {
      await dataService.createItem({ type: 'project', title: 'Goa Vacation 2026', metadata: {} });
      await dataService.createItem({ type: 'note', title: 'Goa Hotel Recommendations', content: 'Beachfront villa', metadata: {} });
      await dataService.createItem({ type: 'task', title: 'Book Goa flights', tags: ['travel'], metadata: {} });
      await dataService.createItem({ type: 'tracker', title: 'Goa Budget Tracking', metadata: { trackerType: 'numeric' } });
      await dataService.createItem({ type: 'goal', title: 'Save for Goa Trip', metadata: { targetAmount: 50000 } });

      const results = await dataService.search('goa');
      assert.equal(results.length, 5);

      const types = new Set(results.map(r => r.type));
      assert.ok(types.has('project'));
      assert.ok(types.has('note'));
      assert.ok(types.has('task'));
      assert.ok(types.has('tracker'));
      assert.ok(types.has('goal'));
    });
  });

  // ─── STEP 20: Complete E2E Journey ────────────────────────────────────────
  describe('E2E Journey: Capture → Inbox → Organize → Convert → Complete → Context', () => {
    it('executes the complete workflow end-to-end', async () => {
      // 1. CAPTURE into Inbox
      const capturedItem = await dataService.createItem({
        type: 'task',
        title: 'Finalize quarterly report #finance',
        content: 'Review balance sheet and tax projections',
        tags: ['finance'],
        metadata: { status: 'inbox' } as TaskMetadata,
      });
      assert.ok(capturedItem.id);

      // 2. ORGANIZE: Assign to project
      const project = await dataService.createItem({
        type: 'project',
        title: 'Quarterly Finance Closing',
        metadata: { status: 'active' },
      });

      await dataService.bulkAssignProject([capturedItem.id], project.id);

      // 3. CONVERT TO TASK & SET DUE DATE
      await dataService.updateItem(capturedItem.id, {
        metadata: {
          status: 'todo',
          priority: 'high',
          dueDate: new Date().toISOString(),
          projectId: project.id,
        } as TaskMetadata,
      });

      // Verify project progress is at 0%
      let projCtx = await dataService.getProjectContext(project.id);
      assert.ok(projCtx);
      assert.equal(projCtx.completedTasksCount, 0);
      assert.equal(projCtx.tasks.length, 1);
      assert.equal(projCtx.progressPercentage, 0);

      // 4. COMPLETE TASK
      await dataService.completeTask(capturedItem.id);

      // 5. PROJECT PROGRESS UPDATES
      projCtx = await dataService.getProjectContext(project.id);
      assert.ok(projCtx);
      assert.equal(projCtx.completedTasksCount, 1);
      assert.equal(projCtx.progressPercentage, 100);

      // 6. SEARCH PROJECT & VIEW CONNECTED CONTEXT
      const searchResults = await dataService.search('Quarterly Finance');
      assert.ok(searchResults.length > 0);
      const foundProject = searchResults.find(r => r.id === project.id);
      assert.ok(foundProject);

      const recoveredContext = await dataService.getProjectContext(foundProject.id);
      assert.ok(recoveredContext);
      assert.equal(recoveredContext.tasks.length, 1);
      assert.equal(recoveredContext.tasks[0].title, 'Finalize quarterly report #finance');
    });
  });
});
