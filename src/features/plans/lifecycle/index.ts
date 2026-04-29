// ─── Factory ─────────────────────────────────────────────────────
export { createPlanLifecycleService } from './factory';
// ─── Ports ───────────────────────────────────────────────────────
export type {
  GenerationPort,
  JobQueuePort,
  PlanGenerationStatusPort,
  PlanPersistencePort,
  QuotaPort,
  UsageRecordingPort,
} from './ports';
export type { PlanLifecycleServicePorts } from './service';
// ─── Service ─────────────────────────────────────────────────────
export type { SubscriptionTier } from '@/shared/types/billing.types';
export { isRetryableClassification } from '@/shared/types/failure-classification';
export type { FailureClassification } from '@/shared/types/failure-classification.types';
export { PlanLifecycleService } from './service';
export type {
  AlreadyFinalized,
  AtomicInsertResult,
  AttemptCapExceeded,
  CreateAiPlanInput,
  CreatePlanResult,
  CreatePlanSuccess,
  DuplicateDetected,
  DurationCapResult,
  GeneratedModule,
  GeneratedTask,
  GenerationAttemptResult,
  GenerationSuccess,
  GenerationSuccessData,
  NormalizedDuration,
  PermanentFailure,
  PlanInsertData,
  ProcessGenerationInput,
  QuotaRejection,
  RetryableFailure,
} from './types';
