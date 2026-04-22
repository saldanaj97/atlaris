import {
	ProviderError,
	ProviderRateLimitError,
	ProviderTimeoutError,
} from '@/features/ai/providers/errors';
import { asyncIterableToReadableStream } from '@/features/ai/streaming/utils';
import type {
	AiPlanGenerationProvider,
	GenerationInput,
	GenerationOptions,
	ProviderGenerateResult,
	ProviderMetadata,
} from '@/features/ai/types/provider.types';

type MockProviderScenario =
	| 'success'
	| 'timeout'
	| 'validation'
	| 'rate_limit'
	| 'error';

type MockProviderConfig = {
	scenario: MockProviderScenario;
	chunkSize?: number;
	delayBetweenChunksMs?: number;
};

type MockProvider = {
	provider: AiPlanGenerationProvider;
	readonly invocationCount: number;
};

const SUCCESS_PAYLOAD = {
	modules: [
		{
			title: 'Getting Started with Machine Learning',
			estimated_minutes: 180,
			tasks: [
				{
					title: 'Understand supervised vs. unsupervised learning',
					estimated_minutes: 60,
				},
				{ title: 'Install Python ML tooling', estimated_minutes: 45 },
				{
					title: 'Complete first classification notebook',
					estimated_minutes: 75,
				},
			],
		},
		{
			title: 'Model Evaluation Deep Dive',
			estimated_minutes: 200,
			tasks: [
				{ title: 'Explore precision/recall metrics', estimated_minutes: 60 },
				{ title: 'Implement k-fold cross-validation', estimated_minutes: 80 },
				{ title: 'Document evaluation trade-offs', estimated_minutes: 60 },
			],
		},
	],
} as const;

const VALIDATION_PAYLOAD = {
	modules: [],
} as const;

function createChunkStream(
	payload: unknown,
	chunkSize: number,
	delayBetweenChunksMs: number,
): ReadableStream<string> {
	const serialized = JSON.stringify(payload);
	async function* iterator(): AsyncIterable<string> {
		for (let index = 0; index < serialized.length; index += chunkSize) {
			if (index > 0 && delayBetweenChunksMs > 0) {
				await new Promise((resolve) =>
					setTimeout(resolve, delayBetweenChunksMs),
				);
			}
			yield serialized.slice(index, index + chunkSize);
		}
	}

	return asyncIterableToReadableStream(iterator());
}

function buildResult(
	payload: unknown,
	metadataOverride?: Partial<ProviderMetadata>,
	options?: { chunkSize?: number; delayBetweenChunksMs?: number },
): ProviderGenerateResult {
	const { chunkSize = 80, delayBetweenChunksMs = 0 } = options ?? {};
	return {
		stream: createChunkStream(payload, chunkSize, delayBetweenChunksMs),
		metadata: {
			provider: 'mock-ai',
			model: 'mock-gpt-4o-mini',
			...metadataOverride,
		},
	};
}

export function createMockProvider(config: MockProviderConfig): MockProvider {
	let invocationCount = 0;

	const provider: AiPlanGenerationProvider = {
		async generate(
			_input: GenerationInput,
			_options?: GenerationOptions,
		): Promise<ProviderGenerateResult> {
			invocationCount += 1;

			switch (config.scenario) {
				case 'success':
					return buildResult(SUCCESS_PAYLOAD, undefined, config);
				case 'validation':
					return buildResult(VALIDATION_PAYLOAD, undefined, config);
				case 'rate_limit':
					throw new ProviderRateLimitError(
						'Mock provider simulated rate limit.',
					);
				case 'timeout':
					throw new ProviderTimeoutError('Mock provider simulated timeout.');
				case 'error':
					throw new ProviderError(
						'provider_error',
						'Mock provider simulated failure.',
					);
				default:
					throw new ProviderError(
						'provider_error',
						`Mock provider scenario "${String(config.scenario)}" not implemented.`,
					);
			}
		},
	};

	return {
		provider,
		get invocationCount() {
			return invocationCount;
		},
	};
}
