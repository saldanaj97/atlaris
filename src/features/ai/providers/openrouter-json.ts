import { ProviderInvalidResponseError } from '@/features/ai/providers/errors';

const CODE_FENCE_PATTERN = /```[a-zA-Z]*\n?([\s\S]*?)```/g;

/** End index (exclusive) of the balanced object opening at `start`, if any. */
function findBalancedObjectEnd(
  text: string,
  start: number,
): number | undefined {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
  }
  return undefined;
}

function parseFirstObject(text: string): unknown {
  let start = text.indexOf('{');
  while (start !== -1) {
    const end = findBalancedObjectEnd(text, start);
    if (end === undefined) {
      // Unclosed (truncated output): every later brace is nested inside it, so
      // parsing one would return a fragment of the real object.
      return undefined;
    }
    try {
      return JSON.parse(text.slice(start, end)) as unknown;
    } catch {
      // Not JSON (prose braces); skip past it rather than into it.
    }
    start = text.indexOf('{', end);
  }
  return undefined;
}

/**
 * Takes the first balanced JSON object from model output. Models that ignore
 * `response_format` wrap JSON in code fences and prose, so fenced blocks are
 * tried first, then the whole text.
 */
export function extractFirstJsonObject(text: string): unknown {
  for (const match of text.matchAll(CODE_FENCE_PATTERN)) {
    const parsed = parseFirstObject(match[1] ?? '');
    if (parsed !== undefined) {
      return parsed;
    }
  }
  const parsed = parseFirstObject(text);
  if (parsed === undefined) {
    throw new ProviderInvalidResponseError(
      'Model output contained no JSON object',
    );
  }
  return parsed;
}
