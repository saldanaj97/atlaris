import { runAnalyticsRootRedirect } from '@/app/(app)/analytics/analytics-entry-redirect';

/**
 * Achievement tracking does not exist yet; keep old links landing on analytics
 * instead of a 404 until it does.
 */
export default function AchievementsPage(): never {
  runAnalyticsRootRedirect();
}
