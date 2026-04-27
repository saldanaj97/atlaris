import type { Metadata } from 'next';
import type { ReactElement, ReactNode } from 'react';

import { SettingsSidebar } from '@/app/(app)/settings/components/SettingsSidebar';
import { PageHeader } from '@/components/ui/page-header';
import { PageShell } from '@/components/ui/page-shell';

export const metadata: Metadata = {
	title: 'Settings',
	description: 'Manage your account settings and preferences.',
};

/**
 * Shared settings layout.
 *
 * Left sidebar for navigation, right content area renders the active
 * sub-page via URL routing (no client-side tab state).
 * On mobile the sidebar stacks above the content.
 */
export default function SettingsLayout({
	children,
}: {
	children: ReactNode;
}): ReactElement {
	return (
		<PageShell>
			<PageHeader title="Settings" className="mb-8" />

			<div className="flex flex-col gap-8 md:flex-row">
				{/* Sidebar */}
				<aside className="w-full shrink-0 md:w-56">
					<SettingsSidebar />
				</aside>

				{/* Content — rendered by the matched sub-route */}
				<section className="min-w-0 flex-1">{children}</section>
			</div>
		</PageShell>
	);
}
