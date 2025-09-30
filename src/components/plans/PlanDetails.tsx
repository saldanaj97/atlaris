'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { ClientPlanDetail } from '@/lib/types/client';
import type { ProgressStatus } from '@/lib/types/db';

import { PlanModuleCard } from '@/components/plans/PlanModuleCard';
import { PlanPendingState } from '@/components/plans/PlanPendingState';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { ExportButtons } from './ExportButtons';
import { PlanDetailsCard } from './PlanDetailsCard';

interface PlanDetailClientProps {
  plan: ClientPlanDetail;
  // DB-level status for finer-grained gating (e.g., 'generating')
  dbStatus?: 'pending' | 'generating' | 'failed' | 'ready';
  dbErrorMessage?: string;
  dbErrorCode?: string;
}

export default function PlanDetails({
  plan,
  dbStatus,
  dbErrorMessage,
  dbErrorCode,
}: PlanDetailClientProps) {
  const router = useRouter();
  const modules = plan.modules ?? [];
  const [statuses, setStatuses] = useState<Record<string, ProgressStatus>>(
    () => {
      const entries = modules.flatMap((module) =>
        (module.tasks ?? []).map((task) => [task.id, task.status] as const)
      );
      return Object.fromEntries(entries);
    }
  );

  const isPending = dbStatus === 'pending';
  const isGenerating = dbStatus === 'generating';
  const isFailed = dbStatus === 'failed';
  // const skeletonCount = isGenerating
  //   ? Math.max(1, plan.latestAttempt?.modulesCount ?? 3)
  //   : 0;

  // TODO: Add way to regenerate the plan or regenerate a module
  return (
    <div className="bg-gradient-subtle min-h-screen">
      <div className="container mx-auto max-w-6xl">
        <Button
          variant="ghost"
          onClick={() => router.push('/plans')}
          className="space-x-2"
        >
          <ArrowLeft className="m-4 h-4" />
          <p>Your Plans</p>
        </Button>

        <PlanDetailsCard plan={plan} modules={modules} statuses={statuses} />

        <ExportButtons />

        <section className="space-y-6">
          <h2 className="text-2xl font-bold">Learning Modules</h2>
          {isFailed ? (
            <PlanPendingState
              planId={plan.id}
              status="failed"
              errorMessage={dbErrorMessage}
              errorCode={dbErrorCode}
            />
          ) : isPending ? (
            <PlanPendingState
              planId={plan.id}
              status={dbStatus}
              errorMessage={dbErrorMessage}
              errorCode={dbErrorCode}
            />
          ) : isGenerating ? (
            <>
              {/* Show overall generation status above the modules list */}
              {/* TODO: When we stream module generation, consider showing per-module inlined progress instead of a single banner. */}
              <PlanPendingState
                planId={plan.id}
                status={dbStatus}
                errorMessage={dbErrorMessage}
                errorCode={dbErrorCode}
              />

              {/* TODO: Add skeleton loading state when the plan has been generating and starts to stream the modules to the user */}
              {/* {[...Array(skeletonCount)].map((_, i) => (
                <div
                  key={i}
                  className="bg-card rounded-lg border p-6 shadow-sm"
                >
                  <div className="bg-muted mb-4 h-6 w-2/3 animate-pulse rounded-md" />
                  <div className="space-y-3">
                    {[1, 2, 3].map((t) => (
                      <div key={t} className="flex items-center gap-3">
                        <div className="bg-muted h-4 w-4 flex-shrink-0 animate-pulse rounded border" />
                        <div className="bg-muted h-4 flex-1 animate-pulse rounded-md" />
                      </div>
                    ))}
                  </div>
                </div>
              ))} */}
            </>
          ) : modules.length === 0 ? (
            <Card className="text-muted-foreground p-6 text-center">
              No modules yet.
            </Card>
          ) : (
            modules.map((module) => (
              <PlanModuleCard
                key={module.id}
                planId={plan.id}
                module={module}
                statuses={statuses}
                setStatuses={setStatuses}
              />
            ))
          )}
        </section>
      </div>
    </div>
  );
}
