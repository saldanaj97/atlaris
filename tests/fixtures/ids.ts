import { randomUUID } from 'node:crypto';

/** Generates a unique ID with a prefix for tests to avoid collisions. */
export function createId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}
