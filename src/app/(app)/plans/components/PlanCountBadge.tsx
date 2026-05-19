'use client';

import {
  formatCompactUsageLimit,
  type UsageData,
} from '@/app/_shared/usage-formatting';
import { UsageHoverCard } from './UsageHoverCard';

interface PlanCountBadgeProps {
  usage: UsageData;
}

export function PlanCountBadge({ usage }: PlanCountBadgeProps) {
  return (
    <UsageHoverCard usage={usage}>
      <span className="cursor-default rounded-full bg-muted-foreground/10 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
        {usage.activePlans.current} /{' '}
        {formatCompactUsageLimit(usage.activePlans.limit)}
      </span>
    </UsageHoverCard>
  );
}
