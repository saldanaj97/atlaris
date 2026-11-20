import {
  LESSON_PROBLEM_REASONS,
  MAX_LESSON_PROBLEM_REPORT_NOTE_LENGTH,
} from '@supabase/schema/constants';
import { z } from 'zod';

export type LessonProblemReason = (typeof LESSON_PROBLEM_REASONS)[number];

export type LessonProblemReportField = 'reason' | 'note';

export const lessonProblemReportRequestSchema = z.object({
  reason: z.enum(LESSON_PROBLEM_REASONS),
  note: z
    .string()
    .trim()
    .max(MAX_LESSON_PROBLEM_REPORT_NOTE_LENGTH)
    .optional()
    .transform((note) => (note ? note : null)),
  lessonContentUpdatedAt: z.iso.datetime({ offset: true }).nullable(),
});

export type LessonProblemReportRequest = z.output<
  typeof lessonProblemReportRequestSchema
>;

export function lessonProblemReportErrorField(
  error: z.ZodError,
): LessonProblemReportField | undefined {
  const fields = new Set(error.issues.map((issue) => issue.path[0]));
  if (fields.has('reason')) {
    return 'reason';
  }
  if (fields.has('note')) {
    return 'note';
  }
  return undefined;
}
