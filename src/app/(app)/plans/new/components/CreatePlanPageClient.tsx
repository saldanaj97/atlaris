'use client';

import type React from 'react';
import { ManualCreatePanel } from '@/app/(app)/plans/new/components/ManualCreatePanel';

export function CreatePlanPageClient(): React.ReactElement {
	return (
		<>
			<div className="mb-6 max-w-2xl text-center">
				<h1 className="product-page-title">What do you want to learn?</h1>
				<p className="product-page-subtitle mt-2">
					Describe your learning goal. We&apos;ll create a personalized,
					time-blocked schedule that syncs to your calendar.
				</p>
			</div>

			<ManualCreatePanel />
		</>
	);
}
