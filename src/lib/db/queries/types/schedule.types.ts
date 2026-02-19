import type { ScheduleCacheRow } from '@/lib/scheduling/types';

export interface UpsertPlanScheduleCachePayload {
  scheduleJson: ScheduleCacheRow['scheduleJson'];
  inputsHash: string;
  timezone: string;
  weeklyHours: number;
  startDate: string;
  deadline: string | null;
}

export type PgErrorShape = {
  code?: string;
  message?: string;
};
