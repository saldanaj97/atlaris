import { redirect } from 'next/navigation';

/**
 * Settings → Integrations redirects to the dedicated /integrations page
 * where the full integration management UI lives.
 */
export default function SettingsIntegrationsPage(): never {
  redirect('/integrations');
}
