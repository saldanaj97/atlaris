import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import {
  generationAttempts,
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
export async function truncateAll() {
  await db.execute(sql`
    TRUNCATE TABLE
      ${generationAttempts},
      ${taskResources},
      ${taskProgress},
      ${tasks},
      ${modules},
      ${planGenerations},
      ${learningPlans},
      ${users}
    RESTART IDENTITY CASCADE
  `);
}

export async function ensureUser({
  clerkUserId,
  email,
  name,
}: {
  clerkUserId: string;
  email: string;
  name?: string;
}) {
  await db
    .insert(users)
    .values({
      clerkUserId,
      email,
      name: name ?? email,
    })
    .onConflictDoNothing();
}

export async function getUserIdFor(clerkUserId: string) {
  const record = await db.query.users.findFirst({
    where: (fields, operators) =>
      operators.eq(fields.clerkUserId, clerkUserId),
  });
  if (!record) throw new Error(`Missing user for ${clerkUserId}`);
  return record.id;
}
