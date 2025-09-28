import {
  recordFailure,
  recordSuccess,
  startAttempt,
  type GenerationAttemptRecord,
} from '@/lib/db/queries/attempts';
import type { FailureClassification } from '@/lib/types/client';

import { classifyFailure } from './classification';
import { OpenAIGenerationProvider } from './openaiProvider';
import {
  parseGenerationStream,
  type ParsedGeneration,
  type ParsedModule,
} from './parser';
import {
  ProviderMetadata,
  ProviderTimeoutError,
  type AiPlanGenerationProvider,
  type GenerationInput,
} from './provider';
import { createAdaptiveTimeout, type AdaptiveTimeoutConfig } from './timeout';

export interface GenerationAttemptContext {
  planId: string;
  userId: string;
  input: GenerationInput;
}

export interface RunGenerationOptions {
  provider?: AiPlanGenerationProvider;
  timeoutConfig?: Partial<AdaptiveTimeoutConfig>;
  clock?: () => number;
  dbClient?: Parameters<typeof startAttempt>[0]['dbClient'];
  now?: () => Date;
}

export interface GenerationSuccessResult {
  status: 'success';
  classification: null;
  modules: ParsedModule[];
  rawText: string;
  metadata: ProviderMetadata;
  durationMs: number;
  extendedTimeout: boolean;
  timedOut: false;
  attempt: GenerationAttemptRecord;
}

export interface GenerationFailureResult {
  status: 'failure';
  classification: FailureClassification;
  error: unknown;
  metadata?: ProviderMetadata;
  rawText?: string;
  durationMs: number;
  extendedTimeout: boolean;
  timedOut: boolean;
  attempt: GenerationAttemptRecord;
}

export type GenerationResult =
  | GenerationSuccessResult
  | GenerationFailureResult;

const DEFAULT_CLOCK = () => Date.now();

function getProvider(
  provider?: AiPlanGenerationProvider
): AiPlanGenerationProvider {
  return provider ?? new OpenAIGenerationProvider();
}

export async function runGenerationAttempt(
  context: GenerationAttemptContext,
  options: RunGenerationOptions = {}
): Promise<GenerationResult> {
  const clock = options.clock ?? DEFAULT_CLOCK;
  const nowFn = options.now ?? (() => new Date());
  const dbClient = options.dbClient;

  const preparation = await startAttempt({
    planId: context.planId,
    userId: context.userId,
    input: context.input,
    dbClient,
    now: nowFn,
  });

  const attemptClockStart = clock();

  if (preparation.capped) {
    const durationMs = Math.max(0, clock() - attemptClockStart);
    const attempt = await recordFailure({
      planId: context.planId,
      preparation,
      classification: 'capped',
      durationMs,
      timedOut: false,
      extendedTimeout: false,
      providerMetadata: undefined,
      dbClient,
      now: nowFn,
    });

    return {
      status: 'failure',
      classification: 'capped',
      error: new Error('Generation attempt cap reached'),
      durationMs,
      extendedTimeout: false,
      timedOut: false,
      attempt,
    };
  }

  const provider = getProvider(options.provider);
  const timeout = createAdaptiveTimeout({
    ...options.timeoutConfig,
    now: clock,
  });
  const startedAt = attemptClockStart;

  let providerMetadata: ProviderMetadata | undefined;
  let rawText: string | undefined;

  try {
    const providerResult = await provider.generate(context.input, {
      signal: timeout.signal,
      timeoutMs: options.timeoutConfig?.baseMs,
    });

    providerMetadata = providerResult.metadata;

    const parsed = await parseGenerationStream(providerResult.stream, {
      onFirstModuleDetected: () => timeout.notifyFirstModule(),
    });

    rawText = parsed.rawText;

    const durationMs = clock() - startedAt;
    timeout.cancel();

    const attempt = await recordSuccess({
      planId: context.planId,
      preparation,
      modules: parsed.modules,
      providerMetadata: providerMetadata ?? {},
      durationMs,
      extendedTimeout: timeout.didExtend,
      dbClient,
      now: nowFn,
    });

    return {
      status: 'success',
      classification: null,
      modules: parsed.modules,
      rawText,
      metadata: providerMetadata ?? {},
      durationMs,
      extendedTimeout: timeout.didExtend,
      timedOut: false,
      attempt,
    };
  } catch (error) {
    timeout.cancel();
    const durationMs = clock() - startedAt;
    const timedOut = timeout.timedOut || error instanceof ProviderTimeoutError;

    const classification = classifyFailure({ error, timedOut });

    const attempt = await recordFailure({
      planId: context.planId,
      preparation,
      classification,
      durationMs,
      timedOut,
      extendedTimeout: timeout.didExtend,
      providerMetadata,
      dbClient,
      now: nowFn,
    });

    const failure: GenerationFailureResult = {
      status: 'failure',
      classification,
      error,
      metadata: providerMetadata,
      rawText,
      durationMs,
      extendedTimeout: timeout.didExtend,
      timedOut,
      attempt,
    };

    return failure;
  }
}

export type { ParsedGeneration, ParsedModule };
