import {
  DashboardContent,
  DashboardContentSkeleton,
} from './components/DashboardContent';
import { PageHeader } from '@/components/ui/page-header';
import { Suspense } from 'react';

/**
 * Dashboard page with Suspense boundary for data-dependent content.
 *
 * Static header renders immediately; resume hero + recent activity wait for
 * plan summaries behind the request boundary.
 */
export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title='Dashboard'
        subtitle='Pick up where the night left off'
      />

      <Suspense fallback={<DashboardContentSkeleton />}>
        <DashboardContent />
      </Suspense>
    </>
  );
}
