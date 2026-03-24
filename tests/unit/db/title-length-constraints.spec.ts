/**
 * Validates that the title-length CHECK constraints in the migration match
 * the canonical constants, so DB and application limits stay in sync.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  MAX_MODULE_TITLE_LENGTH,
  MAX_RESOURCE_TITLE_LENGTH,
  MAX_TASK_TITLE_LENGTH,
} from '@/lib/db/schema/constants';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

const migrationPath = resolve(
  TEST_DIR,
  '../../../src/lib/db/migrations/0020_burly_jackal.sql'
);
const migrationContents = readFileSync(migrationPath, 'utf8');

function extractCheckLimit(
  constraintName: string,
  text: string
): number | null {
  const regex = new RegExp(
    `"${constraintName}"\\s+CHECK\\s*\\(\\s*char_length\\([^)]+\\)\\s*<=\\s*(\\d+)\\s*\\)`
  );
  const match = text.match(regex);
  return match ? Number(match[1]) : null;
}

describe('title length constraint sync', () => {
  it('module_title_length migration matches MAX_MODULE_TITLE_LENGTH', () => {
    const limit = extractCheckLimit('module_title_length', migrationContents);
    expect(limit).toBe(MAX_MODULE_TITLE_LENGTH);
  });

  it('task_title_length migration matches MAX_TASK_TITLE_LENGTH', () => {
    const limit = extractCheckLimit('task_title_length', migrationContents);
    expect(limit).toBe(MAX_TASK_TITLE_LENGTH);
  });

  it('resource_title_length migration matches MAX_RESOURCE_TITLE_LENGTH', () => {
    const limit = extractCheckLimit('resource_title_length', migrationContents);
    expect(limit).toBe(MAX_RESOURCE_TITLE_LENGTH);
  });
});
