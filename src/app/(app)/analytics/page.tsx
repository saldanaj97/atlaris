import { ROUTES } from '@/features/navigation/routes';
import { redirect } from 'next/navigation';

/**
 * Nav and product IA treat `/analytics` as the analytics root; delegate to usage
 * until a dedicated overview exists.
 */
export function runAnalyticsRootRedirect(
  redirectFn: typeof redirect = redirect,
): never {
  redirectFn(ROUTES.ANALYTICS.USAGE);
}

export default function AnalyticsRootPage(): never {
  runAnalyticsRootRedirect();
}
