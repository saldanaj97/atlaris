'use client';

import { useCallback, useMemo, useState } from 'react';

import { ExportButtons } from '@/app/plans/[id]/components/ExportButtons';
import { PlanOverviewHeader } from '@/app/plans/[id]/components/PlanOverviewHeader';
import { PlanPendingState } from '@/app/plans/[id]/components/PlanPendingState';
import { PlanTimeline } from '@/app/plans/[id]/components/PlanTimeline';
import { DeletePlanDialog } from '@/app/plans/components/DeletePlanDialog';
import { computeOverviewStats } from '@/app/plans/[id]/helpers';
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

  const [statuses, setStatuses] =
    useState<Record<string, ProgressStatus>>(initialStatuses);

  const overviewStats = useMemo(
    () => computeOverviewStats(plan, statuses),
    [plan, statuses]
  );

  const handleStatusChange = useCallback(
    (taskId: string, newStatus: ProgressStatus) => {
      setStatuses((prev) => ({ ...prev, [taskId]: newStatus }));
    },
    []
  );

  const isPendingOrProcessing =
    plan.status === 'pending' || plan.status === 'processing';

  const isGenerating = plan.status === 'processing';

  return (
    <div className="mx-auto min-h-screen max-w-7xl py-8">
      {/* Navigation & Actions */}
      <div className="mb-6 flex items-center justify-between">
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

      {isPendingOrProcessing ? (
        <PlanPendingState plan={plan} />
      ) : (
        <>
          {/* Hero Overview */}
          <PlanOverviewHeader plan={plan} stats={overviewStats} />

          {/* Export Buttons */}
          <div className="mt-6">
            <ExportButtons planId={plan.id} />
          </div>

          {/* Module Timeline */}
          <PlanTimeline
            planId={plan.id}
            modules={modules}
            initialStatuses={initialStatuses}
            onStatusChange={handleStatusChange}
          />
        </>
      )}
    </div>
  );
}
