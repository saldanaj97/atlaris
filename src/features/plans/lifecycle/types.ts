/**
 * Types for the plan lifecycle module.
 *
 * These types define the contracts between the lifecycle service and its ports,
 * as well as the discriminated union result types for lifecycle operations.
 */

import type { SubscriptionTier } from '@/features/billing/tier-limits.types';
import type { PdfContext } from '@/features/pdf/context.types';
import type { FailureClassification } from '@/types/client.types';

// Re-export commonly used types so the service can import from one place
export type { SubscriptionTier } from '@/features/billing/tier-limits.types';
export type { PdfContext } from '@/features/pdf/context.types';
export type { FailureClassification } from '@/types/client.types';

// ─── Input types ─────────────────────────────────────────────────

/** Input for creating an AI-origin learning plan. */
export type CreateAiPlanInput = {
  readonly userId: string;
  readonly topic: string;
  readonly skillLevel: 'beginner' | 'intermediate' | 'advanced';
  readonly weeklyHours: number;
  readonly learningStyle: 'reading' | 'video' | 'practice' | 'mixed';
  readonly startDate?: string | null;
  readonly deadlineDate?: string | null;
};

/** Data passed to the persistence port for atomic plan insertion. */
export type PlanInsertData = {
  readonly topic: string;
  readonly skillLevel: 'beginner' | 'intermediate' | 'advanced';
  readonly weeklyHours: number;
  readonly learningStyle: 'reading' | 'video' | 'practice' | 'mixed';
  readonly visibility: 'private';
  readonly origin: 'ai' | 'pdf';
  readonly extractedContext?: PdfContext | null;
  readonly startDate?: string | null;
  readonly deadlineDate?: string | null;
};

// ─── Port result types ───────────────────────────────────────────

/** Result of an atomic plan insert operation. */
export type AtomicInsertResult =
  | { readonly success: true; readonly id: string }
  | { readonly success: false; readonly reason: string };

/** Result of a duration cap check. */
export type DurationCapResult = {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly upgradeUrl?: string;
};

/** Normalized plan duration after tier-based adjustments. */
export type NormalizedDuration = {
  readonly startDate: string | null;
  readonly deadlineDate: string | null;
  readonly totalWeeks: number;
};

/** Result of a PDF quota reservation attempt. */
export type PdfQuotaReservationResult =
  | {
      readonly allowed: true;
      readonly newCount: number;
      readonly limit: number;
    }
  | {
      readonly allowed: false;
      readonly currentCount: number;
      readonly limit: number;
    };

// ─── Lifecycle result types (discriminated union) ────────────────

/** Plan was successfully created. */
export type CreatePlanSuccess = {
  readonly status: 'success';
  readonly planId: string;
  readonly tier: SubscriptionTier;
};

/** A retryable failure occurred (e.g. provider error, timeout). */
export type RetryableFailure = {
  readonly status: 'retryable_failure';
  readonly classification: FailureClassification | 'unknown';
  readonly error: Error;
};

/** A permanent failure occurred (e.g. validation error). */
export type PermanentFailure = {
  readonly status: 'permanent_failure';
  readonly classification: FailureClassification | 'unknown';
  readonly error: Error;
};

/** The operation was rejected due to quota/limit constraints. */
export type QuotaRejection = {
  readonly status: 'quota_rejected';
  readonly reason: string;
  readonly upgradeUrl?: string;
};

/**
 * Discriminated union of all possible outcomes from plan creation.
 * The service never throws for these expected lifecycle outcomes.
 */
export type CreatePlanResult =
  | CreatePlanSuccess
  | RetryableFailure
  | PermanentFailure
  | QuotaRejection;
