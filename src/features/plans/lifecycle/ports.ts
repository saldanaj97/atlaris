/**
 * Port interfaces for the plan lifecycle module.
 *
 * Ports define the boundaries between the lifecycle service and external
 * concerns (persistence, billing, AI, jobs). The service depends only on
 * these interfaces — never on concrete implementations.
 */

import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';

import type {
  AtomicInsertResult,
  DurationCapResult,
  FailureClassification,
  GeneratedModule,
  NormalizedDuration,
  PdfContext,
  PdfQuotaReservationResult,
  PlanInsertData,
  SubscriptionTier,
} from './types';

export type { FailureClassification } from './types';

// ─── PlanPersistencePort ─────────────────────────────────────────

export interface PlanPersistencePort {
  /** Atomically check plan limit and insert a new plan within a transaction. */
  atomicInsertPlan(
    this: void,
    userId: string,
    planData: PlanInsertData
  ): Promise<AtomicInsertResult>;

  /** Find a plan that has exhausted generation attempts (capped without modules). */
  findCappedPlanWithoutModules(
    this: void,
    userId: string
  ): Promise<string | null>;

  /** Find a recent duplicate plan with the same normalized topic (dedup window). */
  findRecentDuplicatePlan(
    this: void,
    userId: string,
    normalizedTopic: string
  ): Promise<string | null>;

  /** Mark a plan's generation as successful. */
  markGenerationSuccess(this: void, planId: string): Promise<void>;

  /** Mark a plan's generation as failed. */
  markGenerationFailure(this: void, planId: string): Promise<void>;
}

// ─── QuotaPort ───────────────────────────────────────────────────

export interface QuotaPort {
  /** Resolve the user's current subscription tier. */
  resolveUserTier(this: void, userId: string): Promise<SubscriptionTier>;

  /** Check if the plan duration is within the tier's cap. */
  checkDurationCap(
    this: void,
    params: {
      tier: SubscriptionTier;
      weeklyHours: number;
      totalWeeks: number;
    }
  ): DurationCapResult;

  /** Normalize plan dates and compute total weeks based on tier constraints. */
  normalizePlanDuration(
    this: void,
    params: {
      tier: SubscriptionTier;
      weeklyHours: number;
      startDate?: string | null;
      deadlineDate?: string | null;
      today?: Date;
    }
  ): NormalizedDuration;

  /** Reserve a PDF quota slot for PDF-origin plans. */
  reservePdfQuota(
    this: void,
    userId: string
  ): Promise<PdfQuotaReservationResult>;

  /** Roll back a previously reserved PDF quota slot on failure. */
  rollbackPdfQuota(
    this: void,
    userId: string,
    reserved: boolean
  ): Promise<void>;
}

// ─── PdfOriginPort ───────────────────────────────────────────────

export interface PdfOriginPort {
  /** Verify PDF proof token and prepare plan input from extracted PDF context. */
  preparePlanInput(
    this: void,
    params: {
      body: Record<string, unknown>;
      authUserId: string;
      internalUserId: string;
    }
  ): Promise<{
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
  rollbackPdfUsage(
    this: void,
    params: {
      internalUserId: string;
      reserved: boolean;
    }
  ): Promise<void>;
}

// ─── GenerationPort ──────────────────────────────────────────────

export interface GenerationPort {
  /** Execute an AI plan generation attempt. */
  runGeneration(
    this: void,
    params: {
      planId: string;
      userId: string;
      tier: SubscriptionTier;
      input: {
        topic: string;
        skillLevel: 'beginner' | 'intermediate' | 'advanced';
        weeklyHours: number;
        learningStyle: 'reading' | 'video' | 'practice' | 'mixed';
        startDate?: string | null;
        deadlineDate?: string | null;
        notes?: string | null;
        pdfContext?: PdfContext | null;
        pdfExtractionHash?: string;
        pdfProofVersion?: 1;
      };
      modelOverride?: string | null;
      signal?: AbortSignal;
    }
  ): Promise<
    | {
        status: 'success';
        modules: GeneratedModule[];
        metadata: Record<string, unknown>;
        usage: CanonicalAIUsage;
        durationMs: number;
      }
    | {
        status: 'failure';
        classification: FailureClassification;
        error: Error;
        metadata?: Record<string, unknown>;
        usage?: CanonicalAIUsage;
        durationMs: number;
      }
  >;
}

// ─── UsageRecordingPort ──────────────────────────────────────────

export interface UsageRecordingPort {
  /** Record AI token usage for billing and analytics. */
  recordUsage(
    this: void,
    params: {
      userId: string;
      usage: CanonicalAIUsage;
      kind?: 'plan' | 'regeneration';
    }
  ): Promise<void>;
}

// ─── JobQueuePort ────────────────────────────────────────────────

export interface JobQueuePort {
  /** Enqueue a job for background processing. */
  enqueueJob(
    this: void,
    params: {
      type: string;
      planId: string | null;
      userId: string;
      data: Record<string, unknown>;
      priority?: number;
    }
  ): Promise<string>;

  /** Mark a job as completed with its result. */
  completeJob(
    this: void,
    jobId: string,
    result: Record<string, unknown>
  ): Promise<void>;

  /** Mark a job as failed with an error message. */
  failJob(
    this: void,
    jobId: string,
    error: string,
    options?: { retryable?: boolean }
  ): Promise<void>;
}
