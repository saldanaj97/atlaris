export interface ActivityItem {
  id: string;
  type: 'progress' | 'milestone';
  planId: string;
  planTitle: string;
  title: string;
  description?: string;
  timestamp: string;
  metadata?: {
    progress?: number;
    duration?: string;
  };
}
