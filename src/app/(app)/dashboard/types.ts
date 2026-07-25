export interface ActivityItem {
  id: string;
  type: 'progress' | 'milestone';
  planId: string;
  title: string;
  timestamp: string;
  progress: number;
}
