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

type ObjectScan = {
  /** First balanced object that parses as JSON. */
  object?: { value: unknown; start: number; end: number };
  /** Opening brace that never closes (truncated output). */
  unclosedAt?: number;
};

function scanFirstObject(text: string): ObjectScan {
  let start = text.indexOf('{');
  while (start !== -1) {
    const end = findBalancedObjectEnd(text, start);
    if (end === undefined) {
      // Every later brace is nested inside this one, so parsing one would
      // return a fragment of the real object.
      return { unclosedAt: start };
    }
    try {
      return {
        object: {
          value: JSON.parse(text.slice(start, end)) as unknown,
          start,
          end,
        },
      };
    } catch {
      // Not JSON (prose braces); skip past it rather than into it.
    }
    start = text.indexOf('{', end);
  }
  return {};
}

/**
 * Takes the first balanced JSON object from model output. Models that ignore
 * `response_format` wrap JSON in code fences and prose, so a fenced block wins
 * unless it sits inside the first object (fenced code in a string value) or
 * after a brace that never closes.
 */
export function extractFirstJsonObject(text: string): unknown {
  const scan = scanFirstObject(text);
  for (const match of text.matchAll(CODE_FENCE_PATTERN)) {
    const fenceStart = match.index;
    const insideObject =
      scan.object !== undefined &&
      fenceStart >= scan.object.start &&
      fenceStart < scan.object.end;
    const afterUnclosed =
      scan.unclosedAt !== undefined && fenceStart > scan.unclosedAt;
    if (insideObject || afterUnclosed) {
      continue;
    }
    const fenced = scanFirstObject(match[1] ?? '').object;
    if (fenced) {
      return fenced.value;
    }
  }
  if (!scan.object) {
    throw new ProviderInvalidResponseError(
      'Model output contained no JSON object',
    );
  }
  return scan.object.value;
}
