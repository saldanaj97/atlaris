import type { ProviderMetadata } from '@/lib/ai/provider';

export const JOB_TYPES = {
  PLAN_GENERATION: 'plan_generation',
  PLAN_REGENERATION: 'plan_regeneration',
} as const;

export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface PlanGenerationJobData {
  topic: string;
  notes: string | null;
  skillLevel: 'beginner' | 'intermediate' | 'advanced';
  weeklyHours: number;
  learningStyle: 'reading' | 'video' | 'practice' | 'mixed';
  startDate: string | null;
  deadlineDate: string | null;
}

export interface PlanGenerationJobResult {
  modulesCount: number;
  tasksCount: number;
  durationMs: number;
  metadata?: {
    provider: ProviderMetadata | null;
    attemptId: string;
  };
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

export interface Job {
  id: string;
  type: JobType;
  planId: string | null;
  userId: string;
  status: JobStatus;
  priority: number;
  attempts: number;
  maxAttempts: number;
  data: unknown;
  result: unknown;
  error: string | null;
  processingStartedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
