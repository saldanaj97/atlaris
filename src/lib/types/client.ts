// Client-friendly (serialized) shapes derived from DB relation models.
// These flatten nested relations (e.g., TaskResource.resource) and convert Date -> string.
// Keep separate from component files to avoid server<->client circular deps.

import type {
  LearningPlanWithModules,
  ModuleWithTasks,
  ProgressStatus,
  Resource,
  TaskWithRelations,
} from '@/lib/types/db';

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
}
