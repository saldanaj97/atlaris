import { Suspense } from 'react';

import {
  ProfileForm,
  ProfileFormSkeleton,
} from '@/app/settings/profile/components/ProfileForm';

/**
 * Profile Settings page with Suspense boundary for data-dependent content.
 *
 * Static elements (title, subtitle) render immediately.
 * The profile form waits for user data from the API.
 */
export default function ProfileSettingsPage(): React.ReactElement {
  return (
    <div className="mx-auto min-h-screen max-w-7xl px-6 py-8">
      {/* Static content - renders immediately */}
      <header className="mb-6">
        <h1>Profile</h1>
        <p className="subtitle">
          Manage your personal information and view your account details
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Data-dependent form - wrapped in Suspense */}
        <Suspense fallback={<ProfileFormSkeleton />}>
          <ProfileForm />
        </Suspense>
      </div>
    </div>
  );
}
