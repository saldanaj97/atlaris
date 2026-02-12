import { nanoid } from 'nanoid';

/** Generates a unique ID with a prefix for tests to avoid collisions. */
export function createId(prefix: string): string {
  return `${prefix}-${nanoid(8)}`;
}
