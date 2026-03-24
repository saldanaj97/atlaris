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
