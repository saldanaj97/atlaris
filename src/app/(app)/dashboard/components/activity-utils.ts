import { CheckCircle2, Clock, FileText, Video, Zap } from 'lucide-react';
import { formatMinutes } from '@/features/plans/formatters';
import { derivePlanSummaryDisplayStatus } from '@/features/plans/read-projection/client';
import {
	formatRelativePast,
	formatScheduledEventRelative,
} from '@/lib/date/relative-time';
import type { PlanSummary } from '@/shared/types/db.types';
import type { ActivityItem, ScheduledEvent } from '../types';

/**
 * Formats a Date object into a human-readable "time ago" string.
 */
function formatTimeAgo(date: Date, now: Date = new Date()): string {
	return formatRelativePast(date, { referenceDate: now, style: 'verbose' });
}

/**
 * Generates activity items from plan summaries.
 * Creates milestone events for new plans, progress updates, and completion events.
 */
export function generateActivities(summaries: PlanSummary[]): ActivityItem[] {
	const activities: ActivityItem[] = [];

	summaries.forEach((summary) => {
		const plan = summary.plan;
		const createdAt = plan.createdAt ? new Date(plan.createdAt) : new Date();
		const completionPercent = Math.round(summary.completion * 100);

		// Add plan creation as a milestone if recently created
		if (plan.createdAt) {
			const daysSinceCreation = Math.floor(
				(Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24),
			);
			if (daysSinceCreation < 7) {
				activities.push({
					id: `plan-${plan.id}`,
					type: 'milestone',
					planId: plan.id,
					planTitle: plan.topic,
					title: `Started: ${plan.topic}`,
					description: `Created a new learning plan with ${summary.totalTasks} tasks.`,
					timestamp: formatTimeAgo(createdAt),
					metadata: { progress: completionPercent },
				});
			}
		}

		// Add progress updates for plans with completion
		if (summary.completion > 0 && summary.completion < 1) {
			activities.push({
				id: `progress-${plan.id}`,
				type: 'progress',
				planId: plan.id,
				planTitle: plan.topic,
				title: 'Progress Update',
				description: `You completed ${summary.completedTasks} of ${summary.totalTasks} tasks (${completionPercent}% complete).`,
				timestamp: formatTimeAgo(createdAt),
				metadata: {
					progress: completionPercent,
					duration: formatMinutes(summary.completedMinutes),
				},
			});
		}

		// Add completion milestone
		if (summary.completion >= 1 - 1e-6) {
			activities.push({
				id: `complete-${plan.id}`,
				type: 'milestone',
				planId: plan.id,
				planTitle: plan.topic,
				title: `Completed: ${plan.topic}`,
				description: `Congratulations! You've completed all ${summary.totalTasks} tasks.`,
				timestamp: formatTimeAgo(createdAt),
				metadata: { progress: 100 },
			});
		}
	});

	return activities;
}

/**
 * Finds the most recently active (incomplete) plan from summaries.
 */
export function findActivePlan(
	summaries: PlanSummary[],
): PlanSummary | undefined {
	const now = new Date();
	const rankedSummaries = summaries
		.map((summary) => ({
			summary,
			status: derivePlanSummaryDisplayStatus({
				summary,
				referenceDate: now,
			}),
		}))
		.filter(({ status }) => status === 'active' || status === 'generating')
		.toSorted((a, b) => {
			const aStatus = a.status;
			const bStatus = b.status;

			if (aStatus !== bStatus) {
				return aStatus === 'active' ? -1 : 1;
			}

			const aTime = a.summary.plan.updatedAt
				? new Date(a.summary.plan.updatedAt).getTime()
				: 0;
			const bTime = b.summary.plan.updatedAt
				? new Date(b.summary.plan.updatedAt).getTime()
				: 0;
			return bTime - aTime;
		});

	return rankedSummaries[0]?.summary;
}

export function getActivityRelativeLabel(date: Date, now?: Date): string {
	return formatScheduledEventRelative(date, now ?? new Date());
}

export function getEventTypeConfig(type: ScheduledEvent['type']) {
	const configs = {
		'live-session': {
			icon: Video,
			label: 'Live Session',
			bgColor: 'bg-rose-50 dark:bg-rose-950/30',
			textColor: 'text-rose-600 dark:text-rose-400',
			borderColor: 'border-rose-200 dark:border-rose-800',
			dotColor: 'bg-rose-500',
		},
		deadline: {
			icon: Clock,
			label: 'Deadline',
			bgColor: 'bg-amber-50 dark:bg-amber-950/30',
			textColor: 'text-amber-600 dark:text-amber-400',
			borderColor: 'border-amber-200 dark:border-amber-800',
			dotColor: 'bg-amber-500',
		},
		quiz: {
			icon: Zap,
			label: 'Quiz',
			bgColor: 'bg-violet-50 dark:bg-violet-950/30',
			textColor: 'text-violet-600 dark:text-violet-400',
			borderColor: 'border-violet-200 dark:border-violet-800',
			dotColor: 'bg-violet-500',
		},
		assignment: {
			icon: FileText,
			label: 'Assignment',
			bgColor: 'bg-blue-50 dark:bg-blue-950/30',
			textColor: 'text-blue-600 dark:text-blue-400',
			borderColor: 'border-blue-200 dark:border-blue-800',
			dotColor: 'bg-blue-500',
		},
		milestone: {
			icon: CheckCircle2,
			label: 'Milestone',
			bgColor: 'bg-emerald-50 dark:bg-emerald-950/30',
			textColor: 'text-emerald-600 dark:text-emerald-400',
			borderColor: 'border-emerald-200 dark:border-emerald-800',
			dotColor: 'bg-emerald-500',
		},
	};

	return configs[type];
}

function _formatEstimatedTime(
	totalMinutes: number,
	completedMinutes: number,
): string {
	const remainingMinutes = totalMinutes - completedMinutes;
	if (remainingMinutes <= 0) return 'Complete';

	const hours = Math.floor(remainingMinutes / 60);
	const minutes = remainingMinutes % 60;

	if (hours === 0) return `${minutes}m left`;
	if (minutes === 0) return `${hours}h left`;
	return `${hours}h ${minutes}m left`;
}
