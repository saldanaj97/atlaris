'use client';

import { BookOpen, RefreshCw, Share2, Trophy } from 'lucide-react';
import Link from 'next/link';
import {
	formatUsageLimit,
	type UsageData,
} from '@/app/(app)/plans/components/usage-types';
import { Badge } from '@/components/ui/badge';
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from '@/components/ui/hover-card';
import type { SubscriptionTier } from '@/features/billing/tier-limits';

interface UsageHoverCardProps {
	usage: UsageData;
	children: React.ReactNode;
}

const tierVariants: Record<
	SubscriptionTier,
	'default' | 'secondary' | 'outline'
> = {
	free: 'outline',
	starter: 'secondary',
	pro: 'default',
};

export function UsageHoverCard({ usage, children }: UsageHoverCardProps) {
	const tier = usage.tier as SubscriptionTier;

	return (
		<HoverCard openDelay={200} closeDelay={100}>
			<HoverCardTrigger asChild>{children}</HoverCardTrigger>
			<HoverCardContent
				className="w-72 border-white/40 bg-white/70 shadow-lg backdrop-blur-xl dark:border-white/10 dark:bg-black/30"
				align="start"
			>
				<div className="space-y-4">
					{/* Tier Header */}
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<Trophy className="text-muted-foreground h-4 w-4" />
							<span className="text-sm font-medium">Subscription</span>
						</div>
						<Badge variant={tierVariants[tier]} className="capitalize">
							{tier}
						</Badge>
					</div>

					{/* Usage Stats */}
					<div className="space-y-3">
						<div className="flex items-center justify-between text-sm">
							<div className="text-muted-foreground flex items-center gap-2">
								<BookOpen className="h-3.5 w-3.5" />
								Active Plans
							</div>
							<span className="font-medium">
								{usage.activePlans.current} /{' '}
								{formatUsageLimit(usage.activePlans.limit)}
							</span>
						</div>

						<div className="flex items-center justify-between text-sm">
							<div className="text-muted-foreground flex items-center gap-2">
								<RefreshCw className="h-3.5 w-3.5" />
								Regenerations
							</div>
							<span className="font-medium">
								{usage.regenerations.used} /{' '}
								{formatUsageLimit(usage.regenerations.limit)}
							</span>
						</div>

						<div className="flex items-center justify-between text-sm">
							<div className="text-muted-foreground flex items-center gap-2">
								<Share2 className="h-3.5 w-3.5" />
								Exports
							</div>
							<span className="font-medium">
								{usage.exports.used} / {formatUsageLimit(usage.exports.limit)}
							</span>
						</div>
					</div>

					{/* Upgrade CTA for non-pro users */}
					{tier !== 'pro' && (
						<div className="border-t pt-3">
							<Link
								href="/pricing"
								className="text-primary hover:text-primary/80 text-xs font-medium transition-colors"
							>
								Upgrade for more →
							</Link>
						</div>
					)}
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}
