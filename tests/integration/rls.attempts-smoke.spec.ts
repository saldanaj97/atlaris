import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';

describe('generation_attempts RLS smoke test', () => {
  it('prevents cross-user reads immediately after migration', async () => {
    const ownerEmail = `owner-smoke-${randomUUID()}@example.com`;
    const otherEmail = `other-smoke-${randomUUID()}@example.com`;

    let ownerCount = 0;
    let otherCount = 0;

    await db.transaction(async (tx) => {
      await tx.execute(sql`select tests.authenticate_as_service_role();`);

      await tx.execute(sql`select tests.create_supabase_user(${ownerEmail});`);
      await tx.execute(sql`select tests.create_supabase_user(${otherEmail});`);

      await tx.execute(sql`
        insert into public.users (clerk_user_id, email, name)
        values
          (tests.get_supabase_uid(${ownerEmail})::text, ${ownerEmail}, 'Owner Smoke'),
          (tests.get_supabase_uid(${otherEmail})::text, ${otherEmail}, 'Other Smoke')
      `);

      await tx.execute(sql`
        insert into public.learning_plans (
          user_id,
          topic,
          skill_level,
          weekly_hours,
          learning_style,
          visibility,
          origin
        )
        values (
          (
            select id
            from public.users
            where clerk_user_id = tests.get_supabase_uid(${ownerEmail})::text
            limit 1
          ),
          'Owner Smoke Plan',
          'beginner',
          5,
          'reading',
          'private',
          'ai'
        )
      `);

      await tx.execute(sql`
        insert into public.generation_attempts (
          plan_id,
          status,
          classification,
          duration_ms,
          modules_count,
          tasks_count,
          truncated_topic,
          truncated_notes,
          normalized_effort
        )
        values (
          (
            select id
            from public.learning_plans
            where topic = 'Owner Smoke Plan'
            limit 1
          ),
          'failure',
          'timeout',
          10500,
          0,
          0,
          false,
          false,
          false
        )
      `);

      await tx.execute(sql`select tests.clear_authentication();`);

      await tx.execute(sql`select tests.authenticate_as(${ownerEmail});`);
      const ownerRows = await tx.execute(
        sql`select count(*)::int as value from public.generation_attempts`
      );

      await tx.execute(sql`select tests.authenticate_as(${otherEmail});`);
      const otherRows = await tx.execute(
        sql`select count(*)::int as value from public.generation_attempts`
      );

      await tx.execute(sql`select tests.clear_authentication();`);

      ownerCount = Number(
        (ownerRows as Array<{ value?: number }>)[0]?.value ?? 0
      );
      otherCount = Number(
        (otherRows as Array<{ value?: number }>)[0]?.value ?? 0
      );
    });

    expect(ownerCount).toBe(1);
    expect(otherCount).toBe(0);
  });
});
