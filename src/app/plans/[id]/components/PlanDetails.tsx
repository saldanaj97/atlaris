'use client';

import { PlanOverviewHeader } from '@/app/plans/[id]/components/PlanOverviewHeader';
import { PlanPendingState } from '@/app/plans/[id]/components/PlanPendingState';
import { PlanTimeline } from '@/app/plans/[id]/components/PlanTimeline';
import { useState } from 'react';

import type { ClientPlanDetail } from '@/lib/types/client';
import type { ProgressStatus } from '@/lib/types/db';

interface PlanDetailClientProps {
  plan: ClientPlanDetail;
}

/**
 * Renders the plan details view with a magazine-style layout.
 * Features a hero overview card and an interactive module timeline.
 */
export function PlanDetails({ plan }: PlanDetailClientProps) {
  const modules = plan.modules ?? [];
  const [statuses, setStatuses] = useState<Record<string, ProgressStatus>>(
    () => {
      const entries = modules.flatMap((mod) =>
        (mod.tasks ?? []).map((task) => [task.id, task.status] as const)
      );
      return Object.fromEntries(entries);
    }
  );

  const isPendingOrProcessing =
    plan.status === 'pending' || plan.status === 'processing';

  return (
    <div className="mx-auto min-h-screen max-w-7xl py-8">
      {isPendingOrProcessing ? (
        <PlanPendingState plan={plan} />
      ) : (
        <>
          {/* Hero Overview */}
          <PlanOverviewHeader plan={plan} statuses={statuses} />

          {/* Module Timeline */}
          <PlanTimeline
            planId={plan.id}
            modules={modules}
            statuses={statuses}
            setStatuses={setStatuses}
          />
        </>
      )}
    </div>
  );
}
