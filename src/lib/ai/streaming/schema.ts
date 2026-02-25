import { z } from 'zod';

const planStartDataSchema = z.object({
  planId: z.string(),
  topic: z.string(),
  skillLevel: z.enum(['beginner', 'intermediate', 'advanced']),
  learningStyle: z.enum(['reading', 'video', 'practice', 'mixed']),
  weeklyHours: z.number(),
  startDate: z.string().nullable(),
  deadlineDate: z.string().nullable(),
  origin: z.enum(['ai', 'manual', 'template', 'pdf']).optional(),
});

const moduleSummaryDataSchema = z.object({
  planId: z.string(),
  index: z.number(),
  title: z.string(),
  description: z.string().nullable().optional(),
  estimatedMinutes: z.number(),
  tasksCount: z.number(),
});

const progressDataSchema = z.object({
  planId: z.string(),
  modulesParsed: z.number(),
  modulesTotalHint: z.number().optional(),
});

const completeDataSchema = z.object({
  planId: z.string(),
  modulesCount: z.number(),
  tasksCount: z.number(),
  durationMs: z.number(),
});

const errorDataSchema = z.object({
  planId: z.string().nullable().optional(),
  code: z.string(),
  message: z.string(),
  classification: z.string(),
  retryable: z.boolean(),
  requestId: z.string().optional(),
});

const cancelledDataSchema = z.object({
  planId: z.string(),
  message: z.string(),
  classification: z.literal('cancelled'),
  retryable: z.literal(true),
  requestId: z.string().optional(),
});

export const StreamingEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('plan_start'), data: planStartDataSchema }),
  z.object({
    type: z.literal('module_summary'),
    data: moduleSummaryDataSchema,
  }),
  z.object({ type: z.literal('progress'), data: progressDataSchema }),
  z.object({ type: z.literal('complete'), data: completeDataSchema }),
  z.object({ type: z.literal('error'), data: errorDataSchema }),
  z.object({ type: z.literal('cancelled'), data: cancelledDataSchema }),
]);

export type StreamingEventValidated = z.infer<typeof StreamingEventSchema>;
