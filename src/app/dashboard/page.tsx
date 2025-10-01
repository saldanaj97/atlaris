import PlansList from '@/components/plans/PlansList';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { getEffectiveClerkUserId } from '@/lib/api/auth';
import { getPlanSummariesForUser } from '@/lib/db/queries/plans';
import { getUserByClerkId } from '@/lib/db/queries/users';
import { formatWeeklyHours } from '@/lib/formatters';
import { BookOpen, Clock, Plus, Target, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

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
                <PlansList summaries={summaries} />
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
