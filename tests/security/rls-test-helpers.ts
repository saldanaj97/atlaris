import { z } from 'zod';

export const policyRowSchema = z.object({
  tablename: z.string(),
  policyname: z.string(),
  role: z.string(),
});

// Keep this list limited to tables with explicit allow/deny behavior checks in
// rls.policies.spec.ts. Do not add metadata-only tables here without functional tests.
export const expectedPolicyTables = [
  'users',
  'learning_plans',
  'generation_attempts',
  'job_queue',
  'modules',
  'tasks',
  'resources',
  'task_progress',
  'usage_metrics',
  'ai_usage_events',
] as const;

export const serverOwnedWriteTables = [
  'ai_usage_events',
  'generation_attempts',
  'learning_plans',
  'modules',
  'plan_schedules',
  'resources',
  'task_resources',
  'tasks',
  'usage_metrics',
] as const;

export async function expectRlsViolation(operation: () => Promise<unknown>) {
  try {
    await operation();
    throw new Error('Expected RLS violation but operation succeeded');
  } catch (error) {
    const err = error as Error;
    const message = err.message;
    const causeMessage = (err.cause as Error)?.message || '';
    const combinedMessage = `${message} ${causeMessage}`;

    if (
      !/row[-\s]?level.*security|permission denied|insufficient privilege/i.test(
        combinedMessage,
      )
    ) {
      throw new Error(
        `Expected RLS violation error but got: ${message}${causeMessage ? ` (cause: ${causeMessage})` : ''}`,
        { cause: error },
      );
    }
  }
}
