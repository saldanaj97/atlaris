'use client';

import type { LucideIcon } from 'lucide-react';
import { Lock } from 'lucide-react';
import type { JSX } from 'react';

import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

export interface LockedFeatureCardProps {
	icon: LucideIcon;
	title: string;
	description: string;
	className?: string;
}

/**
 * Preview tile for unreleased analytics/features: readable copy, lock affordance,
 * dashed edge — avoids washing entire card with opacity.
 */
export function LockedFeatureCard({
	icon: Icon,
	title,
	description,
	className,
}: LockedFeatureCardProps): JSX.Element {
	return (
		<Card
			data-slot="locked-feature-card"
			role="group"
			aria-label={`Preview — ${title}, unavailable`}
			className={cn(
				'border-border/80 border-dashed bg-card shadow-sm',
				className,
			)}
		>
			<CardContent className="relative">
				<div className="absolute top-4 right-4" aria-hidden="true">
					<Lock className="text-muted-foreground h-4 w-4" />
				</div>

				<div className="flex flex-col gap-3 pr-8">
					<Icon className="text-primary h-8 w-8 shrink-0" aria-hidden="true" />
					<div>
						<h3 className="font-medium text-foreground">{title}</h3>
						<p className="text-muted-foreground mt-1 text-sm">{description}</p>
					</div>
				</div>

				<Progress value={0} className="mt-4 h-1.5 bg-muted" aria-hidden="true" />
			</CardContent>
		</Card>
	);
}
