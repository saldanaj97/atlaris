import { eq } from 'drizzle-orm';
import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { getDb } from '@/lib/db/runtime';
import { learningPlans, modules, taskProgress, tasks } from '@/lib/db/schema';
import { logger } from '@/lib/logging/logger';

function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function toCsvRow(fields: string[]): string {
  return fields.map(escapeCsvField).join(',');
}

// GET /api/v1/exports/csv
export const GET = withErrorBoundary(
  withAuthAndRateLimit('read', async ({ user }) => {
    const db = getDb();

    const plans = await db
      .select({
        planId: learningPlans.id,
        planTopic: learningPlans.topic,
        skillLevel: learningPlans.skillLevel,
        weeklyHours: learningPlans.weeklyHours,
        startDate: learningPlans.startDate,
        deadlineDate: learningPlans.deadlineDate,
        planCreatedAt: learningPlans.createdAt,
        moduleId: modules.id,
        moduleTitle: modules.title,
        moduleOrder: modules.order,
        moduleEstimatedMinutes: modules.estimatedMinutes,
        taskId: tasks.id,
        taskTitle: tasks.title,
        taskOrder: tasks.order,
        taskEstimatedMinutes: tasks.estimatedMinutes,
        progressStatus: taskProgress.status,
        completedAt: taskProgress.completedAt,
      })
      .from(learningPlans)
      .leftJoin(modules, eq(modules.planId, learningPlans.id))
      .leftJoin(tasks, eq(tasks.moduleId, modules.id))
      .leftJoin(taskProgress, eq(taskProgress.taskId, tasks.id))
      .where(eq(learningPlans.userId, user.id))
      .orderBy(learningPlans.createdAt, modules.order, tasks.order);

    const headers = [
      'Plan',
      'Skill Level',
      'Weekly Hours',
      'Start Date',
      'Deadline',
      'Plan Created',
      'Module #',
      'Module',
      'Module Est. Minutes',
      'Task #',
      'Task',
      'Task Est. Minutes',
      'Status',
      'Completed At',
    ];

    const rows = plans.map((row) =>
      toCsvRow([
        row.planTopic,
        row.skillLevel,
        String(row.weeklyHours),
        row.startDate ?? '',
        row.deadlineDate ?? '',
        row.planCreatedAt?.toISOString() ?? '',
        row.moduleOrder != null ? String(row.moduleOrder) : '',
        row.moduleTitle ?? '',
        row.moduleEstimatedMinutes != null
          ? String(row.moduleEstimatedMinutes)
          : '',
        row.taskOrder != null ? String(row.taskOrder) : '',
        row.taskTitle ?? '',
        row.taskEstimatedMinutes != null
          ? String(row.taskEstimatedMinutes)
          : '',
        row.progressStatus ?? 'not_started',
        row.completedAt?.toISOString() ?? '',
      ])
    );

    const csv = [toCsvRow(headers), ...rows].join('\n');

    logger.info(
      { userId: user.id, rowCount: rows.length },
      'CSV export generated'
    );

    return new Response(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="atlaris-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  })
);
