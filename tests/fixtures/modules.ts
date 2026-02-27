/**
 * Test factories for database module and task records.
 * Use these instead of direct db.insert calls to centralize schema changes.
 */

import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import { modules, tasks } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';

type ModuleRow = InferSelectModel<typeof modules>;
type ModuleInsert = InferInsertModel<typeof modules>;
type TaskRow = InferSelectModel<typeof tasks>;
type TaskInsert = InferInsertModel<typeof tasks>;

type CreateTestModuleParams = {
  planId: string;
  order?: number;
  title?: string;
  description?: string;
  estimatedMinutes?: number;
};

type CreateTestTaskParams = {
  moduleId: string;
  order?: number;
  title?: string;
  description?: string;
  estimatedMinutes?: number;
};

/**
 * Inserts a module into the database. Returns the inserted module.
 * Centralizes module creation so schema changes are reflected in one place.
 */
export async function createTestModule(
  params: CreateTestModuleParams
): Promise<ModuleRow> {
  const {
    planId,
    order = 1,
    title = 'Test Module',
    description = 'Test module description',
    estimatedMinutes = 120,
  } = params;

  const [row] = await db
    .insert(modules)
    .values({
      planId,
      order,
      title,
      description,
      estimatedMinutes,
    } as ModuleInsert)
    .returning();

  if (!row) {
    throw new Error('Failed to create module');
  }

  return row;
}

/**
 * Inserts a task into the database. Returns the inserted task.
 * Centralizes task creation so schema changes are reflected in one place.
 */
export async function createTestTask(
  params: CreateTestTaskParams
): Promise<TaskRow> {
  const {
    moduleId,
    order = 1,
    title = 'Test Task',
    description = 'Task description',
    estimatedMinutes = 30,
  } = params;

  const [row] = await db
    .insert(tasks)
    .values({
      moduleId,
      order,
      title,
      description,
      estimatedMinutes,
    } as TaskInsert)
    .returning();

  if (!row) {
    throw new Error('Failed to create task');
  }

  return row;
}
