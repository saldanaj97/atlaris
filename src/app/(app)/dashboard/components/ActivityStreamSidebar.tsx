import { BookOpen, Calendar, Clock, Plus } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';
import { Activity } from 'react';
import { Button } from '@/components/ui/button';
import type { PlanSummary } from '@/shared/types/db.types';
import type { ScheduledEvent } from '../types';
import { getActivityRelativeLabel, getEventTypeConfig } from './activity-utils';

interface ActivityStreamSidebarProps {
  activePlan?: PlanSummary;
  upcomingEvents?: readonly ScheduledEvent[];
  isVisible?: boolean;
}

const EMPTY_UPCOMING_EVENTS: readonly ScheduledEvent[] = [];
const SIDEBAR_CARD_CLASS =
  'rounded-2xl border border-sidebar-border bg-sidebar p-5 text-sidebar-foreground shadow-sm';
const SIDEBAR_SECONDARY_TEXT_CLASS = 'text-sidebar-foreground/70';
const SIDEBAR_MUTED_TEXT_CLASS = 'text-sidebar-foreground/60';

function UpcomingScheduleCard({
  events,
}: {
  events: readonly ScheduledEvent[];
}) {
  return (
    <div className={SIDEBAR_CARD_CLASS}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Calendar className="h-4 w-4" />
          </div>
          <span
            className={`text-sm font-medium ${SIDEBAR_SECONDARY_TEXT_CLASS}`}
          >
            Upcoming Schedule
          </span>
        </div>
        <span className="rounded-full bg-sidebar-accent px-2 py-0.5 text-xs font-medium text-sidebar-accent-foreground">
          {events.length} {events.length === 1 ? 'event' : 'events'}
        </span>
      </div>

      {/* Events Timeline */}
      <div className="space-y-3">
        {events.map((event, index) => {
          const config = getEventTypeConfig(event.type);
          const Icon = config.icon;
          const isLast = index === events.length - 1;
          const eventIconClass = event.isUrgent
            ? 'border-sidebar-border bg-sidebar-primary text-sidebar-primary-foreground'
            : 'border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground';
          const relativeTimeClass = event.isUrgent
            ? 'text-sidebar-primary'
            : SIDEBAR_SECONDARY_TEXT_CLASS;

          return (
            <div key={event.id} className="relative flex gap-3">
              {/* Timeline connector */}
              {!isLast && (
                <div className="absolute top-8 left-[15px] h-[calc(100%+4px)] w-px bg-sidebar-border" />
              )}

              {/* Event Type Icon */}
              <div
                className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${eventIconClass}`}
              >
                <Icon className="h-4 w-4" />
              </div>

              {/* Event Content */}
              <div className="min-w-0 flex-1 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="truncate text-sm font-medium text-sidebar-foreground">
                        {event.title}
                      </h4>
                      {event.isUrgent && (
                        <span className="shrink-0 rounded-full bg-sidebar-primary px-1.5 py-0.5 text-[10px] font-medium text-sidebar-primary-foreground">
                          Soon
                        </span>
                      )}
                    </div>
                    <p
                      className={`mt-0.5 truncate text-xs ${SIDEBAR_SECONDARY_TEXT_CLASS}`}
                    >
                      {event.courseName}
                    </p>
                  </div>
                </div>

                {/* Time & Duration */}
                <div className="mt-1.5 flex items-center gap-3">
                  <span className={`text-xs font-medium ${relativeTimeClass}`}>
                    {getActivityRelativeLabel(event.dateTime)}
                  </span>
                  {event.duration && (
                    <span
                      className={`flex items-center gap-1 text-xs ${SIDEBAR_MUTED_TEXT_CLASS}`}
                    >
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
        <Button asChild variant="outline" className="bg-sidebar">
          <Link href="/plans">View All Plans</Link>
        </Button>
        <Button asChild>
          <Link href="/plans/new">
            <Plus className="h-4 w-4" />
            New Plan
          </Link>
        </Button>
      </div>
    </div>
  );
}

function EmptyStateCard() {
  return (
    <div className={SIDEBAR_CARD_CLASS}>
      <div className="flex flex-col items-center py-6 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-accent-foreground">
          <BookOpen className="h-6 w-6" />
        </div>
        <h3 className="mb-2 font-medium text-sidebar-foreground">
          No active learning plan
        </h3>
        <p className={`mb-4 text-sm ${SIDEBAR_SECONDARY_TEXT_CLASS}`}>
          Create a new plan to start your learning journey
        </p>
        <Button asChild>
          <Link href="/plans/new">Create New Plan</Link>
        </Button>
      </div>
    </div>
  );
}

function NoUpcomingEventsCard() {
  return (
    <div className={SIDEBAR_CARD_CLASS}>
      <div className="flex flex-col items-center py-6 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-accent-foreground">
          <Calendar className="h-6 w-6" />
        </div>
        <h3 className="mb-2 font-medium text-sidebar-foreground">
          No upcoming events
        </h3>
        <p className={`mb-4 text-sm ${SIDEBAR_SECONDARY_TEXT_CLASS}`}>
          Add sessions to your active plan to keep learning momentum.
        </p>
        <Button asChild>
          <Link href="/plans">View Plans</Link>
        </Button>
      </div>
    </div>
  );
}

export function ActivityStreamSidebar({
  activePlan,
  upcomingEvents = EMPTY_UPCOMING_EVENTS,
  isVisible = true,
}: ActivityStreamSidebarProps): JSX.Element {
  const activityMode: 'visible' | 'hidden' = isVisible ? 'visible' : 'hidden';
  const hasUpcomingEvents = upcomingEvents.length > 0;

  return (
    <Activity mode={activityMode}>
      <aside className="flex w-full flex-col gap-4">
        {!activePlan ? (
          <EmptyStateCard />
        ) : hasUpcomingEvents ? (
          <UpcomingScheduleCard events={upcomingEvents} />
        ) : (
          <NoUpcomingEventsCard />
        )}
      </aside>
    </Activity>
  );
}
