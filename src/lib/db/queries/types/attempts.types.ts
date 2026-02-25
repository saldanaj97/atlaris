import { generationAttempts, learningPlans } from '@/lib/db/schema';
import type { InferSelectModel } from 'drizzle-orm';

import type { ParsedModule } from '@/lib/ai/parser';
import type {
  GenerationInput,
  ProviderMetadata,
} from '@/lib/ai/types/provider.types';
import type { FailureClassification } from '@/lib/types/client';
import type { EffortNormalizationFlags } from '@/lib/utils/effort';

/**
 * Db client for attempts. Must be request-scoped {@link getDb} in API routes to enforce RLS.
 *
 * When using the RLS client returned by {@link getDb}, callers are responsible for releasing
 * it by calling its `cleanup()` method. Do this in a `finally` block.
 */
export type AttemptsDbClient = ReturnType<
  typeof import('@/lib/db/runtime').getDb
>;

export type GenerationAttemptRecord = InferSelectModel<
  typeof generationAttempts
>;

export interface AttemptReservation {
  reserved: true;
  attemptId: string;
  attemptNumber: number;
  startedAt: Date;
  sanitized: {
    topic: {
      value: string;
      truncated: boolean;
      originalLength: number;
    };
    notes: {
      value: string | undefined;
      truncated: boolean;
      originalLength?: number;
    };
  };
  promptHash: string;
  pdfProvenance?: {
    extractionHash: string;
    proofVersion: 1;
    contextDigest: string;
  } | null;
}

export interface AttemptRejection {
  reserved: false;
  reason: 'capped' | 'in_progress' | 'invalid_status' | 'rate_limited';
  currentStatus?: (typeof learningPlans.$inferSelect)['generationStatus'];
  retryAfter?: number;
}

export type ReserveAttemptResult = AttemptReservation | AttemptRejection;

/** Read-only subset of AttemptsDbClient used for count/getOldest window queries. */
export type AttemptsReadClient = Pick<AttemptsDbClient, 'select'>;

// ----- Input / sanitization -----

export interface SanitizedField {
  value: string | undefined;
  truncated: boolean;
  originalLength?: number;
}

export interface SanitizedInput {
  topic: SanitizedField & { value: string; originalLength: number };
  notes: SanitizedField;
}

// ----- Normalized modules (effort clamping) -----

export interface NormalizedTaskData {
  title: string;
  description: string | null;
  estimatedMinutes: number;
}

export interface NormalizedModuleData {
  title: string;
  description: string | null;
  estimatedMinutes: number;
  tasks: NormalizedTaskData[];
}

export interface NormalizedModulesResult {
  normalizedModules: NormalizedModuleData[];
  normalizationFlags: EffortNormalizationFlags;
}

// ----- PDF provenance -----

export interface PdfProvenanceData {
  extractionHash: string;
  proofVersion: 1;
  contextDigest: string;
}

// ----- Attempt metadata (stored in DB) -----

export interface AttemptMetadataFailure {
  classification: FailureClassification;
  timedOut: boolean;
}

export interface AttemptMetadata {
  input: {
    topic: {
      truncated: boolean;
      original_length: number;
    };
    notes: {
      truncated: boolean;
      original_length: number;
    } | null;
  };
  normalization: {
    modules_clamped: boolean;
    tasks_clamped: boolean;
  };
  timing: {
    started_at: string;
    finished_at: string;
    duration_ms: number;
    extended_timeout: boolean;
  };
  pdf: {
    extraction_hash: string;
    proof_version: 1;
    context_digest: string;
  } | null;
  provider: ProviderMetadata | null;
  failure: AttemptMetadataFailure | null;
}

export interface MetadataParams {
  sanitized: SanitizedInput;
  providerMetadata?: ProviderMetadata;
  modulesClamped: boolean;
  tasksClamped: boolean;
  startedAt: Date;
  finishedAt: Date;
  extendedTimeout: boolean;
  pdfProvenance?: PdfProvenanceData | null;
  failure?: AttemptMetadataFailure;
}

// ----- Params for exported functions -----

export interface ReserveAttemptSlotParams {
  planId: string;
  userId: string;
  input: GenerationInput;
  dbClient: AttemptsDbClient;
  /** If set, plan must have one of these statuses (takes precedence over requiredGenerationStatus). */
  allowedGenerationStatuses?: ReadonlyArray<
    (typeof learningPlans.$inferSelect)['generationStatus']
  >;
  /** If set (and allowedGenerationStatuses not set), plan must have this exact status. */
  requiredGenerationStatus?: (typeof learningPlans.$inferSelect)['generationStatus'];
  now?: () => Date;
}

export interface FinalizeSuccessParams {
  attemptId: string;
  planId: string;
  preparation: AttemptReservation;
  modules: ParsedModule[];
  providerMetadata?: ProviderMetadata;
  durationMs: number;
  extendedTimeout: boolean;
  /** Required. Pass request-scoped getDb() in API routes to enforce RLS. */
  dbClient: AttemptsDbClient;
  now?: () => Date;
}

export interface FinalizeFailureParams {
  attemptId: string;
  planId: string;
  preparation: AttemptReservation;
  classification: FailureClassification;
  durationMs: number;
  timedOut?: boolean;
  extendedTimeout?: boolean;
  providerMetadata?: ProviderMetadata;
  error?: AttemptError;
  /** Required. Pass request-scoped getDb() in API routes to enforce RLS. */
  dbClient: AttemptsDbClient;
  now?: () => Date;
}

export interface FinalizeSuccessPersistenceParams {
  attemptId: string;
  planId: string;
  preparation: AttemptReservation;
  normalizedModules: NormalizedModuleData[];
  normalizationFlags: EffortNormalizationFlags;
  modulesCount: number;
  tasksCount: number;
  durationMs: number;
  metadata: AttemptMetadata;
  finishedAt: Date;
  dbClient: AttemptsDbClient;
}

export interface UserGenerationAttemptsSinceParams {
  userId: string;
  dbClient: AttemptsReadClient;
  since: Date;
}

export interface UserGenerationAttemptWindowStats {
  count: number;
  oldestAttemptCreatedAt: Date | null;
}

// ----- Provider error retryability -----

/** Determines if a provider_error is retryable based on error metadata. */
export interface ProviderErrorStatusShape {
  status?: number;
  statusCode?: number;
  httpStatus?: number;
  response?: { status?: number } | null;
}

export interface AttemptErrorFallbackShape {
  message: string;
  code?: string;
}

export type AttemptErrorWithStatus =
  | (ProviderErrorStatusShape &
      Partial<AttemptErrorFallbackShape> & { status: number })
  | (ProviderErrorStatusShape &
      Partial<AttemptErrorFallbackShape> & { statusCode: number })
  | (ProviderErrorStatusShape &
      Partial<AttemptErrorFallbackShape> & { httpStatus: number })
  | (ProviderErrorStatusShape &
      Partial<AttemptErrorFallbackShape> & { response: { status: number } });

export type AttemptError = AttemptErrorWithStatus | AttemptErrorFallbackShape;
