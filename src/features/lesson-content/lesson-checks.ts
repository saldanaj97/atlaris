import type { LessonIssue } from '@/features/lesson-content/lesson-citation-checks';
import type { ResearchBrief } from '@/features/plans/research/contract';
import type {
  LessonContent,
  LessonContentBlock,
} from '@/shared/types/lesson-content.types';

import { checkLessonCitations } from '@/features/lesson-content/lesson-citation-checks';
import { suggestedLessonBodyBudgetChars } from '@/features/lesson-content/module-lesson-prompts';
import { LessonContentSchema } from '@/shared/schemas/lesson-content.schemas';

/** `blockRef` for a problem with the lesson as a whole, not one block. */
export const LESSON_BLOCK_REF = 'lesson';

/** Code for every block-contract (schema) problem. */
export const SCHEMA_INVALID_CODE = 'schema_invalid';

/** Schema problems reported per lesson; the rest are dropped. */
const MAX_SCHEMA_ISSUES = 10;

/**
 * The body may run this far past the prompt's suggested budget before it
 * counts as too long. The budget is a hint, so the margin is wide.
 */
export const LESSON_LENGTH_BUDGET_TOLERANCE = 1.5;

/** `- `, `* `, `• `, `1. ` or `1) ` at the start of an item. */
const LIST_MARKER_PATTERN = /^\s*(?:[-*•]|\d+[.)])\s+/;
/** `Label: explanation`, the label at most a few words, optionally bold. */
const LABEL_PATTERN =
  /^\s*(?:\*\*|__)?([^:*_\n]{1,60})(?:\*\*|__)?\s*:([\s\S]*)$/;
const TABLE_SEPARATOR_CELL = /^\s*:?-{3,}:?\s*$/;

function issue(code: string, blockRef: string, message: string): LessonIssue {
  return { code, blockRef, message, source: 'code' };
}

/** Maps a schema error path to the block it points at. */
function schemaBlockRef(path: readonly PropertyKey[]): string {
  const [root, index, field, item] = path;
  if (root === 'sourceIds') {
    return 'sourceIds';
  }
  if (root !== 'blocks' || typeof index !== 'number') {
    return LESSON_BLOCK_REF;
  }
  return field === 'items' && typeof item === 'number'
    ? `blocks[${index}].items[${item}]`
    : `blocks[${index}]`;
}

/** The block contract from `LessonContentSchema`. */
export function checkLessonSchema(content: LessonContent): LessonIssue[] {
  const parsed = LessonContentSchema.safeParse(content);
  if (parsed.success) {
    return [];
  }
  return parsed.error.issues
    .slice(0, MAX_SCHEMA_ISSUES)
    .map((zodIssue) =>
      issue(
        SCHEMA_INVALID_CODE,
        schemaBlockRef(zodIssue.path),
        `Does not match the lesson block contract: ${zodIssue.message}`,
      ),
    );
}

function checkCompletionCriteria(
  blocks: readonly LessonContentBlock[],
): LessonIssue[] {
  return blocks.some((block) => block.type === 'completion_criteria')
    ? []
    : [
        issue(
          'missing_completion_criteria',
          LESSON_BLOCK_REF,
          'The lesson has no completion_criteria block',
        ),
      ];
}

/** One takeaway item: a non-blank line, no list marker, a complete label. */
function takeawayItemIssues(item: string, blockRef: string): LessonIssue[] {
  if (item.trim().length === 0) {
    return [issue('takeaway_blank', blockRef, 'The takeaway is empty')];
  }
  const issues: LessonIssue[] = [];
  if (LIST_MARKER_PATTERN.test(item)) {
    issues.push(
      issue(
        'takeaway_list_marker',
        blockRef,
        'The takeaway starts with a list marker; the block already renders as a list',
      ),
    );
  }
  const label = LABEL_PATTERN.exec(item);
  if (label && (label[2] ?? '').trim().length === 0) {
    issues.push(
      issue(
        'takeaway_label_malformed',
        blockRef,
        'The takeaway is a label with no explanation after it',
      ),
    );
  }
  const emphasis = item.match(/\*\*|__/g)?.length ?? 0;
  if (emphasis % 2 !== 0) {
    issues.push(
      issue(
        'takeaway_label_malformed',
        blockRef,
        'The takeaway has unbalanced bold markers',
      ),
    );
  }
  return issues;
}

/** A `takeaways` block exists and every item in it is well formed. */
function checkTakeaways(blocks: readonly LessonContentBlock[]): LessonIssue[] {
  const takeaways = blocks.flatMap((block, index) =>
    block.type === 'takeaways' ? [{ block, index }] : [],
  );
  if (takeaways.length === 0) {
    return [
      issue(
        'missing_takeaways',
        LESSON_BLOCK_REF,
        'The lesson has no takeaways',
      ),
    ];
  }
  return takeaways.flatMap(({ block, index }) => {
    const seen = new Set<string>();
    return block.items.flatMap((item, itemIndex) => {
      const ref = `blocks[${index}].items[${itemIndex}]`;
      const normalized = item.trim().toLowerCase();
      const duplicate =
        normalized.length > 0 && seen.has(normalized)
          ? [
              issue(
                'takeaway_duplicate',
                ref,
                'The takeaway repeats an earlier one',
              ),
            ]
          : [];
      seen.add(normalized);
      return [...takeawayItemIssues(item, ref), ...duplicate];
    });
  });
}

/** Cells in one Markdown table row, outer pipes removed; `\|` stays a cell. */
function tableCells(line: string): string[] {
  const inner = line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '');
  return inner.split(/(?<!\\)\|/);
}

/** Runs of two or more consecutive lines that start with `|`. */
function tableRuns(text: string): string[][] {
  const runs: string[][] = [];
  let run: string[] = [];
  for (const line of [...text.split('\n'), '']) {
    if (line.trim().startsWith('|')) {
      run.push(line);
      continue;
    }
    if (run.length >= 2) {
      runs.push(run);
    }
    run = [];
  }
  return runs;
}

function checkTable(rows: readonly string[], blockRef: string): LessonIssue[] {
  const issues: LessonIssue[] = [];
  if (rows.some((row) => !/(?<!\\)\|\s*$/.test(row))) {
    issues.push(
      issue(
        'table_border_misaligned',
        blockRef,
        'A table row does not start and end with a | border',
      ),
    );
  }
  const counts = rows.map((row) => tableCells(row).length);
  if (new Set(counts).size > 1) {
    issues.push(
      issue(
        'table_column_mismatch',
        blockRef,
        `Table rows have different column counts (${[...new Set(counts)].join(', ')})`,
      ),
    );
  }
  const separator = rows[1];
  if (
    separator === undefined ||
    !tableCells(separator).every((cell) => TABLE_SEPARATOR_CELL.test(cell))
  ) {
    issues.push(
      issue(
        'table_missing_separator',
        blockRef,
        'The table has no |---| separator row under its header',
      ),
    );
  }
  return issues;
}

/** Markdown tables in text blocks have borders and matching columns. */
function checkTables(blocks: readonly LessonContentBlock[]): LessonIssue[] {
  return blocks.flatMap((block, index) => {
    if (
      block.type !== 'paragraph' &&
      block.type !== 'example' &&
      block.type !== 'practice'
    ) {
      return [];
    }
    return tableRuns(block.text).flatMap((rows) =>
      checkTable(rows, `blocks[${index}]`),
    );
  });
}

function blockChars(block: LessonContentBlock): number {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'practice':
      return block.text.length;
    case 'example':
      return block.title.length + block.text.length;
    case 'takeaways':
    case 'completion_criteria':
      return block.items.reduce((sum, item) => sum + item.length, 0);
    default: {
      const _never: never = block;
      throw new Error(`Unhandled lesson block: ${String(_never)}`);
    }
  }
}

/** The body stays within the budget the writer prompt suggested. */
function checkLength(
  blocks: readonly LessonContentBlock[],
  estimatedMinutes: number,
): LessonIssue[] {
  const budget = suggestedLessonBodyBudgetChars(estimatedMinutes);
  const limit = Math.round(budget * LESSON_LENGTH_BUDGET_TOLERANCE);
  const chars = blocks.reduce((sum, block) => sum + blockChars(block), 0);
  return chars > limit
    ? [
        issue(
          'over_length_budget',
          LESSON_BLOCK_REF,
          `The lesson body is ${chars} characters; a ${estimatedMinutes}-minute lesson should stay under about ${limit}`,
        ),
      ]
    : [];
}

/**
 * Structural code checks on one lesson, run on every tier: the block
 * contract, a completion_criteria block, well-formed takeaways, aligned
 * table borders, the length budget and the 3a citation checks. Rules are
 * general, never about a topic. Pure; an empty list passes. A lesson that
 * breaks the block contract gets only the schema issues.
 */
export function runLessonCodeChecks(
  content: LessonContent,
  context: {
    readonly estimatedMinutes: number;
    readonly research: ResearchBrief | null;
  },
): LessonIssue[] {
  const schemaIssues = checkLessonSchema(content);
  if (schemaIssues.length > 0) {
    return schemaIssues;
  }
  return [
    ...checkCompletionCriteria(content.blocks),
    ...checkTakeaways(content.blocks),
    ...checkTables(content.blocks),
    ...checkLength(content.blocks, context.estimatedMinutes),
    ...checkLessonCitations(content, context.research),
  ];
}
