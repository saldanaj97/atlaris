import { ROUTES } from '@/features/navigation/routes';
import { redirect } from 'next/navigation';

export function runAnalyticsRootRedirect(
  redirectFn: typeof redirect = redirect,
): never {
  redirectFn(ROUTES.ANALYTICS.USAGE);
}
