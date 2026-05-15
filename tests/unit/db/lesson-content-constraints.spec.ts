/**
 * Ensures lesson-content CHECK limits in generated migrations match
 * `supabase/schema/constants.ts` (single source of truth).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  MAX_MODULE_LESSON_GENERATION_ERROR_LENGTH,
  MAX_TASK_LESSON_CONTENT_JSON_CHARS,
} from '@supabase/schema/constants';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

function findLessonContentConstraintMigrations(): string[] {
  const migrationsDir = join(TEST_DIR, '../../../supabase/migrations');
  let files: string[];
  try {
    files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Could not read migrations directory: ${migrationsDir}. ${message}`,
      { cause: error },
    );
  }

  const matches: string[] = [];
  for (const file of files) {
    const fullPath = join(migrationsDir, file);
    const content = readFileSync(fullPath, 'utf8');
    if (
      content.includes('module_lesson_generation_error_length') &&
      content.includes('task_lesson_content_json_length')
    ) {
      matches.push(content);
    }
  }

  if (matches.length === 0) {
    throw new Error(
      `No migration in ${migrationsDir} defines both module_lesson_generation_error_length and task_lesson_content_json_length. Scanned ${String(files.length)} files.`,
    );
  }

  return matches;
}

function extractLimitFromCheck(
  constraintName: string,
  sqlTexts: readonly string[],
): number {
  const escaped = constraintName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const constraintRegex = new RegExp(
    `\\b${escaped}\\b[\\s\\S]*?(?:<=|<|=)[\\s\\S]*?(\\d+)`,
    'm',
  );

  for (const sqlText of sqlTexts) {
    const match = sqlText.match(constraintRegex);
    if (match?.[1]) {
      return Number(match[1]);
    }
  }
  throw new Error(`Constraint "${constraintName}" not found in migration SQL.`);
}

describe('lesson content constraint sync', () => {
  let migrationContents: string[];

  beforeAll(() => {
    migrationContents = findLessonContentConstraintMigrations();
  });

  it('module_lesson_generation_error_length matches MAX_MODULE_LESSON_GENERATION_ERROR_LENGTH', () => {
    const limit = extractLimitFromCheck(
      'module_lesson_generation_error_length',
      migrationContents,
    );
    expect(limit).toBe(MAX_MODULE_LESSON_GENERATION_ERROR_LENGTH);
  });

  it('task_lesson_content_json_length matches MAX_TASK_LESSON_CONTENT_JSON_CHARS', () => {
    const limit = extractLimitFromCheck(
      'task_lesson_content_json_length',
      migrationContents,
    );
    expect(limit).toBe(MAX_TASK_LESSON_CONTENT_JSON_CHARS);
  });
});
