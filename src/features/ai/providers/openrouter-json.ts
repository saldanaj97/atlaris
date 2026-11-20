import { ProviderInvalidResponseError } from '@/features/ai/providers/errors';

const CODE_FENCE_PATTERN = /```[a-zA-Z]*\n?([\s\S]*?)```/g;

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

type Span = { start: number; end: number };

type ObjectScan = {
  object?: Span & { value: unknown };
  skipped: Span[];
  unclosedAt?: number;
};

function scanFirstObject(text: string): ObjectScan {
  const skipped: Span[] = [];
  let start = text.indexOf('{');
  while (start !== -1) {
    const end = findBalancedObjectEnd(text, start);
    if (end === undefined) {
      return { skipped, unclosedAt: start };
    }
    try {
      return {
        object: {
          value: JSON.parse(text.slice(start, end)) as unknown,
          start,
          end,
        },
        skipped,
      };
    } catch {
      skipped.push({ start, end });
    }
    start = text.indexOf('{', end);
  }
  return { skipped };
}

function spanContains(span: Span | undefined, index: number): boolean {
  return span !== undefined && index >= span.start && index < span.end;
}

export function extractFirstJsonObject(text: string): unknown {
  const scan = scanFirstObject(text);
  for (const match of text.matchAll(CODE_FENCE_PATTERN)) {
    const fenceStart = match.index;
    const insideObject =
      spanContains(scan.object, fenceStart) ||
      scan.skipped.some((span) => spanContains(span, fenceStart));
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
