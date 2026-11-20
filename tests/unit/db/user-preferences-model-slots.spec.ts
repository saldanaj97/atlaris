import {
  USER_PREFERENCES_AUTHENTICATED_INSERT_COLUMNS,
  USER_PREFERENCES_AUTHENTICATED_UPDATE_COLUMNS,
} from '@supabase/privileges/user-preferences-authenticated-columns';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const GROUNDED_MIGRATION_SQL = readFileSync(
  join(
    REPO_ROOT,
    'supabase',
    'migrations',
    '20261021143142_add_user_preferences_grounded_model_slots.sql',
  ),
  'utf8',
);
const GROUNDED_COLUMNS = [
  'preferred_writer_ai_model',
  'preferred_verifier_ai_model',
  'preferred_advisor_ai_model',
];

function normalizeColumns(rawColumns: string): string[] {
  return rawColumns
    .split(',')
    .map((column) => column.trim())
    .filter(Boolean)
    .sort();
}

function lastGrantColumns(
  migrationSql: string,
  privilege: 'INSERT' | 'UPDATE',
): string[] {
  const grant = [
    ...migrationSql.matchAll(
      new RegExp(
        `GRANT ${privilege} \\(([^)]+)\\) ON TABLE "user_preferences" TO authenticated;`,
        'g',
      ),
    ),
  ].at(-1);
  return normalizeColumns(grant?.[1] ?? '');
}

describe('canonical user preference model-slot schema', () => {
  it('grants authenticated writes on the user-owned model slots only', () => {
    expect(USER_PREFERENCES_AUTHENTICATED_INSERT_COLUMNS).toEqual([
      'user_id',
      'preferred_ai_model',
      'preferred_regeneration_ai_model',
      'preferred_lesson_ai_model',
      'preferred_writer_ai_model',
      'preferred_verifier_ai_model',
      'preferred_advisor_ai_model',
      'analytics_timezone',
      'updated_at',
    ]);
    expect(USER_PREFERENCES_AUTHENTICATED_UPDATE_COLUMNS).toEqual([
      'preferred_ai_model',
      'preferred_regeneration_ai_model',
      'preferred_lesson_ai_model',
      'preferred_writer_ai_model',
      'preferred_verifier_ai_model',
      'preferred_advisor_ai_model',
      'analytics_timezone',
      'updated_at',
    ]);
  });

  it('adds the grounded role slots as nullable text and grants the current columns', () => {
    for (const column of GROUNDED_COLUMNS) {
      expect(GROUNDED_MIGRATION_SQL).toContain(`ADD COLUMN "${column}" text;`);
    }
    expect(GROUNDED_MIGRATION_SQL).not.toMatch(/\bCHECK\s*\(/i);
    expect(GROUNDED_MIGRATION_SQL).not.toMatch(/UPDATE "user_preferences"/i);
    expect(lastGrantColumns(GROUNDED_MIGRATION_SQL, 'INSERT')).toEqual(
      [...USER_PREFERENCES_AUTHENTICATED_INSERT_COLUMNS].sort(),
    );
    expect(lastGrantColumns(GROUNDED_MIGRATION_SQL, 'UPDATE')).toEqual(
      [...USER_PREFERENCES_AUTHENTICATED_UPDATE_COLUMNS].sort(),
    );
  });
});
