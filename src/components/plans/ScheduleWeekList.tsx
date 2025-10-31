import React from 'react';
import type { ScheduleJson } from '@/lib/scheduling/types';
import { formatMinutes } from '@/lib/formatters';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

interface ScheduleWeekListProps {
  schedule: ScheduleJson;
}

/**
 * Render a week-by-week view of a schedule with days and sessions.
 *
 * Displays a Card for each week including the week's date range. Each day lists its sessions with the task title, a module badge, and the formatted estimated minutes. If the schedule has no weeks, renders a centered muted placeholder message.
 *
 * @param schedule - The schedule data to render
 * @returns A React element representing the structured schedule view
 */
export default function ScheduleWeekList({ schedule }: ScheduleWeekListProps) {
  if (schedule.weeks.length === 0) {
    return (
      <Card className="text-muted-foreground p-6 text-center">
        <p>No schedule available yet.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {schedule.weeks.map((week) => (
        <Card key={week.weekNumber} className="border-0 p-6 shadow-sm">
          {/* Week Header */}
          <div className="mb-4 border-b border-gray-200 pb-3">
            <h3 className="text-lg font-semibold text-gray-900">
              Week {week.weekNumber}
            </h3>
            <p className="text-muted-foreground text-sm">
              {week.startDate} – {week.endDate}
            </p>
          </div>

          {/* Days and Sessions */}
          <div className="space-y-4">
            {week.days.map((day) => (
              <div key={day.dayNumber} className="rounded-md bg-gray-50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-muted-foreground text-sm font-medium">
                    Day {day.dayNumber} – {day.date}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {day.sessions.length} session(s)
                  </span>
                </div>

                {/* Session Tasks */}
                <div className="space-y-2">
                  {day.sessions.map((session) => (
                    <div
                      key={session.taskId}
                      className="flex items-start justify-between rounded border border-gray-200 bg-white p-3"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">
                          {session.taskTitle}
                        </p>
                        <Badge className="mt-1 bg-blue-500/10 px-2 py-1 text-blue-800">
                          {session.moduleName}
                        </Badge>
                      </div>
                      <div className="ml-4 text-right">
                        <span className="text-muted-foreground text-sm font-semibold">
                          {formatMinutes(session.estimatedMinutes)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}