import { preferredAiModel } from '@supabase/enums';
import {
  USER_PREFERENCES_AUTHENTICATED_INSERT_COLUMNS,
  USER_PREFERENCES_AUTHENTICATED_UPDATE_COLUMNS,
} from '@supabase/privileges/user-preferences-authenticated-columns';
import { userPreferences } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq, sql } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { describe, expect, it } from 'vitest';

const HISTORICAL_MODEL = 'google/gemini-2.0-flash-exp:free';
const MODEL_SLOT_COLUMNS = [
  'preferred_ai_model',
  'preferred_regeneration_ai_model',
  'preferred_lesson_ai_model',
] as const;

const EXPAND_MIGRATION_SQL = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260826184123_expand_user_preferences_model_text_slots.sql',
  ),
  'utf8',
);

const RESTORE_PRE_EXPAND_SCHEMA_SQL = `
  ALTER TABLE "user_preferences"
    DROP COLUMN IF EXISTS "preferred_regeneration_ai_model";
  ALTER TABLE "user_preferences"
    DROP COLUMN IF EXISTS "preferred_lesson_ai_model";
  ALTER TABLE "user_preferences"
    ALTER COLUMN "preferred_ai_model" TYPE "preferred_ai_model"
    USING "preferred_ai_model"::"preferred_ai_model";
  REVOKE INSERT, UPDATE ON TABLE "user_preferences" FROM authenticated;
  GRANT INSERT (user_id, preferred_ai_model, analytics_timezone, updated_at)
    ON TABLE "user_preferences" TO authenticated;
  GRANT UPDATE (preferred_ai_model, analytics_timezone, updated_at)
    ON TABLE "user_preferences" TO authenticated;
`;

async function authenticatedPreferenceColumns(
  client: postgres.Sql,
  privilege: 'INSERT' | 'UPDATE',
): Promise<string[]> {
  const rows = await client<{ column_name: string }[]>`
    SELECT column_info.column_name::text AS column_name
    FROM information_schema.columns AS column_info
    WHERE column_info.table_schema = 'public'
      AND column_info.table_name = 'user_preferences'
      AND has_column_privilege(
        'authenticated',
        'public.user_preferences',
        column_info.column_name,
        ${privilege}
      )
    ORDER BY column_info.column_name
  `;
  return rows.map((row) => row.column_name);
}

describe('user preference model-slot persistence', () => {
  it('converts preferred_ai_model to text and adds nullable operation slots', async () => {
    const rows = (await db.execute(sql`
      SELECT column_name, data_type, udt_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'user_preferences'
        AND column_name IN (
          'preferred_ai_model',
          'preferred_regeneration_ai_model',
          'preferred_lesson_ai_model'
        )
      ORDER BY column_name
    `)) as Array<{
      column_name: string;
      data_type: string;
      udt_name: string;
      is_nullable: string;
      column_default: string | null;
    }>;

    expect(rows).toEqual([
      {
        column_name: 'preferred_ai_model',
        data_type: 'text',
        udt_name: 'text',
        is_nullable: 'YES',
        column_default: null,
      },
      {
        column_name: 'preferred_lesson_ai_model',
        data_type: 'text',
        udt_name: 'text',
        is_nullable: 'YES',
        column_default: null,
      },
      {
        column_name: 'preferred_regeneration_ai_model',
        data_type: 'text',
        udt_name: 'text',
        is_nullable: 'YES',
        column_default: null,
      },
    ]);
  });

  it('keeps the historical preferred_ai_model enum type', async () => {
    const typeRows = (await db.execute(sql`
      SELECT t.typname, t.typtype
      FROM pg_type AS t
      WHERE t.typname = 'preferred_ai_model'
    `)) as Array<{ typname: string; typtype: string }>;

    expect(typeRows).toEqual([{ typname: 'preferred_ai_model', typtype: 'e' }]);

    const enumRows = (await db.execute(sql`
      SELECT e.enumlabel
      FROM pg_type AS t
      JOIN pg_enum AS e ON e.enumtypid = t.oid
      WHERE t.typname = 'preferred_ai_model'
      ORDER BY e.enumsortorder
    `)) as Array<{ enumlabel: string }>;
    expect(enumRows.map((row) => row.enumlabel)).toEqual([
      ...preferredAiModel.enumValues,
    ]);
  });

  it('does not add model-id constraints or indexes on the preference slots', async () => {
    const checkRows = (await db.execute(sql`
      SELECT pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = 'public.user_preferences'::regclass
        AND contype = 'c'
    `)) as Array<{ definition: string }>;
    expect(
      checkRows.filter((row) =>
        MODEL_SLOT_COLUMNS.some((column) => row.definition.includes(column)),
      ),
    ).toEqual([]);

    const indexRows = (await db.execute(sql`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'user_preferences'
        AND (
          indexdef ILIKE '%preferred_ai_model%'
          OR indexdef ILIKE '%preferred_regeneration_ai_model%'
          OR indexdef ILIKE '%preferred_lesson_ai_model%'
        )
    `)) as Array<{ indexname: string }>;
    expect(indexRows).toEqual([]);
  });

  it('preserves enum-typed writes as text and leaves new slots null', async () => {
    const authUserId = buildTestAuthUserId('model-slot-enum-write');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });

    await db.execute(sql`
      INSERT INTO "user_preferences" ("user_id", "preferred_ai_model")
      VALUES (${userId}::uuid, ${HISTORICAL_MODEL}::preferred_ai_model)
    `);

    const [row] = await db
      .select({
        preferredAiModel: userPreferences.preferredAiModel,
        preferredRegenerationAiModel:
          userPreferences.preferredRegenerationAiModel,
        preferredLessonAiModel: userPreferences.preferredLessonAiModel,
      })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));

    expect(row?.preferredAiModel).toBe(HISTORICAL_MODEL);
    expect(row?.preferredRegenerationAiModel).toBeNull();
    expect(row?.preferredLessonAiModel).toBeNull();
  });

  it('accepts non-enum text in preferred_ai_model without copying into operation slots', async () => {
    const authUserId = buildTestAuthUserId('model-slot-text-write');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });

    await db.execute(sql`
      INSERT INTO "user_preferences" ("user_id", "preferred_ai_model")
      VALUES (${userId}::uuid, 'not-a-catalog-model')
    `);

    const [row] = await db
      .select({
        preferredAiModel: userPreferences.preferredAiModel,
        preferredRegenerationAiModel:
          userPreferences.preferredRegenerationAiModel,
        preferredLessonAiModel: userPreferences.preferredLessonAiModel,
      })
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId));

    expect(row?.preferredAiModel).toBe('not-a-catalog-model');
    expect(row?.preferredRegenerationAiModel).toBeNull();
    expect(row?.preferredLessonAiModel).toBeNull();
  });

  it('preserves a pre-existing enum preference through the expand migration', async () => {
    const databaseUrl = process.env.POSTGRES_URL;
    if (!databaseUrl) {
      throw new Error(
        'POSTGRES_URL is required for migration integration tests.',
      );
    }

    const authUserId = buildTestAuthUserId('model-slot-expand-transition');
    const userId = await ensureUser({
      authUserId,
      email: buildTestEmail(authUserId),
    });

    const client = postgres(databaseUrl, { max: 1 });
    let restoredPriorSchema = false;
    let expanded = false;

    try {
      await client.unsafe(RESTORE_PRE_EXPAND_SCHEMA_SQL);
      restoredPriorSchema = true;

      await client`
        INSERT INTO "user_preferences" ("user_id", "preferred_ai_model")
        VALUES (${userId}::uuid, ${HISTORICAL_MODEL}::preferred_ai_model)
      `;

      await client.unsafe(EXPAND_MIGRATION_SQL);
      expanded = true;

      const [row] = await client<
        {
          preferred_ai_model: string | null;
          preferred_regeneration_ai_model: string | null;
          preferred_lesson_ai_model: string | null;
        }[]
      >`
        SELECT
          "preferred_ai_model",
          "preferred_regeneration_ai_model",
          "preferred_lesson_ai_model"
        FROM "user_preferences"
        WHERE "user_id" = ${userId}::uuid
      `;
      expect(row?.preferred_ai_model).toBe(HISTORICAL_MODEL);
      expect(row?.preferred_regeneration_ai_model).toBeNull();
      expect(row?.preferred_lesson_ai_model).toBeNull();

      const [column] = await client<
        {
          udt_name: string;
          data_type: string;
          is_nullable: string;
        }[]
      >`
        SELECT udt_name::text, data_type::text, is_nullable::text
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'user_preferences'
          AND column_name = 'preferred_ai_model'
      `;
      expect(column).toEqual({
        udt_name: 'text',
        data_type: 'text',
        is_nullable: 'YES',
      });

      const enumType = await client<{ typname: string; typtype: string }[]>`
        SELECT t.typname::text, t.typtype::text
        FROM pg_type AS t
        WHERE t.typname = 'preferred_ai_model'
      `;
      expect(enumType).toEqual([
        { typname: 'preferred_ai_model', typtype: 'e' },
      ]);

      const checkRows = await client<{ definition: string }[]>`
        SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conrelid = 'public.user_preferences'::regclass
          AND contype = 'c'
      `;
      expect(
        checkRows.filter((row) =>
          MODEL_SLOT_COLUMNS.some((columnName) =>
            row.definition.includes(columnName),
          ),
        ),
      ).toEqual([]);

      const indexRows = await client<{ indexname: string }[]>`
        SELECT indexname::text
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'user_preferences'
          AND (
            indexdef ILIKE '%preferred_ai_model%'
            OR indexdef ILIKE '%preferred_regeneration_ai_model%'
            OR indexdef ILIKE '%preferred_lesson_ai_model%'
          )
      `;
      expect(indexRows).toEqual([]);

      expect(await authenticatedPreferenceColumns(client, 'INSERT')).toEqual(
        [...USER_PREFERENCES_AUTHENTICATED_INSERT_COLUMNS].sort(),
      );
      expect(await authenticatedPreferenceColumns(client, 'UPDATE')).toEqual(
        [...USER_PREFERENCES_AUTHENTICATED_UPDATE_COLUMNS].sort(),
      );
    } finally {
      try {
        if (restoredPriorSchema && !expanded) {
          await client.unsafe(EXPAND_MIGRATION_SQL);
        }
      } finally {
        await client.end();
      }
    }
  });
});
