import { describe, expect, it } from 'vitest';

import { createMockProvider } from '@/lib/ai/mockProvider';
import {
  ProviderError,
  ProviderRateLimitError,
  type GenerationInput,
} from '@/lib/ai/provider';

const SAMPLE_INPUT: GenerationInput = {
  topic: 'Sample Topic',
  notes: 'Sample notes for testing the mock provider.',
  skillLevel: 'beginner',
  weeklyHours: 5,
  learningStyle: 'mixed',
};

async function collectStream(stream: AsyncIterable<string>) {
  let output = '';
  for await (const chunk of stream) {
    output += chunk;
  }
  return output;
}

describe('Mock AI provider', () => {
  it('returns deterministic payload for the success scenario', async () => {
    const mock = createMockProvider({ scenario: 'success', chunkSize: 32 });
    const result = await mock.provider.generate(SAMPLE_INPUT);

    expect(mock.invocationCount).toBe(1);
    expect(result.metadata).toMatchObject({
      provider: 'mock-ai',
      model: 'mock-gpt-4o-mini',
    });

    const payload = JSON.parse(await collectStream(result.stream));
    expect(Array.isArray(payload.modules)).toBe(true);
    expect(payload.modules).toHaveLength(2);
    expect(payload.modules[0].tasks).toHaveLength(3);
  });

  it('returns empty modules for validation scenario', async () => {
    const mock = createMockProvider({ scenario: 'validation' });
    const result = await mock.provider.generate(SAMPLE_INPUT);

    const payload = JSON.parse(await collectStream(result.stream));
    expect(payload.modules).toEqual([]);
    expect(mock.invocationCount).toBe(1);
  });

  it('rejects with rate limit error when scenario is rate_limit', async () => {
    const mock = createMockProvider({ scenario: 'rate_limit' });
    await expect(mock.provider.generate(SAMPLE_INPUT)).rejects.toBeInstanceOf(
      ProviderRateLimitError
    );
    expect(mock.invocationCount).toBe(1);
  });

  it('rejects with provider error when scenario is error', async () => {
    const mock = createMockProvider({ scenario: 'error' });
    await expect(mock.provider.generate(SAMPLE_INPUT)).rejects.toBeInstanceOf(
      ProviderError
    );
    expect(mock.invocationCount).toBe(1);
  });
});
