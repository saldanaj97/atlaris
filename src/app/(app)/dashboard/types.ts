export interface ActivityItem {
  id: string;
  kind: 'generated' | 'progress' | 'completed';
  planId: string;
  title: string;
  timestamp: string;
  occurredAt: string;
  progress: number;
}
