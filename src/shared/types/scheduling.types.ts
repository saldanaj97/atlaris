// ── Plain types ──

export type SessionAssignment = {
  taskId: string;
  taskTitle: string;
  estimatedMinutes: number;
  moduleId: string;
  moduleName: string;
};

export type Day = {
  dayNumber: number;
  date: string;
  sessions: SessionAssignment[];
};

export type Week = {
  weekNumber: number;
  startDate: string;
  endDate: string;
  days: Day[];
};

export type ScheduleJson = {
  weeks: Week[];
  totalWeeks: number;
  totalSessions: number;
};

export type ScheduleCacheRow = {
  planId: string;
  scheduleJson: ScheduleJson;
  inputsHash: string;
  generatedAt: Date;
  timezone: string;
  weeklyHours: number;
  startDate: string;
  deadline: string | null;
};

export type ScheduleInputs = {
  planId: string;
  tasks: Array<{
    id: string;
    title: string;
    estimatedMinutes: number;
    order: number;
    moduleId: string;
    moduleTitle?: string;
  }>;
  startDate: string;
  deadline: string | null;
  weeklyHours: number;
  timezone: string;
};
