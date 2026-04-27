import {
	BookOpen,
	Check,
	Clock,
	ExternalLink,
	MoreHorizontal,
	Sparkles,
	Target,
	TrendingUp,
	Trophy,
	Zap,
} from 'lucide-react';
import type React from 'react';

import { cn } from '@/lib/utils';
import type { ActivityItem } from '../types';

const typeConfig: Record<
	ActivityItem['type'],
	{
		icon: React.ComponentType<{ className?: string }>;
		color: string;
		borderColor: string;
	}
> = {
	session: {
		icon: BookOpen,
		color: 'bg-indigo-100 text-indigo-600',
		borderColor: 'border-l-indigo-400',
	},
	milestone: {
		icon: Trophy,
		color: 'bg-amber-100 text-amber-600',
		borderColor: 'border-l-amber-400',
	},
	export: {
		icon: ExternalLink,
		color: 'bg-emerald-100 text-emerald-600',
		borderColor: 'border-l-emerald-400',
	},
	streak: {
		icon: Zap,
		color: 'bg-rose-100 text-rose-600',
		borderColor: 'border-l-rose-400',
	},
	progress: {
		icon: TrendingUp,
		color: 'bg-cyan-100 text-cyan-600',
		borderColor: 'border-l-cyan-400',
	},
	recommendation: {
		icon: Sparkles,
		color: 'bg-violet-100 text-violet-600',
		borderColor: 'border-l-violet-400',
	},
};

export function ActivityCard({ activity }: { activity: ActivityItem }) {
	const config = typeConfig[activity.type];
	const Icon = config.icon;

	return (
		<article
			className={cn(
				'group border-panel-border bg-panel relative overflow-hidden rounded-2xl border border-l-4 p-5 shadow-sm transition hover:shadow-md',
				config.borderColor,
			)}
		>
			<div className="flex gap-4">
				{/* Icon */}
				<div
					className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${config.color}`}
				>
					<Icon className="h-5 w-5" />
				</div>

				{/* Content */}
				<div className="min-w-0 flex-1">
					<div className="mb-1 flex items-start justify-between gap-2">
						<div>
							<span className="text-xs font-medium text-muted-foreground">
								{activity.planTitle}
							</span>
							<h4 className="font-semibold text-foreground">
								{activity.title}
							</h4>
						</div>
						<div className="flex items-center gap-2">
							<span className="flex-shrink-0 text-xs text-muted-foreground">
								{activity.timestamp}
							</span>
							<button
								type="button"
								className="rounded-lg p-1 text-muted-foreground/60 opacity-0 transition group-hover:opacity-100 hover:bg-accent hover:text-accent-foreground dark:hover:bg-white/10"
							>
								<MoreHorizontal className="h-4 w-4" />
							</button>
						</div>
					</div>

					{activity.description && (
						<p className="mb-3 text-sm text-muted-foreground">
							{activity.description}
						</p>
					)}

					{/* Metadata */}
					{activity.metadata && (
						<div className="flex flex-wrap items-center gap-3">
							{activity.metadata.duration && (
								<span className="flex items-center gap-1 text-xs text-muted-foreground">
									<Clock className="h-3 w-3" />
									{activity.metadata.duration}
								</span>
							)}
							{activity.metadata.progress !== undefined && (
								<span className="flex items-center gap-1 text-xs text-muted-foreground">
									<Target className="h-3 w-3" />
									{activity.metadata.progress}% complete
								</span>
							)}
							{activity.metadata.platform && (
								<span className="flex items-center gap-1 text-xs text-muted-foreground">
									<Check className="h-3 w-3" />
									{activity.metadata.platform}
								</span>
							)}
							{activity.metadata.streakCount && (
								<span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
									<Zap className="h-3 w-3" />
									{activity.metadata.streakCount} days
								</span>
							)}
						</div>
					)}
				</div>
			</div>
		</article>
	);
}
