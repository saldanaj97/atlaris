// Client-friendly (serialized) shapes derived from DB relation models.
// These flatten nested relations (e.g., TaskResource.resource) and convert Date -> string.
// Keep separate from component files to avoid server<->client circular deps.

import type {
  ModuleWithTasks,
  Resource,
  TaskWithRelations,
} from '@/lib/db/queries/types/modules.types';
import type { LearningPlanWithModules, ProgressStatus } from '@/lib/types/db';

export type PlanStatus = 'pending' | 'processing' | 'ready' | 'failed';

export type AttemptStatus = 'success' | 'failure';

export type FailureClassification =
  | 'validation'
  | 'provider_error'
  | 'rate_limit'
  | 'timeout'
  | 'capped';

export interface ClientGenerationAttempt {
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
}

export interface ClientResource
  extends Pick<Resource, 'id' | 'type' | 'title' | 'url' | 'durationMinutes'> {
  order: number;
}

export interface ClientTask
  extends Pick<
    TaskWithRelations,
    'id' | 'order' | 'title' | 'description' | 'estimatedMinutes'
  > {
  status: ProgressStatus;
  resources: ClientResource[];
}

export interface ClientModule
  extends Pick<
    ModuleWithTasks,
    'id' | 'order' | 'title' | 'description' | 'estimatedMinutes'
  > {
  tasks: ClientTask[];
}

export interface ClientPlanDetail
  extends Pick<
    LearningPlanWithModules,
    | 'id'
    | 'topic'
    | 'skillLevel'
    | 'weeklyHours'
    | 'learningStyle'
    | 'visibility'
    | 'origin'
  > {
  createdAt?: string; // serialized from Date
  modules: ClientModule[];
  status?: PlanStatus;
  latestAttempt?: ClientGenerationAttempt | null;
}
