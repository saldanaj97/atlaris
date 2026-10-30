export type ActivityKind =
  | 'plan-created'
  | 'task-completed'
  | 'task-started'
  | 'task-reset';

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  planId: string;
  /** Task title, or the plan topic for plan-level events. */
  title: string;
  /** Plan topic for task events; absent for plan-level events. */
  planTopic?: string;
  /** Estimated minutes of a completed task. */
  minutes?: number;
  timestamp: string;
  occurredAt: string;
}
