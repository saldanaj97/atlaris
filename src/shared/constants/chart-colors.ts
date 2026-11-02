/**
 * Multi-series plan chart palette — semantic chart tokens.
 * Prefer CSS vars so series follow light/dark theme swaps.
 */
export const PLAN_CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const;

/**
 * Line dash per series, paired by index with `PLAN_CHART_COLORS`. Series 2 and
 * 5 are both warm, so series 5 is dashed and never relies on hue alone.
 */
export const PLAN_CHART_DASHES = [
  undefined,
  undefined,
  undefined,
  undefined,
  '10 6',
] as const;
