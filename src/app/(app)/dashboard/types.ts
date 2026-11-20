export type ActivityKind =
  | 'plan-created'
  | 'task-completed'
  | 'task-started'
  | 'task-reset';

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  planId: string;
  title: string;
  planTopic?: string;
  minutes?: number;
  timestamp: string;
  occurredAt: string;
}
