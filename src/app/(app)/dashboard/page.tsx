import { Suspense } from 'react';

import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';

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
		<PageShell>
			<PageHeader
				title="Activity Feed"
				subtitle="Your learning journey, moment by moment"
			/>

			{/* Data-dependent content - wrapped in Suspense */}
			<Suspense fallback={<DashboardContentSkeleton />}>
				<DashboardContent />
			</Suspense>
		</PageShell>
	);
}
