import {
  toByteStream,
  toSseBody,
  WEB_SEARCH_STREAM_CHUNKS,
  WEB_SEARCH_STREAM_TEXT,
} from './fixtures/openrouter-grounded-streams';
import {
  collectOpenRouterStream,
  OPENROUTER_TEST_MODEL,
  OPENROUTER_TEST_PLAN_PRESET,
} from './openrouter-test-helpers';
import {
  ProviderError,
  ProviderTimeoutError,
} from '@/features/ai/providers/errors';
import {
  type OpenRouterGroundedChatRequest,
  sendOpenRouterGroundedChat,
} from '@/features/ai/providers/openrouter';
import { extractFirstJsonObject } from '@/features/ai/providers/openrouter-json';
import { toWireServerTool } from '@/features/ai/providers/openrouter-server-tools';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const GATEWAY_BASE_URL =
  'https://gateway.ai.cloudflare.com/v1/test-account/atlaris-staging/openrouter';

const BASE_REQUEST: OpenRouterGroundedChatRequest = {
  tier: 'pro',
  model: OPENROUTER_TEST_MODEL,
  presetSlug: OPENROUTER_TEST_PLAN_PRESET,
  stage: 'research',
  userParts: [
    { text: 'Brief: learn Rust ownership', cache: true },
    { text: 'Module outline: ...', cache: true },
    { text: 'Find sources for module 1' },
  ],
  promptCacheKey: 'plan-123',
  responseFormat: {
    type: 'json_schema',
    name: 'research',
    schema: { type: 'object' },
    strict: true,
  },
  serverTools: [
    {
      type: 'web_search',
      engine: 'parallel',
      mode: 'fast',
      maxResults: 5,
      maxTotalResults: 15,
    },
    {
      type: 'advisor',
      model: 'anthropic/claude-opus-4.5',
      instructions: 'Check source quality',
      maxCompletionTokens: 800,
      temperature: 0,
    },
  ],
  toolChoice: 'auto',
  maxToolCalls: 6,
};

function streamResponse(): Response {
  return new Response(toByteStream(toSseBody(WEB_SEARCH_STREAM_CHUNKS)), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

/** Sends one text event, then stalls until the request signal aborts, as fetch does. */
function stallingFetch() {
  return vi.fn<typeof fetch>((_url, init) => {
    const signal = init?.signal;
    const firstEvent = new TextEncoder().encode(
      `data: ${JSON.stringify({ choices: [{ delta: { content: '{' } }] })}\n\n`,
    );
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(firstEvent);
        signal?.addEventListener('abort', () =>
          controller.error(signal.reason),
        );
      },
    });
    return Promise.resolve(new Response(body, { status: 200 }));
  });
}

function captureFetch(response: () => Response = streamResponse) {
  const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(response()));
  const call = () => {
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    return {
      url: String(url),
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    };
  };
  return { fetchMock, call };
}

describe('toWireServerTool', () => {
  it('maps tools to OpenRouter server tools and drops unset parameters', () => {
    expect(
      toWireServerTool({ type: 'web_search', engine: 'parallel' }),
    ).toEqual({
      type: 'openrouter:web_search',
      parameters: { engine: 'parallel' },
    });
    expect(toWireServerTool({ type: 'advisor', model: 'x/y' })).toEqual({
      type: 'openrouter:advisor',
      parameters: { model: 'x/y' },
    });
  });
});

describe('sendOpenRouterGroundedChat', () => {
  beforeEach(() => {
    vi.stubEnv('OPENROUTER_API_KEY', 'shared-key');
    vi.stubEnv('OPENROUTER_API_KEY_PRO', 'pro-key');
    vi.stubEnv('OPENROUTER_BASE_URL', GATEWAY_BASE_URL);
    vi.stubEnv('CF_AI_GATEWAY_TOKEN', 'gateway-token');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('sends server tools, cache breakpoints and the schema format on the wire', async () => {
    const { fetchMock, call } = captureFetch();

    await sendOpenRouterGroundedChat(BASE_REQUEST, { fetch: fetchMock });

    const { url, body } = call();
    expect(url).toBe(`${GATEWAY_BASE_URL}/chat/completions`);
    expect(body).toMatchObject({
      model: `${OPENROUTER_TEST_MODEL}@preset/${OPENROUTER_TEST_PLAN_PRESET}`,
      stream: true,
      prompt_cache_key: 'plan-123',
      tool_choice: 'auto',
      max_tool_calls: 6,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'research',
          schema: { type: 'object' },
          strict: true,
        },
      },
      tools: [
        {
          type: 'openrouter:web_search',
          parameters: {
            engine: 'parallel',
            mode: 'fast',
            max_results: 5,
            max_total_results: 15,
          },
        },
        {
          type: 'openrouter:advisor',
          parameters: {
            model: 'anthropic/claude-opus-4.5',
            instructions: 'Check source quality',
            max_completion_tokens: 800,
            temperature: 0,
          },
        },
      ],
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Brief: learn Rust ownership',
              cache_control: { type: 'ephemeral' },
            },
            {
              type: 'text',
              text: 'Module outline: ...',
              cache_control: { type: 'ephemeral' },
            },
            { type: 'text', text: 'Find sources for module 1' },
          ],
        },
      ],
    });
    const [, , lastPart] =
      (body.messages as { content: object[] }[])[0]?.content ?? [];
    expect(lastPart).not.toHaveProperty('cache_control');
  });

  it("uses the tier's API key and a single gateway attempt with server tools", async () => {
    const { fetchMock, call } = captureFetch();

    await sendOpenRouterGroundedChat(BASE_REQUEST, { fetch: fetchMock });

    expect(call().headers).toMatchObject({
      Authorization: 'Bearer pro-key',
      'cf-aig-authorization': 'Bearer gateway-token',
      'cf-aig-max-attempts': '1',
    });
  });

  it('keeps the default gateway retry and omits tool fields without server tools', async () => {
    const { fetchMock, call } = captureFetch();

    await sendOpenRouterGroundedChat(
      {
        ...BASE_REQUEST,
        tier: 'free',
        serverTools: undefined,
        toolChoice: undefined,
        maxToolCalls: undefined,
        responseFormat: { type: 'json_object' },
      },
      { fetch: fetchMock },
    );

    const { headers, body } = call();
    expect(headers).toMatchObject({
      Authorization: 'Bearer shared-key',
      'cf-aig-max-attempts': '2',
    });
    expect(body).not.toHaveProperty('tools');
    expect(body).not.toHaveProperty('tool_choice');
    expect(body).not.toHaveProperty('max_tool_calls');
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('fills citations, usage and cost once the stream is read', async () => {
    const { fetchMock } = captureFetch();

    const { stream, metadata } = await sendOpenRouterGroundedChat(
      BASE_REQUEST,
      { fetch: fetchMock },
    );
    const text = await collectOpenRouterStream(stream);

    expect(text).toBe(WEB_SEARCH_STREAM_TEXT);
    expect(extractFirstJsonObject(text)).toMatchObject({
      modules: [{ title: 'Rust ownership' }],
    });
    expect(metadata.citations.map((citation) => citation.url)).toEqual([
      'https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html',
      'https://rust-lang.org/learn',
    ]);
    expect(metadata.usage).toMatchObject({
      providerReportedCostUsd: 0.012734,
      cachedPromptTokens: 3900,
      webSearchRequests: 2,
    });
  });

  it('maps an HTTP 429 to a rate-limit provider error', async () => {
    const { fetchMock } = captureFetch(
      () =>
        new Response(
          JSON.stringify({ error: { code: 429, message: 'Rate limited' } }),
          { status: 429 },
        ),
    );

    const error: unknown = await sendOpenRouterGroundedChat(BASE_REQUEST, {
      fetch: fetchMock,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({
      kind: 'rate_limit',
      statusCode: 429,
      message: 'Rate limited',
    });
  });

  it('maps a timeout while reading the stream to a provider timeout error', async () => {
    const timeoutController = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timeoutController.signal);
    const fetchMock = stallingFetch();

    const { stream } = await sendOpenRouterGroundedChat(BASE_REQUEST, {
      fetch: fetchMock,
    });
    const reader = stream.getReader();
    await reader.read();
    timeoutController.abort(new DOMException('timed out', 'TimeoutError'));

    await expect(reader.read()).rejects.toBeInstanceOf(ProviderTimeoutError);
  });

  it('aborts the request when the caller cancels the stream', async () => {
    const fetchMock = stallingFetch();

    const { stream } = await sendOpenRouterGroundedChat(BASE_REQUEST, {
      fetch: fetchMock,
    });
    const reader = stream.getReader();
    await reader.read();
    await reader.cancel();

    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it('rejects more than four cache breakpoints before sending', async () => {
    const { fetchMock } = captureFetch();

    await expect(
      sendOpenRouterGroundedChat(
        {
          ...BASE_REQUEST,
          userParts: Array.from({ length: 5 }, (_, index) => ({
            text: `part ${index}`,
            cache: true,
          })),
        },
        { fetch: fetchMock },
      ),
    ).rejects.toThrow('at most 4 cached prompt parts');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
