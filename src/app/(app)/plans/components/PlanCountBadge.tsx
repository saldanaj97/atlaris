'use client';

import { UsageHoverCard } from './UsageHoverCard';
import {
  formatCompactUsageLimit,
  type UsageData,
} from '@/app/_shared/usage-formatting';

interface PlanCountBadgeProps {
  usage: UsageData;
}

export function PlanCountBadge({ usage }: PlanCountBadgeProps) {
  const limitLabel = formatCompactUsageLimit(usage.activePlans.limit);

  return (
    <UsageHoverCard usage={usage}>
      <span
        className='inline-flex cursor-default items-center gap-1 rounded-full border border-panel-border/80 bg-panel px-3 py-1 text-xs font-medium text-muted-foreground tabular-nums'
        aria-label={`${usage.activePlans.current} of ${limitLabel} active plans used`}
      >
        <span className='text-foreground'>{usage.activePlans.current}</span>
        <span aria-hidden='true'>/</span>
        <span>{limitLabel}</span>
        <span>plans</span>
      </span>
    </UsageHoverCard>
  );
}
