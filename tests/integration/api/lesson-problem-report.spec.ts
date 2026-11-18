import { clearTestUser, setTestUser } from '../../helpers/auth';
import { ensureUser } from '../../helpers/db/users';
import { PUT } from '@/app/api/v1/plans/[planId]/modules/[moduleId]/tasks/[taskId]/problem-report/route';
import { clearAllUserRateLimiters } from '@/lib/api/user-rate-limit';
import { executeRows } from '@/lib/db/execute-rows';
import { lessonProblemReports, tasks } from '@supabase/schema';
import { MAX_LESSON_PROBLEM_REPORT_NOTE_LENGTH } from '@supabase/schema/constants';
import { db } from '@supabase/service-role';
import { createTestModule, createTestTask } from '@tests/fixtures/modules';
import { createTestPlan } from '@tests/fixtures/plans';
import { mockServerSession } from '@tests/helpers/mock-server-auth';
import { buildRouteHandlerContext } from '@tests/helpers/route-handler-context';
import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const serverAuth = vi.hoisted(() => {
  const getSession = vi.fn();
  return {
    getSession,
    module: () => ({ auth: { getSession } }),
  };
});
vi.mock('@/lib/auth/server', () => serverAuth.module());

const LESSON_CONTENT = {
  version: 1,
  blocks: [{ type: 'paragraph', text: 'State stores values.' }],
};

type Lesson = {
  planId: string;
  moduleId: string;
  taskId: string;
  /** The version as the page renders it (a JS Date's ISO string). */
  version: string | null;
};

/**
 * A plan with one module and one lesson. With content, the lesson's
 * `lesson_content_updated_at` carries microseconds, as Postgres stores it.
 */
async function createLesson(
  userId: string,
  options: { withContent: boolean } = { withContent: true },
): Promise<Lesson> {
  const plan = await createTestPlan({ userId });
  const module = await createTestModule({ planId: plan.id });
  const task = await createTestTask({ moduleId: module.id });
  if (options.withContent) {
    await db.execute(sql`
      UPDATE ${tasks}
      SET "lesson_content" = ${JSON.stringify(LESSON_CONTENT)}::jsonb,
          "lesson_content_updated_at" = '2026-11-01 10:00:00.123456+00'
      WHERE ${tasks.id} = ${task.id}
    `);
  }
  const [row] = await db
    .select({ updatedAt: tasks.lessonContentUpdatedAt })
    .from(tasks)
    .where(eq(tasks.id, task.id));
  return {
    planId: plan.id,
    moduleId: module.id,
    taskId: task.id,
    version: row?.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

function putReport(lesson: Lesson, body: unknown) {
  const { planId, moduleId, taskId } = lesson;
  return PUT(
    new Request(
      `http://localhost/api/v1/plans/${planId}/modules/${moduleId}/tasks/${taskId}/problem-report`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    ),
    buildRouteHandlerContext({ planId, moduleId, taskId }),
  );
}

async function reportsFor(taskId: string) {
  return db
    .select()
    .from(lessonProblemReports)
    .where(eq(lessonProblemReports.taskId, taskId));
}

describe('PUT /api/v1/plans/:planId/modules/:moduleId/tasks/:taskId/problem-report', () => {
  const ownerAuthId = 'auth_lesson_report_owner';
  const otherAuthId = 'auth_lesson_report_other';
  let ownerUserId: string;
  let otherUserId: string;

  beforeEach(async () => {
    clearAllUserRateLimiters();
    mockServerSession(serverAuth.getSession, ownerAuthId);
    setTestUser(ownerAuthId);
    ownerUserId = await ensureUser({
      authUserId: ownerAuthId,
      email: 'lesson-report-owner@example.com',
    });
    otherUserId = await ensureUser({
      authUserId: otherAuthId,
      email: 'lesson-report-other@example.com',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearTestUser();
  });

  it('saves a report with the version the learner read', async () => {
    const lesson = await createLesson(ownerUserId);
    expect(lesson.version).toBe('2026-11-01T10:00:00.123Z');

    const res = await putReport(lesson, {
      reason: 'incorrect',
      note: '  Step 2 uses the wrong flag.  ',
      lessonContentUpdatedAt: lesson.version,
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string };
    const rows = await reportsFor(lesson.taskId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: body.id,
      userId: ownerUserId,
      planId: lesson.planId,
      moduleId: lesson.moduleId,
      reason: 'incorrect',
      note: 'Step 2 uses the wrong flag.',
    });
    // The task row's own value, microseconds included.
    const [stored] = await executeRows<{ same: boolean }>(
      db,
      sql`
      SELECT r."lesson_content_updated_at" = t."lesson_content_updated_at" AS same
      FROM ${lessonProblemReports} r JOIN ${tasks} t ON t."id" = r."task_id"
      WHERE r."task_id" = ${lesson.taskId}
    `,
    );
    expect(stored?.same).toBe(true);
  });

  it('replaces the earlier report in place', async () => {
    const lesson = await createLesson(ownerUserId);
    await putReport(lesson, {
      reason: 'incorrect',
      note: 'First note',
      lessonContentUpdatedAt: lesson.version,
    });
    const [first] = await reportsFor(lesson.taskId);

    const res = await putReport(lesson, {
      reason: 'unclear',
      note: '   ',
      lessonContentUpdatedAt: lesson.version,
    });

    expect(res.status).toBe(200);
    const rows = await reportsFor(lesson.taskId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: first!.id,
      reason: 'unclear',
      note: null,
      createdAt: first!.createdAt,
    });
    expect(rows[0]!.updatedAt.getTime()).toBeGreaterThan(
      first!.updatedAt.getTime(),
    );
  });

  it("rejects another user's lesson and writes nothing", async () => {
    const othersLesson = await createLesson(otherUserId);

    const res = await putReport(othersLesson, {
      reason: 'incorrect',
      lessonContentUpdatedAt: othersLesson.version,
    });

    expect(res.status).toBe(404);
    expect(await reportsFor(othersLesson.taskId)).toHaveLength(0);
  });

  it('rejects a lesson that is not in the module and plan in the path', async () => {
    const lesson = await createLesson(ownerUserId);
    const other = await createLesson(ownerUserId);

    const res = await putReport(
      { ...lesson, moduleId: other.moduleId },
      { reason: 'incorrect', lessonContentUpdatedAt: lesson.version },
    );

    expect(res.status).toBe(404);
    expect(await reportsFor(lesson.taskId)).toHaveLength(0);
  });

  it('rejects a lesson with no content yet', async () => {
    const lesson = await createLesson(ownerUserId, { withContent: false });

    const res = await putReport(lesson, {
      reason: 'incorrect',
      lessonContentUpdatedAt: null,
    });

    expect(res.status).toBe(404);
    expect(await reportsFor(lesson.taskId)).toHaveLength(0);
  });

  it('rejects a report on a lesson version that has since changed', async () => {
    const lesson = await createLesson(ownerUserId);

    const res = await putReport(lesson, {
      reason: 'incorrect',
      lessonContentUpdatedAt: '2026-10-01T10:00:00.000Z',
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: 'LESSON_CONTENT_CHANGED' });
    expect(await reportsFor(lesson.taskId)).toHaveLength(0);
  });

  it.each([
    ['missing', { lessonContentUpdatedAt: null }],
    ['unknown', { reason: 'boring', lessonContentUpdatedAt: null }],
  ])('rejects a %s reason with the reason field marker', async (_, body) => {
    const lesson = await createLesson(ownerUserId);

    const res = await putReport(lesson, {
      ...body,
      lessonContentUpdatedAt: lesson.version,
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ details: { field: 'reason' } });
    expect(await reportsFor(lesson.taskId)).toHaveLength(0);
  });

  it('rejects a note over 1,000 characters with the note field marker', async () => {
    const lesson = await createLesson(ownerUserId);

    const res = await putReport(lesson, {
      reason: 'other',
      note: 'x'.repeat(MAX_LESSON_PROBLEM_REPORT_NOTE_LENGTH + 1),
      lessonContentUpdatedAt: lesson.version,
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ details: { field: 'note' } });
    expect(await reportsFor(lesson.taskId)).toHaveLength(0);
  });

  it('accepts a note of exactly 1,000 characters', async () => {
    const lesson = await createLesson(ownerUserId);
    const note = 'x'.repeat(MAX_LESSON_PROBLEM_REPORT_NOTE_LENGTH);

    const res = await putReport(lesson, {
      reason: 'other',
      note,
      lessonContentUpdatedAt: lesson.version,
    });

    expect(res.status).toBe(200);
    const [row] = await reportsFor(lesson.taskId);
    expect(row?.note).toBe(note);
  });
});
