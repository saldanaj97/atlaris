export const OPENROUTER_USAGE_COST_FIELD = 'cost' as const;

export interface OpenRouterUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  /** OpenRouter extension field on `usage`: USD float, not credits. */
  cost?: number | null;
  /** Set on a call made with a bring-your-own provider key. */
  isByok?: boolean;
  /** BYOK only: what the upstream provider bills the key owner, in USD. */
  costDetails?: { upstreamInferenceCost?: number | null } | null;
}

export interface OpenRouterStreamChunk {
  usage?: OpenRouterUsage | null;
}
