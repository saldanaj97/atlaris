/**
 * Shared DB-layer constants used by both the schema definition and query helpers.
 * Keeping limits here ensures the application-level sanitization and the DB-level
 * constraints (current or future) stay in sync automatically.
 */

/** Application-level title length cap for resources. Must match the DB CHECK constraint. */
export const MAX_RESOURCE_TITLE_LENGTH = 500;
