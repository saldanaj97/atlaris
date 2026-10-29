import { ProviderInvalidResponseError } from '@/features/ai/providers/errors';
import {
  isUsageShape,
  normalizeUsage,
  validateNonStreamingResponse,
} from '@/features/ai/providers/openrouter-response';
import { describe, expect, it } from 'vitest';

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

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'throws when usage.cost is %s',
    (cost) => {
      expect(() =>
        normalizeUsage({
          promptTokens: 1,
          completionTokens: 2,
          cost,
        }),
      ).toThrow(ProviderInvalidResponseError);
    },
  );

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

  // DEV-185: on a BYOK call `cost` is only OpenRouter's fee (often 0); the
  // provider bills the key owner `upstreamInferenceCost` on top.
  it('adds the upstream cost of a BYOK call to its reported cost', () => {
    const u = normalizeUsage({
      promptTokens: 1,
      completionTokens: 2,
      cost: 0.0005,
      isByok: true,
      costDetails: { upstreamInferenceCost: 0.01 },
    });
    expect(u.providerReportedCostUsd).toBeCloseTo(0.0105, 10);
  });

  it('counts the upstream cost of a BYOK call with a zero fee', () => {
    const u = normalizeUsage({
      promptTokens: 1,
      completionTokens: 2,
      cost: 0,
      isByok: true,
      costDetails: { upstreamInferenceCost: 0.02 },
    });
    expect(u.providerReportedCostUsd).toBe(0.02);
  });

  it('leaves a BYOK call without its upstream cost to the estimate', () => {
    const u = normalizeUsage({
      promptTokens: 1,
      completionTokens: 2,
      cost: 0,
      isByok: true,
    });
    expect(u.providerReportedCostUsd).toBeUndefined();
  });

  it('ignores upstream cost on a call that is not BYOK', () => {
    const u = normalizeUsage({
      promptTokens: 1,
      completionTokens: 2,
      cost: 0.01,
      costDetails: { upstreamInferenceCost: 0.01 },
    });
    expect(u.providerReportedCostUsd).toBe(0.01);
  });

  it('throws when a BYOK upstream cost is negative', () => {
    expect(() =>
      normalizeUsage({
        promptTokens: 1,
        completionTokens: 2,
        cost: 0,
        isByok: true,
        costDetails: { upstreamInferenceCost: -1 },
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

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite cost %s',
    (cost) => {
      expect(
        isUsageShape({
          promptTokens: 1,
          completionTokens: 2,
          totalTokens: 3,
          cost,
        }),
      ).toBe(false);
    },
  );

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

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite usage.cost %s before normalizeUsage',
    (cost) => {
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
    },
  );

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
