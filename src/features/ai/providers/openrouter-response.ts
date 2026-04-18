import {
  OPENROUTER_USAGE_COST_FIELD,
  type OpenRouterStreamChunk,
  type OpenRouterUsage,
} from '@/features/ai/openrouter-cost-contract';
import { ProviderInvalidResponseError } from '@/features/ai/providers/errors';
import { asyncIterableToReadableStream } from '@/features/ai/streaming/utils';
import type { ProviderUsage } from '@/features/ai/types/provider.types';

type TextPart = {
  type: string;
  text?: string;
};

type StreamDeltaLike = {
  content?: string | TextPart[] | null;
};

type StreamChoiceLike = {
  delta?: StreamDeltaLike | null;
  message?: StreamDeltaLike | null;
};

export type StreamEventLike = OpenRouterStreamChunk & {
  choices?: StreamChoiceLike[];
  delta?: string;
};

export function isObjectRecord(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isAsyncIterable(
  value: unknown
): value is AsyncIterable<StreamEventLike> {
  return (
    isObjectRecord(value) &&
    Symbol.asyncIterator in value &&
    typeof value[Symbol.asyncIterator] === 'function'
  );
}

export function parseContent(
  content: string | TextPart[] | null | undefined
): string | null {
  if (!content) {
    return null;
  }

  if (typeof content === 'string') {
    return content;
  }

  const text = content
    .filter((item): item is TextPart => item.type === 'text')
    .map((item) => item.text ?? '')
    .join('');

  return text.length > 0 ? text : null;
}

function extractChunkText(event: StreamEventLike): string {
  if (typeof event.delta === 'string' && event.delta.length > 0) {
    return event.delta;
  }

  const choice = event.choices?.[0];
  if (!choice) {
    return '';
  }

  const fromDelta = parseContent(choice.delta?.content);
  if (fromDelta) {
    return fromDelta;
  }

  const fromMessage = parseContent(choice.message?.content);
  return fromMessage ?? '';
}

export function normalizeUsage(
  usage: OpenRouterUsage | undefined | null
): ProviderUsage {
  const base: ProviderUsage = {
    promptTokens: usage?.promptTokens ?? usage?.input_tokens,
    completionTokens: usage?.completionTokens ?? usage?.output_tokens,
    totalTokens: usage?.totalTokens ?? usage?.total_tokens,
  };

  if (usage !== undefined && isObjectRecord(usage)) {
    const rawCost = usage.cost;
    if (rawCost !== undefined && rawCost !== null) {
      if (typeof rawCost !== 'number' || !Number.isFinite(rawCost)) {
        throw new ProviderInvalidResponseError(
          'OpenRouter usage.cost must be a finite number when present'
        );
      }
      if (rawCost < 0) {
        throw new ProviderInvalidResponseError(
          'OpenRouter usage.cost must be non-negative when present'
        );
      }
      return { ...base, providerReportedCostUsd: rawCost };
    }
  }

  return base;
}

const USAGE_TOKEN_FIELDS = [
  'promptTokens',
  'completionTokens',
  'totalTokens',
  'input_tokens',
  'output_tokens',
  'total_tokens',
] as const;

function isTextPartArray(value: unknown): value is TextPart[] {
  return (
    Array.isArray(value) &&
    value.every((part) => {
      if (!isObjectRecord(part) || typeof part.type !== 'string') {
        return false;
      }
      return part.text === undefined || typeof part.text === 'string';
    })
  );
}

export function isUsageShape(value: unknown): value is OpenRouterUsage {
  if (!isObjectRecord(value)) {
    return false;
  }

  if (
    !USAGE_TOKEN_FIELDS.every((field) => {
      const fieldValue = value[field];
      return fieldValue === undefined || typeof fieldValue === 'number';
    })
  ) {
    return false;
  }

  const rawCost = value[OPENROUTER_USAGE_COST_FIELD];
  if (rawCost !== undefined && rawCost !== null) {
    if (typeof rawCost !== 'number' || !Number.isFinite(rawCost)) {
      return false;
    }
    if (rawCost < 0) {
      return false;
    }
  }

  return true;
}

function describeResponseValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (Array.isArray(value)) {
    return `array(length=${value.length})`;
  }
  if (isObjectRecord(value)) {
    const keys = Object.keys(value);
    return `object(keys=${keys.length > 0 ? keys.join(', ') : 'none'})`;
  }
  if (typeof value === 'string') {
    return `string(length=${value.length})`;
  }
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return `${typeof value}(${value.toString()})`;
  }
  if (typeof value === 'symbol') {
    return 'symbol';
  }
  if (typeof value === 'function') {
    return 'function';
  }
  return typeof value;
}

function createInvalidShapeError(
  fieldPath: string,
  expected: string,
  actual: unknown
): ProviderInvalidResponseError {
  return new ProviderInvalidResponseError(
    `OpenRouter returned invalid response shape: expected ${fieldPath} to be ${expected}, received ${describeResponseValue(actual)}`
  );
}

export function validateNonStreamingResponse(response: unknown): {
  rawContent: string | TextPart[];
  usage: StreamEventLike['usage'] | undefined;
} {
  if (!isObjectRecord(response)) {
    throw createInvalidShapeError('response', 'an object', response);
  }

  const rawChoices = response.choices;
  if (!Array.isArray(rawChoices)) {
    throw createInvalidShapeError('choices', 'an array', rawChoices);
  }
  const choices: unknown[] = rawChoices;

  if (choices.length === 0) {
    throw new ProviderInvalidResponseError(
      'OpenRouter returned an empty response (choices array was empty)'
    );
  }

  const firstChoice = choices[0];
  if (!isObjectRecord(firstChoice)) {
    throw createInvalidShapeError('choices[0]', 'an object', firstChoice);
  }

  const message = firstChoice.message;
  if (!isObjectRecord(message)) {
    throw createInvalidShapeError('choices[0].message', 'an object', message);
  }

  const rawContent = message.content;
  if (typeof rawContent !== 'string' && !isTextPartArray(rawContent)) {
    throw createInvalidShapeError(
      'choices[0].message.content',
      'a string or TextPart[]',
      rawContent
    );
  }

  const usage = response.usage;
  if (usage !== undefined && !isUsageShape(usage)) {
    throw createInvalidShapeError(
      'usage',
      'an object with numeric token fields',
      usage
    );
  }

  return {
    rawContent,
    usage,
  };
}

export function getStatusCodeFromError(error: unknown): number | undefined {
  if (!isObjectRecord(error)) {
    return undefined;
  }

  if (typeof error.status === 'number') {
    return error.status;
  }

  if (typeof error.statusCode === 'number') {
    return error.statusCode;
  }

  if (
    isObjectRecord(error.response) &&
    typeof error.response.status === 'number'
  ) {
    return error.response.status;
  }

  return undefined;
}

type StreamUsageEventContext = {
  /**
   * True when `event.usage` is a plain object record; arrays are excluded because
   * malformed list payloads should not become authoritative for streaming cost.
   */
  usageObjectPresent: boolean;
};

export function streamFromEvents(params: {
  events: AsyncIterable<StreamEventLike>;
  onUsage: (usage: ProviderUsage, context: StreamUsageEventContext) => void;
}): ReadableStream<string> {
  const { events, onUsage } = params;
  const textChunks = (async function* () {
    let emittedAnyText = false;

    for await (const event of events) {
      const usageObjectPresent =
        isObjectRecord(event.usage) && !Array.isArray(event.usage);
      onUsage(normalizeUsage(event.usage), { usageObjectPresent });
      const text = extractChunkText(event);
      if (!text) {
        continue;
      }
      emittedAnyText = true;
      yield text;
    }

    if (!emittedAnyText) {
      throw new ProviderInvalidResponseError(
        'OpenRouter returned no text content'
      );
    }
  })();

  return asyncIterableToReadableStream(textChunks);
}
