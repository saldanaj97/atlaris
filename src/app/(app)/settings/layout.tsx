import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { SettingsLedgerShell } from '@/app/(app)/settings/components/LedgerPrimitives';
import { SettingsHero } from '@/app/(app)/settings/components/SettingsHero';
import {
  SettingsContentHeading,
  SettingsLegacyHashRedirect,
  SettingsSectionNavigation,
} from '@/app/(app)/settings/components/SettingsScrollTarget';

export const metadata: Metadata = {
  title: 'Settings',
  description: 'Manage your account settings and preferences.',
};

/**
 * Shared settings chrome: hero plus a framed section nav and routed content.
 */
export default function SettingsLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <>
      <SettingsLegacyHashRedirect />
      <SettingsHero />
      <SettingsLedgerShell nav={<SettingsSectionNavigation />}>
        <SettingsContentHeading />
        {children}
      </SettingsLedgerShell>
    </>
  );
}
