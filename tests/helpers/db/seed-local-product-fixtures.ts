import { LOCAL_PRODUCT_TESTING_SEED_USER_ROW_ID } from '@/lib/config/local-product-testing';
import postgres from 'postgres';

export const LOCAL_PRODUCT_BROWSER_FIXTURE_PLAN_ID =
  '22222222-2222-4222-8222-222222222222' as const;

export const LOCAL_PRODUCT_BROWSER_FIXTURE_MODULE_ONE_ID =
  '33333333-3333-4333-8333-333333333333' as const;

export const LOCAL_PRODUCT_BROWSER_FIXTURE_PLAN_TOPIC =
  'Local fixture: browser progress and regeneration' as const;

export const LOCAL_PRODUCT_BROWSER_FIXTURE_TASK_TITLES = {
  planNavigate: 'Toggle a plan task and navigate',
  moduleNavigate: 'Toggle a module lesson and return',
} as const;

const FIXTURE_MODULE_TWO_ID = '44444444-4444-4444-8444-444444444444';
const FIXTURE_TASK_ONE_ID = '55555555-5555-4555-8555-555555555555';
const FIXTURE_TASK_TWO_ID = '66666666-6666-4666-8666-666666666666';
const FIXTURE_TASK_THREE_ID = '77777777-7777-4777-8777-777777777777';
const FIXTURE_TASK_FOUR_ID = '88888888-8888-4888-8888-888888888888';

export function getLocalProductBrowserFixtureUrls(appUrl: string): {
  plan: string;
  module: string;
} {
  const base = appUrl.replace(/\/$/, '');
  return {
    plan: `${base}/plans/${LOCAL_PRODUCT_BROWSER_FIXTURE_PLAN_ID}`,
    module: `${base}/plans/${LOCAL_PRODUCT_BROWSER_FIXTURE_PLAN_ID}/modules/${LOCAL_PRODUCT_BROWSER_FIXTURE_MODULE_ONE_ID}`,
  };
}

export async function seedLocalProductBrowserFixtures(
  connectionUrl: string,
): Promise<void> {
  const sql = postgres(connectionUrl, { max: 1 });

  try {
    await sql.begin(async (tx) => {
      await tx`
        INSERT INTO learning_plans (
          id,
          user_id,
          topic,
          skill_level,
          weekly_hours,
          learning_style,
          start_date,
          deadline_date,
          visibility,
          origin,
          generation_status,
          is_quota_eligible,
          finalized_at
        )
        VALUES (
          ${LOCAL_PRODUCT_BROWSER_FIXTURE_PLAN_ID}::uuid,
          ${LOCAL_PRODUCT_TESTING_SEED_USER_ROW_ID}::uuid,
          ${LOCAL_PRODUCT_BROWSER_FIXTURE_PLAN_TOPIC},
          'intermediate',
          5,
          'mixed',
          current_date,
          current_date + interval '14 days',
          'private',
          'ai',
          'ready',
          true,
          now()
        )
        ON CONFLICT (id) DO UPDATE SET
          topic = excluded.topic,
          skill_level = excluded.skill_level,
          weekly_hours = excluded.weekly_hours,
          learning_style = excluded.learning_style,
          start_date = excluded.start_date,
          deadline_date = excluded.deadline_date,
          visibility = excluded.visibility,
          origin = excluded.origin,
          generation_status = excluded.generation_status,
          is_quota_eligible = excluded.is_quota_eligible,
          finalized_at = excluded.finalized_at,
          updated_at = now()
      `;

      await tx`
        DELETE FROM job_queue
        WHERE plan_id = ${LOCAL_PRODUCT_BROWSER_FIXTURE_PLAN_ID}::uuid
      `;
      await tx`
        DELETE FROM generation_attempts
        WHERE plan_id = ${LOCAL_PRODUCT_BROWSER_FIXTURE_PLAN_ID}::uuid
      `;
      await tx`
        DELETE FROM modules
        WHERE plan_id = ${LOCAL_PRODUCT_BROWSER_FIXTURE_PLAN_ID}::uuid
      `;

      await tx`
        INSERT INTO generation_attempts (
          plan_id,
          status,
          classification,
          duration_ms,
          modules_count,
          tasks_count,
          prompt_hash,
          metadata
        )
        VALUES (
          ${LOCAL_PRODUCT_BROWSER_FIXTURE_PLAN_ID}::uuid,
          'success',
          null,
          0,
          2,
          4,
          'local-product-fixture',
          '{"source":"seed-local-product-fixtures"}'::jsonb
        )
      `;

      await tx`
        INSERT INTO modules (
          id,
          plan_id,
          "order",
          title,
          description,
          estimated_minutes,
          lesson_generation_status
        )
        VALUES
          (
            ${LOCAL_PRODUCT_BROWSER_FIXTURE_MODULE_ONE_ID}::uuid,
            ${LOCAL_PRODUCT_BROWSER_FIXTURE_PLAN_ID}::uuid,
            1,
            'Navigation batching basics',
            'A deterministic module for validating task progress while moving between pages.',
            60,
            'ready'
          ),
          (
            ${FIXTURE_MODULE_TWO_ID}::uuid,
            ${LOCAL_PRODUCT_BROWSER_FIXTURE_PLAN_ID}::uuid,
            2,
            'Regeneration queue checks',
            'A deterministic module for validating regeneration-adjacent flows.',
            45,
            'ready'
          )
      `;

      await tx`
        INSERT INTO tasks (
          id,
          module_id,
          "order",
          title,
          description,
          estimated_minutes,
          has_micro_explanation,
          lesson_content,
          lesson_content_updated_at
        )
        VALUES
          (
            ${FIXTURE_TASK_ONE_ID}::uuid,
            ${LOCAL_PRODUCT_BROWSER_FIXTURE_MODULE_ONE_ID}::uuid,
            1,
            ${LOCAL_PRODUCT_BROWSER_FIXTURE_TASK_TITLES.planNavigate},
            'Use this task to confirm pending plan-level task progress survives route changes.',
            20,
            true,
            '{"version":1,"blocks":[{"type":"paragraph","text":"Use this seeded lesson to validate progress batching without generating content first."}]}'::jsonb,
            now()
          ),
          (
            ${FIXTURE_TASK_TWO_ID}::uuid,
            ${LOCAL_PRODUCT_BROWSER_FIXTURE_MODULE_ONE_ID}::uuid,
            2,
            ${LOCAL_PRODUCT_BROWSER_FIXTURE_TASK_TITLES.moduleNavigate},
            'Use this task to confirm module-level task progress survives navigation back to the plan.',
            40,
            true,
            '{"version":1,"blocks":[{"type":"paragraph","text":"Navigate back to the plan immediately after toggling this lesson."}]}'::jsonb,
            now()
          ),
          (
            ${FIXTURE_TASK_THREE_ID}::uuid,
            ${FIXTURE_MODULE_TWO_ID}::uuid,
            1,
            'Inspect regeneration queue metadata',
            'Use this task as stable content before triggering regeneration against the fixture plan.',
            25,
            true,
            '{"version":1,"blocks":[{"type":"paragraph","text":"This lesson is present so module detail pages are usable before regeneration."}]}'::jsonb,
            now()
          ),
          (
            ${FIXTURE_TASK_FOUR_ID}::uuid,
            ${FIXTURE_MODULE_TWO_ID}::uuid,
            2,
            'Confirm regenerated content replaces stale tasks',
            'Use this task as a pre-regeneration baseline.',
            20,
            true,
            '{"version":1,"blocks":[{"type":"paragraph","text":"After regeneration, stale task ids should not receive progress updates."}]}'::jsonb,
            now()
          )
      `;
    });
  } finally {
    await sql.end();
  }
}
