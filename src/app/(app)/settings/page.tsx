import { runSettingsEntryRedirect } from '@/app/(app)/settings/settings-entry-redirect';

type SettingsIndexPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SettingsPage({
  searchParams,
}: SettingsIndexPageProps): Promise<never> {
  runSettingsEntryRedirect(await searchParams);
}
