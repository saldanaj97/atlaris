import { and, count, eq } from 'drizzle-orm';
import type { PlainHandler } from '@/lib/api/auth';
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
  planTopic: string;
  skillLevel: string;
  weeklyHours: number;
  startDate: string | null;
  deadlineDate: string | null;
  planCreatedAt: Date | null;
  moduleTitle: string | null;
  moduleOrder: number | null;
  moduleEstimatedMinutes: number | null;
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
  // -1 = BOM+header not yet enqueued; 0..rows.length-1 = row index
  let index = -1;

  return new ReadableStream<Uint8Array>({
    pull(controller): void {
      if (index === -1) {
        controller.enqueue(encoder.encode(`\uFEFF${toCsvRow(headers)}\n`));
        index = 0;
        return;
      }
      if (index >= rows.length) {
        controller.close();
        return;
      }
      const row = rows[index++];
      if (row !== undefined) {
        controller.enqueue(encoder.encode(`${toCsvDataRow(row)}\n`));
      }
    },
  });
}

// GET /api/v1/exports/csv
export const GET: PlainHandler = withErrorBoundary(
  withAuthAndRateLimit('read', async ({ user }): Promise<Response> => {
    const db = getDb();

    const [countResult] = await db
      .select({ count: count() })
      .from(learningPlans)
      .leftJoin(modules, eq(modules.planId, learningPlans.id))
      .leftJoin(tasks, eq(tasks.moduleId, modules.id))
      .leftJoin(
        taskProgress,
        and(eq(taskProgress.taskId, tasks.id), eq(taskProgress.userId, user.id))
      )
      .where(eq(learningPlans.userId, user.id));

    const rowCount = countResult?.count ?? 0;

    if (rowCount > MAX_CSV_EXPORT_ROWS) {
      logger.warn(
        {
          userId: user.id,
          rowCount,
          maxRows: MAX_CSV_EXPORT_ROWS,
        },
        'CSV export exceeded synchronous row limit'
      );

      throw new AppError('CSV export is too large for direct download.', {
        status: 413,
        code: 'CSV_EXPORT_TOO_LARGE',
        details: {
          rowCount,
          maxRows: MAX_CSV_EXPORT_ROWS,
          backgroundJobRequired: true,
        },
      });
    }

    const plans: CsvExportRow[] = await db
      .select({
        planTopic: learningPlans.topic,
        skillLevel: learningPlans.skillLevel,
        weeklyHours: learningPlans.weeklyHours,
        startDate: learningPlans.startDate,
        deadlineDate: learningPlans.deadlineDate,
        planCreatedAt: learningPlans.createdAt,
        moduleTitle: modules.title,
        moduleOrder: modules.order,
        moduleEstimatedMinutes: modules.estimatedMinutes,
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
      .limit(MAX_CSV_EXPORT_ROWS);

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
