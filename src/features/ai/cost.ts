/**
 * Centralized AI cost calculation and output-token ceilings.
 *
 * This is the **single source of truth** for:
 * 1. Deterministic cost computation from model pricing and token counts.
 * 2. Output-token ceilings per model — enforced at the provider call boundary.
 *
 * All persistence, billing, and provider code should import from this module.
 * Ceilings are model-specific and tier-independent: the same model always
 * gets the same ceiling regardless of the user's subscription tier.
 *
 * @module features/ai/cost
 */

import { getModelById } from '@/features/ai/ai-models';
import { logger } from '@/lib/logging/logger';
import type { CanonicalAIUsage } from '@/shared/types/ai-usage.types';

/**
 * Default output-token ceiling applied to models that do not declare
 * `maxOutputTokens` (e.g., the `openrouter/free` router or unknown models).
 *
 * Set conservatively to prevent runaway output spend while still allowing
 * complete structured plan generation.
 */
export const DEFAULT_OUTPUT_TOKEN_CEILING = 32_768;

/**
 * Thrown by {@link computeCostCents} when the model is missing from the
 * pricing registry. Distinct error class so callers can decide whether to
 * surface as a partial-usage record or hard-fail.
 */
export class UnknownModelError extends Error {
	constructor(public readonly modelId: string) {
		super(
			`Unknown model "${modelId}" in computeCostCents — cannot determine pricing.`,
		);
		this.name = 'UnknownModelError';
	}
}

/**
 * Compute estimated cost in **USD cents** from model pricing and token counts.
 *
 * Throws when the model is not in the registry (unknown models must not
 * silently waive charges). Returns 0 when both counts are zero.
 * The result is deterministic: identical inputs always produce identical output.
 */
export function computeCostCents(
	modelId: string,
	inputTokens: number,
	outputTokens: number,
): number {
	if (
		!Number.isFinite(inputTokens) ||
		!Number.isFinite(outputTokens) ||
		inputTokens < 0 ||
		outputTokens < 0
	) {
		throw new Error(
			`Invalid token counts: inputTokens=${inputTokens}, outputTokens=${outputTokens}. Values must be finite and >= 0.`,
		);
	}

	const model = getModelById(modelId);
	if (!model) {
		logger.error({ modelId }, 'Unknown model in computeCostCents');
		throw new UnknownModelError(modelId);
	}
	if (inputTokens === 0 && outputTokens === 0) return 0;

	const totalUsd =
		(inputTokens / 1_000_000) * model.inputCostPerMillion +
		(outputTokens / 1_000_000) * model.outputCostPerMillion;

	return Math.round(totalUsd * 100);
}

/**
 * Derive cost deterministically from a {@link CanonicalAIUsage} shape.
 *
 * Recalculates from the model pricing registry rather than trusting the
 * pre-computed `estimatedCostCents` field, ensuring auditability.
 */
export function calculateCostFromUsage(usage: CanonicalAIUsage): number {
	return computeCostCents(usage.model, usage.inputTokens, usage.outputTokens);
}

/**
 * Return the output-token ceiling for a given model.
 *
 * Uses the model's `maxOutputTokens` when defined; otherwise falls back
 * to {@link DEFAULT_OUTPUT_TOKEN_CEILING}. The ceiling is model-specific
 * and tier-independent — every user tier gets the same ceiling for the
 * same model.
 *
 * Callers at the provider boundary pass this value as `maxTokens` to
 * prevent unbounded output generation.
 */
export function getOutputTokenCeiling(modelId: string): number {
	const model = getModelById(modelId);
	if (!model) {
		logger.warn(
			{ modelId },
			'Unknown model in getOutputTokenCeiling — falling back to DEFAULT_OUTPUT_TOKEN_CEILING',
		);
		return DEFAULT_OUTPUT_TOKEN_CEILING;
	}
	return model.maxOutputTokens ?? DEFAULT_OUTPUT_TOKEN_CEILING;
}
