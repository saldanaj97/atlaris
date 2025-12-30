'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { ScheduleJson } from '@/lib/scheduling/types';
import type { ClientPlanDetail } from '@/lib/types/client';
import type { ProgressStatus } from '@/lib/types/db';

import { PlanModuleCard } from '@/app/plans/components/PlanModuleCard';
import ScheduleWeekList from '@/app/plans/components/ScheduleWeekList';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { ExportButtons } from './ExportButtons';
import { PlanDetailsCard } from './PlanDetailsCard';
import { PlanPendingState } from './PlanPendingState';
import { RegenerateButton } from './RegenerateButton';

interface PlanDetailClientProps {
  plan: ClientPlanDetail;
  schedule: ScheduleJson | null;
  scheduleError?: string;
}

/**
 * Renders the plan details view with modules and an optional learning schedule.
 *
 * @param plan - The client-facing plan data to display, including modules and overall status.
 * @param schedule - The schedule data used to render the learning schedule tab, or null if unavailable.
 * @param scheduleError - Optional error message to display when schedule failed to load.
 * @returns The rendered PlanDetails UI containing navigation, plan summary, export controls, and tabbed Modules/Schedule content.
 */
export default function PlanDetails({
  plan,
  schedule,
  scheduleError,
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
  const [activeView, setActiveView] = useState<'modules' | 'schedule'>(
    'modules'
  );

  const isPendingOrProcessing =
    plan.status === 'pending' || plan.status === 'processing';

  return (
    <div className="min-h-screen">
      <div className="container mx-auto">
        {/* Navigation & Actions Bar */}
        <div className="mb-6 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => router.push('/dashboard')}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>

          {!isPendingOrProcessing && (
            <div className="flex items-center gap-2">
              <ExportButtons planId={plan.id} />
              <RegenerateButton planId={plan.id} />
            </div>
          )}
        </div>

        {isPendingOrProcessing ? (
          <PlanPendingState plan={plan} />
        ) : (
          <>
            <PlanDetailsCard
              plan={plan}
              modules={modules}
              statuses={statuses}
            />

            {/* View Toggle */}
            <div className="border-border mb-6 border-b">
              <div className="-mb-px flex gap-6" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeView === 'modules'}
                  onClick={() => setActiveView('modules')}
                  className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                    activeView === 'modules'
                      ? 'border-primary text-primary'
                      : 'text-muted-foreground hover:border-border hover:text-foreground border-transparent'
                  }`}
                >
                  Modules
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeView === 'schedule'}
                  onClick={() => setActiveView('schedule')}
                  className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                    activeView === 'schedule'
                      ? 'border-primary text-primary'
                      : 'text-muted-foreground hover:border-border hover:text-foreground border-transparent'
                  }`}
                >
                  Schedule
                </button>
              </div>
            </div>

            {/* Content */}
            {activeView === 'modules' && (
              <section className="space-y-6">
                <h2 className="text-2xl font-bold">Learning Modules</h2>
                {modules.length === 0 ? (
                  <Card className="text-muted-foreground p-6 text-center">
                    No modules yet. Generation will populate this plan soon.
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
            )}

            {activeView === 'schedule' && (
              <section className="space-y-6">
                <h2 className="text-2xl font-bold">Learning Schedule</h2>
                {scheduleError ? (
                  <Card className="border-destructive/50 bg-destructive/10 p-6 text-center">
                    <p className="text-destructive">{scheduleError}</p>
                  </Card>
                ) : schedule ? (
                  <ScheduleWeekList schedule={schedule} />
                ) : (
                  <Card className="text-muted-foreground p-6 text-center">
                    <p>No schedule available yet.</p>
                  </Card>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
