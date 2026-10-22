import type { ParsedModule } from '@/features/ai/types/parser.types';
import type { GenerationInput } from '@/shared/types/ai-provider.types';

import { MAX_MODULE_COUNT } from '@/features/ai/constants';
import { z } from 'zod';

/**
 * One problem found in an outline. `blockRef` points into the outline JSON:
 * `plan`, `modules[0]` or `modules[0].tasks[2]`.
 */
export type OutlineIssue = {
  readonly code: string;
  readonly blockRef: string;
  readonly message: string;
  readonly source: 'code' | 'verifier';
};

/** Expected outline shape; the parser enforces only the hard limits. */
export const OUTLINE_MODULE_COUNT_RANGE = { min: 2, max: MAX_MODULE_COUNT };
export const OUTLINE_LESSONS_PER_MODULE_RANGE = { min: 2, max: 12 };

/** Token-set similarity at or above which two titles count as near duplicates. */
const NEAR_DUPLICATE_JACCARD = 0.8;
/** A module's minutes may differ from its lessons' sum by this share (or 15 min). */
const MODULE_MINUTES_TOLERANCE = 0.25;
const MODULE_MINUTES_SLACK = 15;
/** Lesson minutes may exceed the deadline's hour budget by this share. */
const TOTAL_MINUTES_TOLERANCE = 0.25;

const titleSchema = z.string().trim().min(1);
const minutesSchema = z.number().int().positive();
const outlineSchema = z.array(
  z.object({
    title: titleSchema,
    description: z.string().optional(),
    estimatedMinutes: minutesSchema,
    tasks: z
      .array(
        z.object({
          title: titleSchema,
          description: z.string().optional(),
          estimatedMinutes: minutesSchema,
        }),
      )
      .min(1),
  }),
);

/** Words that say nothing about scope or overlap. */
const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'into',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
  'your',
  'you',
  'how',
  'what',
  'why',
  'using',
  'use',
  'learn',
  'learning',
  'introduction',
  'intro',
  'basics',
  'basic',
  'fundamentals',
  'beginner',
  'beginners',
  'intermediate',
  'advanced',
  'guide',
  'course',
  'master',
  'mastering',
  'understanding',
  'understand',
  'getting',
  'started',
  'part',
  'module',
  'lesson',
  'week',
  'unit',
  'chapter',
]);

/** Leading numbering such as `1.`, `Module 3:` or `Lesson 2 -`. */
const NUMBERING_PATTERN =
  /^\s*(?:(?:module|lesson|part|week|unit|chapter|step)\s+)?(?:\d+|[ivx]+)\s*[.:)\-–—]\s*/i;

function stem(token: string): string {
  return token.length > 3 && token.endsWith('s') && !token.endsWith('ss')
    ? token.slice(0, -1)
    : token;
}

export function normalizeTitle(title: string): string {
  return title
    .replace(NUMBERING_PATTERN, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+#]+/gu, ' ')
    .trim();
}

function titleTokens(title: string): Set<string> {
  return new Set(
    normalizeTitle(title)
      .split(' ')
      .filter((token) => token.length > 0 && !STOPWORDS.has(token))
      .map(stem),
  );
}

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) {
      shared += 1;
    }
  }
  return shared / (a.size + b.size - shared);
}

function moduleRef(index: number): string {
  return `modules[${index}]`;
}

function taskRef(moduleIndex: number, taskIndex: number): string {
  return `modules[${moduleIndex}].tasks[${taskIndex}]`;
}

function issue(code: string, blockRef: string, message: string): OutlineIssue {
  return { code, blockRef, message, source: 'code' };
}

/** Each field that fails the outline schema, by block. */
export function checkOutlineSchema(modules: unknown): OutlineIssue[] {
  const result = outlineSchema.safeParse(modules);
  if (result.success) {
    return [];
  }
  return result.error.issues.map((zodIssue) => {
    const [moduleIndex, field, taskIndex] = zodIssue.path;
    const blockRef =
      typeof moduleIndex !== 'number'
        ? 'plan'
        : field === 'tasks' && typeof taskIndex === 'number'
          ? taskRef(moduleIndex, taskIndex)
          : moduleRef(moduleIndex);
    return issue(
      'schema_invalid',
      blockRef,
      `${zodIssue.path.join('.') || 'modules'}: ${zodIssue.message}`,
    );
  });
}

/**
 * Pacing (`pacePlan`) trims a plan with a deadline to fit its hours: it drops
 * lessons, and at very low capacity whole modules, without changing module
 * estimates. Checks skip what that trim causes, or a repair (paced again)
 * could never clear it.
 */
function isPacedInput(input: Pick<GenerationInput, 'deadlineDate'>): boolean {
  return Boolean(input.deadlineDate?.trim());
}

/** Minimums are skipped on a paced plan; maximums always apply. */
export function checkOutlineCounts(
  modules: readonly ParsedModule[],
  input: Pick<GenerationInput, 'deadlineDate'>,
): OutlineIssue[] {
  const issues: OutlineIssue[] = [];
  const paced = isPacedInput(input);
  const { min, max } = OUTLINE_MODULE_COUNT_RANGE;
  if ((!paced && modules.length < min) || modules.length > max) {
    issues.push(
      issue(
        'module_count',
        'plan',
        `Plan has ${modules.length} modules; expected ${min} to ${max}.`,
      ),
    );
  }
  const lessons = OUTLINE_LESSONS_PER_MODULE_RANGE;
  modules.forEach((module, index) => {
    if (
      (!paced && module.tasks.length < lessons.min) ||
      module.tasks.length > lessons.max
    ) {
      issues.push(
        issue(
          'lesson_count',
          moduleRef(index),
          `Module has ${module.tasks.length} lessons; expected ${lessons.min} to ${lessons.max}.`,
        ),
      );
    }
  });
  return issues;
}

type TitledBlock = { ref: string; title: string };

function findDuplicates(blocks: readonly TitledBlock[]): OutlineIssue[] {
  const issues: OutlineIssue[] = [];
  const seen: { ref: string; normalized: string; tokens: Set<string> }[] = [];
  for (const block of blocks) {
    const normalized = normalizeTitle(block.title);
    const tokens = titleTokens(block.title);
    const exact = seen.find((earlier) => earlier.normalized === normalized);
    const near =
      exact ??
      seen.find(
        (earlier) => jaccard(earlier.tokens, tokens) >= NEAR_DUPLICATE_JACCARD,
      );
    if (exact) {
      issues.push(
        issue(
          'duplicate_title',
          block.ref,
          `Title "${block.title}" repeats ${exact.ref}.`,
        ),
      );
    } else if (near) {
      issues.push(
        issue(
          'near_duplicate_title',
          block.ref,
          `Title "${block.title}" overlaps ${near.ref}.`,
        ),
      );
    }
    seen.push({ ref: block.ref, normalized, tokens });
  }
  return issues;
}

/** Duplicate module titles, and duplicate lesson titles anywhere in the plan. */
export function checkOutlineDuplicates(
  modules: readonly ParsedModule[],
): OutlineIssue[] {
  return [
    ...findDuplicates(
      modules.map((module, index) => ({
        ref: moduleRef(index),
        title: module.title,
      })),
    ),
    ...findDuplicates(
      modules.flatMap((module, moduleIndex) =>
        module.tasks.map((task, taskIndex) => ({
          ref: taskRef(moduleIndex, taskIndex),
          title: task.title,
        })),
      ),
    ),
  ];
}

function sharesKeyword(
  tokens: ReadonlySet<string>,
  keywords: ReadonlySet<string>,
): boolean {
  for (const token of tokens) {
    for (const keyword of keywords) {
      if (
        token === keyword ||
        (token.length >= 4 &&
          keyword.length >= 4 &&
          (token.startsWith(keyword) || keyword.startsWith(token)))
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Flags an outline in which no module's title, description or lesson titles
 * share a keyword with the topic. Plan-level only: a valid subtopic often
 * does not repeat the topic name ("Linear regression" in a machine learning
 * plan), so per-module scope is left to the verifier. Skipped when the topic
 * has no keyword of 3+ characters.
 */
export function checkOutlineScope(
  modules: readonly ParsedModule[],
  topic: string,
): OutlineIssue[] {
  const keywords = new Set(
    [...titleTokens(topic)].filter((token) => token.length >= 3),
  );
  if (keywords.size === 0) {
    return [];
  }
  const onTopic = modules.some((module) => {
    const text = [
      module.title,
      module.description ?? '',
      ...module.tasks.map((task) => task.title),
    ].join(' ');
    return sharesKeyword(titleTokens(text), keywords);
  });
  return onTopic
    ? []
    : [
        issue(
          'off_topic_outline',
          'plan',
          `No module mentions the plan topic "${topic}".`,
        ),
      ];
}

function weeksBetween(startDate: string, deadlineDate: string): number | null {
  const start = Date.parse(startDate);
  const deadline = Date.parse(deadlineDate);
  if (Number.isNaN(start) || Number.isNaN(deadline)) {
    return null;
  }
  const days = (deadline - start) / (24 * 60 * 60 * 1000);
  return Math.max(1, Math.ceil(days / 7));
}

/**
 * Module minutes must match their lessons' sum, no lesson may exceed a week's
 * hours, and with a start date and deadline the lessons must fit the hours.
 * On a paced plan a module may estimate more than its remaining lessons.
 */
export function checkOutlineTime(
  modules: readonly ParsedModule[],
  input: Pick<GenerationInput, 'weeklyHours' | 'startDate' | 'deadlineDate'>,
): OutlineIssue[] {
  const issues: OutlineIssue[] = [];
  const paced = isPacedInput(input);
  const weeklyMinutes = input.weeklyHours * 60;
  let totalMinutes = 0;

  modules.forEach((module, moduleIndex) => {
    const lessonMinutes = module.tasks.reduce(
      (sum, task) => sum + task.estimatedMinutes,
      0,
    );
    totalMinutes += lessonMinutes;
    const allowed = Math.max(
      MODULE_MINUTES_SLACK,
      lessonMinutes * MODULE_MINUTES_TOLERANCE,
    );
    const difference = module.estimatedMinutes - lessonMinutes;
    if ((paced ? -difference : Math.abs(difference)) > allowed) {
      issues.push(
        issue(
          'module_time_mismatch',
          moduleRef(moduleIndex),
          `Module estimates ${module.estimatedMinutes} minutes but its lessons add up to ${lessonMinutes}.`,
        ),
      );
    }
    module.tasks.forEach((task, taskIndex) => {
      if (weeklyMinutes > 0 && task.estimatedMinutes > weeklyMinutes) {
        issues.push(
          issue(
            'lesson_exceeds_weekly_hours',
            taskRef(moduleIndex, taskIndex),
            `Lesson takes ${task.estimatedMinutes} minutes; the learner has ${input.weeklyHours} hours a week.`,
          ),
        );
      }
    });
  });

  // No start date: the budget would depend on the clock, which a replayed
  // workflow must not read.
  const weeks =
    input.startDate && input.deadlineDate
      ? weeksBetween(input.startDate, input.deadlineDate)
      : null;
  if (weeks !== null) {
    const budget = weeklyMinutes * weeks;
    if (totalMinutes > budget * (1 + TOTAL_MINUTES_TOLERANCE)) {
      issues.push(
        issue(
          'plan_exceeds_hours',
          'plan',
          `Lessons add up to ${totalMinutes} minutes; ${input.weeklyHours} hours a week for ${weeks} weeks allows ${budget}.`,
        ),
      );
    }
  }
  return issues;
}

/**
 * Every code check, run on all tiers. Pure: the workflow runs it outside a
 * step on cached step results. A schema failure stops the other checks.
 */
export function runOutlineCodeChecks(
  modules: readonly ParsedModule[],
  input: GenerationInput,
): OutlineIssue[] {
  const schemaIssues = checkOutlineSchema(modules);
  if (schemaIssues.length > 0) {
    return schemaIssues;
  }
  return [
    ...checkOutlineCounts(modules, input),
    ...checkOutlineDuplicates(modules),
    ...checkOutlineScope(modules, input.topic),
    ...checkOutlineTime(modules, input),
  ];
}
