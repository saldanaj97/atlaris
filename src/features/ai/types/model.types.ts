type ModelTier = 'free' | 'pro';

export type AvailableModel = {
  id: string;
  name: string;
  provider: string;
  description: string;
  tier: ModelTier;
  contextWindow: number;
  maxOutputTokens?: number;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
};
