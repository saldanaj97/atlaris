import type { ReactNode } from 'react';

import SiteHeader from '@/components/shared/SiteHeader';

export const dynamic = 'force-dynamic';

export default function AppLayout({
	children,
}: Readonly<{ children: ReactNode }>) {
	return (
		<>
			<SiteHeader />
			<main className="flex-1 pt-16">{children}</main>
		</>
	);
}
