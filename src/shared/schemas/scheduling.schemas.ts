import { z } from 'zod';

export const sessionAssignmentSchema = z.object({
  taskId: z.string(),
  taskTitle: z.string(),
  estimatedMinutes: z.number().int().min(1),
  moduleId: z.string(),
  moduleName: z.string(),
});

export const daySchema = z.object({
  dayNumber: z.number().int().min(1).max(7),
  date: z.string(), // ISO date string
  sessions: z.array(sessionAssignmentSchema),
});

export const weekSchema = z.object({
  weekNumber: z.number().int().min(1),
  startDate: z.string(), // ISO date string
  endDate: z.string(), // ISO date string
  days: z.array(daySchema),
});

export const scheduleJsonSchema = z.object({
  weeks: z.array(weekSchema),
  totalWeeks: z.number().int().min(0),
  totalSessions: z.number().int().min(0),
});
