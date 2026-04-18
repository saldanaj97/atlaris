export interface UsageData {
  tier: string;
  activePlans: { current: number; limit: number };
  regenerations: { used: number; limit: number };
  exports: { used: number; limit: number };
}

export function formatUsageLimit(value: number): string {
  return value === Infinity ? '∞' : String(value);
}
