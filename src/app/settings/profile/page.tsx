import { ProfileForm } from '@/app/settings/profile/components/ProfileForm';

/**
 * Profile Settings page.
 *
 * Static elements (title, subtitle) render immediately.
 * ProfileForm is a client component that manages its own loading state
 * via useEffect, so it renders ProfileFormSkeleton internally while fetching.
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
        <ProfileForm />
      </div>
    </div>
  );
}
