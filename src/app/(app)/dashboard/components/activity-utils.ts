import type { ActivityItem } from '../types';
import type { PlanReadStatus } from '@/features/plans/read-projection/types';
import type { LearningPlan, PlanSummary } from '@/shared/types/db.types';

import { derivePlanSummaryDisplayStatus } from '@/features/plans/read-projection/client';
import { formatRelativePast } from '@/lib/date/relative-time';

type DatedActivity = {
  activity: ActivityItem;
  activityDate: Date;
};

const DASHBOARD_PLAN_STATUS_RANK: Partial<Record<PlanReadStatus, number>> = {
  active: 0,
  not_started: 1,
  generating: 2,
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
 * Creates generated, progress, and completion events.
 */
export function generateActivities(summaries: PlanSummary[]): ActivityItem[] {
  const datedActivities: DatedActivity[] = [];
  const now = new Date();

  summaries.forEach((summary) => {
    const plan = summary.plan;
    const createdAt = plan.createdAt ? new Date(plan.createdAt) : now;
    const progressAt = getPlanProgressTimestamp(plan, createdAt);
    // Add plan creation as a milestone if recently created
    if (plan.createdAt && plan.generationStatus === 'ready') {
      const daysSinceCreation = Math.floor(
        (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysSinceCreation < 7) {
        datedActivities.push({
          activityDate: createdAt,
          activity: {
            id: `plan-${plan.id}`,
            kind: 'generated',
            planId: plan.id,
            title: plan.topic,
            timestamp: formatTimeAgo(createdAt, now),
            occurredAt: createdAt.toISOString(),
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
          kind: 'progress',
          planId: plan.id,
          title: plan.topic,
          timestamp: formatTimeAgo(progressAt, now),
          occurredAt: progressAt.toISOString(),
        },
      });
    }

    // Add completion milestone
    if (summary.completion >= 1 - 1e-6) {
      datedActivities.push({
        activityDate: progressAt,
        activity: {
          id: `complete-${plan.id}`,
          kind: 'completed',
          planId: plan.id,
          title: plan.topic,
          timestamp: formatTimeAgo(progressAt, now),
          occurredAt: progressAt.toISOString(),
        },
      });
    }
  });

  return datedActivities
    .toSorted((a, b) => b.activityDate.getTime() - a.activityDate.getTime())
    .map(({ activity }) => activity);
}

/**
 * Finds the highest-priority incomplete plan from summaries.
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
    .filter(({ status }) => status in DASHBOARD_PLAN_STATUS_RANK)
    .toSorted((a, b) => {
      const rankDifference =
        (DASHBOARD_PLAN_STATUS_RANK[a.status] ?? 99) -
        (DASHBOARD_PLAN_STATUS_RANK[b.status] ?? 99);

      if (rankDifference !== 0) {
        return rankDifference;
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

export function getDashboardGreeting(
  name: string | null | undefined,
  activePlan?: PlanSummary,
): string {
  const firstName = name?.trim().split(/\s+/)[0];
  const welcome = firstName ? `Welcome back, ${firstName}.` : 'Welcome back.';

  if (!activePlan) {
    return `${welcome} Ready for your next challenge?`;
  }

  if (activePlan.plan.generationStatus !== 'ready') {
    return `${welcome} Your plan for ${activePlan.plan.topic} is still being created.`;
  }

  const progressPercent = Math.round(
    Math.max(0, Math.min(1, activePlan.completion)) * 100,
  );

  if (progressPercent === 0) {
    return `${welcome} ${activePlan.plan.topic} is ready when you are.`;
  }

  return `${welcome} You’re ${progressPercent}% through ${activePlan.plan.topic}. Keep the momentum going.`;
}
