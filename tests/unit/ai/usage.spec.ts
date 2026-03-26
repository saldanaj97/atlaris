import { describe, expect, it, vi } from 'vitest';

import {
  normalizeToCanonicalUsage,
  safeNormalizeUsage,
} from '@/features/ai/usage';
import type { ProviderMetadata } from '@/shared/types/ai-provider.types';
import { IncompleteUsageError } from '@/shared/types/ai-usage.types';

// Mock Sentry so safeNormalizeUsage doesn't throw on import
vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

// Mock getModelById for cost calculation tests
vi.mock('@/features/ai/ai-models', () => ({
  getModelById: (id: string) => {
    const models: Record<
      string,
      { inputCostPerMillion: number; outputCostPerMillion: number }
    > = {
      'openai/gpt-4o': {
        inputCostPerMillion: 2.5,
        outputCostPerMillion: 10,
      },
      'google/gemini-2.0-flash-exp:free': {
        inputCostPerMillion: 0,
        outputCostPerMillion: 0,
      },
    };
    return models[id] ?? undefined;
  },
}));

// ─── normalizeToCanonicalUsage ───────────────────────────────────

describe('normalizeToCanonicalUsage', () => {
  it('normalizes complete provider metadata into canonical shape', () => {
    const metadata: ProviderMetadata = {
      provider: 'openrouter',
      model: 'openai/gpt-4o',
      usage: {
        promptTokens: 500,
        completionTokens: 1000,
        totalTokens: 1500,
      },
    };

    const result = normalizeToCanonicalUsage(metadata);

    expect(result).toEqual({
      inputTokens: 500,
      outputTokens: 1000,
      totalTokens: 1500,
      model: 'openai/gpt-4o',
      provider: 'openrouter',
      estimatedCostCents: expect.any(Number),
    });
  });

  it('computes totalTokens when not provided by the provider', () => {
    const metadata: ProviderMetadata = {
      provider: 'openrouter',
      model: 'openai/gpt-4o',
      usage: {
        promptTokens: 200,
        completionTokens: 300,
      },
    };

    const result = normalizeToCanonicalUsage(metadata);

    expect(result.totalTokens).toBe(500);
  });

  it('throws IncompleteUsageError when provider is missing', () => {
    const metadata: ProviderMetadata = {
      model: 'openai/gpt-4o',
      usage: {
        promptTokens: 100,
        completionTokens: 200,
      },
    };

    expect(() => normalizeToCanonicalUsage(metadata)).toThrow(
      IncompleteUsageError
    );

    try {
      normalizeToCanonicalUsage(metadata);
    } catch (error) {
      expect(error).toBeInstanceOf(IncompleteUsageError);
      const usageError = error as IncompleteUsageError;
      expect(usageError.missingFields).toContain('provider');
      expect(usageError.partialUsage.provider).toBe('unknown');
      expect(usageError.partialUsage.inputTokens).toBe(100);
    }
  });

  it('throws IncompleteUsageError when model is missing', () => {
    const metadata: ProviderMetadata = {
      provider: 'openrouter',
      usage: {
        promptTokens: 100,
        completionTokens: 200,
      },
    };

    expect(() => normalizeToCanonicalUsage(metadata)).toThrow(
      IncompleteUsageError
    );

    try {
      normalizeToCanonicalUsage(metadata);
    } catch (error) {
      const usageError = error as IncompleteUsageError;
      expect(usageError.missingFields).toContain('model');
      expect(usageError.partialUsage.model).toBe('unknown');
    }
  });

  it('throws IncompleteUsageError when inputTokens is missing', () => {
    const metadata: ProviderMetadata = {
      provider: 'openrouter',
      model: 'openai/gpt-4o',
      usage: {
        completionTokens: 200,
      },
    };

    expect(() => normalizeToCanonicalUsage(metadata)).toThrow(
      IncompleteUsageError
    );

    try {
      normalizeToCanonicalUsage(metadata);
    } catch (error) {
      const usageError = error as IncompleteUsageError;
      expect(usageError.missingFields).toContain('inputTokens');
      expect(usageError.partialUsage.inputTokens).toBe(0);
      expect(usageError.partialUsage.outputTokens).toBe(200);
    }
  });

  it('throws IncompleteUsageError when outputTokens is missing', () => {
    const metadata: ProviderMetadata = {
      provider: 'openrouter',
      model: 'openai/gpt-4o',
      usage: {
        promptTokens: 100,
      },
    };

    expect(() => normalizeToCanonicalUsage(metadata)).toThrow(
      IncompleteUsageError
    );

    try {
      normalizeToCanonicalUsage(metadata);
    } catch (error) {
      const usageError = error as IncompleteUsageError;
      expect(usageError.missingFields).toContain('outputTokens');
      expect(usageError.partialUsage.outputTokens).toBe(0);
      expect(usageError.partialUsage.inputTokens).toBe(100);
    }
  });

  it('throws IncompleteUsageError when usage object is entirely missing', () => {
    const metadata: ProviderMetadata = {
      provider: 'openrouter',
      model: 'openai/gpt-4o',
    };

    expect(() => normalizeToCanonicalUsage(metadata)).toThrow(
      IncompleteUsageError
    );

    try {
      normalizeToCanonicalUsage(metadata);
    } catch (error) {
      const usageError = error as IncompleteUsageError;
      expect(usageError.missingFields).toContain('inputTokens');
      expect(usageError.missingFields).toContain('outputTokens');
      expect(usageError.partialUsage.inputTokens).toBe(0);
      expect(usageError.partialUsage.outputTokens).toBe(0);
    }
  });

  it('throws IncompleteUsageError when metadata is undefined', () => {
    expect(() => normalizeToCanonicalUsage(undefined)).toThrow(
      IncompleteUsageError
    );

    try {
      normalizeToCanonicalUsage(undefined);
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
      });
    }
  });

  it('reports multiple missing fields at once', () => {
    const metadata: ProviderMetadata = {
      usage: {
        promptTokens: 100,
      },
    };

    try {
      normalizeToCanonicalUsage(metadata);
    } catch (error) {
      const usageError = error as IncompleteUsageError;
      expect(usageError.missingFields).toEqual(
        expect.arrayContaining(['provider', 'model', 'outputTokens'])
      );
      expect(usageError.missingFields).toHaveLength(3);
    }
  });

  it('does NOT throw when all fields are present (even if zero)', () => {
    const metadata: ProviderMetadata = {
      provider: 'mock',
      model: 'mock-v1',
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    };

    const result = normalizeToCanonicalUsage(metadata);

    expect(result).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      model: 'mock-v1',
      provider: 'mock',
      estimatedCostCents: 0,
    });
  });
});

// ─── safeNormalizeUsage ──────────────────────────────────────────

describe('safeNormalizeUsage', () => {
  it('returns canonical usage for complete metadata', () => {
    const metadata: ProviderMetadata = {
      provider: 'openrouter',
      model: 'openai/gpt-4o',
      usage: {
        promptTokens: 500,
        completionTokens: 1000,
        totalTokens: 1500,
      },
    };

    const result = safeNormalizeUsage(metadata);

    expect(result.inputTokens).toBe(500);
    expect(result.outputTokens).toBe(1000);
    expect(result.provider).toBe('openrouter');
  });

  it('returns partial usage (not throw) for incomplete metadata', () => {
    const metadata: ProviderMetadata = {};

    const result = safeNormalizeUsage(metadata);

    expect(result.provider).toBe('unknown');
    expect(result.model).toBe('unknown');
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });

  it('returns partial usage for undefined metadata', () => {
    const result = safeNormalizeUsage(undefined);

    expect(result).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      model: 'unknown',
      provider: 'unknown',
      estimatedCostCents: 0,
    });
  });

  it('returns partial usage with available fields preserved', () => {
    const metadata: ProviderMetadata = {
      provider: 'openrouter',
      model: 'openai/gpt-4o',
      // usage is missing entirely
    };

    const result = safeNormalizeUsage(metadata);

    expect(result.provider).toBe('openrouter');
    expect(result.model).toBe('openai/gpt-4o');
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
