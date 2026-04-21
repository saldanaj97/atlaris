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
}

export interface OpenRouterStreamChunk {
  usage?: OpenRouterUsage | null;
}
