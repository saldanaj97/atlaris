'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { ClientPlanDetail } from '@/lib/types/client';
import type { ProgressStatus } from '@/lib/types/db';

import { PlanModuleCard } from '@/components/plans/PlanModuleCard';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { ExportButtons } from './ExportButtons';
import { PlanDetailsCard } from './PlanDetailsCard';

interface PlanDetailClientProps {
  plan: ClientPlanDetail;
}

export default function PlanDetails({ plan }: PlanDetailClientProps) {
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
      </div>
    </div>
  );
}
