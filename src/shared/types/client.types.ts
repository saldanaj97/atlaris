import type {
  ModuleWithTasks,
  Resource,
  TaskWithRelations,
} from '@/lib/db/queries/types/modules.types';
import type {
  LearningPlanWithModules,
  ProgressStatus,
} from '@/shared/types/db.types';

/** @deprecated Import `FailureClassification` from `@/shared/types/failure-classification.types`. */
export type { FailureClassification } from '@/shared/types/failure-classification.types';

import type { FailureClassification } from '@/shared/types/failure-classification.types';

export type PlanStatus = 'pending' | 'processing' | 'ready' | 'failed';

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

type ClientResource = Pick<
  Resource,
  'id' | 'type' | 'title' | 'url' | 'durationMinutes'
> & {
  order: number;
};

export type ClientTask = Pick<
  TaskWithRelations,
  'id' | 'order' | 'title' | 'description' | 'estimatedMinutes'
> & {
  status: ProgressStatus;
  resources: ClientResource[];
};

export type ClientModule = Pick<
  ModuleWithTasks,
  'id' | 'order' | 'title' | 'description' | 'estimatedMinutes'
> & {
  tasks: ClientTask[];
};

export type ClientPlanDetail = Pick<
  LearningPlanWithModules,
  | 'id'
  | 'topic'
  | 'skillLevel'
  | 'weeklyHours'
  | 'learningStyle'
  | 'visibility'
  | 'origin'
> & {
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
