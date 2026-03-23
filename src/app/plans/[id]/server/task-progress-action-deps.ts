/**
 * Shared imports for plan task progress server actions (deduped for jscpd).
 */
export { withServerActionContext } from '@/lib/api/auth';
export { setTaskProgress, setTaskProgressBatch } from '@/lib/db/queries/tasks';
export { getDb } from '@/lib/db/runtime';
export { learningPlans, modules, tasks } from '@/lib/db/schema';
export { logger } from '@/lib/logging/logger';
export { PROGRESS_STATUSES } from '@/shared/types/db';
export type { ProgressStatus } from '@/shared/types/db.types';
