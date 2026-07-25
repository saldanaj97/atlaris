import {
  DashboardContent,
  DashboardContentSkeleton,
} from './components/DashboardContent';
import { Suspense } from 'react';

/**
 * Dashboard page with Suspense boundary for data-dependent content.
 *
 * Personalized header, resume hero, and activity wait for plan summaries
 * behind the request boundary.
 */
export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardContentSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}
