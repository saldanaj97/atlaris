import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatMinutes } from '@/features/plans/formatters';
import type { ScheduleJson } from '@/shared/types/scheduling.types';

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
export function ScheduleWeekList({ schedule }: ScheduleWeekListProps) {
  if (schedule.weeks.length === 0) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        <p>No schedule available yet.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {schedule.weeks.map((week) => (
        <Card key={week.weekNumber} className="p-6">
          {/* Week Header */}
          <div className="mb-4 border-b border-border pb-3">
            <h3 className="text-lg font-semibold text-foreground">
              Week {week.weekNumber}
            </h3>
            <p className="text-sm text-muted-foreground">
              {week.startDate} – {week.endDate}
            </p>
          </div>

          {/* Days and Sessions */}
          <div className="space-y-4">
            {week.days.map((day) => (
              <div
                key={day.dayNumber}
                className="bg-secondary-background rounded-md p-4"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">
                    Day {day.dayNumber} – {day.date}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {day.sessions.length} session(s)
                  </span>
                </div>

                {/* Session Tasks */}
                <div className="space-y-2">
                  {day.sessions.map((session) => (
                    <div
                      key={session.taskId}
                      className="flex items-start justify-between rounded border border-border bg-card p-3"
                    >
                      <div className="flex-1">
                        <p className="font-medium text-foreground">
                          {session.taskTitle}
                        </p>
                        <Badge className="mt-1 bg-blue-500/10 px-2 py-1 text-blue-800">
                          {session.moduleName}
                        </Badge>
                      </div>
                      <div className="ml-4 text-right">
                        <span className="text-sm font-semibold text-muted-foreground">
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
