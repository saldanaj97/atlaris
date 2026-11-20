export const JOB_TYPE_MAP = {
  PLAN_REGENERATION: 'plan_regeneration',
} as const;

export const JOB_TYPE_VALUES = Object.values(JOB_TYPE_MAP) as [
  (typeof JOB_TYPE_MAP)[keyof typeof JOB_TYPE_MAP],
  ...(typeof JOB_TYPE_MAP)[keyof typeof JOB_TYPE_MAP][],
];

export type JobTypeValue = (typeof JOB_TYPE_MAP)[keyof typeof JOB_TYPE_MAP];
