// ─── Factory ─────────────────────────────────────────────────────
export { createPlanLifecycleService } from './factory';
// ─── Ports ───────────────────────────────────────────────────────
export type {
  GenerationPort,
  JobQueuePort,
  PdfOriginPort,
  PlanPersistencePort,
  QuotaPort,
  UsageRecordingPort,
} from './ports';
// ─── Service ─────────────────────────────────────────────────────
export type { PlanLifecycleServicePorts } from './service';
export { PlanLifecycleService } from './service';
// ─── Types ───────────────────────────────────────────────────────
export type {
  AlreadyFinalized,
  AtomicInsertResult,
  AttemptCapExceeded,
  CreateAiPlanInput,
  CreatePdfPlanInput,
  CreatePlanResult,
  CreatePlanSuccess,
  DuplicateDetected,
  DurationCapResult,
  FailureClassification,
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
  SubscriptionTier,
} from './types';
export { isRetryableClassification } from './types';
