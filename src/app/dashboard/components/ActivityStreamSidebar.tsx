import { BookOpen, Calendar, Clock, Plus } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';
import { Activity } from 'react';
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
  'rounded-2xl border border-sidebar-border bg-sidebar p-5 text-sidebar-foreground shadow-lg backdrop-blur-xl';
const SIDEBAR_SECONDARY_TEXT_CLASS = 'text-sidebar-foreground/70';
const SIDEBAR_MUTED_TEXT_CLASS = 'text-sidebar-foreground/60';
const SIDEBAR_SECONDARY_ACTION_CLASS =
  'flex items-center justify-center rounded-lg border border-sidebar-border bg-sidebar py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground';
const SIDEBAR_PRIMARY_ACTION_CLASS =
  'bg-sidebar-primary hover:bg-sidebar-primary/90 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium text-sidebar-primary-foreground shadow-md transition-all hover:shadow-lg';

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
          <div className="bg-sidebar-primary text-sidebar-primary-foreground flex h-8 w-8 items-center justify-center rounded-lg">
            <Calendar className="h-4 w-4" />
          </div>
          <span
            className={`text-sm font-medium ${SIDEBAR_SECONDARY_TEXT_CLASS}`}
          >
            Upcoming Schedule
          </span>
        </div>
        <span className="bg-sidebar-accent text-sidebar-accent-foreground rounded-full px-2 py-0.5 text-xs font-medium">
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
                <div className="bg-sidebar-border absolute top-8 left-[15px] h-[calc(100%+4px)] w-px" />
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
                      <h4 className="text-sidebar-foreground truncate text-sm font-medium">
                        {event.title}
                      </h4>
                      {event.isUrgent && (
                        <span className="bg-sidebar-primary text-sidebar-primary-foreground shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium">
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
        <Link href="/plans" className={SIDEBAR_SECONDARY_ACTION_CLASS}>
          View All Plans
        </Link>
        <Link href="/plans/new" className={SIDEBAR_PRIMARY_ACTION_CLASS}>
          <Plus className="h-4 w-4" />
          New Plan
        </Link>
      </div>
    </div>
  );
}

function EmptyStateCard() {
  return (
    <div className={SIDEBAR_CARD_CLASS}>
      <div className="flex flex-col items-center py-6 text-center">
        <div className="bg-sidebar-accent text-sidebar-accent-foreground mb-4 flex h-12 w-12 items-center justify-center rounded-full">
          <BookOpen className="h-6 w-6" />
        </div>
        <h3 className="text-sidebar-foreground mb-2 font-medium">
          No active learning plan
        </h3>
        <p className={`mb-4 text-sm ${SIDEBAR_SECONDARY_TEXT_CLASS}`}>
          Create a new plan to start your learning journey
        </p>
        <Link
          href="/plans/new"
          className={`${SIDEBAR_PRIMARY_ACTION_CLASS} px-4`}
        >
          Create New Plan
        </Link>
      </div>
    </div>
  );
}

function NoUpcomingEventsCard() {
  return (
    <div className={SIDEBAR_CARD_CLASS}>
      <div className="flex flex-col items-center py-6 text-center">
        <div className="bg-sidebar-accent text-sidebar-accent-foreground mb-4 flex h-12 w-12 items-center justify-center rounded-full">
          <Calendar className="h-6 w-6" />
        </div>
        <h3 className="text-sidebar-foreground mb-2 font-medium">
          No upcoming events
        </h3>
        <p className={`mb-4 text-sm ${SIDEBAR_SECONDARY_TEXT_CLASS}`}>
          Add sessions to your active plan to keep learning momentum.
        </p>
        <Link href="/plans" className={`${SIDEBAR_PRIMARY_ACTION_CLASS} px-4`}>
          View Plans
        </Link>
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
