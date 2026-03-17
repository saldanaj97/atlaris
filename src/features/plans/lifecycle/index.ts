// ─── Service ─────────────────────────────────────────────────────
export { PlanLifecycleService } from './service';
export type { PlanLifecycleServicePorts } from './service';

// ─── Factory ─────────────────────────────────────────────────────
export { createPlanLifecycleService } from './factory';

// ─── Adapters ────────────────────────────────────────────────────
export { QuotaAdapter } from './adapters/quota-adapter';
export { PlanPersistenceAdapter } from './adapters/plan-persistence-adapter';

// ─── Ports ───────────────────────────────────────────────────────
export type {
  PlanPersistencePort,
  QuotaPort,
  PdfOriginPort,
  GenerationPort,
  UsageRecordingPort,
  JobQueuePort,
} from './ports';

// ─── Types ───────────────────────────────────────────────────────
export type {
  CreateAiPlanInput,
  CreatePlanResult,
  CreatePlanSuccess,
  RetryableFailure,
  PermanentFailure,
  QuotaRejection,
  PlanInsertData,
  AtomicInsertResult,
  DurationCapResult,
  NormalizedDuration,
  PdfQuotaReservationResult,
  SubscriptionTier,
  FailureClassification,
} from './types';
