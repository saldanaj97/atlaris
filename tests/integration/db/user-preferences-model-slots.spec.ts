import { preferredAiModel } from '@supabase/enums';
import { userPreferences } from '@supabase/schema';
import { db } from '@supabase/service-role';
import { ensureUser } from '@tests/helpers/db/users';
import { buildTestAuthUserId, buildTestEmail } from '@tests/helpers/testIds';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

const HISTORICAL_MODEL = 'google/gemini-2.0-flash-exp:free';
const MODEL_SLOT_COLUMNS = [
  'preferred_ai_model',
  'preferred_regeneration_ai_model',
  'preferred_lesson_ai_model',
] as const;

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
});
