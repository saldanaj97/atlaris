import { redirect } from 'next/navigation';

import { ROUTES } from '@/lib/navigation';

/**
 * /settings root redirects to the Profile tab.
 */
export default function SettingsPage(): never {
  redirect(ROUTES.SETTINGS.PROFILE);
}
