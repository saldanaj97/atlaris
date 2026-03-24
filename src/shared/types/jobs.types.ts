import { JOB_TYPE_MAP, type JobTypeValue } from '@/shared/constants/jobs';

export const JOB_TYPES = JOB_TYPE_MAP;

export type JobType = JobTypeValue;

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface JobErrorHistoryEntry {
  attempt: number;
  error: string;
  timestamp: string;
}

export interface PlanRegenerationJobData {
  planId: string;
  overrides?: Partial<{
    topic: string;
    notes: string | null;
    skillLevel: 'beginner' | 'intermediate' | 'advanced';
    weeklyHours: number;
    learningStyle: 'reading' | 'video' | 'practice' | 'mixed';
    startDate: string | null;
    deadlineDate: string | null;
  }>;
}

export interface PlanRegenerationJobResult {
  planId: string;
  modulesCount: number;
  tasksCount: number;
  durationMs: number;
}

export type PlanRegenerationJobPayload = PlanRegenerationJobData & {
  errorHistory?: JobErrorHistoryEntry[];
};

export type JobPayload = PlanRegenerationJobPayload;

export type JobResult = PlanRegenerationJobResult;

export interface Job<
  TPayload extends JobPayload = JobPayload,
  TResult extends JobResult | null = JobResult | null,
> {
  id: string;
  type: JobType;
  planId: string | null;
  userId: string;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  data: TPayload;
  result: TResult;
  error: string | null;
  processingStartedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
