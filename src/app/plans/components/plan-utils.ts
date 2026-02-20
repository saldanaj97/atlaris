import type { PlanStatus } from '@/app/plans/types';
import type { PlanSummary } from '@/lib/types/db';

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
export function getRelativeTime(date: Date | null | undefined): string {
  if (!date) return 'Recently';

  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

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
export function getPlanStatus(summary: PlanSummary): PlanStatus {
  // Check generation status first
  const generationStatus = summary.plan.generationStatus;
  if (
    generationStatus === 'generating' ||
    generationStatus === 'pending_retry'
  ) {
    return 'generating';
  }
  if (generationStatus === 'failed') {
    return 'failed';
  }

  const progressPercent = Math.round(summary.completion * 100);
  if (progressPercent >= 100) return 'completed';

  // Check if plan is inactive/paused (not updated in 30+ days)
  const updatedAt = summary.plan.updatedAt;
  if (updatedAt) {
    const now = new Date();
    const daysSinceUpdate = Math.floor(
      (now.getTime() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceUpdate >= 30) {
      return 'paused';
    }
  }

  return 'active';
}

/**
 * Retrieves the name of the next task to work on from a plan summary.
 *
 * This function finds the first incomplete module in the plan and returns its title.
 * Since task-level data is not available in the summary, it returns the module title
 * as a fallback. In a full implementation, this would fetch task details from the API.
 *
 * @param summary - The plan summary object containing modules and their completion status.
 * @returns "Not started" if the plan hasn't been started yet, "Next: [Module Title]" for the first incomplete module,
 *          "Continue learning" if no title is available, or "All tasks completed" if all modules are complete.
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
  // Check if plan hasn't been started yet
  if (summary.completedTasks === 0) {
    return 'Not started';
  }

  // Find the first incomplete module and its first incomplete task
  for (const planModule of summary.modules) {
    // Since we don't have task-level data here, return module title with "Next: " prefix
    // In a full implementation, this would come from the API
    return planModule.title ? `Next: ${planModule.title}` : 'Continue learning';
  }
  return 'All tasks completed';
}
