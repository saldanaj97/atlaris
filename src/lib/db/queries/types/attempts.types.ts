import type { DbClient } from '@/lib/db/types';
import type { EffortNormalizationFlags } from '@/shared/constants/effort';
import type {
  GenerationInput,
  ProviderMetadata,
} from '@/shared/types/ai-provider.types';
import type { SubscriptionTier } from '@/shared/types/billing.types';
import type { FailureClassification } from '@/shared/types/failure-classification.types';
import type { GenerationPurpose } from '@/shared/types/generation-purpose';
import type { InferSelectModel } from 'drizzle-orm';

type DbSchemaModule = typeof import('@supabase/schema');

/**
 * Db client for attempts. Must be request-scoped {@link getDb} in API routes to enforce RLS.
 *
 * When using the RLS client returned by {@link getDb}, callers are responsible for releasing
 * it by calling its `cleanup()` method. Do this in a `finally` block.
 */
export type AttemptsDbClient = DbClient;

export type GenerationAttemptRecord = InferSelectModel<
  DbSchemaModule['generationAttempts']
>;

export interface AttemptReservation {
  reserved: true;
  attemptId: string;
  attemptNumber: number;
  startedAt: Date;
  /** Tier admitted when a durable workflow reservation was created. */
  admittedTier?: SubscriptionTier;
  generationPurpose: GenerationPurpose;
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
}

export interface AttemptRejection {
  reserved: false;
  reason:
    | 'capped'
    | 'in_progress'
    | 'invalid_status'
    | 'rate_limited'
    | 'plan_limit'
    | 'active_child_generation'
    | 'free_allowance_used'
    | 'free_initial_in_progress';
  currentStatus?: InferSelectModel<
    DbSchemaModule['learningPlans']
  >['generationStatus'];
  retryAfter?: number;
}

export type ReserveAttemptResult = AttemptReservation | AttemptRejection;

/** Read-only subset of AttemptsDbClient used for count/getOldest window queries. */
export type AttemptsReadClient = Pick<AttemptsDbClient, 'select'>;

// ----- Input / sanitization -----

interface SanitizedField {
  value: string | undefined;
  truncated: boolean;
  originalLength?: number;
}

export interface SanitizedInput {
  topic: SanitizedField & { value: string; originalLength: number };
  notes: SanitizedField;
}

// ----- Normalized modules (effort clamping) -----

interface NormalizedTaskData {
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

// ----- Attempt metadata (stored in DB) -----

interface AttemptMetadataFailure {
  classification: FailureClassification;
  timedOut: boolean;
}

export interface AttemptWorkflowMetadata {
  provider: 'workflow-sdk';
  runId: string;
  /** Stable logical operation key used to recover a workflow reservation replay. */
  idempotencyKey?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AttemptMetadata {
  workflow?: AttemptWorkflowMetadata;
  admitted_tier?: SubscriptionTier;
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
  provider: ProviderMetadata | null;
  failure: AttemptMetadataFailure | null;
}

export interface MetadataParams {
  sanitized: SanitizedInput;
  providerMetadata?: ProviderMetadata;
  workflowMetadata?: AttemptWorkflowMetadata;
  modulesClamped: boolean;
  tasksClamped: boolean;
  startedAt: Date;
  finishedAt: Date;
  extendedTimeout: boolean;
  failure?: AttemptMetadataFailure;
  admittedTier?: SubscriptionTier;
}

// ----- Params for exported functions -----

export interface ReserveAttemptSlotParams {
  planId: string;
  userId: string;
  input: GenerationInput;
  generationPurpose: GenerationPurpose;
  dbClient: AttemptsDbClient;
  /** If set, plan must have one of these statuses (takes precedence over requiredGenerationStatus). */
  allowedGenerationStatuses?: ReadonlyArray<
    InferSelectModel<DbSchemaModule['learningPlans']>['generationStatus']
  >;
  /** If set (and allowedGenerationStatuses not set), plan must have this exact status. */
  requiredGenerationStatus?: InferSelectModel<
    DbSchemaModule['learningPlans']
  >['generationStatus'];
  /** Durable workflow identity for idempotently recovering a committed reservation. */
  workflowMetadata?: AttemptWorkflowMetadata;
  now?: () => Date;
}

export interface FinalizeSuccessPersistenceInTxParams {
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
