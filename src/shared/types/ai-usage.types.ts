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

/** Fields that may be missing when {@link CanonicalAIUsage.isPartial} is true. */
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
	/**
	 * OpenRouter-reported request cost in **integer micro-USD** (USD × 1e6), when
	 * the provider sent a valid USD `usage.cost` and usage is complete. Null if
	 * absent, incomplete usage, or not applicable.
	 */
	readonly providerCostMicrousd: number | null;
	/** True when required provider fields were missing (see `missingFields`). */
	readonly isPartial: boolean;
	/** Which required fields were missing when `isPartial` is true. */
	readonly missingFields: readonly CanonicalUsageMissingField[];
};

/**
 * Thrown when provider metadata is missing required usage fields.
 * Carries partial usage so callers can still record best-effort data
 * after logging the error.
 */
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
