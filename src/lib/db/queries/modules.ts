import { eq } from 'drizzle-orm';

import { getDb } from '@/lib/db/runtime';
import { modules, tasks } from '@/lib/db/schema';
import type { Module, Task } from '@/lib/types/db';

export async function getModuleWithTasks(
  moduleId: string
): Promise<Array<{ modules: Module | null; tasks: Task | null }>> {
  const db = getDb();
  return await db
    .select()
    .from(modules)
    .leftJoin(tasks, eq(tasks.moduleId, modules.id))
    .where(eq(modules.id, moduleId));
}
