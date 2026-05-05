import { timestamp } from 'drizzle-orm/pg-core';

/**
 * Common schema field helpers to reduce duplication across table definitions
 */

/**
 * Standard timestamp fields for tracking record creation and updates.
 * Use this helper to add consistent createdAt and updatedAt fields to tables.
 */
export const timestampFields = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
} as const;
