/**
 * Port interfaces for the plan lifecycle module.
 *
 * Ports define the boundaries between the lifecycle service and external
 * concerns (persistence, billing, AI, jobs). The service depends only on
 * these interfaces — never on concrete implementations.
 */

import type { GenerationInput } from '@/shared/types/ai-provider.types';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';

import type {
  AtomicInsertResult,
  CreatePdfPlanInput,
  DurationCapResult,
  FailureClassification,
  GeneratedModule,
  NormalizedDuration,
  PdfContext,
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
}

// ─── PdfOriginPort ───────────────────────────────────────────────

export type PreparePlanInputParams = {
  authUserId: CreatePdfPlanInput['authUserId'];
  internalUserId: CreatePdfPlanInput['userId'];
  topic: CreatePdfPlanInput['topic'];
  skillLevel: CreatePdfPlanInput['skillLevel'];
  weeklyHours: CreatePdfPlanInput['weeklyHours'];
  learningStyle: CreatePdfPlanInput['learningStyle'];
  extractedContent: CreatePdfPlanInput['extractedContent'];
  pdfProofToken: CreatePdfPlanInput['pdfProofToken'];
  pdfExtractionHash: CreatePdfPlanInput['pdfExtractionHash'];
  pdfProofVersion: CreatePdfPlanInput['pdfProofVersion'];
};

export type PreparePlanInputSuccess = {
  extractedContext: PdfContext | null;
  topic: string;
  skillLevel: CreatePdfPlanInput['skillLevel'];
  weeklyHours: CreatePdfPlanInput['weeklyHours'];
  learningStyle: CreatePdfPlanInput['learningStyle'];
  pdfUsageReserved: boolean;
  pdfProvenance: { extractionHash: string; proofVersion: 1 } | null;
};

export interface PdfOriginPort {
  /** Verify PDF proof token and prepare plan input from extracted PDF context. */
  preparePlanInput(
    this: void,
    params: PreparePlanInputParams
  ): Promise<PreparePlanInputSuccess>;

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

export type GenerationRunParams = {
  planId: string;
  userId: string;
  tier: SubscriptionTier;
  input: Readonly<GenerationInput>;
  modelOverride?: string | null;
  signal?: AbortSignal;
};

export type GenerationRunSuccess = {
  status: 'success';
  modules: GeneratedModule[];
  metadata: Record<string, unknown>;
  usage: CanonicalAIUsage;
  durationMs: number;
};

export type GenerationRunFailure = {
  status: 'failure';
  classification: FailureClassification;
  error: Error;
  metadata?: Record<string, unknown>;
  usage?: CanonicalAIUsage;
  durationMs: number;
};

export type GenerationRunResult = GenerationRunSuccess | GenerationRunFailure;

export interface GenerationPort {
  /** Execute an AI plan generation attempt. */
  runGeneration(
    this: void,
    params: GenerationRunParams
  ): Promise<GenerationRunResult>;
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
