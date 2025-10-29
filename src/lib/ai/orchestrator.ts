import {
  recordFailure,
  recordSuccess,
  startAttempt,
  type GenerationAttemptRecord,
} from '@/lib/db/queries/attempts';
import type { FailureClassification } from '@/lib/types/client';

import { classifyFailure } from './classification';
import { pacePlan } from './pacing';
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
import { getGenerationProvider } from './provider-factory';
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
  signal?: AbortSignal;
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
  return provider ?? getGenerationProvider();
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

  // Combine timeout signal with external shutdown signal if provided
  const externalSignal = options.signal;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  timeout.signal.addEventListener('abort', onAbort);
  if (externalSignal) {
    externalSignal.addEventListener('abort', onAbort);
  }

  let providerMetadata: ProviderMetadata | undefined;
  let rawText: string | undefined;

  try {
    const providerResult = await provider.generate(context.input, {
      signal: controller.signal,
      timeoutMs: options.timeoutConfig?.baseMs,
    });

    providerMetadata = providerResult.metadata;

    const parsed = await parseGenerationStream(providerResult.stream, {
      onFirstModuleDetected: () => timeout.notifyFirstModule(),
    });

    rawText = parsed.rawText;

    // Apply pacing to trim modules to fit user's time capacity
    const pacedModules = pacePlan(parsed.modules, context.input);

    const durationMs = clock() - startedAt;
    timeout.cancel();
    timeout.signal.removeEventListener('abort', onAbort);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onAbort);
    }

    const attempt = await recordSuccess({
      planId: context.planId,
      preparation,
      modules: pacedModules,
      providerMetadata: providerMetadata ?? {},
      durationMs,
      extendedTimeout: timeout.didExtend,
      dbClient,
      now: nowFn,
    });

    return {
      status: 'success',
      classification: null,
      modules: pacedModules,
      rawText,
      metadata: providerMetadata ?? {},
      durationMs,
      extendedTimeout: timeout.didExtend,
      timedOut: false,
      attempt,
    };
  } catch (error) {
    timeout.cancel();
    timeout.signal.removeEventListener('abort', onAbort);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onAbort);
    }
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
