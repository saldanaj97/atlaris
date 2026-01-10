export interface ActivityItem {
  id: string;
  type:
    | 'progress'
    | 'milestone'
    | 'session'
    | 'export'
    | 'streak'
    | 'recommendation';
  planId: string;
  planTitle: string;
  title: string;
  description?: string;
  timestamp: string;
  metadata?: {
    progress?: number;
    duration?: string;
    platform?: string;
    streakCount?: number;
  };
}

export type ScheduledEvent = {
  id: string;
  title: string;
  type: 'live-session' | 'deadline' | 'quiz' | 'assignment' | 'milestone';
  dateTime: Date;
  duration?: string;
  courseName: string;
  isUrgent?: boolean;
};

export type ActivityFilter =
  | 'all'
  | 'session'
  | 'milestone'
  | 'progress'
  | 'export';

export type ActivityLabel =
  | 'All'
  | 'Sessions'
  | 'Milestones'
  | 'Progress'
  | 'Exports';

export type ActivityFilterTab = {
  id: ActivityFilter;
  label: ActivityLabel;
};
