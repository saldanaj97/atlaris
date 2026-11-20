export type CanonicalUsageMissingField =
  | 'provider'
  | 'model'
  | 'inputTokens'
  | 'outputTokens';

/**
 * Canonical usage shape returned by all AI providers and consumed by all
 * persistence and billing paths. Normalization fills completeness fields so
 * downstream persistence can gate provider-derived audit columns.
 */
export type CanonicalAIUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly model: string;
  readonly provider: string;
  readonly estimatedCostCents: number;
  /**
   * OpenRouter-reported request cost in **integer micro-USD** (USD × 1e6), when
   * the provider sent a valid USD `usage.cost` and usage is complete. Null if
   * absent, incomplete usage, or not applicable.
   */
  readonly providerCostMicrousd: number | null;
  readonly isPartial: boolean;
  readonly missingFields: readonly CanonicalUsageMissingField[];
};

export class IncompleteUsageError extends Error {
  public readonly partialUsage: CanonicalAIUsage;
  public readonly missingFields: readonly CanonicalUsageMissingField[];

  constructor(
    message: string,
    partialUsage: CanonicalAIUsage,
    missingFields: readonly CanonicalUsageMissingField[],
  ) {
    super(message);
    Object.setPrototypeOf(this, IncompleteUsageError.prototype);
    this.name = 'IncompleteUsageError';
    this.partialUsage = partialUsage;
    this.missingFields = missingFields;
  }
}
