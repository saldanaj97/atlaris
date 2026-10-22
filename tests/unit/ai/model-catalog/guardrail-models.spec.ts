import {
  fetchGuardrailModels,
  GuardrailModelsError,
  parseGuardrailModels,
} from '@/features/ai/model-catalog/guardrail-models';
import { logger } from '@/lib/logging/logger';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
});

/** Shaped like a real `/models/user` entry, including fields the sync ignores. */
function apiModel(overrides: Record<string, unknown> = {}) {
  return {
    id: 'anthropic/claude-haiku-5.5',
    name: 'Anthropic: Claude Haiku 5.5',
    description: 'Fast Anthropic model.',
    context_length: 1_000_000,
    pricing: {
      prompt: '0.0000001',
      completion: '0.0000005',
      web_search: '0.01',
      overrides: [
        { min_prompt_tokens: 100_000, prompt: '0.0000005', completion: '0' },
      ],
    },
    top_provider: { context_length: 1_000_000, max_completion_tokens: 128_000 },
    supported_parameters: ['max_tokens', 'response_format', 'tools'],
    ...overrides,
  };
}

describe('parseGuardrailModels', () => {
  it('maps a /models/user entry to catalog units', () => {
    expect(parseGuardrailModels({ data: [apiModel()] })).toEqual([
      {
        modelId: 'anthropic/claude-haiku-5.5',
        name: 'Claude Haiku 5.5',
        provider: 'Anthropic',
        description: 'Fast Anthropic model.',
        contextLength: 1_000_000,
        maxOutputTokens: 128_000,
        inputCostPerMillion: 0.1,
        outputCostPerMillion: 0.5,
        supportedParameters: ['max_tokens', 'response_format', 'tools'],
      },
    ]);
  });

  it('falls back to the id vendor and nulls a missing output limit', () => {
    const [model] = parseGuardrailModels({
      data: [
        apiModel({
          id: 'deepseek/deepseek-v4.1-flash',
          name: 'DeepSeek V4.1 Flash',
          description: null,
          top_provider: null,
          supported_parameters: undefined,
          pricing: { prompt: '0.00000007', completion: '0.0000005' },
        }),
      ],
    });

    expect(model).toMatchObject({
      provider: 'deepseek',
      name: 'DeepSeek V4.1 Flash',
      description: '',
      maxOutputTokens: null,
      inputCostPerMillion: 0.07,
      supportedParameters: [],
    });
  });

  it('rejects an empty list', () => {
    expect(() => parseGuardrailModels({ data: [] })).toThrow(
      expect.objectContaining({ reason: 'empty' }),
    );
  });

  it('skips a variable (-1) price or malformed model and logs it', () => {
    const warnSpy = vi.spyOn(logger, 'warn');

    const models = parseGuardrailModels({
      data: [
        apiModel(),
        apiModel({
          id: 'openrouter/auto',
          pricing: { prompt: '-1', completion: '-1' },
        }),
        apiModel({ id: 'broken', context_length: 'big' }),
      ],
    });

    expect(models.map((model) => model.modelId)).toEqual([
      'anthropic/claude-haiku-5.5',
    ]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'guardrail_models_skipped',
        skippedModelIds: ['openrouter/auto', 'broken'],
      }),
      expect.any(String),
    );
  });

  it('rejects a list with no valid model instead of emptying the tier', () => {
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

    expect(() =>
      parseGuardrailModels({
        data: [apiModel({ pricing: { prompt: '-1', completion: '-1' } })],
      }),
    ).toThrow(expect.objectContaining({ reason: 'parse' }));
  });

  it('rejects a body without a model list', () => {
    expect(() => parseGuardrailModels({ models: [] })).toThrow(
      GuardrailModelsError,
    );
  });
});

describe('fetchGuardrailModels', () => {
  it('calls /models/user with the tier key and a timeout', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ data: [apiModel()] })),
    );

    const models = await fetchGuardrailModels({
      apiKey: 'tier-key',
      timeoutMs: 5_000,
      fetchImpl,
    });

    expect(models).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/models/user',
      {
        headers: { Authorization: 'Bearer tier-key' },
        signal: expect.any(AbortSignal),
      },
    );
  });

  it('throws an http error on a non-2xx response', async () => {
    await expect(
      fetchGuardrailModels({
        apiKey: 'tier-key',
        timeoutMs: 5_000,
        fetchImpl: async () => new Response('nope', { status: 401 }),
      }),
    ).rejects.toMatchObject({ reason: 'http' });
  });

  it('throws a parse error on a non-JSON body', async () => {
    await expect(
      fetchGuardrailModels({
        apiKey: 'tier-key',
        timeoutMs: 5_000,
        fetchImpl: async () => new Response('<html>'),
      }),
    ).rejects.toMatchObject({ reason: 'parse' });
  });
});
