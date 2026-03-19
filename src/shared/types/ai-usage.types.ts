/**
 * Canonical AI usage accounting contract.
 *
 * This is the single source of truth for AI usage data.
 * All providers normalize their responses into this shape.
 * All persistence and billing code consumes only this type.
 *
 * Missing or incomplete usage data must raise an explicit error/alert —
 * never silently default to zero.
 */

/**
 * Canonical usage shape returned by all AI providers and consumed by all
 * persistence and billing paths. Every field is required — normalization
 * functions enforce this at the provider boundary.
 */
export type CanonicalAIUsage = {
  /** Number of input/prompt tokens consumed. */
  readonly inputTokens: number;
  /** Number of output/completion tokens generated. */
  readonly outputTokens: number;
  /** Total tokens (input + output). */
  readonly totalTokens: number;
  /** AI model identifier (e.g., 'google/gemini-2.0-flash-exp:free'). */
  readonly model: string;
  /** Provider identifier (e.g., 'openrouter', 'mock'). */
  readonly provider: string;
  /** Estimated cost in USD cents, computed from model pricing. */
  readonly estimatedCostCents: number;
};

/**
 * Thrown when provider metadata is missing required usage fields.
 * Carries partial usage so callers can still record best-effort data
 * after logging the error.
 */
export class IncompleteUsageError extends Error {
  public readonly partialUsage: CanonicalAIUsage;
  public readonly missingFields: readonly string[];

  constructor(
    message: string,
    partialUsage: CanonicalAIUsage,
    missingFields: readonly string[]
  ) {
    super(message);
    this.name = 'IncompleteUsageError';
    this.partialUsage = partialUsage;
    this.missingFields = missingFields;
  }
}
