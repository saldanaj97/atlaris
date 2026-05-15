/**
 * Shared DB-layer constants used by both the schema definition and query helpers.
 * Keeping limits here ensures the application-level sanitization and the DB-level
 * constraints (current or future) stay in sync automatically.
 */

/**
 * Canonical max length for `title` columns that use `char_length(title) <= 500` in
 * the DB (modules, tasks, resources). Intentionally the same cap for consistent UX.
 * Must match the literal in Drizzle CHECKs and generated migrations.
 */
export const MAX_TITLE_LENGTH = 500;

/** Title length cap for modules. Must match the DB CHECK constraint. */
export const MAX_MODULE_TITLE_LENGTH = MAX_TITLE_LENGTH;

/** Title length cap for tasks. Must match the DB CHECK constraint. */
export const MAX_TASK_TITLE_LENGTH = MAX_TITLE_LENGTH;

/** Title length cap for resources. Must match the DB CHECK constraint. */
export const MAX_RESOURCE_TITLE_LENGTH = MAX_TITLE_LENGTH;

/** Shared cap for DB-backed monitoring queries that page recent job rows. */
export const MAX_JOB_MONITORING_ROWS = 200;

/**
 * Soft cap on serialized JSON size (`length(lesson_content::text)`) stored on `tasks.lesson_content`.
 * Enforced by DB CHECK plus Zod semantic limits on blocks (MVP guards grossly oversized rows).
 */
export const MAX_TASK_LESSON_CONTENT_JSON_CHARS = 262_144;

/**
 * Soft cap on `modules.lesson_generation_error` (`char_length`), aligned with Drizzle CHECK literal.
 */
export const MAX_MODULE_LESSON_GENERATION_ERROR_LENGTH = 4_000;

/** Max structured blocks allowed in one task lesson payload (`LessonContent.blocks`). */
export const MAX_LESSON_BLOCKS_PER_TASK = 48;

/** Max characters for paragraph-like block text (`heading`, `paragraph`, `example.text`, `practice`). */
export const MAX_LESSON_BLOCK_TEXT_LENGTH = 12_000;

/** Max characters for titles on `example` blocks. */
export const MAX_LESSON_BLOCK_TITLE_LENGTH = 240;

/** Max bullet entries in list-style blocks (`takeaways`, `completion_criteria`). */
export const MAX_LESSON_LIST_ITEMS = 32;

/** Max characters per list item string in lesson list blocks. */
export const MAX_LESSON_LIST_ITEM_LENGTH = 600;

/**
 * Upper bound on task entries in `ModuleLessonBatchProviderOutput.tasks`.
 */
export const MAX_MODULE_LESSON_BATCH_TASKS = 64;
