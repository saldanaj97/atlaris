import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { PlanSummary } from '@/lib/types/db';
import { formatSkillLevel as baseFormatSkillLevel } from '@/lib/formatters';
import { Play } from 'lucide-react';
import Link from 'next/link';

function formatWeeklyHours(hours?: number | null) {
  if (!Number.isFinite(hours) || !hours || hours <= 0) {
    return 'Flexible weekly hours';
  }
  const label = hours === 1 ? 'hr' : 'hrs';
  return `${hours} ${label} / week`;
}

function formatDate(value?: Date | null) {
  if (!value) return 'Created recently';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(value);
  } catch {
    return 'Created recently';
  }
}

function formatSkillLevel(
  level: PlanSummary['plan']['skillLevel'] | null | undefined
) {
  if (!level) return 'Unknown';
  return baseFormatSkillLevel(level);
}

interface PlanCardProps {
  summary: PlanSummary;
}

function PlanCard({ summary }: PlanCardProps) {
  const { plan } = summary;
  const progressPercent = Math.round(summary.completion * 100);
  const isCompleted = progressPercent >= 100;
  const totalWeeks = summary.modules.length;
  const currentWeek = totalWeeks
    ? Math.min(totalWeeks, summary.completedModules + 1)
    : 0;
  const weeklyHoursLabel = formatWeeklyHours(plan.weeklyHours);
  const skillLevelLabel = formatSkillLevel(plan.skillLevel);
  const createdAtLabel = formatDate(plan.createdAt);

  return (
    <Card>
      <CardHeader>
        <div className="mb-1 flex items-center gap-3">
          <CardTitle className="text-2xl font-semibold">{plan.topic}</CardTitle>
          <Badge
            variant={isCompleted ? 'default' : 'secondary'}
            className="capitalize"
          >
            <span>{isCompleted ? 'completed' : 'active'}</span>
          </Badge>
        </div>
        <CardDescription className="flex flex-wrap items-center gap-3 text-sm">
          <span className="capitalize">{skillLevelLabel}</span>
          <span aria-hidden="true">•</span>
          <span>{weeklyHoursLabel}</span>
          <span aria-hidden="true">•</span>
          <span>{createdAtLabel}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">
        <p className="capitalize">Learning style: {plan.learningStyle}</p>

        <div className="mt-4 space-y-3">
          <div className="text-muted-foreground flex items-center justify-between text-sm">
            <span>
              Week {currentWeek || 1} of {totalWeeks || 1}
            </span>
            <span className="text-foreground font-medium">
              {progressPercent}%
            </span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>
      </CardContent>
      <CardFooter className="text-muted-foreground flex items-center justify-between border-t border-dashed pt-4 text-sm">
        <span>
          Completed tasks: {summary.completedTasks} / {summary.totalTasks}
        </span>
        <Button asChild size="sm">
          <Link href={`/plans/${plan.id}`}>
            <Play className="mr-2 h-4 w-4" />
            {isCompleted ? 'Review' : 'Continue'}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

interface PlansListProps {
  summaries: PlanSummary[];
}

export default function PlansList({ summaries }: PlansListProps) {
  return (
    <div className="grid gap-6">
      {summaries.map((summary) => (
        <PlanCard key={summary.plan.id} summary={summary} />
      ))}
    </div>
  );
}
