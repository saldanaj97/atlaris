import type {
  AttemptReservation,
  AttemptsDbClient,
  FinalizeFailureParams,
  FinalizeSuccessParams,
  GenerationAttemptRecord,
  ReserveAttemptResult,
  ReserveAttemptSlotParams,
} from '@/lib/db/queries/types/attempts.types';
import type { FailureClassification } from '@/shared/types/failure-classification.types';
import type { ParsedModule } from './parser.types';
import type {
  AiPlanGenerationProvider,
  GenerationInput,
  ProviderMetadata,
} from './provider.types';
import type { AdaptiveTimeoutConfig } from './timeout.types';

export type GenerationAttemptContext = {
  planId: string;
  userId: string;
  input: GenerationInput;
};

export type ReserveAttemptSlotOperation = (
  params: ReserveAttemptSlotParams,
) => Promise<ReserveAttemptResult>;

export type FinalizeAttemptSuccessOperation = (
  params: FinalizeSuccessParams,
) => Promise<GenerationAttemptRecord>;

export type FinalizeAttemptFailureOperation = (
  params: FinalizeFailureParams,
) => Promise<GenerationAttemptRecord>;

export interface AttemptOperations {
  reserveAttemptSlot: ReserveAttemptSlotOperation;
  finalizeAttemptSuccess: FinalizeAttemptSuccessOperation;
  finalizeAttemptFailure: FinalizeAttemptFailureOperation;
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
};

export type GenerationSuccessResult = {
  status: 'success';
  classification: null;
  modules: ParsedModule[];
  rawText: string;
  metadata: ProviderMetadata;
  durationMs: number;
  extendedTimeout: boolean;
  timedOut: false;
  attempt: GenerationAttemptRecord;
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
};

export type GenerationResult =
  | GenerationSuccessResult
  | GenerationFailureResult;
