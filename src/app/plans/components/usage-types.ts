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
export function isUnlimitedNumber(value: number | null | undefined): boolean {
  return value === null || value === undefined || value === Infinity;
}

export function formatUsageLimit(value: number): string {
  return isUnlimitedNumber(value) ? '∞' : String(value);
}
