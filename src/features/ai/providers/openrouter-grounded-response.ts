import type {
  ProviderMetadata,
  ProviderUsage,
} from '@/features/ai/types/provider.types';

import {
  ProviderError,
  ProviderInvalidResponseError,
} from '@/features/ai/providers/errors';
import { isObjectRecord } from '@/features/ai/providers/openrouter-response';
import { asyncIterableToReadableStream } from '@/features/ai/streaming/utils';

/** A source the model cited, from a streamed `url_citation` annotation. */
export type OpenRouterUrlCitation = {
  url: string;
  title?: string;
  /** Excerpt from the page, when the search engine returns one. */
  content?: string;
};

export type OpenRouterGroundedUsage = ProviderUsage & {
  cachedPromptTokens?: number;
  cacheWritePromptTokens?: number;
  /** Searches billed for the request, advisor searches included. */
  webSearchRequests?: number;
  serverToolCallsExecuted?: number;
};

/**
 * Filled in while the stream is read; complete once it closes. `usage.cost`
 * already includes advisor cost.
 */
export type OpenRouterGroundedMetadata = ProviderMetadata & {
  usage: OpenRouterGroundedUsage;
  citations: OpenRouterUrlCitation[];
};

function readNumber(
  record: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function readRecord(
  record: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const value = record?.[key];
  return isObjectRecord(value) && !Array.isArray(value) ? value : undefined;
}

function readCost(usage: Record<string, unknown>): number | undefined {
  const cost = usage.cost;
  if (cost === undefined || cost === null) {
    return undefined;
  }
  if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) {
    throw new ProviderInvalidResponseError(
      'OpenRouter usage.cost must be a non-negative finite number when present',
    );
  }
  return cost;
}

/**
 * Reads the wire `usage` object. Search counts come from
 * `server_tool_use_details`; the documented `server_tool_use` is read only as
 * a fallback because responses omit it in practice.
 */
export function normalizeGroundedUsage(
  usage: Record<string, unknown>,
): OpenRouterGroundedUsage {
  const promptDetails = readRecord(usage, 'prompt_tokens_details');
  const toolDetails = readRecord(usage, 'server_tool_use_details');
  const documentedToolUse = readRecord(usage, 'server_tool_use');
  return {
    promptTokens: readNumber(usage, 'prompt_tokens'),
    completionTokens: readNumber(usage, 'completion_tokens'),
    totalTokens: readNumber(usage, 'total_tokens'),
    providerReportedCostUsd: readCost(usage),
    cachedPromptTokens: readNumber(promptDetails, 'cached_tokens'),
    cacheWritePromptTokens: readNumber(promptDetails, 'cache_write_tokens'),
    webSearchRequests:
      readNumber(toolDetails, 'web_search_requests') ??
      readNumber(documentedToolUse, 'web_search_requests'),
    serverToolCallsExecuted: readNumber(toolDetails, 'tool_calls_executed'),
  };
}

export function extractUrlCitations(
  annotations: unknown,
): OpenRouterUrlCitation[] {
  if (!Array.isArray(annotations)) {
    return [];
  }
  const citations: OpenRouterUrlCitation[] = [];
  for (const annotation of annotations) {
    if (!isObjectRecord(annotation) || annotation.type !== 'url_citation') {
      continue;
    }
    const citation = readRecord(annotation, 'url_citation');
    if (typeof citation?.url !== 'string' || citation.url.length === 0) {
      continue;
    }
    citations.push({
      url: citation.url,
      ...(typeof citation.title === 'string' && { title: citation.title }),
      ...(typeof citation.content === 'string' && {
        content: citation.content,
      }),
    });
  }
  return citations;
}

function throwIfErrorChunk(chunk: Record<string, unknown>): void {
  const error = readRecord(chunk, 'error');
  if (!error) {
    return;
  }
  const message =
    typeof error.message === 'string'
      ? error.message
      : 'OpenRouter stream reported an error';
  const code = readNumber(error, 'code');
  throw new ProviderError(
    code === 429 ? 'rate_limit' : 'provider_error',
    message,
    {
      statusCode: code,
    },
  );
}

/**
 * Turns wire (snake_case) stream chunks into a text stream, collecting
 * citations, usage, model and finish reason into `metadata` as they arrive.
 */
export function streamGroundedEvents(params: {
  events: AsyncIterable<unknown>;
  metadata: OpenRouterGroundedMetadata;
}): ReadableStream<string> {
  const { events, metadata } = params;
  const seenUrls = new Set(metadata.citations.map((citation) => citation.url));
  const textChunks = (async function* () {
    let emittedAnyText = false;

    for await (const chunk of events) {
      if (!isObjectRecord(chunk) || Array.isArray(chunk)) {
        throw new ProviderInvalidResponseError(
          'OpenRouter stream sent a chunk that is not an object',
        );
      }
      throwIfErrorChunk(chunk);

      if (typeof chunk.model === 'string' && chunk.model.length > 0) {
        metadata.model = chunk.model;
      }
      const usage = readRecord(chunk, 'usage');
      if (usage) {
        // In place: span and caller hold this object.
        Object.assign(metadata.usage, normalizeGroundedUsage(usage));
      }

      const choice: unknown = Array.isArray(chunk.choices)
        ? chunk.choices[0]
        : undefined;
      if (!isObjectRecord(choice)) {
        continue;
      }
      if (
        typeof choice.finish_reason === 'string' &&
        choice.finish_reason.length > 0
      ) {
        metadata.finishReason = choice.finish_reason;
      }
      const delta = readRecord(choice, 'delta');
      for (const citation of extractUrlCitations(delta?.annotations)) {
        if (!seenUrls.has(citation.url)) {
          seenUrls.add(citation.url);
          metadata.citations.push(citation);
        }
      }
      const text = delta?.content;
      if (typeof text === 'string' && text.length > 0) {
        emittedAnyText = true;
        yield text;
      }
    }

    if (!emittedAnyText) {
      throw new ProviderInvalidResponseError(
        'OpenRouter returned no text content',
      );
    }
  })();

  return asyncIterableToReadableStream(textChunks);
}
