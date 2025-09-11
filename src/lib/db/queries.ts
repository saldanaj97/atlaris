import { eq } from 'drizzle-orm';
import { db } from './drizzle';
import { learningPlans, modules, taskProgress, tasks, users } from './schema';

// User queries
export async function getUserByClerkId(clerkUserId: string) {
  const result = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId));
  return result[0];
}

export async function createUser(userData: {
  clerkUserId: string;
  email: string;
  name?: string;
}) {
  const result = await db.insert(users).values(userData).returning();
  return result[0];
}

// Learning plan queries
export async function getUserLearningPlans(userId: string) {
  return await db
    .select()
    .from(learningPlans)
    .where(eq(learningPlans.userId, userId));
}

export async function getLearningPlanWithModules(planId: string) {
  return await db
    .select()
    .from(learningPlans)
    .leftJoin(modules, eq(modules.planId, learningPlans.id))
    .where(eq(learningPlans.id, planId));
}

// Task queries
export async function getTasks() {
  const allTasks = await db.select().from(tasks);
  return allTasks;
}

export async function getUserTaskProgress(userId: string, taskId: string) {
  const result = await db
    .select()
    .from(taskProgress)
    .where(eq(taskProgress.userId, userId) && eq(taskProgress.taskId, taskId));
  return result[0];
}

// Module queries
export async function getModuleWithTasks(moduleId: string) {
  return await db
    .select()
    .from(modules)
    .leftJoin(tasks, eq(tasks.moduleId, modules.id))
    .where(eq(modules.id, moduleId));
}
