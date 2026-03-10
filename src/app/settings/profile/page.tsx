import type { ReactElement } from 'react';

import { headers } from 'next/headers';

import { ProfileForm } from '@/app/settings/profile/components/ProfileForm';

/**
 * Profile Settings sub-page.
 *
 * Rendered inside the shared settings layout.
 * ProfileForm is a client component that manages its own loading state
 * via useEffect, so it renders ProfileFormSkeleton internally while fetching.
 */
export default async function ProfileSettingsPage(): Promise<ReactElement> {
  const locale = (await headers())
    .get('accept-language')
    ?.split(',')[0]
    ?.trim();

  return (
    <>
      <header className="mb-6">
        <h2 className="text-xl font-semibold">Profile</h2>
        <p className="text-muted-foreground text-sm">
          Manage your personal information and view your account details
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <ProfileForm locale={locale} />
      </div>
    </>
  );
}
