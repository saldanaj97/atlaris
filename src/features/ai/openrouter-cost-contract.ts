export const OPENROUTER_USAGE_COST_FIELD = 'cost' as const;

export interface OpenRouterUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  cost?: number | null;
  isByok?: boolean;
  costDetails?: { upstreamInferenceCost?: number | null } | null;
}

export interface OpenRouterStreamChunk {
  usage?: OpenRouterUsage | null;
}
