'use client';

import type { ClientPlanDetail } from '@/shared/types/client.types';
import type { ProgressStatus } from '@/shared/types/db.types';

import { batchUpdateTaskProgressAction } from '@/app/(app)/plans/[id]/actions';
import { PlanOverviewHeader } from '@/app/(app)/plans/[id]/components/PlanOverviewHeader';
import { PlanPendingState } from '@/app/(app)/plans/[id]/components/PlanPendingState';
import { PlanTimeline } from '@/app/(app)/plans/[id]/components/PlanTimeline';
import {
  computeOverviewStats,
  getStatusesFromModules,
} from '@/app/(app)/plans/[id]/helpers';
import { useOptimisticTaskStatusUpdates } from '@/app/(app)/plans/[id]/hooks/useOptimisticTaskStatusUpdates';
import { logTaskStatusError } from '@/app/(app)/plans/[id]/log-task-status-error';
import { DeletePlanDialog } from '@/app/(app)/plans/components/DeletePlanDialog';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { type ReactElement, useMemo } from 'react';
import { toast } from 'sonner';

interface PlanDetailClientProps {
  plan: ClientPlanDetail;
}

/**
 * Client component that keeps header progress in sync with timeline status changes.
 */
export function PlanDetails({ plan }: PlanDetailClientProps): ReactElement {
  const modules = plan.modules;
  const initialStatuses = getStatusesFromModules(modules);
  const scopedTaskIds = useMemo(
    () =>
      new Set(modules.flatMap((module) => module.tasks.map((task) => task.id))),
    [modules],
  );

  async function flushTaskProgress(
    updates: Array<{ taskId: string; status: ProgressStatus }>,
  ) {
    const result = await batchUpdateTaskProgressAction({
      planId: plan.id,
      updates,
    });
    if (result?.revalidateFailed) {
      toast.message('Progress saved. Refresh if the page looks stale.');
    }
  }

  const { statuses, handleStatusChange } = useOptimisticTaskStatusUpdates({
    initialStatuses,
    scopedTaskIds,
    flushAction: flushTaskProgress,
    onError: logTaskStatusError,
  });

  const overviewStats = computeOverviewStats(plan, statuses);

  const isPendingOrProcessing =
    plan.status === 'pending' || plan.status === 'processing';

  const isGenerating = isPendingOrProcessing;

  return (
    <div className='pb-12 md:pb-20'>
      <header className='mb-6'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <Button variant='ghost' size='sm' asChild>
            <Link href='/dashboard'>
              <ArrowLeft className='size-4' aria-hidden='true' />
              Back to Dashboard
            </Link>
          </Button>

          <DeletePlanDialog
            planId={plan.id}
            planTopic={plan.topic}
            isGenerating={isGenerating}
            redirectTo='/plans'
          >
            <Button
              variant='ghost'
              size='sm'
              disabled={isGenerating}
              className='text-muted-foreground hover:text-destructive'
            >
              <Trash2 className='mr-2 size-4' />
              Delete plan
            </Button>
          </DeletePlanDialog>
        </div>
      </header>

      {isPendingOrProcessing ? (
        <PlanPendingState plan={plan} />
      ) : (
        <>
          {/* Plan Overview */}
          <PlanOverviewHeader plan={plan} stats={overviewStats} />

          {/* Module Timeline */}
          <PlanTimeline
            planId={plan.id}
            modules={modules}
            statuses={statuses}
            onStatusChange={handleStatusChange}
          />
        </>
      )}
    </div>
  );
}
