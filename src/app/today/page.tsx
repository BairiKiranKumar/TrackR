import { TaskListView } from '@/components/tasks/TaskListView';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Today — TRACKR',
  description: 'View tasks due today, overdue tasks, and work in progress.',
};

export default function TodayPage() {
  return <TaskListView view="today" title="Today" />;
}
