'use client';

import {
	formatUsageLimit,
	type UsageData,
} from '@/app/plans/components/usage-types';
import { UsageHoverCard } from './UsageHoverCard';

interface PlanCountBadgeProps {
	usage: UsageData;
}

export function PlanCountBadge({ usage }: PlanCountBadgeProps) {
	return (
		<UsageHoverCard usage={usage}>
			<span className="bg-muted-foreground/10 text-muted-foreground cursor-default rounded-full px-2.5 py-0.5 text-xs font-medium">
				{usage.activePlans.current} /{' '}
				{formatUsageLimit(usage.activePlans.limit)}
			</span>
		</UsageHoverCard>
	);
}
