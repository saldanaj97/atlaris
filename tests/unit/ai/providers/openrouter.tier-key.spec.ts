import {
  OPENROUTER_SAMPLE_INPUT,
  OPENROUTER_TEST_LESSON_PRESET,
  OPENROUTER_TEST_MODEL,
  OPENROUTER_TEST_PLAN_PRESET,
  VALID_PLAN_RESPONSE,
} from './openrouter-test-helpers';
import { OpenRouterProvider } from '@/features/ai/providers/openrouter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const coreOptions = vi.hoisted(() => [] as unknown[]);

vi.mock('@openrouter/sdk/core', () => ({
  OpenRouterCore: class {
    constructor(options: unknown) {
      coreOptions.push(options);
    }
  },
}));

vi.mock('@openrouter/sdk/funcs/chatSend', () => ({
  chatSend: () =>
    Promise.resolve({
      ok: true,
      value: {
        choices: [
          { message: { content: JSON.stringify(VALID_PLAN_RESPONSE) } },
        ],
      },
    }),
}));

async function sdkApiKey(
  config: ConstructorParameters<typeof OpenRouterProvider>[0],
) {
  await new OpenRouterProvider(config).generate(OPENROUTER_SAMPLE_INPUT);
  return (coreOptions.at(-1) as { apiKey?: string }).apiKey;
}

describe('OpenRouterProvider API key per tier', () => {
  beforeEach(() => {
    coreOptions.length = 0;
    vi.stubEnv('OPENROUTER_API_KEY', 'shared-key');
    vi.stubEnv('OPENROUTER_API_KEY_FREE', 'free-key');
    vi.stubEnv('OPENROUTER_API_KEY_STARTER', 'starter-key');
    vi.stubEnv('OPENROUTER_API_KEY_PRO', 'pro-key');
    vi.stubEnv('OPENROUTER_PLAN_PRESET', OPENROUTER_TEST_PLAN_PRESET);
    vi.stubEnv('OPENROUTER_LESSON_PRESET', OPENROUTER_TEST_LESSON_PRESET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ['free', 'free-key'],
    ['starter', 'starter-key'],
    ['pro', 'pro-key'],
  ] as const)('uses the %s key for that tier', async (tier, key) => {
    await expect(
      sdkApiKey({ model: OPENROUTER_TEST_MODEL, tier }),
    ).resolves.toBe(key);
  });

  it('falls back to OPENROUTER_API_KEY when the tier key is unset', async () => {
    vi.stubEnv('OPENROUTER_API_KEY_PRO', '');

    await expect(
      sdkApiKey({ model: OPENROUTER_TEST_MODEL, tier: 'pro' }),
    ).resolves.toBe('shared-key');
  });

  it('keeps OPENROUTER_API_KEY without a tier, as the current pipeline does', async () => {
    await expect(sdkApiKey({ model: OPENROUTER_TEST_MODEL })).resolves.toBe(
      'shared-key',
    );
  });

  it('prefers an explicit apiKey over the tier key', async () => {
    await expect(
      sdkApiKey({ model: OPENROUTER_TEST_MODEL, tier: 'pro', apiKey: 'given' }),
    ).resolves.toBe('given');
  });

  it('throws when neither the tier key nor the shared key is set', () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    vi.stubEnv('OPENROUTER_API_KEY_FREE', '');

    expect(
      () =>
        new OpenRouterProvider({ model: OPENROUTER_TEST_MODEL, tier: 'free' }),
    ).toThrow('OPENROUTER_API_KEY is not set');
  });
});
