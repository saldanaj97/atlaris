import type { calendar_v3 } from 'googleapis';

/**
 * Narrowed interface for the Calendar events API used by our sync logic.
 */
export interface CalendarEventsApi {
  insert(params: {
    calendarId: string;
    requestBody: calendar_v3.Schema$Event;
  }): Promise<{ data: calendar_v3.Schema$Event }>;

  delete(params: { calendarId: string; eventId: string }): Promise<void>;
}

/**
 * Minimal calendar client surface used by syncPlanToGoogleCalendar.
 */
export interface GoogleCalendarClient {
  events: CalendarEventsApi;
}
