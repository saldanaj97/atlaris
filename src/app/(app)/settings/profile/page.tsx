import type { ReactElement } from 'react';

import { ProfileForm } from '@/app/(app)/settings/profile/components/ProfileForm';
import { PageHeader } from '@/components/ui/page-header';
import { getSupportedLocale } from '@/lib/i18n/locale';
import { headers } from 'next/headers';

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
        title='Profile'
        subtitle='Manage your personal information and view your account details'
      />

      <div className='grid gap-6 md:grid-cols-2'>
        <ProfileForm locale={locale} />
      </div>
    </>
  );
}
