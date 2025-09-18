'use client';

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

interface DashboardProps {
  onCreateNew: () => void;
  onViewPlan: (planId: string) => void;
}

// Mock user data - in real app this would come from backend
const mockPlans = [
  {
    id: '1',
    title: 'Swift for iOS Development',
    skillLevel: 'Beginner',
    progress: 45,
    totalWeeks: 6,
    currentWeek: 3,
    weeklyHours: '6-10 hours per week',
    createdAt: '2024-01-15',
    lastAccessed: '2 days ago',
    status: 'active',
  },
  {
    id: '2',
    title: 'Advanced Excel & Data Analysis',
    skillLevel: 'Intermediate',
    progress: 78,
    totalWeeks: 4,
    currentWeek: 4,
    weeklyHours: '3-5 hours per week',
    createdAt: '2024-01-01',
    lastAccessed: '1 week ago',
    status: 'active',
  },
  {
    id: '3',
    title: 'Digital Marketing Fundamentals',
    skillLevel: 'Beginner',
    progress: 100,
    totalWeeks: 8,
    currentWeek: 8,
    weeklyHours: '5-8 hours per week',
    createdAt: '2023-12-01',
    lastAccessed: '2 weeks ago',
    status: 'completed',
  },
];

const DashboardPage = ({ onCreateNew, onViewPlan }: DashboardProps) => {
  const stats = {
    totalPlans: mockPlans.length,
    activePlans: mockPlans.filter((p) => p.status === 'active').length,
    completedPlans: mockPlans.filter((p) => p.status === 'completed').length,
    totalHoursLearned: 127,
  };

  return (
    <div className="bg-gradient-subtle min-h-screen">
      <div className="container mx-auto px-6 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold">Welcome back!</h1>
          <p className="text-muted-foreground">
            Track your learning progress and continue your journey.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-4">
          <Card className="bg-gradient-card border-0 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">Total Plans</p>
                <p className="text-2xl font-bold">{stats.totalPlans}</p>
              </div>
              <BookOpen className="text-primary/50 h-8 w-8" />
            </div>
          </Card>

          <Card className="bg-gradient-card border-0 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">Active Plans</p>
                <p className="text-learning-primary text-2xl font-bold">
                  {stats.activePlans}
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
                  {stats.completedPlans}
                </p>
              </div>
              <TrendingUp className="text-learning-success/50 h-8 w-8" />
            </div>
          </Card>

          <Card className="bg-gradient-card border-0 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">Hours Learned</p>
                <p className="text-2xl font-bold">{stats.totalHoursLearned}h</p>
              </div>
              <Clock className="text-learning-secondary/50 h-8 w-8" />
            </div>
          </Card>
        </div>

        {/* Main Content */}
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Learning Plans */}
          <div className="space-y-6 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">Your Learning Plans</h2>
              <Button onClick={onCreateNew} variant="outline">
                <Plus className="mr-2 h-4 w-4" />
                Create New
              </Button>
            </div>

            <div className="space-y-4">
              {mockPlans.map((plan) => (
                <Card
                  key={plan.id}
                  className="bg-gradient-card cursor-pointer border-0 p-6 shadow-sm transition-all hover:shadow-md"
                >
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex-1">
                      <div className="mb-2 flex items-center gap-3">
                        <h3 className="text-xl font-semibold">{plan.title}</h3>
                        <Badge
                          variant={
                            plan.status === 'completed'
                              ? 'default'
                              : 'secondary'
                          }
                        >
                          {plan.status}
                        </Badge>
                      </div>
                      <div className="text-muted-foreground flex items-center gap-4 text-sm">
                        <span>{plan.skillLevel}</span>
                        <span>•</span>
                        <span>{plan.weeklyHours}</span>
                        <span>•</span>
                        <span>Last accessed {plan.lastAccessed}</span>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-sm">
                        Week {plan.currentWeek} of {plan.totalWeeks}
                      </span>
                      <span className="text-sm font-medium">
                        {plan.progress}%
                      </span>
                    </div>
                    <Progress value={plan.progress} className="h-2" />
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t pt-4">
                    <div className="text-muted-foreground text-sm">
                      Created {plan.createdAt}
                    </div>
                    <Button onClick={() => onViewPlan(plan.id)} size="sm">
                      <Play className="mr-2 h-4 w-4" />
                      {plan.status === 'completed' ? 'Review' : 'Continue'}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card className="bg-gradient-hero border-0 p-6 text-black">
              <h3 className="mb-4 text-lg font-semibold">
                Ready to Learn Something New?
              </h3>
              <p className="mb-4 text-sm text-black/90">
                Create a personalized learning path for any skill you want to
                master.
              </p>
              <Button
                onClick={onCreateNew}
                variant="secondary"
                className="text-primary w-full bg-white hover:bg-white/90"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create Learning Path
              </Button>
            </Card>

            {/* Recent Activity */}
            <Card className="bg-gradient-card border-0 p-6 shadow-sm">
              <h3 className="mb-4 font-semibold">Recent Activity</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <div className="bg-learning-success h-2 w-2 rounded-full"></div>
                  <span>Completed "UIKit Fundamentals" module</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="bg-learning-primary h-2 w-2 rounded-full"></div>
                  <span>Started Week 3 of Swift Development</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="bg-learning-secondary h-2 w-2 rounded-full"></div>
                  <span>Exported plan to Notion</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="bg-muted-foreground h-2 w-2 rounded-full"></div>
                  <span>Completed Excel course</span>
                </div>
              </div>
            </Card>

            {/* Tips */}
            <Card className="bg-gradient-card border-0 p-6 shadow-sm">
              <h3 className="mb-4 font-semibold">Learning Tips</h3>
              <div className="text-muted-foreground space-y-3 text-sm">
                <p>
                  💡 Set aside consistent time each day for better retention
                </p>
                <p>🎯 Focus on one module at a time to avoid overwhelm</p>
                <p>📅 Use the calendar export to block learning time</p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
