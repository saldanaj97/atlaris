import { describe, it, expect } from 'vitest';

import { createMockProvider } from '@/lib/ai/mockProvider';
import { runGenerationAttempt } from '@/lib/ai/orchestrator';
import { db } from '@/lib/db/drizzle';
import { learningPlans, modules, tasks } from '@/lib/db/schema';
import { setTestUser } from '../helpers/auth';
import { ensureUser, getUserIdFor } from '../helpers/db';

/**
 * Injects a DB error during recordSuccess to assert full rollback (no modules / tasks persisted).
 * We monkey-patch the db client passed into runGenerationAttempt to throw after inserting modules
 * before the attempt record, ensuring transaction rollback semantics.
 */

describe('Concurrency - rollback on DB error', () => {
  it('rolls back modules/tasks when an error occurs mid-transaction', async () => {
    setTestUser('rollback_user');
    await ensureUser({ clerkUserId: 'rollback_user', email: 'rollback_user@example.com' });
    const userId = await getUserIdFor('rollback_user');

    const [plan] = await db
      .insert(learningPlans)
      .values({
        userId,
        topic: 'Rollback Plan',
        skillLevel: 'beginner',
        weeklyHours: 2,
        learningStyle: 'reading',
        visibility: 'private',
        origin: 'ai',
      })
      .returning();

    // Mock provider success scenario so we reach recordSuccess.
    const mock = createMockProvider({ scenario: 'success' });

    // Wrap db with a client that throws after first module insert.
    let moduleInsertCount = 0;
    const failingClient = {
      ...db,
      insert: (...args: any[]) => (db as any).insert(...args),
      transaction: async (cb: any) => {
        return await (db as any).transaction(async (tx: any) => {
          const originalInsert = tx.insert.bind(tx);
          tx.insert = (table: any) => {
            const builder = originalInsert(table);
            const originalValues = builder.values.bind(builder);
            builder.values = (vals: any) => {
              if (table === modules) {
                moduleInsertCount += (vals as any[]).length;
              }
              return originalValues(vals);
            };
            const originalReturning = builder.returning.bind(builder);
            builder.returning = (...rArgs: any[]) => {
              const retBuilder = originalReturning(...rArgs);
              const originalExecute = retBuilder.then.bind(retBuilder);
              return retBuilder;
            };
            return builder;
          };

          const result = await cb(tx);
          // Force failure after modules & tasks inserted but before commit
          if (moduleInsertCount > 0) {
            throw new Error('Injected failure after module/task insertion');
          }
          return result;
        });
      },
    } as any;

    let error: unknown = null;
    try {
      await runGenerationAttempt(
        {
          planId: plan.id,
          userId,
          input: {
            topic: 'Rollback Plan',
            notes: 'Should rollback completely',
            skillLevel: 'beginner',
            weeklyHours: 2,
            learningStyle: 'reading',
          },
        },
        { provider: mock.provider, dbClient: failingClient }
      );
    } catch (e) {
      error = e;
    }

    expect(error).toBeTruthy();

    const moduleRows = await db.select().from(modules).where(modules.planId.eq(plan.id));
    const taskRows = await db.select().from(tasks);
    expect(moduleRows.length).toBe(0);
    expect(taskRows.length).toBe(0);
  });
});
