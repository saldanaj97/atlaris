import { z } from 'zod';

export const TOPIC_MAX_LENGTH = 200;
export const NOTES_MAX_LENGTH = 2000;

export const weeklyHoursSchema = z
  .number()
  .refine(Number.isFinite, {
    message: 'Weekly hours must be a finite number.',
  })
  .int('Weekly hours must be an integer.')
  .min(0, 'Weekly hours cannot be negative.')
  .max(80, 'Weekly hours cannot exceed 80.');
