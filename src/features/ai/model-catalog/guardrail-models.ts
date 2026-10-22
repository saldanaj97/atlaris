/**
 * Reads the models a tier key's OpenRouter guardrail allows:
 * `GET /models/user` (https://openrouter.ai/docs/api/api-reference/models/list-models-user).
 */

import { z } from 'zod';

/** One model from a tier's guardrail, in catalog units. */
export type GuardrailModel = {
  readonly modelId: string;
  readonly name: string;
  readonly provider: string;
  readonly description: string;
  readonly contextLength: number;
  readonly maxOutputTokens: number | null;
  readonly inputCostPerMillion: number;
  readonly outputCostPerMillion: number;
  readonly supportedParameters: readonly string[];
};

/** A per-token USD price such as `"0.0000001"`; `-1` (variable) is rejected. */
const perTokenPrice = z
  .string()
  .regex(/^\d+(\.\d+)?(e-?\d+)?$/i, 'expected a non-negative decimal');

const guardrailModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullish(),
  context_length: z.number().int().nonnegative(),
  pricing: z.object({ prompt: perTokenPrice, completion: perTokenPrice }),
  top_provider: z
    .object({ max_completion_tokens: z.number().int().nonnegative().nullish() })
    .nullish(),
  supported_parameters: z.array(z.string()).nullish(),
});

const guardrailModelsResponseSchema = z.object({
  data: z.array(guardrailModelSchema),
});

export class GuardrailModelsError extends Error {
  constructor(
    message: string,
    readonly reason: 'http' | 'parse' | 'empty',
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'GuardrailModelsError';
  }
}

/** USD per token → USD per million tokens, without float noise (`0.1`, not `0.09999…`). */
function perMillion(perToken: string): number {
  return Number((Number(perToken) * 1_000_000).toPrecision(12));
}

/** `"Anthropic: Claude Haiku 5.5"` → provider `Anthropic`, name `Claude Haiku 5.5`. */
function splitDisplayName(
  id: string,
  displayName: string,
): { provider: string; name: string } {
  const separator = displayName.indexOf(': ');
  if (separator > 0) {
    return {
      provider: displayName.slice(0, separator),
      name: displayName.slice(separator + 2),
    };
  }
  return { provider: id.split('/')[0] ?? id, name: displayName };
}

/**
 * Parses a `/models/user` body. Throws when the body or any model is
 * malformed, or the list is empty, so a sync never replaces good rows with a
 * partial or empty list. Long-prompt `pricing.overrides` are ignored.
 */
export function parseGuardrailModels(body: unknown): GuardrailModel[] {
  const parsed = guardrailModelsResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new GuardrailModelsError(
      `Unexpected /models/user response: ${parsed.error.message}`,
      'parse',
      { cause: parsed.error },
    );
  }
  if (parsed.data.data.length === 0) {
    throw new GuardrailModelsError('The guardrail returned no models', 'empty');
  }
  return parsed.data.data.map((model) => ({
    modelId: model.id,
    ...splitDisplayName(model.id, model.name),
    description: model.description ?? '',
    contextLength: model.context_length,
    maxOutputTokens: model.top_provider?.max_completion_tokens ?? null,
    inputCostPerMillion: perMillion(model.pricing.prompt),
    outputCostPerMillion: perMillion(model.pricing.completion),
    supportedParameters: model.supported_parameters ?? [],
  }));
}

/**
 * Always OpenRouter itself: `OPENROUTER_BASE_URL` may point model calls at an
 * authenticated AI Gateway, which this metadata read does not need.
 */
const GUARDRAIL_MODELS_URL = 'https://openrouter.ai/api/v1/models/user';

export type FetchGuardrailModelsArgs = {
  apiKey: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
};

/** Fetches and parses the models `apiKey`'s guardrail allows. */
export async function fetchGuardrailModels({
  apiKey,
  timeoutMs,
  fetchImpl = fetch,
}: FetchGuardrailModelsArgs): Promise<GuardrailModel[]> {
  const response = await fetchImpl(GUARDRAIL_MODELS_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new GuardrailModelsError(
      `/models/user responded ${response.status}`,
      'http',
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new GuardrailModelsError(
      '/models/user returned invalid JSON',
      'parse',
      {
        cause: error,
      },
    );
  }
  return parseGuardrailModels(body);
}
