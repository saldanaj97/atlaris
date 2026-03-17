// Client-friendly (serialized) shapes derived from DB relation models.
// These flatten nested relations (e.g., TaskResource.resource) and convert Date -> string.
// Keep separate from component files to avoid server<->client circular deps.

// Client-friendly (serialized) shapes derived from DB relation models.
// These flatten nested relations (e.g., TaskResource.resource) and convert Date -> string.
// Keep separate from component files to avoid server<->client circular deps.
export type {
  AttemptStatus,
  ClientGenerationAttempt,
  ClientModule,
  ClientPlanDetail,
  ClientResource,
  ClientTask,
  FailureClassification,
  PlanStatus,
} from './client.types';

export const PLAN_STATUSES = [
  'pending',
  'processing',
  'ready',
  'failed',
] as const;
