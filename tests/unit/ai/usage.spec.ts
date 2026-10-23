import type { ProviderMetadata } from '@/shared/types/ai-provider.types';

import {
  normalizeToCanonicalUsage,
  safeNormalizeUsage,
} from '@/features/ai/usage';
import { IncompleteUsageError } from '@/shared/types/ai-usage.types';
import { describe, expect, it, vi } from 'vitest';

// Mock Sentry so safeNormalizeUsage doesn't throw on import
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

// ─── normalizeToCanonicalUsage ───────────────────────────────────

describe('normalizeToCanonicalUsage', async () => {
  it('normalizes complete provider metadata into canonical shape', async () => {
    const metadata: ProviderMetadata = {
      provider: 'openrouter',
      model: 'openai/gpt-6-sol',
      usage: {
        promptTokens: 500,
        completionTokens: 1000,
        totalTokens: 1500,
      },
    };

    const result = await normalizeToCanonicalUsage(metadata);

    expect(result).toEqual({
      inputTokens: 500,
      outputTokens: 1000,
      totalTokens: 1500,
      model: 'openai/gpt-6-sol',
      provider: 'openrouter',
      estimatedCostCents: expect.any(Number),
      providerCostMicrousd: null,
      isPartial: false,
      missingFields: [],
    });
  });

  it('maps providerReportedCostUsd to providerCostMicrousd when usage is complete', async () => {
    const metadata: ProviderMetadata = {
      provider: 'openrouter',
      model: 'openai/gpt-6-sol',
      usage: {
        promptTokens: 100,
        completionTokens: 200,
        providerReportedCostUsd: 0.001234,
      },
    };

    const result = await normalizeToCanonicalUsage(metadata);

    expect(result.providerCostMicrousd).toBe(1234);
    expect(result.isPartial).toBe(false);
  });

  it('preserves zero providerReportedCostUsd when usage is complete', async () => {
    const metadata: ProviderMetadata = {
      provider: 'openrouter',
      model: 'openai/gpt-6-sol',
      usage: {
        promptTokens: 100,
        completionTokens: 200,
        providerReportedCostUsd: 0,
      },
    };

    expect(
      (await normalizeToCanonicalUsage(metadata)).providerCostMicrousd,
    ).toBe(0);
  });

  it('ignores invalid providerReportedCostUsd values when usage is otherwise complete', async () => {
    const metadata: ProviderMetadata = {
      provider: 'openrouter',
      model: 'openai/gpt-6-sol',
      usage: {
        promptTokens: 100,
        completionTokens: 200,
        providerReportedCostUsd: Number.POSITIVE_INFINITY,
      },
    };

    expect(
      (await normalizeToCanonicalUsage(metadata)).providerCostMicrousd,
    ).toBeNull();
  });

  it('never reports providerCostMicrousd for partial usage', async () => {
    const metadata: ProviderMetadata = {
      provider: 'openrouter',
      model: 'openai/gpt-6-sol',
      usage: {
        promptTokens: 100,
        providerReportedCostUsd: 0.004567,
      },
    };

    await expect(normalizeToCanonicalUsage(metadata)).rejects.toThrow(
      IncompleteUsageError,
    );

    try {
      await normalizeToCanonicalUsage(metadata);
      expect.unreachable('Expected IncompleteUsageError');
    } catch (error) {
      const usageError = error as IncompleteUsageError;
      expect(usageError.partialUsage.providerCostMicrousd).toBeNull();
    }
  });

  it('computes totalTokens when not provided by the provider', async () => {
    const metadata: ProviderMetadata = {
      provider: 'openrouter',
      model: 'openai/gpt-6-sol',
      usage: {
        promptTokens: 200,
        completionTokens: 300,
      },
    };

    const result = await normalizeToCanonicalUsage(metadata);

    expect(result.totalTokens).toBe(500);
  });

  it('throws IncompleteUsageError when provider is missing', async () => {
    const metadata: ProviderMetadata = {
      model: 'openai/gpt-6-sol',
      usage: {
        promptTokens: 100,
        completionTokens: 200,
      },
    };

    await expect(normalizeToCanonicalUsage(metadata)).rejects.toThrow(
      IncompleteUsageError,
    );

    try {
      await normalizeToCanonicalUsage(metadata);
    } catch (error) {
      expect(error).toBeInstanceOf(IncompleteUsageError);
      const usageError = error as IncompleteUsageError;
      expect(usageError.missingFields).toContain('provider');
      expect(usageError.partialUsage.provider).toBe('unknown');
      expect(usageError.partialUsage.inputTokens).toBe(100);
    }
  });

  it('throws IncompleteUsageError when model is missing', async () => {
    const metadata: ProviderMetadata = {
      provider: 'openrouter',
      usage: {
        promptTokens: 100,
        completionTokens: 200,
      },
    };

    await expect(normalizeToCanonicalUsage(metadata)).rejects.toThrow(
      IncompleteUsageError,
    );

    try {
      await normalizeToCanonicalUsage(metadata);
    } catch (error) {
      const usageError = error as IncompleteUsageError;
      expect(usageError.missingFields).toContain('model');
      expect(usageError.partialUsage.model).toBe('unknown');
    }
  });

  it('throws IncompleteUsageError when inputTokens is missing', async () => {
    const metadata: ProviderMetadata = {
      provider: 'openrouter',
      model: 'openai/gpt-6-sol',
      usage: {
        completionTokens: 200,
      },
    };

    await expect(normalizeToCanonicalUsage(metadata)).rejects.toThrow(
      IncompleteUsageError,
    );

    try {
      await normalizeToCanonicalUsage(metadata);
    } catch (error) {
      const usageError = error as IncompleteUsageError;
      expect(usageError.missingFields).toContain('inputTokens');
      expect(usageError.partialUsage.inputTokens).toBe(0);
      expect(usageError.partialUsage.outputTokens).toBe(200);
    }
  });

  it('throws IncompleteUsageError when outputTokens is missing', async () => {
    const metadata: ProviderMetadata = {
      provider: 'openrouter',
      model: 'openai/gpt-6-sol',
      usage: {
        promptTokens: 100,
      },
    };

    await expect(normalizeToCanonicalUsage(metadata)).rejects.toThrow(
      IncompleteUsageError,
    );

    try {
      await normalizeToCanonicalUsage(metadata);
    } catch (error) {
      const usageError = error as IncompleteUsageError;
      expect(usageError.missingFields).toContain('outputTokens');
      expect(usageError.partialUsage.outputTokens).toBe(0);
      expect(usageError.partialUsage.inputTokens).toBe(100);
    }
  });

  it('throws IncompleteUsageError when usage object is entirely missing', async () => {
    const metadata: ProviderMetadata = {
      provider: 'openrouter',
      model: 'openai/gpt-6-sol',
    };

    await expect(normalizeToCanonicalUsage(metadata)).rejects.toThrow(
      IncompleteUsageError,
    );

    try {
      await normalizeToCanonicalUsage(metadata);
    } catch (error) {
      const usageError = error as IncompleteUsageError;
      expect(usageError.missingFields).toContain('inputTokens');
      expect(usageError.missingFields).toContain('outputTokens');
      expect(usageError.partialUsage.inputTokens).toBe(0);
      expect(usageError.partialUsage.outputTokens).toBe(0);
    }
  });

  it('throws IncompleteUsageError when metadata is undefined', async () => {
    await expect(normalizeToCanonicalUsage(undefined)).rejects.toThrow(
      IncompleteUsageError,
    );

    try {
      await normalizeToCanonicalUsage(undefined);
    } catch (error) {
      const usageError = error as IncompleteUsageError;
      expect(usageError.missingFields).toEqual([
        'provider',
        'model',
        'inputTokens',
        'outputTokens',
      ]);
      expect(usageError.partialUsage).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        model: 'unknown',
        provider: 'unknown',
        estimatedCostCents: 0,
        providerCostMicrousd: null,
        isPartial: true,
        missingFields: ['provider', 'model', 'inputTokens', 'outputTokens'],
      });
    }
  });

  it('reports multiple missing fields at once', async () => {
    const metadata: ProviderMetadata = {
      usage: {
        promptTokens: 100,
      },
    };

    try {
      await normalizeToCanonicalUsage(metadata);
    } catch (error) {
      const usageError = error as IncompleteUsageError;
      expect(usageError.missingFields).toEqual(
        expect.arrayContaining(['provider', 'model', 'outputTokens']),
      );
      expect(usageError.missingFields).toHaveLength(3);
    }
  });

  it('does not throw when all required fields are present, even if zero', async () => {
    const metadata: ProviderMetadata = {
      provider: 'mock',
      model: 'mock-v1',
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    };

    const result = await normalizeToCanonicalUsage(metadata);

    expect(result).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      model: 'mock-v1',
      provider: 'mock',
      estimatedCostCents: 0,
      providerCostMicrousd: null,
      isPartial: false,
      missingFields: [],
    });
  });
});

// ─── safeNormalizeUsage ──────────────────────────────────────────

describe('safeNormalizeUsage', async () => {
  it('returns canonical usage for complete metadata', async () => {
    const metadata: ProviderMetadata = {
      provider: 'openrouter',
      model: 'openai/gpt-6-sol',
      usage: {
        promptTokens: 500,
        completionTokens: 1000,
        totalTokens: 1500,
      },
    };

    const result = await safeNormalizeUsage(metadata);

    expect(result.inputTokens).toBe(500);
    expect(result.outputTokens).toBe(1000);
    expect(result.provider).toBe('openrouter');
  });

  it('returns partial usage (not throw) for incomplete metadata', async () => {
    const metadata: ProviderMetadata = {};

    const result = await safeNormalizeUsage(metadata);

    expect(result.provider).toBe('unknown');
    expect(result.model).toBe('unknown');
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });

  it('returns partial usage for undefined metadata', async () => {
    const result = await safeNormalizeUsage(undefined);

    expect(result).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      model: 'unknown',
      provider: 'unknown',
      estimatedCostCents: 0,
      providerCostMicrousd: null,
      isPartial: true,
      missingFields: ['provider', 'model', 'inputTokens', 'outputTokens'],
    });
  });

  it('returns partial usage with available fields preserved', async () => {
    const metadata: ProviderMetadata = {
      provider: 'openrouter',
      model: 'openai/gpt-6-sol',
      // usage is missing entirely
    };

    const result = await safeNormalizeUsage(metadata);

    expect(result.provider).toBe('openrouter');
    expect(result.model).toBe('openai/gpt-6-sol');
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });
});

// ─── IncompleteUsageError ────────────────────────────────────────

describe('IncompleteUsageError', () => {
  it('carries partialUsage and missingFields', () => {
    const partialUsage = {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      model: 'unknown',
      provider: 'unknown',
      estimatedCostCents: 0,
      providerCostMicrousd: null,
      isPartial: true,
      missingFields: ['provider', 'model'] as const,
    };

    const error = new IncompleteUsageError('test error', partialUsage, [
      'provider',
      'model',
    ]);

    expect(error.name).toBe('IncompleteUsageError');
    expect(error.message).toBe('test error');
    expect(error.partialUsage).toBe(partialUsage);
    expect(error.missingFields).toEqual(['provider', 'model']);
    expect(error).toBeInstanceOf(Error);
  });
});
