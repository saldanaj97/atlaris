import { makeOpenRouterGpt4oProviderMetadata } from '@tests/fixtures/canonical-usage.factory';
import { makeDbClient } from '@tests/fixtures/db-mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { safeNormalizeUsage } from '@/features/ai/usage';
import { UsageRecordingAdapter } from '@/features/plans/lifecycle/adapters/usage-recording-adapter';
import type { RecordUsageParams } from '@/lib/db/usage';

vi.mock('@sentry/nextjs', () => ({
	captureException: vi.fn(),
}));

describe('UsageRecordingAdapter', () => {
	const fakeDb = makeDbClient();
	const mockRecordUsage = vi.fn();
	const mockIncrementUsage = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		mockRecordUsage.mockResolvedValue(undefined);
		mockIncrementUsage.mockResolvedValue(undefined);
	});

	it('calls recordUsage with RecordUsageParams derived from safeNormalizeUsage for equivalent metadata', async () => {
		const metadata = makeOpenRouterGpt4oProviderMetadata();
		const canonical = safeNormalizeUsage(metadata);
		const expected: RecordUsageParams = {
			userId: 'user-1',
			provider: canonical.provider,
			model: canonical.model,
			inputTokens: canonical.inputTokens,
			outputTokens: canonical.outputTokens,
			costCents: canonical.estimatedCostCents,
		};
		const mockToRecordParams = vi.fn().mockReturnValue(expected);

		const adapter = new UsageRecordingAdapter(fakeDb, {
			recordUsage: mockRecordUsage,
			incrementUsage: mockIncrementUsage,
			canonicalUsageToRecordParams: mockToRecordParams,
		});
		await adapter.recordUsage({
			userId: 'user-1',
			usage: canonical,
			kind: 'plan',
		});

		expect(mockToRecordParams).toHaveBeenCalledWith(canonical, 'user-1');
		expect(mockRecordUsage).toHaveBeenCalledTimes(1);
		expect(mockRecordUsage).toHaveBeenCalledWith(expected, fakeDb);
		expect(mockIncrementUsage).toHaveBeenCalledWith('user-1', 'plan', fakeDb);
	});

	it('omits provider microusd and snapshot when usage is partial', async () => {
		const metadata = {
			model: 'openai/gpt-4o',
			usage: {
				promptTokens: 1,
				completionTokens: 2,
				totalTokens: 3,
			},
		};
		const canonical = safeNormalizeUsage(metadata);
		expect(canonical.isPartial).toBe(true);
		const expected: RecordUsageParams = {
			userId: 'user-2',
			provider: canonical.provider,
			model: canonical.model,
			inputTokens: canonical.inputTokens,
			outputTokens: canonical.outputTokens,
			costCents: canonical.estimatedCostCents,
		};
		const mockToRecordParams = vi.fn().mockReturnValue(expected);

		const adapter = new UsageRecordingAdapter(fakeDb, {
			recordUsage: mockRecordUsage,
			incrementUsage: mockIncrementUsage,
			canonicalUsageToRecordParams: mockToRecordParams,
		});
		await adapter.recordUsage({
			userId: 'user-2',
			usage: canonical,
			kind: 'plan',
		});

		expect(mockToRecordParams).toHaveBeenCalledWith(canonical, 'user-2');
		expect(mockRecordUsage).toHaveBeenCalledWith(expected, fakeDb);
	});

	it('does not increment aggregates when kind is omitted', async () => {
		const canonical = safeNormalizeUsage(makeOpenRouterGpt4oProviderMetadata());

		const adapter = new UsageRecordingAdapter(fakeDb, {
			recordUsage: mockRecordUsage,
			incrementUsage: mockIncrementUsage,
		});

		await adapter.recordUsage({
			userId: 'user-3',
			usage: canonical,
		});

		expect(mockRecordUsage).toHaveBeenCalledTimes(1);
		expect(mockIncrementUsage).not.toHaveBeenCalled();
	});
});
