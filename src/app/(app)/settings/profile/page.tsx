import type { ReactElement } from 'react';

import { SettingsLedgerPanel } from '@/app/(app)/settings/components/LedgerPrimitives';
import { ProfileForm } from '@/app/(app)/settings/profile/components/ProfileForm';
import { ProfilePlanCardSkeleton } from '@/app/(app)/settings/profile/components/ProfileFormSkeleton';
import { ProfilePlanCard } from '@/app/(app)/settings/profile/components/ProfilePlanCard';
import { getSupportedLocale } from '@/lib/i18n/locale';
import { headers } from 'next/headers';
import { Suspense } from 'react';

export default async function SettingsProfilePage(): Promise<ReactElement> {
  const locale = getSupportedLocale((await headers()).get('accept-language'));

  return (
    <SettingsLedgerPanel>
      <ProfileForm locale={locale} />
      <Suspense fallback={<ProfilePlanCardSkeleton />}>
        <ProfilePlanCard />
      </Suspense>
    </SettingsLedgerPanel>
  );
}
