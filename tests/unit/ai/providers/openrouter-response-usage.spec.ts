import { describe, expect, it } from 'vitest';

import { ProviderInvalidResponseError } from '@/features/ai/providers/errors';
import {
	isUsageShape,
	normalizeUsage,
	validateNonStreamingResponse,
} from '@/features/ai/providers/openrouter-response';

describe('normalizeUsage (OpenRouter cost)', () => {
	it('maps usage.cost to providerReportedCostUsd', () => {
		const u = normalizeUsage({
			promptTokens: 1,
			completionTokens: 2,
			totalTokens: 3,
			cost: 0.001,
		});
		expect(u.providerReportedCostUsd).toBe(0.001);
	});

	it.each([
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
	])('throws when usage.cost is %s', (cost) => {
		expect(() =>
			normalizeUsage({
				promptTokens: 1,
				completionTokens: 2,
				cost,
			}),
		).toThrow(ProviderInvalidResponseError);
	});

	it('ignores non-object usage values', () => {
		expect(normalizeUsage(1 as never)).toEqual({
			promptTokens: undefined,
			completionTokens: undefined,
			totalTokens: undefined,
		});
	});

	it('throws when usage.cost is negative', () => {
		expect(() =>
			normalizeUsage({
				promptTokens: 1,
				completionTokens: 2,
				cost: -1,
			}),
		).toThrow(ProviderInvalidResponseError);
	});
});

describe('isUsageShape (OpenRouter cost)', () => {
	it('accepts omitted cost', () => {
		expect(
			isUsageShape({
				promptTokens: 1,
				completionTokens: 2,
				totalTokens: 3,
			}),
		).toBe(true);
	});

	it('accepts non-negative finite cost', () => {
		expect(
			isUsageShape({
				promptTokens: 1,
				completionTokens: 2,
				totalTokens: 3,
				cost: 0,
			}),
		).toBe(true);
	});

	it.each([
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
	])('rejects non-finite cost %s', (cost) => {
		expect(
			isUsageShape({
				promptTokens: 1,
				completionTokens: 2,
				totalTokens: 3,
				cost,
			}),
		).toBe(false);
	});

	it('rejects negative cost', () => {
		expect(
			isUsageShape({
				promptTokens: 1,
				completionTokens: 2,
				totalTokens: 3,
				cost: -0.001,
			}),
		).toBe(false);
	});
});

describe('validateNonStreamingResponse (usage.cost)', () => {
	const baseResponse = {
		choices: [
			{
				message: {
					content: '{"modules":[]}',
				},
			},
		],
	};

	it.each([
		Number.NaN,
		Number.POSITIVE_INFINITY,
		Number.NEGATIVE_INFINITY,
	])('rejects non-finite usage.cost %s before normalizeUsage', (cost) => {
		expect(() =>
			validateNonStreamingResponse({
				...baseResponse,
				usage: {
					promptTokens: 1,
					completionTokens: 2,
					totalTokens: 3,
					cost,
				},
			}),
		).toThrow(ProviderInvalidResponseError);
	});

	it('rejects negative usage.cost before normalizeUsage', () => {
		expect(() =>
			validateNonStreamingResponse({
				...baseResponse,
				usage: {
					promptTokens: 1,
					completionTokens: 2,
					totalTokens: 3,
					cost: -1,
				},
			}),
		).toThrow(ProviderInvalidResponseError);
	});
});
