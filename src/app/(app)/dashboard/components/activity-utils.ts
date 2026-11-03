import type { ActivityItem, ActivityKind } from '../types';
import type { RecentLearningActivityRow } from '@/lib/db/queries/types/tasks.types';
import type {
  Module,
  PlanSummary,
  ProgressStatus,
} from '@/shared/types/db.types';

import { formatRelativePast } from '@/lib/date/relative-time';

type DatedActivity = {
  activity: ActivityItem;
  activityDate: Date;
};

const TASK_ACTIVITY_KIND: Record<ProgressStatus, ActivityKind> = {
  completed: 'task-completed',
  in_progress: 'task-started',
  not_started: 'task-reset',
};

/**
 * Formats a Date object into a human-readable "time ago" string.
 */
function formatTimeAgo(date: Date, now: Date = new Date()): string {
  return formatRelativePast(date, { referenceDate: now, style: 'verbose' });
}

/**
 * Builds the dashboard feed from recorded task status changes plus recently
 * created plans. Nothing is inferred from plan timestamps.
 */
export function generateActivities(
  summaries: PlanSummary[],
  events: RecentLearningActivityRow[],
): ActivityItem[] {
  const datedActivities: DatedActivity[] = [];
  const now = new Date();

  summaries.forEach((summary) => {
    const plan = summary.plan;
    if (!plan.createdAt || plan.generationStatus !== 'ready') {
      return;
    }
    const createdAt = new Date(plan.createdAt);
    const daysSinceCreation = Math.floor(
      (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysSinceCreation < 7) {
      datedActivities.push({
        activityDate: createdAt,
        activity: {
          id: `plan-${plan.id}`,
          kind: 'plan-created',
          planId: plan.id,
          title: plan.topic,
          timestamp: formatTimeAgo(createdAt, now),
          occurredAt: createdAt.toISOString(),
        },
      });
    }
  });

  events.forEach((event) => {
    const occurredAt = new Date(event.occurredAt);
    const kind = TASK_ACTIVITY_KIND[event.status];
    datedActivities.push({
      activityDate: occurredAt,
      activity: {
        id: `event-${event.id}`,
        kind,
        planId: event.planId,
        title: event.taskTitle,
        planTopic: event.planTopic,
        minutes:
          kind === 'task-completed' ? event.taskEstimatedMinutes : undefined,
        timestamp: formatTimeAgo(occurredAt, now),
        occurredAt: occurredAt.toISOString(),
      },
    });
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
