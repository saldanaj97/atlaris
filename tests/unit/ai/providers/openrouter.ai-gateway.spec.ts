import {
  createOpenRouterMockClient,
  OPENROUTER_SAMPLE_INPUT,
  OPENROUTER_TEST_LESSON_PRESET,
  OPENROUTER_TEST_MODEL,
  OPENROUTER_TEST_PLAN_PRESET,
  VALID_PLAN_RESPONSE,
} from './openrouter-test-helpers';
import { OpenRouterProvider } from '@/features/ai/providers/openrouter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const GATEWAY_BASE_URL =
  'https://gateway.ai.cloudflare.com/v1/test-account/atlaris-staging/openrouter';

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

const PLAN_RESPONSE = {
  choices: [{ message: { content: JSON.stringify(VALID_PLAN_RESPONSE) } }],
};

async function sendPlanRequest() {
  const { client, send } = createOpenRouterMockClient();
  send.mockResolvedValueOnce(PLAN_RESPONSE);
  const provider = new OpenRouterProvider(
    { model: OPENROUTER_TEST_MODEL },
    client,
  );
  await provider.generate(OPENROUTER_SAMPLE_INPUT);
  const [, options] = send.mock.calls[0] ?? [];
  return options as { headers?: Record<string, string> };
}

describe('OpenRouterProvider AI Gateway routing', () => {
  beforeEach(() => {
    coreOptions.length = 0;
    vi.stubEnv('OPENROUTER_API_KEY', 'test-api-key');
    vi.stubEnv('OPENROUTER_PLAN_PRESET', OPENROUTER_TEST_PLAN_PRESET);
    vi.stubEnv('OPENROUTER_LESSON_PRESET', OPENROUTER_TEST_LESSON_PRESET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds the SDK client with OPENROUTER_BASE_URL as the server URL', async () => {
    vi.stubEnv('OPENROUTER_BASE_URL', GATEWAY_BASE_URL);
    const provider = new OpenRouterProvider({ model: OPENROUTER_TEST_MODEL });

    await provider.generate(OPENROUTER_SAMPLE_INPUT);

    expect(coreOptions).toEqual([
      expect.objectContaining({ serverURL: GATEWAY_BASE_URL }),
    ]);
  });

  it('defaults the SDK server URL to OpenRouter', async () => {
    vi.stubEnv('OPENROUTER_BASE_URL', undefined);
    const provider = new OpenRouterProvider({ model: OPENROUTER_TEST_MODEL });

    await provider.generate(OPENROUTER_SAMPLE_INPUT);

    expect(coreOptions).toEqual([
      expect.objectContaining({ serverURL: 'https://openrouter.ai/api/v1' }),
    ]);
  });

  it('sends no gateway headers without a gateway token', async () => {
    vi.stubEnv('OPENROUTER_BASE_URL', GATEWAY_BASE_URL);
    vi.stubEnv('CF_AI_GATEWAY_TOKEN', undefined);

    const options = await sendPlanRequest();

    expect(options.headers).toBeUndefined();
  });

  it('keeps the gateway token away from a non-gateway base URL', async () => {
    vi.stubEnv('OPENROUTER_BASE_URL', 'https://openrouter.ai/api/v1');
    vi.stubEnv('CF_AI_GATEWAY_TOKEN', 'gateway-token');

    const options = await sendPlanRequest();

    expect(options.headers).toBeUndefined();
  });

  it('authenticates, tags, and drops payloads for production plan calls', async () => {
    vi.stubEnv('OPENROUTER_BASE_URL', GATEWAY_BASE_URL);
    vi.stubEnv('CF_AI_GATEWAY_TOKEN', 'gateway-token');
    vi.stubEnv('WORKER_ENV', 'production');

    const options = await sendPlanRequest();

    expect(options.headers).toEqual({
      'cf-aig-authorization': 'Bearer gateway-token',
      'cf-aig-metadata': JSON.stringify({
        stage: 'plan',
        preset: OPENROUTER_TEST_PLAN_PRESET,
      }),
      'cf-aig-skip-cache': 'true',
      'cf-aig-max-attempts': '2',
      'cf-aig-retry-delay': '1000',
      'cf-aig-backoff': 'constant',
      'cf-aig-collect-log-payload': 'false',
    });
  });

  it('drops payloads when WORKER_ENV is unset', async () => {
    vi.stubEnv('OPENROUTER_BASE_URL', GATEWAY_BASE_URL);
    vi.stubEnv('CF_AI_GATEWAY_TOKEN', 'gateway-token');
    vi.stubEnv('WORKER_ENV', undefined);

    const options = await sendPlanRequest();

    expect(options.headers).toMatchObject({
      'cf-aig-collect-log-payload': 'false',
    });
  });

  it('keeps payloads and tags the lesson stage on staging', async () => {
    vi.stubEnv('OPENROUTER_BASE_URL', GATEWAY_BASE_URL);
    vi.stubEnv('CF_AI_GATEWAY_TOKEN', 'gateway-token');
    vi.stubEnv('WORKER_ENV', 'staging');
    const { client, send } = createOpenRouterMockClient();
    send.mockResolvedValueOnce({
      choices: [{ message: { content: '{"version":1,"tasks":[]}' } }],
    });
    const provider = new OpenRouterProvider(
      { model: OPENROUTER_TEST_MODEL },
      client,
    );

    await provider.generateModuleLessonBatch({
      userPrompt: 'lesson user prompt',
      taskIds: ['task-1'],
    });

    const [, options] = send.mock.calls[0] ?? [];
    expect((options as { headers?: Record<string, string> }).headers).toEqual({
      'cf-aig-authorization': 'Bearer gateway-token',
      'cf-aig-metadata': JSON.stringify({
        stage: 'lesson',
        preset: OPENROUTER_TEST_LESSON_PRESET,
      }),
      'cf-aig-skip-cache': 'true',
      'cf-aig-max-attempts': '2',
      'cf-aig-retry-delay': '1000',
      'cf-aig-backoff': 'constant',
    });
  });
});
