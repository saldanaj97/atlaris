import type { ActivityItem } from '../types';
import type { LearningPlan, PlanSummary } from '@/shared/types/db.types';

import { formatMinutes } from '@/features/plans/formatters';
import { derivePlanSummaryDisplayStatus } from '@/features/plans/read-projection/client';
import { formatRelativePast } from '@/lib/date/relative-time';

type DatedActivity = {
  activity: ActivityItem;
  activityDate: Date;
};

/**
 * Formats a Date object into a human-readable "time ago" string.
 */
function formatTimeAgo(date: Date, now: Date = new Date()): string {
  return formatRelativePast(date, { referenceDate: now, style: 'verbose' });
}

function getPlanProgressTimestamp(plan: LearningPlan, fallback: Date): Date {
  return plan.updatedAt ? new Date(plan.updatedAt) : fallback;
}

/**
 * Generates activity items from plan summaries.
 * Creates milestone events for new plans, progress updates, and completion events.
 */
export function generateActivities(summaries: PlanSummary[]): ActivityItem[] {
  const datedActivities: DatedActivity[] = [];
  const now = new Date();

  summaries.forEach((summary) => {
    const plan = summary.plan;
    const createdAt = plan.createdAt ? new Date(plan.createdAt) : now;
    const progressAt = getPlanProgressTimestamp(plan, createdAt);
    const completionPercent = Math.round(summary.completion * 100);

    // Add plan creation as a milestone if recently created
    if (plan.createdAt) {
      const daysSinceCreation = Math.floor(
        (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysSinceCreation < 7) {
        datedActivities.push({
          activityDate: createdAt,
          activity: {
            id: `plan-${plan.id}`,
            type: 'milestone',
            planId: plan.id,
            planTitle: plan.topic,
            title: `Started: ${plan.topic}`,
            description: `Created a new learning plan with ${summary.totalTasks} tasks.`,
            timestamp: formatTimeAgo(createdAt, now),
            metadata: { progress: completionPercent },
          },
        });
      }
    }

    // Add progress updates for plans with completion
    if (summary.completion > 0 && summary.completion < 1) {
      datedActivities.push({
        activityDate: progressAt,
        activity: {
          id: `progress-${plan.id}`,
          type: 'progress',
          planId: plan.id,
          planTitle: plan.topic,
          title: 'Progress Update',
          description: `You completed ${summary.completedTasks} of ${summary.totalTasks} tasks (${completionPercent}% complete).`,
          timestamp: formatTimeAgo(progressAt, now),
          metadata: {
            progress: completionPercent,
            duration: formatMinutes(summary.completedMinutes),
          },
        },
      });
    }

    // Add completion milestone
    if (summary.completion >= 1 - 1e-6) {
      datedActivities.push({
        activityDate: progressAt,
        activity: {
          id: `complete-${plan.id}`,
          type: 'milestone',
          planId: plan.id,
          planTitle: plan.topic,
          title: `Completed: ${plan.topic}`,
          description: `Congratulations! You've completed all ${summary.totalTasks} tasks.`,
          timestamp: formatTimeAgo(progressAt, now),
          metadata: { progress: 100 },
        },
      });
    }
  });

  return datedActivities
    .toSorted((a, b) => b.activityDate.getTime() - a.activityDate.getTime())
    .map(({ activity }) => activity);
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
