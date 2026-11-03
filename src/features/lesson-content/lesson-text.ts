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

const FENCE_OPEN = /^\s*```[\w+-]*\s*$/;
const FENCE_CLOSE = /^\s*```\s*$/;
/** A `|` row, or a `+---+` border from an ASCII box table. */
const TABULAR_LINE = /^\s*(?:\||\+[-=+])/;
/** Inline code, whose content stays literal, or `**bold**`. */
const INLINE_PATTERN = /(`+)([^\n]+?)\1|\*\*(?=\S)([^\n]+?)(?<=\S)\*\*/g;

/** Cells in one Markdown table row, outer pipes removed; `\|` stays a cell. */
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

/**
 * A run of tabular lines as a segment. Anything short of a well-formed table
 * (a box table, no separator, uneven columns) keeps its characters in a
 * monospace block, so no content is dropped or put in the wrong column.
 */
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

/** Splits one block's text into prose, preformatted and table segments. */
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
      // A fence the model never closed runs to the end of the block.
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

/** Splits a line of prose into plain text, inline code and bold. */
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
