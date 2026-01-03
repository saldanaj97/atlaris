import type { ProviderMetadata } from '@/lib/ai/provider';

import { JOB_TYPE_MAP, type JobTypeValue } from './constants';

/**
 * Job type constants object for convenient access.
 * Re-exported from the single source of truth in constants.ts
 * This ensures the enum and runtime validation are always in sync.
 */
export const JOB_TYPES = JOB_TYPE_MAP;

export type JobType = JobTypeValue;

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
