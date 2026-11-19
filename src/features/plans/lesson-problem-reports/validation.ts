/**
 * Request contract for reporting a problem with a lesson (DEV-231).
 * Client-safe: the dialog reads the field names from here.
 */
import {
  LESSON_PROBLEM_REASONS,
  MAX_LESSON_PROBLEM_REPORT_NOTE_LENGTH,
} from '@supabase/schema/constants';
import { z } from 'zod';

export type LessonProblemReason = (typeof LESSON_PROBLEM_REASONS)[number];

/**
 * The form field a 400 response is about, sent as `details.field` so the
 * dialog can put the error on the right field.
 */
export type LessonProblemReportField = 'reason' | 'note';

export const lessonProblemReportRequestSchema = z.object({
  reason: z.enum(LESSON_PROBLEM_REASONS),
  /** Trimmed; an empty note is stored as null. */
  note: z
    .string()
    .trim()
    .max(MAX_LESSON_PROBLEM_REPORT_NOTE_LENGTH)
    .optional()
    .transform((note) => (note ? note : null)),
  /** The lesson version the learner read (`lesson_content_updated_at`). */
  lessonContentUpdatedAt: z.iso.datetime({ offset: true }).nullable(),
});

export type LessonProblemReportRequest = z.output<
  typeof lessonProblemReportRequestSchema
>;

/** The field a validation failure is about; reason wins when both fail. */
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
