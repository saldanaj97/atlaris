import postgres from 'postgres';

export interface SmokeTestConfig {
  apiUrl: string;
  databaseUrl: string;
  apiKey: string;
}

/**
 * Create a plan via API
 */
export async function createPlan(
  config: SmokeTestConfig,
  payload: {
    topic: string;
    skillLevel: 'beginner' | 'intermediate' | 'advanced';
    weeklyHours: number;
  }
) {
  const response = await fetch(`${config.apiUrl}/api/v1/plans`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to create plan: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

/**
 * Poll for job completion with exponential backoff
 */
export async function waitForJobCompletion(
  planId: string,
  databaseUrl: string,
  maxWaitMs = 60000
): Promise<boolean> {
  const startTime = Date.now();
  let attempt = 0;

  const sql = postgres(databaseUrl, { ssl: 'require' });

  try {
    while (Date.now() - startTime < maxWaitMs) {
      // Query job status for the given plan
      const jobs = await sql`
        SELECT status FROM job_queue
        WHERE plan_id = ${planId}
        ORDER BY created_at DESC
        LIMIT 1
      `;

      if (jobs.length === 0) {
        // No job found yet, wait and retry
        await sleep(1000);
        attempt++;
        continue;
      }

      const job = jobs[0];

      if (job.status === 'completed') {
        return true;
      }

      if (job.status === 'failed') {
        throw new Error(`Job for plan ${planId} failed`);
      }

      // Exponential backoff: 1s, 2s, 4s, 8s, ...
      const waitMs = Math.min(1000 * Math.pow(2, attempt), 8000);
      await sleep(waitMs);
      attempt++;
    }

    throw new Error(
      `Job for plan ${planId} did not complete within ${maxWaitMs}ms`
    );
  } finally {
    await sql.end();
  }
}

/**
 * Verify plan exists with modules and tasks
 */
export async function verifyPlanExists(
  planId: string,
  databaseUrl: string
): Promise<{ modulesCount: number; tasksCount: number }> {
  const sql = postgres(databaseUrl, { ssl: 'require' });

  try {
    // Get plan
    const plans = await sql`
      SELECT id, title FROM learning_plans
      WHERE id = ${planId}
    `;

    if (plans.length === 0) {
      throw new Error(`Plan ${planId} not found`);
    }

    // Get modules count
    const modulesResult = await sql`
      SELECT COUNT(*) as count FROM modules
      WHERE plan_id = ${planId}
    `;
    const modulesCount = parseInt(modulesResult[0].count, 10);

    // Get tasks count
    const tasksResult = await sql`
      SELECT COUNT(*) as count FROM tasks t
      JOIN modules m ON t.module_id = m.id
      WHERE m.plan_id = ${planId}
    `;
    const tasksCount = parseInt(tasksResult[0].count, 10);

    return { modulesCount, tasksCount };
  } finally {
    await sql.end();
  }
}

/**
 * Cleanup test data
 */
export async function cleanupTestData(
  planId: string,
  databaseUrl: string
): Promise<void> {
  const sql = postgres(databaseUrl, { ssl: 'require' });

  try {
    // Delete plan (CASCADE will delete modules, tasks, jobs)
    await sql`
      DELETE FROM learning_plans
      WHERE id = ${planId}
    `;
  } catch (error) {
    console.error(`Failed to cleanup plan ${planId}:`, error);
  } finally {
    await sql.end();
  }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
