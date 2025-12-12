'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { ScheduleJson } from '@/lib/scheduling/types';
import type { ClientPlanDetail } from '@/lib/types/client';
import type { ProgressStatus } from '@/lib/types/db';

import { PlanModuleCard } from '@/components/plans/PlanModuleCard';
import ScheduleWeekList from '@/components/plans/ScheduleWeekList';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Highlighter } from '@/components/ui/highlighter';
import { ArrowLeft } from 'lucide-react';
import { ExportButtons } from './ExportButtons';
import { PlanDetailsCard } from './PlanDetailsCard';
import { PlanPendingState } from './PlanPendingState';
import { RegenerateButton } from './RegenerateButton';

interface PlanDetailClientProps {
  plan: ClientPlanDetail;
  schedule: ScheduleJson;
}

/**
 * Renders the plan details view with modules and an optional learning schedule.
 *
 * @param plan - The client-facing plan data to display, including modules and overall status.
 * @param schedule - The schedule data used to render the learning schedule tab.
 * @returns The rendered PlanDetails UI containing navigation, plan summary, export controls, and tabbed Modules/Schedule content.
 */
export default function PlanDetails({ plan, schedule }: PlanDetailClientProps) {
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
        <Button
          variant="neutral"
          onClick={() => router.push('/dashboard')}
          className="mb-4 space-x-2"
        >
          <ArrowLeft className="m-4 h-4" />
          <p>Back to Dashboard</p>
        </Button>

        {isPendingOrProcessing ? (
          <PlanPendingState plan={plan} />
        ) : (
          <>
            <PlanDetailsCard
              plan={plan}
              modules={modules}
              statuses={statuses}
            />

            {/* TODO: Re-enable once Notion/Calendar integrations are ready */}
            <ExportButtons planId={plan.id} />

            {!isPendingOrProcessing && (
              <div className="mb-6">
                <RegenerateButton planId={plan.id} />
              </div>
            )}

            {/* View Toggle */}
            <div className="border-foreground mb-6 border-b">
              <nav className="flex space-x-8" role="tablist">
                <Button
                  type="button"
                  role="tab"
                  aria-selected={activeView === 'modules'}
                  onClick={() => setActiveView('modules')}
                  data-slot="tab"
                  className={`border-b-2 px-1 py-4 text-sm font-medium ${
                    activeView === 'modules'
                      ? 'border-primary text-primary'
                      : 'text-muted-foreground hover:border-border hover:text-foreground border-transparent'
                  }`}
                >
                  {activeView === 'modules' ? (
                    <Highlighter>Modules</Highlighter>
                  ) : (
                    'Modules'
                  )}
                </Button>
                <Button
                  type="button"
                  role="tab"
                  aria-selected={activeView === 'schedule'}
                  onClick={() => setActiveView('schedule')}
                  data-slot="tab"
                  className={`border-b-2 px-1 py-4 text-sm font-medium ${
                    activeView === 'schedule'
                      ? 'border-primary text-primary'
                      : 'text-muted-foreground hover:border-border hover:text-foreground border-transparent'
                  }`}
                >
                  {activeView === 'schedule' ? (
                    <Highlighter>Schedule</Highlighter>
                  ) : (
                    'Schedule'
                  )}
                </Button>
              </nav>
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
                <ScheduleWeekList schedule={schedule} />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
