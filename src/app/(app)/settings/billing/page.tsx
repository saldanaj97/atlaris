import type { ReactElement } from 'react';
import { Suspense } from 'react';

import { BillingCards } from '@/app/(app)/settings/billing/components/BillingCards';
import { BillingCardsSkeleton } from '@/app/(app)/settings/billing/components/BillingCardsSkeleton';
import { PageHeader } from '@/components/ui/page-header';

/**
 * Billing Settings sub-page.
 *
 * Rendered inside the shared settings layout.
 * The billing cards (Current Plan + Usage) wait for subscription and usage data.
 */
export default function BillingSettingsPage(): ReactElement {
	return (
		<>
			<PageHeader
				title="Billing"
				titleAs="h2"
				subtitle="Manage your subscription and view usage"
			/>

			<div className="grid gap-6 md:grid-cols-2">
				<Suspense fallback={<BillingCardsSkeleton />}>
					<BillingCards />
				</Suspense>
			</div>
		</>
	);
}
