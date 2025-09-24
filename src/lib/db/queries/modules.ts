import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/drizzle';
import { modules, tasks } from '@/lib/db/schema';
import { Module, Task } from '../types';

export async function getModuleWithTasks(
  moduleId: string
): Promise<Array<{ modules: Module | null; tasks: Task | null }>> {
  return await db
    .select()
    .from(modules)
    .leftJoin(tasks, eq(tasks.moduleId, modules.id))
    .where(eq(modules.id, moduleId));
}
