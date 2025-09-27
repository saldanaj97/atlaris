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
}

export interface GenerationFailureResult {
  status: 'failure';
  classification: string | null;
  error: unknown;
  metadata?: ProviderMetadata;
  rawText?: string;
  durationMs: number;
  extendedTimeout: boolean;
  timedOut: boolean;
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
  const provider = getProvider(options.provider);
  const timeout = createAdaptiveTimeout({
    ...options.timeoutConfig,
    now: clock,
  });
  const startedAt = clock();

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

    return {
      status: 'success',
      classification: null,
      modules: parsed.modules,
      rawText,
      metadata: providerMetadata ?? {},
      durationMs,
      extendedTimeout: timeout.didExtend,
      timedOut: false,
    };
  } catch (error) {
    timeout.cancel();
    const durationMs = clock() - startedAt;
    const timedOut = timeout.timedOut || error instanceof ProviderTimeoutError;

    const classification = classifyFailure({ error, timedOut });

    const failure: GenerationFailureResult = {
      status: 'failure',
      classification,
      error,
      metadata: providerMetadata,
      rawText,
      durationMs,
      extendedTimeout: timeout.didExtend,
      timedOut,
    };

    return failure;
  }
}

export type { ParsedGeneration, ParsedModule };
