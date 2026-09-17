import { runSettingsEntryRedirect } from '@/app/(app)/settings/settings-entry-redirect';

type SettingsIndexPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * `/settings` is not a stacked ledger. Send users to a real section.
 */
export default async function SettingsPage({
  searchParams,
}: SettingsIndexPageProps): Promise<never> {
  runSettingsEntryRedirect(await searchParams);
}
