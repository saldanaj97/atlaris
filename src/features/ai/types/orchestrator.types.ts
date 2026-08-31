import type { ParsedModule } from './parser.types';
import type {
  AiPlanGenerationProvider,
  GenerationInput,
  ProviderMetadata,
} from './provider.types';
import type { AdaptiveTimeoutConfig } from './timeout.types';
import type {
  AttemptRejection,
  AttemptReservation,
  AttemptsDbClient,
  GenerationAttemptRecord,
  ReserveAttemptResult,
  ReserveAttemptSlotParams,
} from '@/lib/db/queries/types/attempts.types';
import type { FailureClassification } from '@/shared/types/failure-classification.types';
import type { GenerationPurpose } from '@/shared/types/generation-purpose';

export type GenerationAttemptContext = {
  planId: string;
  userId: string;
  input: GenerationInput;
  generationPurpose: GenerationPurpose;
};

type ReserveAttemptSlotOperation = (
  params: ReserveAttemptSlotParams,
) => Promise<ReserveAttemptResult>;

export interface AttemptOperations {
  reserveAttemptSlot: ReserveAttemptSlotOperation;
}

export type AttemptOperationsOverrides = Partial<AttemptOperations>;

export type RunGenerationOptions = {
  provider?: AiPlanGenerationProvider;
  attemptOperations?: AttemptOperationsOverrides;
  timeoutConfig?: Partial<AdaptiveTimeoutConfig>;
  clock?: () => number;
  dbClient: AttemptsDbClient;
  now?: () => Date;
  signal?: AbortSignal;
  reservation?: AttemptReservation;
  allowedGenerationStatuses?: ReserveAttemptSlotParams['allowedGenerationStatuses'];
  requiredGenerationStatus?: ReserveAttemptSlotParams['requiredGenerationStatus'];
  onAttemptReserved?: (reservation: AttemptReservation) => void | Promise<void>;
};

export type GenerationAttemptRecordForResponse =
  | GenerationAttemptRecord
  | (Omit<GenerationAttemptRecord, 'id'> & { id: null });

export type GenerationFailureResult = {
  status: 'failure';
  classification: FailureClassification;
  error: Error;
  metadata?: ProviderMetadata;
  rawText?: string;
  durationMs: number;
  extendedTimeout: boolean;
  timedOut: boolean;
  attempt: GenerationAttemptRecordForResponse;
  /** Present when failure came from `reserveAttemptSlot` rejection (no in-progress row). */
  reservationRejectionReason?: AttemptRejection['reason'];
};

/** Unfinalized success after provider + parse + pace (no DB finalize yet). */
export type GenerationExecutionSuccess = {
  readonly kind: 'success';
  readonly reservation: AttemptReservation;
  readonly modules: ParsedModule[];
  readonly rawText: string;
  readonly metadata: ProviderMetadata;
  readonly durationMs: number;
  readonly extendedTimeout: boolean;
};

/** Unfinalized failure when an in_progress attempt row exists. */
export type GenerationExecutionFailureReserved = {
  readonly kind: 'failure_reserved';
  readonly reservation: AttemptReservation;
  readonly classification: FailureClassification;
  readonly error: Error;
  readonly metadata?: ProviderMetadata;
  readonly rawText?: string;
  readonly durationMs: number;
  readonly extendedTimeout: boolean;
  readonly timedOut: boolean;
};

/** Immediate failure (no attempt row) from reserveAttemptSlot rejection. */
export type GenerationExecutionFailureRejected = {
  readonly kind: 'failure_rejected';
  readonly result: GenerationFailureResult;
};

export type GenerationExecutionResult =
  | GenerationExecutionSuccess
  | GenerationExecutionFailureReserved
  | GenerationExecutionFailureRejected;
