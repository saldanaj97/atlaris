import { headers } from 'next/headers';
import type { ReactElement } from 'react';

import { ProfileForm } from '@/app/(app)/settings/profile/components/ProfileForm';
import { PageHeader } from '@/components/ui/page-header';

function getSupportedLocale(acceptLanguage: string | null): string | undefined {
  if (!acceptLanguage) {
    return undefined;
  }

  const localeCandidates = acceptLanguage
    .split(',')
    .map((part) => part.split(';')[0]?.trim())
    .filter((part): part is string => Boolean(part) && part !== '*');

  return Intl.DateTimeFormat.supportedLocalesOf(localeCandidates)[0];
}

/**
 * Profile Settings sub-page.
 *
 * Rendered inside the shared settings layout.
 * ProfileForm is a client component that manages its own loading state
 * via useEffect, so it renders ProfileFormSkeleton internally while fetching.
 */
export default async function ProfileSettingsPage(): Promise<ReactElement> {
  const locale = getSupportedLocale((await headers()).get('accept-language'));

  return (
    <>
      <PageHeader
        title="Profile"
        titleAs="h2"
        subtitle="Manage your personal information and view your account details"
      />

      <div className="grid gap-6 md:grid-cols-2">
        <ProfileForm locale={locale} />
      </div>
    </>
  );
}
