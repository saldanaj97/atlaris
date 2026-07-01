import {
  DashboardContent,
  DashboardContentSkeleton,
} from './components/DashboardContent';
import { PageHeader } from '@/components/ui/page-header';
import { Suspense } from 'react';

/**
 * Dashboard page with Suspense boundary for data-dependent content.
 *
 * Static elements (header with title and subtitle) render immediately.
 * ResumeLearningHero, ActivityFeedClient, ActivityFeedScoreboard, and
 * ActivityStreamSidebar wait for user plan data.
 */
export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title='Activity Feed'
        subtitle='Your learning journey with activity metrics beside the stream.'
      />

      <Suspense fallback={<DashboardContentSkeleton />}>
        <DashboardContent />
      </Suspense>
    </>
  );
}
