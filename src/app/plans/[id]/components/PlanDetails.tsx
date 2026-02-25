'use client';

import { useCallback, useMemo, useState } from 'react';

import { ExportButtons } from '@/app/plans/[id]/components/ExportButtons';
import { PlanOverviewHeader } from '@/app/plans/[id]/components/PlanOverviewHeader';
import { PlanPendingState } from '@/app/plans/[id]/components/PlanPendingState';
import { PlanTimeline } from '@/app/plans/[id]/components/PlanTimeline';
import { computeOverviewStats } from '@/app/plans/[id]/helpers';
import { ArrowLeft } from 'lucide-react';
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

  return (
    <div className="mx-auto min-h-screen max-w-7xl py-8">
      {/* Back to Dashboard Link */}
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-2 text-sm text-stone-500 transition-colors hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to Dashboard
      </Link>

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
