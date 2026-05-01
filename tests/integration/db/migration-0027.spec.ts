import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ensureUser } from '@tests/helpers/db';
import postgres from 'postgres';
import { describe, expect, it } from 'vitest';

const migration0027Sql = readFileSync(
  resolve(process.cwd(), 'src/lib/db/migrations/0027_windy_agent_zero.sql'),
  'utf8',
);

const restoreLegacyPdfSchemaSql = `
  ALTER TABLE "learning_plans" ADD COLUMN "extracted_context" jsonb;
  ALTER TABLE "learning_plans"
    ADD CONSTRAINT "extracted_context_pdf_shape"
    CHECK ("extracted_context" IS NULL OR jsonb_typeof("extracted_context") = 'object');

  ALTER TABLE "usage_metrics" ADD COLUMN "pdf_plans_generated" integer NOT NULL DEFAULT 0;
  ALTER TABLE "usage_metrics"
    ADD CONSTRAINT "pdf_plans_generated_nonneg"
    CHECK ("pdf_plans_generated" >= 0);

  ALTER TABLE "learning_plans" ALTER COLUMN "origin" DROP DEFAULT;
  ALTER TABLE "learning_plans"
    ALTER COLUMN "origin" SET DATA TYPE text USING "origin"::text;
  DROP TYPE "public"."plan_origin";
  CREATE TYPE "public"."plan_origin" AS ENUM('ai', 'template', 'manual', 'pdf');
  ALTER TABLE "learning_plans"
    ALTER COLUMN "origin" SET DATA TYPE "public"."plan_origin" USING "origin"::"public"."plan_origin";
  ALTER TABLE "learning_plans"
    ALTER COLUMN "origin" SET DEFAULT 'ai'::"public"."plan_origin";
`;

describe('migration 0027_windy_agent_zero', () => {
  it('coerces legacy pdf plans to manual and drops PDF-only columns', async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error(
        'DATABASE_URL is required for migration integration tests.',
      );
    }

    const userId = await ensureUser({
      authUserId: 'migration-0027-user',
      email: 'migration-0027@example.com',
    });

    const notices: string[] = [];
    const sql = postgres(databaseUrl, {
      max: 1,
      onnotice: (notice) => notices.push(notice.message),
    });

    try {
      await sql.unsafe(restoreLegacyPdfSchemaSql);

      const [planRow] = await sql<{ id: string }[]>`
        INSERT INTO "learning_plans" (
          "user_id",
          "topic",
          "skill_level",
          "weekly_hours",
          "learning_style",
          "visibility",
          "origin",
          "generation_status",
          "is_quota_eligible",
          "extracted_context"
        )
        VALUES (
          ${userId},
          'Legacy PDF plan',
          'beginner',
          5,
          'mixed',
          'private',
          'pdf',
          'ready',
          false,
          '{"source":"legacy-pdf"}'::jsonb
        )
        RETURNING "id"
      `;

      await sql`
        INSERT INTO "usage_metrics" (
          "user_id",
          "month",
          "plans_generated",
          "regenerations_used",
          "exports_used",
          "pdf_plans_generated"
        )
        VALUES (${userId}, '2026-04', 0, 0, 0, 1)
      `;

      await sql.unsafe(migration0027Sql);

      const [migratedPlan] = await sql<{ origin: string }[]>`
        SELECT "origin"::text AS "origin"
        FROM "learning_plans"
        WHERE "id" = ${planRow.id}
      `;
      expect(migratedPlan?.origin).toBe('manual');

      const legacyColumns = await sql<
        { table_name: string; column_name: string }[]
      >`
        SELECT table_name::text, column_name::text
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (
            (table_name = 'learning_plans' AND column_name = 'extracted_context')
            OR (table_name = 'usage_metrics' AND column_name = 'pdf_plans_generated')
          )
      `;
      expect(legacyColumns).toHaveLength(0);

      const enumValues = await sql<{ enumlabel: string }[]>`
        SELECT e.enumlabel::text
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname = 'plan_origin'
        ORDER BY e.enumlabel
      `;
      expect(enumValues.map((row) => row.enumlabel)).toEqual([
        'ai',
        'manual',
        'template',
      ]);

      const indexes = await sql<{ indexname: string }[]>`
        SELECT indexname::text
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'learning_plans'
          AND indexname = 'idx_learning_plans_user_origin'
      `;
      expect(indexes).toHaveLength(1);

      expect(notices).toContain(
        'migration 0027: coercing 1 pdf-origin plans to manual',
      );
    } finally {
      await sql.end();
    }
  });
});
