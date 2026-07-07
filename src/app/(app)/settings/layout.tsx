import type { Metadata } from 'next';
import type { ReactElement, ReactNode } from 'react';

import { PageShell } from '@/components/ui/page-shell';

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Manage your account settings and preferences.',
};

/**
 * Shared settings layout.
 *
 * One continuous Ledger surface — no sidebar; sub-routes scroll to sections.
 */
export default function SettingsLayout({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  return <PageShell>{children}</PageShell>;
}
