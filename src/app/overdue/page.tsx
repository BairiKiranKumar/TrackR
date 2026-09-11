import { TaskListView } from '@/components/tasks/TaskListView';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Overdue Tasks — TRACKR',
  description: 'View overdue tasks requiring immediate attention.',
};

export default function OverduePage() {
  return <TaskListView view="overdue" title="Overdue" />;
}
