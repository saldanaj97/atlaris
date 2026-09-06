'use client';

import { UsageHoverCard } from './UsageHoverCard';
import {
  formatCompactUsageLimit,
  type UsageData,
} from '@/app/_shared/usage-formatting';
import { Badge } from '@/components/ui/badge';

interface PlanCountBadgeProps {
  usage: UsageData;
}

export function PlanCountBadge({ usage }: PlanCountBadgeProps) {
  const limitLabel = formatCompactUsageLimit(usage.activePlans.limit);

  return (
    <UsageHoverCard usage={usage}>
      <Badge
        variant='product'
        className='cursor-default border-panel-border/80 px-3 py-1 text-muted-foreground tabular-nums'
        aria-label={`${usage.activePlans.current} of ${limitLabel} active plans used`}
      >
        <span className='text-foreground'>{usage.activePlans.current}</span>
        <span aria-hidden='true'>/</span>
        <span>{limitLabel}</span>
        <span>plans</span>
      </Badge>
    </UsageHoverCard>
  );
}
