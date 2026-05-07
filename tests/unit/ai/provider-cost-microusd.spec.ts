import { describe, expect, it } from 'vitest';

import {
  microusdIntegerToBigint,
  usdCostToMicrousdInteger,
} from '@/features/ai/provider-cost-microusd';

describe('usdCostToMicrousdInteger', () => {
  it('maps 0 to 0', () => {
    expect(usdCostToMicrousdInteger(0)).toBe(0);
  });

  it('rounds fractional USD to nearest micro-USD', () => {
    expect(usdCostToMicrousdInteger(0.001)).toBe(1_000);
    expect(usdCostToMicrousdInteger(0.004567)).toBe(4_567);
  });

  it('rounds sub-micro USD amounts (e.g. 1e-7 USD rounds to 0)', () => {
    expect(usdCostToMicrousdInteger(1e-7)).toBe(0);
  });

  it('throws for negative USD', () => {
    expect(() => usdCostToMicrousdInteger(-0.001)).toThrow(
      'Invalid OpenRouter USD cost',
    );
  });

  it('throws for NaN', () => {
    expect(() => usdCostToMicrousdInteger(Number.NaN)).toThrow(
      'Invalid OpenRouter USD cost',
    );
  });

  it('throws for infinite USD values', () => {
    expect(() => usdCostToMicrousdInteger(Number.POSITIVE_INFINITY)).toThrow(
      'Invalid OpenRouter USD cost',
    );
    expect(() => usdCostToMicrousdInteger(Number.NEGATIVE_INFINITY)).toThrow(
      'Invalid OpenRouter USD cost',
    );
  });

  it('supports large finite costs within safe integer range', () => {
    const usd = 1_234_567.891234;
    expect(usdCostToMicrousdInteger(usd)).toBe(Math.round(usd * 1_000_000));
  });
});

describe('microusdIntegerToBigint', () => {
  it('maps 0 to BigInt zero', () => {
    expect(microusdIntegerToBigint(0)).toBe(BigInt(0));
  });

  it('maps positive integer micro-USD to bigint', () => {
    expect(microusdIntegerToBigint(1_234_567)).toBe(BigInt(1_234_567));
  });

  it('maps negative integer micro-USD to bigint', () => {
    expect(microusdIntegerToBigint(-1_234_567)).toBe(BigInt(-1_234_567));
  });

  it('throws for non-finite micro-USD values', () => {
    expect(() => microusdIntegerToBigint(Number.NaN)).toThrow(
      'Invalid micro-USD integer',
    );
    expect(() => microusdIntegerToBigint(Number.POSITIVE_INFINITY)).toThrow(
      'Invalid micro-USD integer',
    );
    expect(() => microusdIntegerToBigint(Number.NEGATIVE_INFINITY)).toThrow(
      'Invalid micro-USD integer',
    );
  });

  it('throws for fractional or unsafe micro-USD integers', () => {
    expect(() => microusdIntegerToBigint(1.5)).toThrow(
      'Invalid micro-USD integer',
    );
    expect(() => microusdIntegerToBigint(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      'Invalid micro-USD integer',
    );
  });
});
