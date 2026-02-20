import { z } from 'zod';

/**
 * Input data required to compute a schedule
 */
export interface ScheduleInputs {
  planId: string;
  tasks: Array<{
    id: string;
    title: string;
    estimatedMinutes: number;
    order: number;
    moduleId: string;
    // Optional display title for the module; not used for hashing
    moduleTitle?: string;
  }>;
  startDate: string; // ISO date string (YYYY-MM-DD)
  deadline: string | null; // ISO date string (YYYY-MM-DD)
  weeklyHours: number;
  timezone: string; // IANA timezone string
}

/**
 * A single task assignment within a session
 */
export interface SessionAssignment {
  taskId: string;
  taskTitle: string;
  estimatedMinutes: number;
  moduleId: string;
  moduleName: string;
}

/**
 * A day within a week containing scheduled sessions
 */
export interface Day {
  dayNumber: number; // Day number within the week (1-7)
  date: string; // ISO date string
  sessions: SessionAssignment[];
}

/**
 * A week milestone with day/session breakdowns
 */
export interface Week {
  weekNumber: number; // Week number starting from 1
  startDate: string; // ISO date string for week start
  endDate: string; // ISO date string for week end
  days: Day[];
}

/**
 * Complete schedule JSON structure (stored in plan_schedules.schedule_json)
 */
export interface ScheduleJson {
  weeks: Week[];
  totalWeeks: number;
  totalSessions: number;
}

/**
 * Cache metadata for schedule computation
 */
export interface ScheduleCacheRow {
  planId: string;
  scheduleJson: ScheduleJson;
  inputsHash: string;
  generatedAt: Date;
  timezone: string;
  weeklyHours: number;
  startDate: string; // ISO date string
  deadline: string | null; // ISO date string
}

/**
 * Zod schemas for runtime validation
 */
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
