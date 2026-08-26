import { preferredAiModel } from '@supabase/enums';
import {
  USER_PREFERENCES_AUTHENTICATED_INSERT_COLUMNS,
  USER_PREFERENCES_AUTHENTICATED_UPDATE_COLUMNS,
} from '@supabase/privileges/user-preferences-authenticated-columns';
import { USERS_AUTHENTICATED_UPDATE_COLUMNS } from '@supabase/privileges/users-authenticated-update-columns';
import { userPreferences } from '@supabase/schema';
import { getTableColumns } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const MIGRATION_NAME =
  '20260826184123_expand_user_preferences_model_text_slots.sql';
const MIGRATION_SQL = readFileSync(
  join(REPO_ROOT, 'supabase', 'migrations', MIGRATION_NAME),
  'utf8',
);
const USER_PREFERENCES_QUERY_SOURCE = readFileSync(
  join(REPO_ROOT, 'src', 'lib', 'db', 'queries', 'user-preferences.ts'),
  'utf8',
);

function normalizeColumns(rawColumns: string): string[] {
  return rawColumns
    .split(',')
    .map((column) => column.trim())
    .filter(Boolean)
    .sort();
}

describe('canonical user preference model-slot schema', () => {
  it('stores the three model preference fields as nullable text', () => {
    const columns = getTableColumns(userPreferences);

    expect(columns.preferredAiModel.name).toBe('preferred_ai_model');
    expect(columns.preferredAiModel.getSQLType()).toBe('text');
    expect(columns.preferredAiModel.notNull).toBe(false);

    expect(columns.preferredRegenerationAiModel.name).toBe(
      'preferred_regeneration_ai_model',
    );
    expect(columns.preferredRegenerationAiModel.getSQLType()).toBe('text');
    expect(columns.preferredRegenerationAiModel.notNull).toBe(false);
    expect(columns.preferredRegenerationAiModel.hasDefault).toBe(false);

    expect(columns.preferredLessonAiModel.name).toBe(
      'preferred_lesson_ai_model',
    );
    expect(columns.preferredLessonAiModel.getSQLType()).toBe('text');
    expect(columns.preferredLessonAiModel.notNull).toBe(false);
    expect(columns.preferredLessonAiModel.hasDefault).toBe(false);
  });

  it('keeps the persistable model-id TypeScript union without a Drizzle enum column', () => {
    expect(preferredAiModel.enumValues.length).toBeGreaterThan(0);
    expect(getTableColumns(userPreferences).preferredAiModel.getSQLType()).toBe(
      'text',
    );
  });

  it('grants authenticated writes on the user-owned model slots only', () => {
    expect(USER_PREFERENCES_AUTHENTICATED_INSERT_COLUMNS).toEqual([
      'user_id',
      'preferred_ai_model',
      'preferred_regeneration_ai_model',
      'preferred_lesson_ai_model',
      'analytics_timezone',
      'updated_at',
    ]);
    expect(USER_PREFERENCES_AUTHENTICATED_UPDATE_COLUMNS).toEqual([
      'preferred_ai_model',
      'preferred_regeneration_ai_model',
      'preferred_lesson_ai_model',
      'analytics_timezone',
      'updated_at',
    ]);
    expect(USERS_AUTHENTICATED_UPDATE_COLUMNS).toEqual(['name', 'updated_at']);
    expect(USERS_AUTHENTICATED_UPDATE_COLUMNS).not.toContain(
      'initial_plan_generated_at',
    );
    expect(USERS_AUTHENTICATED_UPDATE_COLUMNS).not.toContain(
      'free_access_plan_id',
    );
    expect(USERS_AUTHENTICATED_UPDATE_COLUMNS).not.toContain(
      'free_access_plan_selected_at',
    );
  });

  it('is an expand-safe in-place text conversion with additive nullable slots', () => {
    expect(MIGRATION_SQL).toContain(
      'ALTER TABLE "user_preferences" ALTER COLUMN "preferred_ai_model" TYPE text USING "preferred_ai_model"::text',
    );
    expect(MIGRATION_SQL).toContain(
      'ADD COLUMN "preferred_regeneration_ai_model" text',
    );
    expect(MIGRATION_SQL).toContain(
      'ADD COLUMN "preferred_lesson_ai_model" text',
    );
    expect(MIGRATION_SQL).not.toMatch(/DROP TYPE/i);
    expect(MIGRATION_SQL).not.toMatch(/\bCHECK\s*\(/i);
    expect(MIGRATION_SQL).not.toMatch(/CREATE INDEX/i);
    expect(MIGRATION_SQL).not.toMatch(/UPDATE "user_preferences"/i);
    expect(MIGRATION_SQL).not.toMatch(/ON(?: TABLE)? "users"/i);

    const insertGrant = [
      ...MIGRATION_SQL.matchAll(
        /GRANT INSERT \(([^)]+)\) ON TABLE "user_preferences" TO authenticated;/g,
      ),
    ].at(-1);
    const updateGrant = [
      ...MIGRATION_SQL.matchAll(
        /GRANT UPDATE \(([^)]+)\) ON TABLE "user_preferences" TO authenticated;/g,
      ),
    ].at(-1);

    expect(normalizeColumns(insertGrant?.[1] ?? '')).toEqual(
      [...USER_PREFERENCES_AUTHENTICATED_INSERT_COLUMNS].sort(),
    );
    expect(normalizeColumns(updateGrant?.[1] ?? '')).toEqual(
      [...USER_PREFERENCES_AUTHENTICATED_UPDATE_COLUMNS].sort(),
    );
  });

  it('does not read or write the new operation slots in preference queries', () => {
    expect(USER_PREFERENCES_QUERY_SOURCE).not.toContain(
      'preferredRegenerationAiModel',
    );
    expect(USER_PREFERENCES_QUERY_SOURCE).not.toContain(
      'preferredLessonAiModel',
    );
    expect(USER_PREFERENCES_QUERY_SOURCE).not.toContain(
      'preferred_regeneration_ai_model',
    );
    expect(USER_PREFERENCES_QUERY_SOURCE).not.toContain(
      'preferred_lesson_ai_model',
    );
  });
});
