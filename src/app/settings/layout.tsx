import type { Metadata } from 'next';
import type { ReactElement, ReactNode } from 'react';

import { SettingsSidebar } from '@/app/settings/components/SettingsSidebar';

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
    <div className="mx-auto min-h-screen max-w-7xl px-6 py-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Settings</h1>
      </header>

      <div className="flex flex-col gap-8 md:flex-row">
        {/* Sidebar */}
        <aside className="w-full shrink-0 md:w-56">
          <SettingsSidebar />
        </aside>

        {/* Content — rendered by the matched sub-route */}
        <section className="min-w-0 flex-1">{children}</section>
      </div>
    </div>
  );
}
