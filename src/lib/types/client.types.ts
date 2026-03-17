import type {
  ModuleWithTasks,
  Resource,
  TaskWithRelations,
} from '@/lib/db/queries/types/modules.types';
import type {
  LearningPlanWithModules,
  ProgressStatus,
} from '@/lib/types/db.types';

export type PlanStatus = 'pending' | 'processing' | 'ready' | 'failed';

export type AttemptStatus = 'success' | 'failure' | 'in_progress';

export type FailureClassification =
  | 'validation'
  | 'conflict'
  | 'provider_error'
  | 'rate_limit'
  | 'timeout'
  | 'capped';

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

export type ClientResource = Pick<
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
  status?: PlanStatus;
  latestAttempt?: ClientGenerationAttempt | null;
};
