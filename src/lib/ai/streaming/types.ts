export type PlanStartEvent = {
  type: 'plan_start';
  data: {
    planId: string;
    topic: string;
    skillLevel: 'beginner' | 'intermediate' | 'advanced';
    learningStyle: 'reading' | 'video' | 'practice' | 'mixed';
    weeklyHours: number;
    startDate: string | null;
    deadlineDate: string | null;
  };
};

export type ModuleSummaryEvent = {
  type: 'module_summary';
  data: {
    planId: string;
    index: number;
    title: string;
    description?: string | null;
    estimatedMinutes: number;
    tasksCount: number;
  };
};

export type ProgressEvent = {
  type: 'progress';
  data: {
    planId: string;
    modulesParsed: number;
    modulesTotalHint?: number;
  };
};

export type CompleteEvent = {
  type: 'complete';
  data: {
    planId: string;
    modulesCount: number;
    tasksCount: number;
    durationMs: number;
  };
};

export type ErrorEvent = {
  type: 'error';
  data: {
    planId?: string | null;
    message: string;
    classification: string;
    retryable: boolean;
  };
};

export type StreamingEvent =
  | PlanStartEvent
  | ModuleSummaryEvent
  | ProgressEvent
  | CompleteEvent
  | ErrorEvent;
