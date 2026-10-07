import { runAnalyticsRootRedirect } from '@/app/(app)/analytics/analytics-entry-redirect';

/**
 * Nav and product IA treat `/analytics` as the analytics root; delegate to usage
 * until a dedicated overview exists.
 */
export default function AnalyticsRootPage(): never {
  runAnalyticsRootRedirect();
}
