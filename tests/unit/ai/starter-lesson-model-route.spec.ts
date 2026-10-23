import { AI_DEFAULT_MODEL } from '@/features/ai/ai-models';
import { STARTER_DEFAULT_MODEL_ID } from '@/features/ai/model-operation-policy';
import { resolveModelForTier } from '@/features/ai/model-resolver';
import * as Sentry from '@sentry/nextjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sentry/nextjs')>()),
  captureMessage: vi.fn(),
}));

const coreOptions = vi.fn();
const mockSend = vi.fn();

vi.mock('@openrouter/sdk/core', () => ({
  OpenRouterCore: class {
    constructor(options: unknown) {
      coreOptions(options);
    }
  },
}));

vi.mock('@openrouter/sdk/funcs/chatSend', () => ({
  chatSend: (_core: unknown, request: unknown, options: unknown) =>
    Promise.resolve(mockSend(request, options)).then(
      (value: unknown) => ({ ok: true, value }),
      (error: unknown) => ({ ok: false, error }),
    ),
}));

const LUNA = STARTER_DEFAULT_MODEL_ID;
const LESSON_PRESET = 'test-lesson-preset';
const lessonInput = { userPrompt: 'lesson user prompt', taskIds: ['task-1'] };

async function resolveStarterLessonProvider() {
  return resolveModelForTier('starter', undefined, 'lesson');
}

describe('Starter lesson model route (DEV-180)', () => {
  beforeEach(() => {
    vi.stubEnv('AI_PROVIDER', 'router');
    vi.stubEnv('OPENROUTER_API_KEY', 'worker-key');
    vi.stubEnv('OPENROUTER_API_KEY_STARTER', 'starter-tier-key');
    vi.stubEnv('OPENROUTER_LESSON_PRESET', LESSON_PRESET);
    vi.stubEnv('CF_AI_GATEWAY_TOKEN', '');
    coreOptions.mockReset();
    mockSend.mockReset();
    vi.mocked(Sentry.captureMessage).mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('runs on GPT-6 Luna with openrouter/free as the only fallback', async () => {
    mockSend.mockResolvedValueOnce({
      model: LUNA,
      choices: [{ message: { content: '{"version":1,"tasks":[]}' } }],
    });

    const resolution = await resolveStarterLessonProvider();
    expect(resolution.modelId).toBe(LUNA);
    expect(resolution.freeRouterFallback).toBeUndefined();

    await resolution.provider.generateModuleLessonBatch(lessonInput);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const [{ chatRequest }] = mockSend.mock.calls[0] as [
      { chatRequest: Record<string, unknown> },
    ];
    expect(chatRequest.models).toEqual([
      `${LUNA}@preset/${LESSON_PRESET}`,
      `${AI_DEFAULT_MODEL}@preset/${LESSON_PRESET}`,
    ]);
    expect(chatRequest).not.toHaveProperty('model');
    // The Starter tier key's guardrail blocks openrouter/free; the Worker key
    // allows it, so the fallback can run.
    expect(coreOptions).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'worker-key' }),
    );
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });

  it('records the model OpenRouter served on the [luna, free] fallback route', async () => {
    // OpenRouter answers from the next route model when Luna errors upstream
    // and names the model that served the response.
    const servedFreeModel = 'nvidia/nemotron-3.5-lightning:free';
    mockSend.mockResolvedValueOnce({
      model: servedFreeModel,
      choices: [{ message: { content: '{"version":1,"tasks":[]}' } }],
    });

    const { provider } = await resolveStarterLessonProvider();
    const result = await provider.generateModuleLessonBatch(lessonInput);

    const [{ chatRequest }] = mockSend.mock.calls[0] as [
      { chatRequest: Record<string, unknown> },
    ];
    expect(chatRequest.models).toEqual([
      `${LUNA}@preset/${LESSON_PRESET}`,
      `${AI_DEFAULT_MODEL}@preset/${LESSON_PRESET}`,
    ]);
    expect(result.metadata.model).toBe(servedFreeModel);
  });
});
