// ─── Service ─────────────────────────────────────────────────────
export { PlanLifecycleService } from './service';
export type { PlanLifecycleServicePorts } from './service';

// ─── Factory ─────────────────────────────────────────────────────
export { createPlanLifecycleService } from './factory';

// ─── Adapters ────────────────────────────────────────────────────
export { QuotaAdapter } from './adapters/quota-adapter';
export { PlanPersistenceAdapter } from './adapters/plan-persistence-adapter';
export { PdfOriginAdapter } from './adapters/pdf-origin-adapter';
export { GenerationAdapter } from './adapters/generation-adapter';
export { UsageRecordingAdapter } from './adapters/usage-recording-adapter';

// ─── Ports ───────────────────────────────────────────────────────
export type {
  PlanPersistencePort,
  QuotaPort,
  PdfOriginPort,
  GenerationPort,
  UsageRecordingPort,
  JobQueuePort,
} from './ports';

// ─── Plan Operations ─────────────────────────────────────────────
export {
  atomicCheckAndInsertPlan,
  checkPlanDurationCap,
  checkPlanLimit,
  markPlanGenerationFailure,
  markPlanGenerationSuccess,
} from './plan-operations';

// ─── Types ───────────────────────────────────────────────────────
export type {
  CreateAiPlanInput,
  CreatePdfPlanInput,
  CreatePlanResult,
  CreatePlanSuccess,
  RetryableFailure,
  PermanentFailure,
  QuotaRejection,
  ProcessGenerationInput,
  GenerationAttemptResult,
  GenerationSuccess,
  GenerationSuccessData,
  GeneratedModule,
  GeneratedTask,
  AlreadyFinalized,
  PlanInsertData,
  AtomicInsertResult,
  DurationCapResult,
  NormalizedDuration,
  PdfQuotaReservationResult,
  SubscriptionTier,
  FailureClassification,
} from './types';
export { isRetryableClassification } from './types';
