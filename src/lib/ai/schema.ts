import { z } from 'zod';

export const TaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  estimated_minutes: z.number().int().nonnegative(),
});

export const ModuleSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  estimated_minutes: z.number().int().nonnegative(),
  tasks: z.array(TaskSchema).min(1),
});

export const PlanSchema = z.object({
  modules: z.array(ModuleSchema).min(1),
});

export type PlanOutput = z.infer<typeof PlanSchema>;

