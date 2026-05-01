'use client';

import { ArrowLeft, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { type ReactElement, useCallback, useMemo } from 'react';
import { batchUpdateTaskProgressAction } from '@/app/(app)/plans/[id]/actions';
import { ExportButtons } from '@/app/(app)/plans/[id]/components/ExportButtons';
import { PlanOverviewHeader } from '@/app/(app)/plans/[id]/components/PlanOverviewHeader';
import { PlanPendingState } from '@/app/(app)/plans/[id]/components/PlanPendingState';
import { PlanTimeline } from '@/app/(app)/plans/[id]/components/PlanTimeline';
import {
  computeOverviewStats,
  getStatusesFromModules,
} from '@/app/(app)/plans/[id]/helpers';
import { useOptimisticTaskStatusUpdates } from '@/app/(app)/plans/[id]/hooks/useOptimisticTaskStatusUpdates';
import { DeletePlanDialog } from '@/app/(app)/plans/components/DeletePlanDialog';
import { Button } from '@/components/ui/button';
import { getLoggableErrorDetails } from '@/lib/errors';
import { clientLogger } from '@/lib/logging/client';

import type { ClientPlanDetail } from '@/shared/types/client.types';
import type { ProgressStatus } from '@/shared/types/db.types';

interface PlanDetailClientProps {
  plan: ClientPlanDetail;
}

/**
 * Client component that keeps header progress in sync with timeline status changes.
 */
export function PlanDetails({ plan }: PlanDetailClientProps): ReactElement {
  const modules = plan.modules;
  const initialStatuses = getStatusesFromModules(modules);

  const flushTaskProgress = useCallback(
    async (updates: Array<{ taskId: string; status: ProgressStatus }>) => {
      await batchUpdateTaskProgressAction({ planId: plan.id, updates });
    },
    [plan.id],
  );

  const handleTaskStatusError = useCallback(
    ({
      error,
      taskId,
      previousStatus,
      nextStatus,
    }: {
      error: unknown;
      taskId: string;
      previousStatus: ProgressStatus;
      nextStatus: ProgressStatus;
    }) => {
      const { errorMessage, errorStack } = getLoggableErrorDetails(error);
      clientLogger.error('Optimistic status revert', {
        errorMessage,
        errorStack,
        taskId,
        previousStatus,
        nextStatus,
      });
    },
    [],
  );

  const { statuses, handleStatusChange } = useOptimisticTaskStatusUpdates({
    initialStatuses,
    flushAction: flushTaskProgress,
    onError: handleTaskStatusError,
  });

  const overviewStats = useMemo(
    () => computeOverviewStats(plan, statuses),
    [plan, statuses],
  );

  const isPendingOrProcessing =
    plan.status === 'pending' || plan.status === 'processing';

  const isGenerating = isPendingOrProcessing;

  return (
    <div>
      <header className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard">
              <ArrowLeft size={16} aria-hidden="true" />
              Back to Dashboard
            </Link>
          </Button>

          <DeletePlanDialog
            planId={plan.id}
            planTopic={plan.topic}
            isGenerating={isGenerating}
            redirectTo="/plans"
          >
            <Button
              variant="ghost"
              size="sm"
              disabled={isGenerating}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
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

          <ExportButtons planId={plan.id} />

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
