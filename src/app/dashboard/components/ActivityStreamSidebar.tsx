'use client';

import { PlanSummary } from '@/lib/types/db';
import { BookOpen, Calendar, Clock, Play } from 'lucide-react';
import Link from 'next/link';
import { ScheduledEvent } from '../types';
import {
  formatEstimatedTime,
  getEventTypeConfig,
  getRelativeTime,
} from './activity-utils';

interface ActivityStreamSidebarProps {
  activePlan?: PlanSummary;
  upcomingEvents?: ScheduledEvent[];
}

const mockScheduledEvents: ScheduledEvent[] = [
  {
    id: 'event-1',
    title: 'Continue current module',
    type: 'milestone',
    dateTime: new Date(Date.now() + 1000 * 60 * 60 * 3),
    duration: '30m',
    courseName: 'Current Learning Plan',
    isUrgent: true,
  },
  {
    id: 'event-2',
    title: 'Weekly review session',
    type: 'assignment',
    dateTime: new Date(Date.now() + 1000 * 60 * 60 * 24),
    courseName: 'Learning Goals',
  },
  {
    id: 'event-3',
    title: 'Progress checkpoint',
    type: 'quiz',
    dateTime: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2),
    duration: '15m',
    courseName: 'Self Assessment',
  },
];

function ContinueLearningCard({ plan }: { plan: PlanSummary }) {
  const progress = Math.round(plan.completion * 100);
  const currentModule =
    plan.modules.find((m, idx) => {
      const previousComplete = plan.modules
        .slice(0, idx)
        .every((prev) => prev.order <= m.order);
      return previousComplete && idx < plan.modules.length;
    }) ?? plan.modules[0];

  return (
    <div className="rounded-xl bg-gradient-to-b from-emerald-500 to-blue-500 p-5 shadow-sm">
      {/* Course Info */}
      <div>
        <h3 className="mb-1 text-base font-semibold text-white">
          {plan.plan.topic}
        </h3>
        <p className="mb-4 text-sm text-white/80">
          {currentModule?.title ?? 'Getting started'}
        </p>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="text-white">Progress</span>
          <span className="font-medium text-white">{progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Stats Row */}
      <div className="mb-4 flex items-center justify-between text-xs text-white/80">
        <span>
          {plan.completedModules} of {plan.modules.length} modules
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {formatEstimatedTime(plan.totalMinutes, plan.completedMinutes)}
        </span>
      </div>

      {/* Continue Button */}
      <Link
        href={`/plans/${plan.plan.id}`}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-white/20 px-4 py-2.5 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/30"
      >
        <Play className="h-4 w-4" />
        Continue Learning
      </Link>
    </div>
  );
}

function UpcomingScheduleCard({ events }: { events: ScheduledEvent[] }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/40">
            <Calendar className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Upcoming Schedule
          </span>
        </div>
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          {events.length} events
        </span>
      </div>

      {/* Events Timeline */}
      <div className="space-y-3">
        {events.map((event, index) => {
          const config = getEventTypeConfig(event.type);
          const Icon = config.icon;
          const isLast = index === events.length - 1;

          return (
            <div key={event.id} className="relative flex gap-3">
              {/* Timeline connector */}
              {!isLast && (
                <div className="absolute top-8 left-[15px] h-[calc(100%+4px)] w-px bg-zinc-200 dark:bg-zinc-700" />
              )}

              {/* Event Type Icon */}
              <div
                className={`relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border ${config.bgColor} ${config.borderColor}`}
              >
                <Icon className={`h-4 w-4 ${config.textColor}`} />
              </div>

              {/* Event Content */}
              <div className="min-w-0 flex-1 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {event.title}
                      </h4>
                      {event.isUrgent && (
                        <span className="flex-shrink-0 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-medium text-rose-600 dark:bg-rose-900/40 dark:text-rose-400">
                          Soon
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {event.courseName}
                    </p>
                  </div>
                </div>

                {/* Time & Duration */}
                <div className="mt-1.5 flex items-center gap-3">
                  <span className={`text-xs font-medium ${config.textColor}`}>
                    {getRelativeTime(event.dateTime)}
                  </span>
                  {event.duration && (
                    <span className="flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500">
                      <Clock className="h-3 w-3" />
                      {event.duration}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* View All Link */}
      <Link
        href="/plans"
        className="mt-4 block w-full rounded-lg border border-zinc-200 py-2 text-center text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        View All Plans
      </Link>
    </div>
  );
}

function EmptyStateCard() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col items-center py-6 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
          <BookOpen className="h-6 w-6 text-zinc-400" />
        </div>
        <h3 className="mb-2 font-medium text-zinc-900 dark:text-zinc-100">
          No active learning plan
        </h3>
        <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
          Create a new plan to start your learning journey
        </p>
        <Link
          href="/plans/new"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Create New Plan
        </Link>
      </div>
    </div>
  );
}

export function ActivityStreamSidebar({
  activePlan,
  upcomingEvents = mockScheduledEvents,
}: ActivityStreamSidebarProps) {
  return (
    <aside className="flex w-full flex-col gap-4">
      {activePlan ? (
        <ContinueLearningCard plan={activePlan} />
      ) : (
        <EmptyStateCard />
      )}
      <UpcomingScheduleCard events={upcomingEvents} />
    </aside>
  );
}
