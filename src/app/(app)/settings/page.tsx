import { ROUTES } from '@/features/navigation/routes';
import { redirect } from 'next/navigation';

/**
 * /settings root redirects to the Profile tab.
 */
export default function SettingsPage(): never {
  redirect(ROUTES.SETTINGS.PROFILE);
}
