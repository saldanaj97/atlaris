import { useMemo } from 'react';

import {
  formatLearningStyle,
  formatMinutes,
  formatSkillLevel,
  formatWeeklyHours,
} from '@/lib/formatters';

import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

import type { ClientModule, ClientPlanDetail } from '@/lib/types/client';
import type { ProgressStatus } from '@/lib/types/db';

interface PlanDetailsCardProps {
  plan: ClientPlanDetail;
  modules: ClientModule[];
  statuses: Record<string, ProgressStatus>;
}

export function PlanDetailsCard({
  plan,
  modules,
  statuses,
}: PlanDetailsCardProps) {
  const completedTasks = useMemo(
    () =>
      Object.values(statuses).filter((status) => status === 'completed').length,
    [statuses]
  );

  const totalTasks = useMemo(
    () =>
      modules.reduce((count, module) => count + (module.tasks?.length ?? 0), 0),
    [modules]
  );

  const totalMinutes = useMemo(
    () =>
      modules.reduce(
        (sum, module) =>
          sum +
          (module.tasks ?? []).reduce(
            (moduleSum, task) => moduleSum + (task.estimatedMinutes ?? 0),
            0
          ),
        0
      ),
    [modules]
  );

  const completion = totalTasks
    ? Math.round((completedTasks / totalTasks) * 100)
    : 0;

  const estimatedWeeks = plan.weeklyHours
    ? Math.ceil(totalMinutes / (plan.weeklyHours * 60))
    : null;

  return (
    <Card className="mb-6 p-6">
      <div className="grid gap-6 md:grid-cols-3">
        {/* Plan Info */}
        <div className="space-y-3 md:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            {plan.status && (
              <Badge
                variant={
                  plan.status === 'ready'
                    ? 'default'
                    : plan.status === 'failed'
                      ? 'destructive'
                      : 'secondary'
                }
                className="uppercase"
              >
                {plan.status}
              </Badge>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <CardTitle className="text-3xl font-bold">{plan.topic}</CardTitle>
            <Badge variant="default" className="uppercase">
              {formatSkillLevel(plan.skillLevel)}
            </Badge>
          </div>

          <CardDescription>
            Tailored for {formatSkillLevel(plan.skillLevel)} learners with a
            focus on {formatLearningStyle(plan.learningStyle)} activities.
            Commit {formatWeeklyHours(plan.weeklyHours)} per week to stay on
            track.
          </CardDescription>

          <div className="text-muted-foreground flex flex-wrap gap-4 text-sm">
            {plan.createdAt && (
              <span>
                Created {new Date(plan.createdAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {/* Progress Stats */}
        <div className="space-y-4">
          <div className="bg-primary/5 rounded-lg p-4 text-center">
            <div className="text-primary text-2xl font-bold">{completion}%</div>
            <div className="text-muted-foreground text-sm">Complete</div>
            <Progress value={completion} className="mt-2" />
          </div>

          <div className="grid grid-cols-2 gap-4 text-center text-sm">
            <div>
              <div className="text-lg font-semibold">{completedTasks}</div>
              <div className="text-muted-foreground">Completed Tasks</div>
            </div>
            <div>
              <div className="text-lg font-semibold">{totalTasks}</div>
              <div className="text-muted-foreground">Total Tasks</div>
            </div>
            <div>
              <div className="text-lg font-semibold">
                {formatMinutes(totalMinutes)}
              </div>
              <div className="text-muted-foreground">Total Effort</div>
            </div>
            <div>
              <div className="text-lg font-semibold">
                {estimatedWeeks
                  ? `${estimatedWeeks} week${estimatedWeeks === 1 ? '' : 's'}`
                  : '—'}
              </div>
              <div className="text-muted-foreground">Estimated Duration</div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
