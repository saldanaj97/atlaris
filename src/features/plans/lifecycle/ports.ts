/**
 * Port interfaces for the plan lifecycle module.
 *
 * Ports define the boundaries between the lifecycle service and external
 * concerns (persistence, billing, AI, jobs). The service depends only on
 * these interfaces — never on concrete implementations.
 */

import type {
  AtomicInsertResult,
  DurationCapResult,
  FailureClassification,
  NormalizedDuration,
  PdfQuotaReservationResult,
  PlanInsertData,
  SubscriptionTier,
} from './types';

// ─── PlanPersistencePort ─────────────────────────────────────────

export interface PlanPersistencePort {
  /** Atomically check plan limit and insert a new plan within a transaction. */
  atomicInsertPlan(
    userId: string,
    planData: PlanInsertData
  ): Promise<AtomicInsertResult>;

  /** Find a plan that has exhausted generation attempts (capped without modules). */
  findCappedPlanWithoutModules(userId: string): Promise<string | null>;

  /** Mark a plan's generation as successful. */
  markGenerationSuccess(planId: string): Promise<void>;

  /** Mark a plan's generation as failed. */
  markGenerationFailure(planId: string): Promise<void>;
}

// ─── QuotaPort ───────────────────────────────────────────────────

export interface QuotaPort {
  /** Resolve the user's current subscription tier. */
  resolveUserTier(userId: string): Promise<SubscriptionTier>;

  /** Check if the plan duration is within the tier's cap. */
  checkDurationCap(params: {
    tier: SubscriptionTier;
    weeklyHours: number;
    totalWeeks: number;
  }): DurationCapResult;

  /** Normalize plan dates and compute total weeks based on tier constraints. */
  normalizePlanDuration(params: {
    tier: SubscriptionTier;
    weeklyHours: number;
    startDate?: string | null;
    deadlineDate?: string | null;
    today?: Date;
  }): NormalizedDuration;

  /** Reserve a PDF quota slot for PDF-origin plans. */
  reservePdfQuota(userId: string): Promise<PdfQuotaReservationResult>;

  /** Roll back a previously reserved PDF quota slot on failure. */
  rollbackPdfQuota(userId: string, reserved: boolean): Promise<void>;
}

// ─── PdfOriginPort ───────────────────────────────────────────────

export interface PdfOriginPort {
  /** Verify PDF proof token and prepare plan input from extracted PDF context. */
  preparePlanInput(params: {
    body: Record<string, unknown>;
    authUserId: string;
    internalUserId: string;
  }): Promise<{
    origin: 'pdf';
    extractedContext: unknown;
    topic: string;
    skillLevel: string;
    weeklyHours: number;
    learningStyle: string;
    pdfUsageReserved: boolean;
    pdfProvenance: { extractionHash: string; proofVersion: 1 } | null;
  }>;

  /** Roll back PDF usage reservation on failure. */
  rollbackPdfUsage(params: {
    internalUserId: string;
    reserved: boolean;
  }): Promise<void>;
}

// ─── GenerationPort ──────────────────────────────────────────────

export interface GenerationPort {
  /** Execute an AI plan generation attempt. */
  runGeneration(params: {
    planId: string;
    userId: string;
    input: {
      topic: string;
      skillLevel: 'beginner' | 'intermediate' | 'advanced';
      weeklyHours: number;
      learningStyle: 'reading' | 'video' | 'practice' | 'mixed';
      startDate?: string | null;
      deadlineDate?: string | null;
      notes?: string | null;
    };
    signal?: AbortSignal;
  }): Promise<
    | {
        status: 'success';
        modules: unknown[];
        metadata: Record<string, unknown>;
        durationMs: number;
      }
    | {
        status: 'failure';
        classification: FailureClassification;
        error: Error;
        durationMs: number;
      }
  >;
}

// ─── UsageRecordingPort ──────────────────────────────────────────

export interface UsageRecordingPort {
  /** Record AI token usage for billing and analytics. */
  recordUsage(params: {
    userId: string;
    provider: string;
    model: string;
    inputTokens?: number | null;
    outputTokens?: number | null;
    costCents?: number | null;
    requestId?: string | null;
    kind?: 'plan' | 'regeneration';
  }): Promise<void>;
}

// ─── JobQueuePort ────────────────────────────────────────────────

export interface JobQueuePort {
  /** Enqueue a job for background processing. */
  enqueueJob(params: {
    type: string;
    planId: string | null;
    userId: string;
    data: Record<string, unknown>;
    priority?: number;
  }): Promise<string>;

  /** Mark a job as completed with its result. */
  completeJob(jobId: string, result: Record<string, unknown>): Promise<void>;

  /** Mark a job as failed with an error message. */
  failJob(
    jobId: string,
    error: string,
    options?: { retryable?: boolean }
  ): Promise<void>;
}
