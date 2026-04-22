import { MockGenerationProvider } from '@/features/ai/providers/mock';
import { RouterGenerationProvider } from '@/features/ai/providers/router';
import type { AiPlanGenerationProvider } from '@/features/ai/types/provider.types';
import { aiEnv, appEnv } from '@/lib/config/env';
import { logger } from '@/lib/logging/logger';

function parseMockSeed(): number | undefined {
	return typeof aiEnv.mockSeed === 'number' && !Number.isNaN(aiEnv.mockSeed)
		? aiEnv.mockSeed
		: undefined;
}

/**
 * Returns true when mock providers should be used.
 *
 * Resolution order:
 * 1. `AI_PROVIDER=mock` → mock
 * 2. `AI_PROVIDER=router` → router (real provider)
 * 3. `AI_PROVIDER` unset, test env → `AI_USE_MOCK ?? true`
 * 4. `AI_PROVIDER` unset, development → mock
 * 5. Production fallback → router (real provider)
 *
 * Any other `AI_PROVIDER` value throws at env-parse time (see ai.ts), so we
 * only see the two legal explicit values here.
 */
function shouldUseMock(): boolean {
	const provider = aiEnv.provider;
	if (provider === 'mock') return true;
	if (provider === 'router') return false;
	if (appEnv.isTest) {
		return aiEnv.useMock ?? true;
	}
	if (appEnv.isDevelopment) return true;
	return false;
}

/**
 * Creates a generation provider configured with a specific model.
 * Used when a user has selected a preferred model or when explicitly specifying a model.
 * `AI_USE_MOCK`, when set, must be one of: `true`, `false`, `1`, or `0`.
 *
 * @param modelId - OpenRouter model ID (e.g., 'google/gemini-2.0-flash-exp:free')
 * @returns An instance implementing `AiPlanGenerationProvider`
 */
export function getGenerationProviderWithModel(
	modelId: string,
): AiPlanGenerationProvider {
	if (!modelId) {
		throw new Error('modelId must be a non-empty string');
	}

	if (shouldUseMock()) {
		logger.debug(
			{ source: 'provider-factory', requestedModel: modelId },
			'Mock provider active — requested modelId will not be used',
		);
		return new MockGenerationProvider({
			deterministicSeed: parseMockSeed(),
		});
	}

	return new RouterGenerationProvider({ model: modelId });
}

/**
 * Selects and returns an AI generation provider implementation based on environment configuration.
 * Uses the default model when no specific model is requested.
 *
 * Prioritizes an explicit `AI_PROVIDER`, prefers mock providers in development and most test scenarios
 * (unless `AI_USE_MOCK` is explicitly `false`/`0`), and defaults to a router-based provider for production.
 * When provided, `AI_USE_MOCK` must be `true`, `false`, `1`, or `0`.
 * If `MOCK_GENERATION_SEED` contains a valid integer, that value is passed as `deterministicSeed` to the mock provider.
 *
 * @returns An instance implementing `AiPlanGenerationProvider` — either a `MockGenerationProvider` (possibly configured with a deterministic seed) or a `RouterGenerationProvider`
 */
export function getGenerationProvider(): AiPlanGenerationProvider {
	if (shouldUseMock()) {
		return new MockGenerationProvider({
			deterministicSeed: parseMockSeed(),
		});
	}

	// Explicit non-mock provider or production — always pass model explicitly
	return new RouterGenerationProvider({
		model: aiEnv.defaultModel,
	});
}
