import { and, eq } from 'drizzle-orm';
import { withAuthAndRateLimit, withErrorBoundary } from '@/lib/api/auth';
import { AppError } from '@/lib/api/errors';
import { getDb } from '@/lib/db/runtime';
import { learningPlans, modules, taskProgress, tasks } from '@/lib/db/schema';
import { logger } from '@/lib/logging/logger';

const MAX_CSV_EXPORT_ROWS = 10_000;

function escapeCsvField(field: string): string {
  if (
    field.includes(',') ||
    field.includes('"') ||
    field.includes('\n') ||
    field.includes('\r')
  ) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

function toCsvRow(fields: string[]): string {
  return fields.map(escapeCsvField).join(',');
}

type CsvExportRow = {
  planId: string;
  planTopic: string;
  skillLevel: string;
  weeklyHours: number;
  startDate: string | null;
  deadlineDate: string | null;
  planCreatedAt: Date | null;
  moduleId: string | null;
  moduleTitle: string | null;
  moduleOrder: number | null;
  moduleEstimatedMinutes: number | null;
  taskId: string | null;
  taskTitle: string | null;
  taskOrder: number | null;
  taskEstimatedMinutes: number | null;
  progressStatus: string | null;
  completedAt: Date | null;
};

function toCsvDataRow(row: CsvExportRow): string {
  return toCsvRow([
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
    row.taskEstimatedMinutes != null ? String(row.taskEstimatedMinutes) : '',
    row.progressStatus ?? 'not_started',
    row.completedAt?.toISOString() ?? '',
  ]);
}

function createCsvStream(
  headers: string[],
  rows: CsvExportRow[]
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    start(controller): void {
      controller.enqueue(encoder.encode(`${toCsvRow(headers)}\n`));

      for (const row of rows) {
        controller.enqueue(encoder.encode(`${toCsvDataRow(row)}\n`));
      }

      controller.close();
    },
  });
}

// GET /api/v1/exports/csv
export const GET = withErrorBoundary(
  withAuthAndRateLimit('read', async ({ user }): Promise<Response> => {
    const db = getDb();

    const plans: CsvExportRow[] = await db
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
      .leftJoin(
        taskProgress,
        and(eq(taskProgress.taskId, tasks.id), eq(taskProgress.userId, user.id))
      )
      .where(eq(learningPlans.userId, user.id))
      .orderBy(learningPlans.createdAt, modules.order, tasks.order)
      .limit(MAX_CSV_EXPORT_ROWS + 1);

    if (plans.length > MAX_CSV_EXPORT_ROWS) {
      logger.warn(
        {
          userId: user.id,
          rowCount: plans.length,
          maxRows: MAX_CSV_EXPORT_ROWS,
        },
        'CSV export exceeded synchronous row limit'
      );

      throw new AppError('CSV export is too large for direct download.', {
        status: 413,
        code: 'CSV_EXPORT_TOO_LARGE',
        details: {
          rowCount: plans.length,
          maxRows: MAX_CSV_EXPORT_ROWS,
          backgroundJobRequired: true,
        },
      });
    }

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

    logger.info(
      { userId: user.id, rowCount: plans.length },
      'CSV export generated'
    );

    return new Response(createCsvStream(headers, plans), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="atlaris-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  })
);
