'use client';

import { UsageHoverCard } from './UsageHoverCard';

interface UsageData {
  tier: string;
  activePlans: { current: number; limit: number };
  regenerations: { used: number; limit: number };
  exports: { used: number; limit: number };
}

interface PlanCountBadgeProps {
  usage: UsageData;
}

function formatLimit(value: number): string {
  return value === Infinity ? '∞' : String(value);
}

export function PlanCountBadge({ usage }: PlanCountBadgeProps) {
  return (
    <UsageHoverCard usage={usage}>
      <span className="bg-muted-foreground/10 text-muted-foreground cursor-default rounded-full px-2.5 py-0.5 text-xs font-medium">
        {usage.activePlans.current} / {formatLimit(usage.activePlans.limit)}
      </span>
    </UsageHoverCard>
  );
}
