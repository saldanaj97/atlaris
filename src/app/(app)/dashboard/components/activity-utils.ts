import type { ActivityItem } from '../types';
import type {
  LearningPlan,
  Module,
  PlanSummary,
} from '@/shared/types/db.types';

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

export function getDashboardHeroTitle(name: string | null | undefined): string {
  const firstName = name?.trim().split(/\s+/)[0];
  return firstName ? `Welcome back, ${firstName}.` : 'Welcome back.';
}

export function getDashboardHeroDescription(activePlan?: PlanSummary): string {
  if (!activePlan) {
    return 'Ready for your next challenge?';
  }

  if (activePlan.plan.generationStatus !== 'ready') {
    return `Your plan for ${activePlan.plan.topic} is still being created.`;
  }

  const progressPercent = Math.round(
    Math.max(0, Math.min(1, activePlan.completion)) * 100,
  );

  if (progressPercent === 0) {
    return `${activePlan.plan.topic} is ready when you are.`;
  }

  return `You’re ${progressPercent}% through ${activePlan.plan.topic}. Keep the momentum going.`;
}

export function getDashboardGreeting(
  name: string | null | undefined,
  activePlan?: PlanSummary,
): string {
  return `${getDashboardHeroTitle(name)} ${getDashboardHeroDescription(activePlan)}`;
}

export function getDashboardProgressStats(summaries: PlanSummary[]): {
  percent: number;
  completedModules: number;
  totalModules: number;
  completedTasks: number;
  totalTasks: number;
  planCount: number;
} {
  let completedModules = 0;
  let totalModules = 0;
  let completedTasks = 0;
  let totalTasks = 0;

  for (const summary of summaries) {
    completedModules += summary.completedModules;
    totalModules += summary.modules.length;
    completedTasks += summary.completedTasks;
    totalTasks += summary.totalTasks;
  }

  return {
    percent:
      totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0,
    completedModules,
    totalModules,
    completedTasks,
    totalTasks,
    planCount: summaries.length,
  };
}

export function getOrderedPlanModules(plan: PlanSummary): Module[] {
  return plan.modules.toSorted((left, right) => left.order - right.order);
}

export function getResumeModule(plan: PlanSummary): Module | undefined {
  const modules = getOrderedPlanModules(plan);
  if (modules.length === 0) {
    return undefined;
  }

  const progressPercent = Math.round(
    Math.max(0, Math.min(1, plan.completion)) * 100,
  );

  if (progressPercent >= 100) {
    return modules.at(-1);
  }

  return modules[plan.completedModules] ?? modules.at(-1);
}
