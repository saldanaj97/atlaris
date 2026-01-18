import { BookOpen, Calendar, Clock, Plus } from 'lucide-react';
import Link from 'next/link';
import { getEventTypeConfig, getRelativeTime } from './activity-utils';

import type { PlanSummary } from '@/lib/types/db';
import type { ScheduledEvent } from '../types';

interface ActivityStreamSidebarProps {
  activePlan?: PlanSummary;
  upcomingEvents?: ScheduledEvent[];
}

function UpcomingScheduleCard({ events }: { events: ScheduledEvent[] }) {
  return (
    <div className="dark:bg-card-background rounded-2xl border border-white/40 bg-black/5 p-5 shadow-lg backdrop-blur-xl dark:border-white/10">
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
        <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
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
                <div className="absolute top-8 left-[15px] h-[calc(100%+4px)] w-px bg-white/20 dark:bg-zinc-700" />
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

      {/* Action Buttons - Side by side when space allows */}
      <div className="mt-4 grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
        <Link
          href="/plans"
          className="flex items-center justify-center rounded-lg border border-white/20 bg-white/10 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-white/20 dark:text-zinc-400 dark:hover:bg-white/5"
        >
          View All Plans
        </Link>
        <Link
          href="/plans/new"
          className="from-primary to-accent hover:from-primary/90 hover:to-accent/90 flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r py-2 text-sm font-medium text-white shadow-md transition-all hover:shadow-lg"
        >
          <Plus className="h-4 w-4" />
          New Plan
        </Link>
      </div>
    </div>
  );
}

function EmptyStateCard() {
  return (
    <div className="dark:bg-card-background rounded-2xl border border-white/40 bg-black/5 p-5 shadow-lg backdrop-blur-xl dark:border-white/10">
      <div className="flex flex-col items-center py-6 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white/20 dark:bg-zinc-800">
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
  upcomingEvents = [],
}: ActivityStreamSidebarProps) {
  return (
    <aside className="flex w-full flex-col gap-4">
      {activePlan ? (
        <UpcomingScheduleCard events={upcomingEvents} />
      ) : (
        <EmptyStateCard />
      )}
    </aside>
  );
}
