import { TaskListView } from '@/components/tasks/TaskListView';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Upcoming — TRACKR',
  description: 'View upcoming future tasks scheduled across your projects.',
};

export default function UpcomingPage() {
  return <TaskListView view="upcoming" title="Upcoming" />;
}
