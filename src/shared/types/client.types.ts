import type { PLAN_STATUSES } from '@/shared/types/client';
import type {
  LearningStyle,
  ProgressStatus,
  ResourceType,
  SkillLevel,
} from '@/shared/types/db.types';

/** @deprecated Import `FailureClassification` from `@/shared/types/failure-classification.types`. */
export type { FailureClassification } from '@/shared/types/failure-classification.types';

import type { FailureClassification } from '@/shared/types/failure-classification.types';

export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const ATTEMPT_STATUSES = ['success', 'failure', 'in_progress'] as const;

export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export type ClientGenerationAttempt = {
  id: string;
  status: AttemptStatus;
  classification: FailureClassification | null;
  durationMs: number;
  modulesCount: number;
  tasksCount: number;
  truncatedTopic: boolean;
  truncatedNotes: boolean;
  normalizedEffort: boolean;
  promptHash: string | null;
  metadata: Record<string, unknown> | null;
  model?: string | null;
  createdAt: string;
};

type ClientResource = {
  id: string;
  type: ResourceType;
  title: string;
  url: string;
  durationMinutes: number | null;
  order: number;
};

export type ClientTask = {
  id: string;
  order: number;
  title: string;
  description: string | null;
  estimatedMinutes: number;
  status: ProgressStatus;
  resources: ClientResource[];
};

export type ClientModule = {
  id: string;
  order: number;
  title: string;
  description: string | null;
  estimatedMinutes: number;
  tasks: ClientTask[];
};

export type ClientPlanDetail = {
  id: string;
  topic: string;
  skillLevel: SkillLevel;
  weeklyHours: number;
  learningStyle: LearningStyle;
  visibility: string;
  origin: 'ai' | 'manual' | 'template' | null;
  createdAt?: string;
  modules: ClientModule[];
  totalTasks: number;
  completedTasks: number;
  totalMinutes: number;
  completedMinutes: number;
  completedModules: number;
  status?: PlanStatus;
  latestAttempt?: ClientGenerationAttempt | null;
};
