import { z } from 'zod';

import { LEARNING_STYLES, SKILL_LEVELS } from '@/shared/types/db';
import type { LearningStyle, SkillLevel } from '@/shared/types/db.types';

export const SKILL_LEVEL_ENUM = z.enum(
  SKILL_LEVELS as [SkillLevel, ...SkillLevel[]]
);
export const LEARNING_STYLE_ENUM = z.enum(
  LEARNING_STYLES as [LearningStyle, ...LearningStyle[]]
);

export const weeklyHoursSchema = z
  .number()
  .refine(Number.isFinite, {
    message: 'Weekly hours must be a finite number.',
  })
  .int('Weekly hours must be an integer.')
  .min(0, 'Weekly hours cannot be negative.')
  .max(80, 'Weekly hours cannot exceed 80.');
