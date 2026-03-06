'use client';

import { useCallback, useMemo, useOptimistic } from 'react';

import { ExportButtons } from '@/app/plans/[id]/components/ExportButtons';
import { PlanOverviewHeader } from '@/app/plans/[id]/components/PlanOverviewHeader';
import { PlanPendingState } from '@/app/plans/[id]/components/PlanPendingState';
import { PlanTimeline } from '@/app/plans/[id]/components/PlanTimeline';
import { computeOverviewStats } from '@/app/plans/[id]/helpers';
import { DeletePlanDialog } from '@/app/plans/components/DeletePlanDialog';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Trash2 } from 'lucide-react';
import Link from 'next/link';

import type { ClientPlanDetail } from '@/lib/types/client';
import type { ProgressStatus } from '@/lib/types/db';

interface PlanDetailClientProps {
  plan: ClientPlanDetail;
}

/**
 * Client component that keeps header progress in sync with timeline status changes.
 */
export function PlanDetails({ plan }: PlanDetailClientProps) {
  const modules = plan.modules ?? [];
  const initialStatuses = Object.fromEntries(
    modules.flatMap((mod) =>
      (mod.tasks ?? []).map((task) => [task.id, task.status] as const)
    )
  );

  const [statuses, addOptimisticStatus] = useOptimistic(
    initialStatuses,
    (
      current: Record<string, ProgressStatus>,
      update: { taskId: string; status: ProgressStatus }
    ) => ({
      ...current,
      [update.taskId]: update.status,
    })
  );

  const overviewStats = useMemo(
    () => computeOverviewStats(plan, statuses),
    [plan, statuses]
  );

  const handleStatusChange = useCallback(
    (taskId: string, newStatus: ProgressStatus) => {
      addOptimisticStatus({ taskId, status: newStatus });
    },
    [addOptimisticStatus]
  );

  const isPendingOrProcessing =
    plan.status === 'pending' || plan.status === 'processing';

  const isGenerating = plan.status === 'processing';

  return (
    <div>
      <header className="mb-6 space-y-4">
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

        <div className="space-y-2">
          <h1 className="wrap-break-word">{plan.topic}</h1>
          <p className="subtitle">
            Track modules, update task progress, and keep your plan on schedule.
          </p>
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
