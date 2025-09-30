import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import {
  generationAttempts,
  jobQueue,
  learningPlans,
  modules,
  planGenerations,
  taskProgress,
  taskResources,
  tasks,
  users,
} from '@/lib/db/schema';

/**
 * Truncate core tables between tests to guarantee isolation.
 */
const userIdCache = new Map<string, string>();

export async function truncateAll() {
  await db.execute(sql`
    TRUNCATE TABLE
      ${generationAttempts},
      ${jobQueue},
      ${taskResources},
      ${taskProgress},
      ${tasks},
      ${modules},
      ${planGenerations},
      ${learningPlans},
      ${users}
    RESTART IDENTITY CASCADE
  `);
  userIdCache.clear();
}

export async function ensureUser({
  clerkUserId,
  email,
  name,
}: {
  clerkUserId: string;
  email: string;
  name?: string;
}): Promise<string> {
  const cached = userIdCache.get(clerkUserId);
  if (cached) return cached;

  const [inserted] = await db
    .insert(users)
    .values({
      clerkUserId,
      email,
      name: name ?? email,
    })
    .onConflictDoNothing()
    .returning({ id: users.id });

  if (inserted?.id) {
    userIdCache.set(clerkUserId, inserted.id);
    return inserted.id;
  }

  const record = await db.query.users.findFirst({
    where: (fields, operators) =>
      operators.eq(fields.clerkUserId, clerkUserId),
  });
  if (!record) throw new Error(`Missing user for ${clerkUserId}`);

  userIdCache.set(clerkUserId, record.id);
  return record.id;
}
