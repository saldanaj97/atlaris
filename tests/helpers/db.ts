import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import {
  generationAttempts,
  jobQueue,
  learningPlans,
  modules,
  planGenerations,
  resources,
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
      ${users},
      ${resources}
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
  //  Don't use cache - always check database
  // The cache is cleared by truncateAll but we want to ensure we always have fresh data

  // Try to find existing user first
  const existing = await db.query.users.findFirst({
    where: (fields, operators) => operators.eq(fields.clerkUserId, clerkUserId),
  });

  if (existing) {
    userIdCache.set(clerkUserId, existing.id);
    return existing.id;
  }

  // User doesn't exist, create it
  const [inserted] = await db
    .insert(users)
    .values({
      clerkUserId,
      email,
      name: name ?? email,
    })
    .returning({ id: users.id });

  if (!inserted?.id) {
    throw new Error(`Failed to create user for ${clerkUserId}`);
  }

  userIdCache.set(clerkUserId, inserted.id);
  return inserted.id;
}
