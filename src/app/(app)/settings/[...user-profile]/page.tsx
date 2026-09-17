import { runSettingsEntryRedirect } from '@/app/(app)/settings/settings-entry-redirect';

type SettingsUserProfilePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Clerk path-routed fallback (`/settings/user-profile/...` and other unmatched
 * settings segments). Static `/settings/profile` wins for that exact path.
 * Keep this catch-all so Clerk returns do not 404; send them to a real section.
 */
export default async function SettingsUserProfilePage({
  searchParams,
}: SettingsUserProfilePageProps): Promise<never> {
  runSettingsEntryRedirect(await searchParams);
}
