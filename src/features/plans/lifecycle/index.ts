// ─── Service ─────────────────────────────────────────────────────

// ─── Service ─────────────────────────────────────────────────────
export { GenerationAdapter } from './adapters/generation-adapter';
export { PdfOriginAdapter } from './adapters/pdf-origin-adapter';
export { PlanPersistenceAdapter } from './adapters/plan-persistence-adapter';

// ─── Adapters ────────────────────────────────────────────────────
// ─── Adapters ────────────────────────────────────────────────────
export { QuotaAdapter } from './adapters/quota-adapter';
export { UsageRecordingAdapter } from './adapters/usage-recording-adapter';
// ─── Factory ─────────────────────────────────────────────────────
// ─── Factory ─────────────────────────────────────────────────────
export { createPlanLifecycleService } from './factory';
// ─── Plan Operations ─────────────────────────────────────────────
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
  PdfQuotaReservationResult,
  PermanentFailure,
  PlanInsertData,
  ProcessGenerationInput,
  QuotaRejection,
  RetryableFailure,
  SubscriptionTier,
} from './types';
// ─── Types ───────────────────────────────────────────────────────
export { isRetryableClassification } from './types';
