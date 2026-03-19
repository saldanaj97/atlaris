// ─── Service ─────────────────────────────────────────────────────

export { GenerationAdapter } from './adapters/generation-adapter';
export { PdfOriginAdapter } from './adapters/pdf-origin-adapter';
export { PlanPersistenceAdapter } from './adapters/plan-persistence-adapter';

// ─── Adapters ────────────────────────────────────────────────────
export { QuotaAdapter } from './adapters/quota-adapter';
export { UsageRecordingAdapter } from './adapters/usage-recording-adapter';
// ─── Factory ─────────────────────────────────────────────────────
export { createPlanLifecycleService } from './factory';
// ─── Plan Operations ─────────────────────────────────────────────
export {
  atomicCheckAndInsertPlan,
  checkPlanDurationCap,
  checkPlanLimit,
  findRecentDuplicatePlan,
  markPlanGenerationFailure,
  markPlanGenerationSuccess,
} from './plan-operations';
// ─── Ports ───────────────────────────────────────────────────────
export type {
  GenerationPort,
  JobQueuePort,
  PdfOriginPort,
  PlanPersistencePort,
  QuotaPort,
  UsageRecordingPort,
} from './ports';
export type { PlanLifecycleServicePorts } from './service';
export { PlanLifecycleService } from './service';

// ─── Types ───────────────────────────────────────────────────────
export type {
  AlreadyFinalized,
  AtomicInsertResult,
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
  PdfQuotaReservationResult,
  PermanentFailure,
  PlanInsertData,
  ProcessGenerationInput,
  QuotaRejection,
  RetryableFailure,
  SubscriptionTier,
} from './types';
export { isRetryableClassification } from './types';
