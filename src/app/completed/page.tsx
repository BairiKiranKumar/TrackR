import { TaskListView } from '@/components/tasks/TaskListView';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Completed Tasks — TRACKR',
  description: 'View completed tasks history across your projects.',
};

export default function CompletedPage() {
  return <TaskListView view="completed" title="Completed" />;
}
