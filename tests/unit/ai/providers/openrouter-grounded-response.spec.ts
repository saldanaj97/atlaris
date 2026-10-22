import {
  MID_STREAM_ERROR_CHUNKS,
  WEB_SEARCH_STREAM_CHUNKS,
  WEB_SEARCH_STREAM_TEXT,
} from './fixtures/openrouter-grounded-streams';
import { collectOpenRouterStream } from './openrouter-test-helpers';
import {
  ProviderError,
  ProviderInvalidResponseError,
} from '@/features/ai/providers/errors';
import {
  normalizeGroundedUsage,
  type OpenRouterGroundedMetadata,
  streamGroundedEvents,
} from '@/features/ai/providers/openrouter-grounded-response';
import { describe, expect, it } from 'vitest';

async function* fromChunks(chunks: readonly unknown[]) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

function freshMetadata(): OpenRouterGroundedMetadata {
  return { provider: 'openrouter', usage: {}, citations: [] };
}

describe('streamGroundedEvents', () => {
  it('streams text and collects deduplicated citations, usage and model', async () => {
    const metadata = freshMetadata();
    const usageRef = metadata.usage;

    const text = await collectOpenRouterStream(
      streamGroundedEvents({
        events: fromChunks(WEB_SEARCH_STREAM_CHUNKS),
        metadata,
      }),
    );

    expect(text).toBe(WEB_SEARCH_STREAM_TEXT);
    expect(metadata.citations).toEqual([
      {
        url: 'https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html',
        title: 'Understanding Ownership - The Rust Programming Language',
        content: 'Ownership is a set of rules [...] memory',
      },
      { url: 'https://rust-lang.org/learn', title: 'Learn Rust' },
    ]);
    expect(metadata.usage).toBe(usageRef);
    expect(metadata.usage).toEqual({
      promptTokens: 4210,
      completionTokens: 388,
      totalTokens: 4598,
      providerReportedCostUsd: 0.012734,
      cachedPromptTokens: 3900,
      cacheWritePromptTokens: 0,
      webSearchRequests: 2,
      serverToolCallsExecuted: 3,
    });
    expect(metadata.model).toBe('anthropic/claude-haiku-5.5');
    expect(metadata.finishReason).toBe('stop');
  });

  it('throws a provider error on a mid-stream error chunk', async () => {
    const stream = streamGroundedEvents({
      events: fromChunks(MID_STREAM_ERROR_CHUNKS),
      metadata: freshMetadata(),
    });

    const error: unknown = await collectOpenRouterStream(stream).catch(
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({
      kind: 'provider_error',
      statusCode: 502,
      message: 'Provider returned error',
    });
  });

  it('throws when the stream carries no text', async () => {
    const stream = streamGroundedEvents({
      events: fromChunks([{ choices: [{ delta: { content: '' } }] }]),
      metadata: freshMetadata(),
    });

    await expect(collectOpenRouterStream(stream)).rejects.toThrow(
      ProviderInvalidResponseError,
    );
  });
});

describe('normalizeGroundedUsage', () => {
  it('falls back to the documented server_tool_use field', () => {
    expect(
      normalizeGroundedUsage({ server_tool_use: { web_search_requests: 1 } }),
    ).toMatchObject({ webSearchRequests: 1 });
  });

  it('rejects a negative cost', () => {
    expect(() => normalizeGroundedUsage({ cost: -1 })).toThrow(
      ProviderInvalidResponseError,
    );
  });
});
