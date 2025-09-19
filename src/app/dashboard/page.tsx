import { getEffectiveClerkUserId } from '@/lib/api/auth';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  BookOpen,
  Clock,
  MoreHorizontal,
  Play,
  Plus,
  Target,
  TrendingUp,
} from 'lucide-react';

import { getPlanSummariesForUser, getUserByClerkId } from '@/lib/db/queries';

function formatWeeklyHours(hours: number) {
  if (!Number.isFinite(hours) || hours <= 0) {
    return 'Flexible hours';
  }
  return `${hours} hr${hours === 1 ? '' : 's'} / week`;
}

function formatDate(value?: Date | null) {
  if (!value) return '—';
  return value.toLocaleDateString();
}

export default async function DashboardPage() {
  const userId = await getEffectiveClerkUserId();
  if (!userId) redirect('/sign-in?redirect_url=/dashboard');

  const user = await getUserByClerkId(userId);
  if (!user) {
    redirect('/plans/new');
  }

  const summaries = await getPlanSummariesForUser(user.id);

  const completedPlans = summaries.filter(
    ({ completion }) => completion >= 1 - 1e-6
  );
  const activePlans = summaries.length - completedPlans.length;
  const totalHoursLearned = Math.round(
    summaries.reduce((sum, summary) => sum + summary.completedMinutes, 0) / 60
  );

  return (
    <div className="bg-gradient-subtle min-h-screen">
      <div className="container mx-auto px-6 py-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="mb-2 text-3xl font-bold">Welcome back!</h1>
            <p className="text-muted-foreground">
              Track your learning progress and continue your journey.
            </p>
          </div>
          <Button asChild>
            <Link href="/plans/new">
              <Plus className="mr-2 h-4 w-4" />
              Create New Plan
            </Link>
          </Button>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-4">
          <Card className="bg-gradient-card border-0 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">Total Plans</p>
                <p className="text-2xl font-bold">{summaries.length}</p>
              </div>
              <BookOpen className="text-primary/50 h-8 w-8" />
            </div>
          </Card>

          <Card className="bg-gradient-card border-0 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">Active Plans</p>
                <p className="text-learning-primary text-2xl font-bold">
                  {activePlans}
                </p>
              </div>
              <Target className="text-learning-primary/50 h-8 w-8" />
            </div>
          </Card>

          <Card className="bg-gradient-card border-0 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">Completed</p>
                <p className="text-learning-success text-2xl font-bold">
                  {completedPlans.length}
                </p>
              </div>
              <TrendingUp className="text-learning-success/50 h-8 w-8" />
            </div>
          </Card>

          <Card className="bg-gradient-card border-0 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">Hours Learned</p>
                <p className="text-2xl font-bold">{totalHoursLearned}h</p>
              </div>
              <Clock className="text-learning-secondary/50 h-8 w-8" />
            </div>
          </Card>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Your Learning Plans</h2>
            </div>

            <div className="space-y-4">
              {summaries.length === 0 ? (
                <Card className="bg-gradient-card text-muted-foreground border-0 p-6 text-center">
                  You do not have any learning plans yet. Create one to get
                  started.
                </Card>
              ) : (
                summaries.map((summary) => {
                  const progressPercent = Math.round(summary.completion * 100);
                  const isCompleted = progressPercent >= 100;
                  const totalWeeks = summary.modules.length;
                  const currentWeek = totalWeeks
                    ? Math.min(totalWeeks, summary.completedModules + 1)
                    : 0;

                  return (
                    <Card
                      key={summary.plan.id}
                      className="bg-gradient-card border-0 p-6 shadow-sm transition-all hover:shadow-md"
                    >
                      <div className="mb-4 flex items-start justify-between">
                        <div className="flex-1">
                          <div className="mb-2 flex items-center gap-3">
                            <h3 className="text-xl font-semibold">
                              {summary.plan.topic}
                            </h3>
                            <Badge
                              variant={isCompleted ? 'default' : 'secondary'}
                              className="capitalize"
                            >
                              {isCompleted ? 'completed' : 'active'}
                            </Badge>
                          </div>
                          <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-sm">
                            <span className="capitalize">
                              {summary.plan.skillLevel}
                            </span>
                            <span>•</span>
                            <span>
                              {formatWeeklyHours(summary.plan.weeklyHours)}
                            </span>
                            <span>•</span>
                            <span>
                              Created {formatDate(summary.plan.createdAt)}
                            </span>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" disabled>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="space-y-3">
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

                      <div className="text-muted-foreground mt-4 flex items-center justify-between border-t pt-4 text-sm">
                        <span>
                          Completed tasks: {summary.completedTasks} /{' '}
                          {summary.totalTasks}
                        </span>
                        <Button asChild size="sm">
                          <Link href={`/plans/${summary.plan.id}`}>
                            <Play className="mr-2 h-4 w-4" />
                            {isCompleted ? 'Review' : 'Continue'}
                          </Link>
                        </Button>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-6">
            <Card className="bg-gradient-card border-0 p-6 shadow-sm">
              <h3 className="mb-3 text-lg font-semibold">Keep Learning</h3>
              <p className="text-muted-foreground text-sm">
                Stay consistent by reserving time each week. Aim for at least{' '}
                {summaries.length
                  ? formatWeeklyHours(summaries[0].plan.weeklyHours)
                  : '2 hours'}
                .
              </p>
              <Button asChild className="mt-4 w-full">
                <Link href="/plans/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Generate New Plan
                </Link>
              </Button>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
