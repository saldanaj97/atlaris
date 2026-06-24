import { DashboardContentSkeleton } from './components/DashboardContent';
import { PageHeader } from '@/components/ui/page-header';

export default function DashboardLoading() {
  return (
    <>
      <PageHeader
        title='Activity Feed'
        subtitle='Your learning journey, moment by moment'
      />
      <DashboardContentSkeleton />
    </>
  );
}
