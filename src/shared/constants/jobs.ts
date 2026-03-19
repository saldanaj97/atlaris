/**
 * Single source of truth for job type values.
 * This mapping is used to define both the database enum and runtime validation.
 */

export const JOB_TYPE_MAP = {
  // Reserved for a future async initial-generation pipeline. Initial plan
  // generation is not using a job queue today; it is handled by the streaming route.
  PLAN_GENERATION: 'plan_generation',
  PLAN_REGENERATION: 'plan_regeneration',
} as const;

export const JOB_TYPE_VALUES = Object.values(JOB_TYPE_MAP) as [
  (typeof JOB_TYPE_MAP)[keyof typeof JOB_TYPE_MAP],
  ...(typeof JOB_TYPE_MAP)[keyof typeof JOB_TYPE_MAP][],
];

export type JobTypeValue = (typeof JOB_TYPE_MAP)[keyof typeof JOB_TYPE_MAP];
