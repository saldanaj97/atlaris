import {
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
  parseISO,
} from 'date-fns';
import type { PlanStatus } from '@/app/plans/types';
import { deriveCanonicalPlanSummaryStatus } from '@/features/plans/read-models/summary';
import type { PlanSummary } from '@/shared/types/db.types';

export const ALL_TASKS_COMPLETED_LABEL = 'All tasks completed';
export const CONTINUE_LEARNING_LABEL = 'Continue learning';

type DateInput = Date | string | null | undefined;

function toValidDate(value: DateInput): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Converts a date to a human-readable relative time string.
 *
 * Returns a formatted string representing how long ago the date was:
 * - "Just now" for dates less than 1 minute ago
 * - "Xm ago" for dates less than 1 hour ago (e.g., "5m ago")
 * - "X hour ago" or "X hours ago" for dates less than 24 hours ago
 * - "Yesterday" for dates exactly 1 day ago
 * - "X days ago" for dates less than 7 days ago
 * - "Xw ago" for dates less than 30 days ago (weeks)
 * - "Xmo ago" for dates 30+ days ago (months)
 * - "Recently" if the date is null or undefined
 *
 * @param date - The date to convert to relative time. Can be a Date object, null, or undefined.
 * @returns A human-readable relative time string.
 *
 * @example
 * ```ts
 * getRelativeTime(new Date()) // "Just now"
 * getRelativeTime(new Date(Date.now() - 5 * 60 * 1000)) // "5m ago"
 * getRelativeTime(new Date(Date.now() - 2 * 60 * 60 * 1000)) // "2 hours ago"
 * getRelativeTime(null) // "Recently"
 * ```
 */
export function getRelativeTime(
  date: DateInput,
  referenceDate: DateInput
): string {
  const targetDate = toValidDate(date);
  const reference = toValidDate(referenceDate);

  if (!targetDate || !reference) return 'Recently';

  const rawMinutes = differenceInMinutes(reference, targetDate);
  const rawHours = differenceInHours(reference, targetDate);
  const rawDays = differenceInDays(reference, targetDate);

  // Clamp to non-negative so future dates degrade to "Just now"
  const diffMinutes = Math.max(0, rawMinutes);
  const diffHours = Math.max(0, rawHours);
  const diffDays = Math.max(0, rawDays);

  if (diffMinutes < 60) {
    return diffMinutes <= 1 ? 'Just now' : `${diffMinutes}m ago`;
  }
  if (diffHours < 24) {
    return diffHours === 1 ? '1 hour ago' : `${diffHours}h ago`;
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

/**
 * Determines the current status of a learning plan based on completion and activity.
 *
 * The status is determined by the following rules:
 * - "generating": If the plan's generationStatus is 'generating'
 * - "failed": If the plan's generationStatus is 'failed'
 * - "completed": If the plan's completion percentage is 100% or greater
 * - "paused": If the plan hasn't been updated in 30+ days (inactive)
 * - "active": For all other cases (in progress and recently updated)
 *
 * @param summary - The plan summary object containing completion data and plan metadata.
 * @returns The status of the plan: "active", "paused", "completed", "generating", or "failed".
 *
 * @example
 * ```ts
 * const summary: PlanSummary = {
 *   plan: { updatedAt: new Date(), generationStatus: 'ready' },
 *   completion: 0.75,
 *   // ... other fields
 * };
 * getPlanStatus(summary) // "active"
 *
 * const completedSummary: PlanSummary = {
 *   plan: { updatedAt: new Date(), generationStatus: 'ready' },
 *   completion: 1.0,
 *   // ... other fields
 * };
 * getPlanStatus(completedSummary) // "completed"
 *
 * const generatingSummary: PlanSummary = {
 *   plan: { generationStatus: 'generating' },
 *   completion: 0,
 *   // ... other fields
 * };
 * getPlanStatus(generatingSummary) // "generating"
 * ```
 */
export function getPlanStatus(
  summary: PlanSummary,
  referenceDate: DateInput
): PlanStatus {
  const canonicalStatus = deriveCanonicalPlanSummaryStatus(summary);

  if (canonicalStatus !== 'active') {
    return canonicalStatus;
  }

  // Check if plan is inactive/paused (not updated in 30+ days)
  const updatedAt = toValidDate(summary.plan.updatedAt);
  const reference = toValidDate(referenceDate);
  if (updatedAt && reference) {
    const daysSinceUpdate = differenceInDays(reference, updatedAt);
    if (daysSinceUpdate >= 30) {
      return 'paused';
    }
  }

  return 'active';
}

/**
 * Retrieves a best-effort next-step label from a plan summary.
 *
 * Summary data does not include task-level progress, so this helper only returns a
 * coarse fallback label based on the first available module title.
 *
 * @param summary - The plan summary object containing modules and their completion status.
 * @returns "Not started" if the plan hasn't been started yet, "Next: [Module Title]" for an in-progress plan,
 *          "Continue learning" if no title is available, or "All tasks completed" if the summary is complete.
 *
 * @example
 * ```ts
 * const summary: PlanSummary = {
 *   completedTasks: 0,
 *   modules: [
 *     { title: "Introduction to React" },
 *     { title: "Advanced Hooks" }
 *   ],
 *   // ... other fields
 * };
 * getNextTaskName(summary) // "Not started"
 *
 * const startedSummary: PlanSummary = {
 *   completedTasks: 2,
 *   modules: [
 *     { title: "Introduction to React" },
 *     { title: "Advanced Hooks" }
 *   ],
 *   // ... other fields
 * };
 * getNextTaskName(startedSummary) // "Next: Introduction to React"
 *
 * const emptySummary: PlanSummary = {
 *   modules: [],
 *   // ... other fields
 * };
 * getNextTaskName(emptySummary) // "All tasks completed"
 * ```
 */
export function getNextTaskName(summary: PlanSummary): string {
  if (summary.completedTasks === 0) {
    return 'Not started';
  }

  if (deriveCanonicalPlanSummaryStatus(summary) === 'completed') {
    return ALL_TASKS_COMPLETED_LABEL;
  }

  return CONTINUE_LEARNING_LABEL;
}
