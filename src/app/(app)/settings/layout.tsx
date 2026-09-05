import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Manage your account settings and preferences.',
};

/**
 * Shared settings layout.
 *
 * One continuous Ledger surface — no sidebar.
 */
export default function SettingsLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return children;
}
