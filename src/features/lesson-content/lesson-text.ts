/**
 * The Markdown subset lesson models write inside block text. Example blocks
 * also hold unfenced SQL and ASCII box tables whose indentation and columns
 * must survive, so only these constructs are parsed; the rest stays as written.
 */
export type LessonTextSegment =
  | { readonly type: 'prose'; readonly text: string }
  | { readonly type: 'preformatted'; readonly text: string }
  | {
      readonly type: 'table';
      readonly header: readonly string[];
      readonly rows: readonly (readonly string[])[];
    };

export type LessonInlineSegment = {
  readonly type: 'text' | 'code' | 'strong';
  readonly text: string;
};

export const TABLE_SEPARATOR_CELL = /^\s*:?-{3,}:?\s*$/;

const FENCE_OPEN = /^\s*```[^`]*$/;
const FENCE_CLOSE = /^\s*```\s*$/;
const TABULAR_LINE = /^\s*(?:\||\+[-=+])/;
const INLINE_PATTERN =
  /(`+)([^\n]+?)\1|(?<![\w*])\*\*(?=\S)([^\n]+?)(?<=\S)\*\*(?![\w*])/g;

export function tableCells(line: string): string[] {
  const inner = line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '');
  return inner.split(/(?<!\\)\|/);
}

function displayCells(line: string): string[] {
  return tableCells(line).map((cell) =>
    cell.trim().replaceAll(String.raw`\|`, '|'),
  );
}

function tabularSegment(lines: readonly string[]): LessonTextSegment {
  const [headerLine, separatorLine, ...rowLines] = lines;
  const isTable =
    headerLine !== undefined &&
    separatorLine !== undefined &&
    lines.every((line) => line.trim().startsWith('|')) &&
    tableCells(separatorLine).every((cell) => TABLE_SEPARATOR_CELL.test(cell));
  if (isTable) {
    const header = displayCells(headerLine);
    const rows = rowLines.map(displayCells);
    if (
      tableCells(separatorLine).length === header.length &&
      rows.every((row) => row.length === header.length)
    ) {
      return { type: 'table', header, rows };
    }
  }
  return { type: 'preformatted', text: lines.join('\n') };
}

export function parseLessonText(text: string): LessonTextSegment[] {
  const lines = text.split(/\r?\n/);
  const segments: LessonTextSegment[] = [];
  let prose: string[] = [];
  const flushProse = () => {
    if (prose.length > 0) {
      segments.push({ type: 'prose', text: prose.join('\n') });
    }
    prose = [];
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (FENCE_OPEN.test(line)) {
      flushProse();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE_CLOSE.test(lines[index] ?? '')) {
        code.push(lines[index] ?? '');
        index += 1;
      }
      segments.push({ type: 'preformatted', text: code.join('\n') });
      index += 1;
      continue;
    }
    if (TABULAR_LINE.test(line)) {
      const run: string[] = [];
      while (index < lines.length && TABULAR_LINE.test(lines[index] ?? '')) {
        run.push(lines[index] ?? '');
        index += 1;
      }
      if (run.length >= 2) {
        flushProse();
        segments.push(tabularSegment(run));
      } else {
        prose.push(...run);
      }
      continue;
    }
    if (line.trim().length === 0) {
      flushProse();
    } else {
      prose.push(line);
    }
    index += 1;
  }
  flushProse();
  return segments;
}

export function parseLessonInline(text: string): LessonInlineSegment[] {
  const segments: LessonInlineSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(INLINE_PATTERN)) {
    if (match.index > cursor) {
      segments.push({ type: 'text', text: text.slice(cursor, match.index) });
    }
    const code = match[2];
    segments.push(
      code === undefined
        ? { type: 'strong', text: match[3] ?? '' }
        : { type: 'code', text: code.trim() },
    );
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) {
    segments.push({ type: 'text', text: text.slice(cursor) });
  }
  return segments;
}
