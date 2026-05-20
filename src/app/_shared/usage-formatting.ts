export interface UsageData {
  tier: string;
  activePlans: { current: number; limit: number };
  regenerations: { used: number; limit: number };
  exports: { used: number; limit: number };
}

/**
 * Tier limits use both `Infinity` (numeric quotas like `maxActivePlans`) and
 * `null` (optional caps like `maxWeeks`) to mean "unbounded". Centralize the
 * predicate so callers don't have to remember to check both.
 */
function isUnlimitedNumber(value: number | null | undefined): boolean {
  return value === null || value === undefined || value === Infinity;
}

export function formatCompactUsageLimit(
  value: number | null | undefined,
): string {
  return isUnlimitedNumber(value) ? '∞' : String(value);
}

export function formatUsageLimitLabel(
  value: number | null | undefined,
): string {
  return isUnlimitedNumber(value) ? 'unlimited' : String(value);
}

export function formatMarketingLimit(value: number | null | undefined): string {
  return isUnlimitedNumber(value) ? 'Unlimited' : String(value);
}

export function formatMarketingSchedulingHorizon(
  value: number | null | undefined,
): string {
  return isUnlimitedNumber(value) ? 'Unlimited' : `${value}-week`;
}

/** Returns 0 for unlimited limits since there's no cap to show progress against. */
export function getUsagePercent(
  used: number,
  limit: number | null | undefined,
): number {
  if (isUnlimitedNumber(limit)) return 0;
  if (typeof limit !== 'number' || limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}
