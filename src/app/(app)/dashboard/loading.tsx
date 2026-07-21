import { DashboardContentSkeleton } from './components/DashboardContent';
import { PageHeader } from '@/components/ui/page-header';

export default function DashboardLoading() {
  return (
    <>
      <PageHeader
        title='Dashboard'
        subtitle='Pick up where the night left off'
      />
      <DashboardContentSkeleton />
    </>
  );
}
