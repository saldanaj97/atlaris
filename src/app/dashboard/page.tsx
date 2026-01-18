import { Suspense } from 'react';

import {
  DashboardContent,
  DashboardContentSkeleton,
} from './components/DashboardContent';

/**
 * Dashboard page with Suspense boundary for data-dependent content.
 *
 * Static elements (header with title and subtitle) render immediately.
 * ResumeLearningHero, ActivityFeedClient, and ActivityStreamSidebar wait for user plan data.
 */
export default function DashboardPage() {
  return (
    <div className="mx-auto min-h-screen max-w-7xl px-6 py-8">
      {/* Static header - renders immediately */}
      <header className="mb-6">
        <h1>Activity Feed</h1>
        <p className="subtitle">Your learning journey, moment by moment</p>
      </header>

      {/* Data-dependent content - wrapped in Suspense */}
      <Suspense fallback={<DashboardContentSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}
