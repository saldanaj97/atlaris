'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface ExportButtonsProps {
  planId: string;
}

interface ErrorResponse {
  error?: string;
  message?: string;
}

interface CalendarSyncResponse {
  eventsCreated: number;
}

export function ExportButtons({ planId }: ExportButtonsProps) {
  const [isExportingNotion, setIsExportingNotion] = useState(false);
  const [isExportingCalendar, setIsExportingCalendar] = useState(false);

  async function handleNotionExport() {
    setIsExportingNotion(true);

    try {
      const response = await fetch('/api/v1/integrations/notion/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });

      if (!response.ok) {
        const data = (await response.json()) as ErrorResponse;
        if (response.status === 403) {
          toast.error('Export limit reached', {
            description: data.message ?? 'Upgrade your plan to export more',
          });
        } else {
          toast.error(data.error ?? 'Export failed');
        }
        return;
      }

      toast.success('Exported to Notion', {
        description: 'Your learning plan is now in Notion!',
      });
    } catch (error) {
      console.error('Notion export error:', error);
      toast.error('Export failed', {
        description: 'An unknown error occurred during export',
      });
    } finally {
      setIsExportingNotion(false);
    }
  }

  async function handleCalendarSync() {
    setIsExportingCalendar(true);

    try {
      const response = await fetch(
        '/api/v1/integrations/google-calendar/sync',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId }),
        }
      );

      const data = (await response.json()) as
        | ErrorResponse
        | CalendarSyncResponse;

      if (!response.ok) {
        const errorData = data as ErrorResponse;
        if (response.status === 403) {
          toast.error('Sync limit reached', {
            description: errorData.message ?? 'Upgrade your plan to sync more',
          });
        } else {
          toast.error(errorData.error ?? 'Sync failed');
        }
        return;
      }

      const successData = data as CalendarSyncResponse;
      toast.success('Added to Google Calendar', {
        description: `${successData.eventsCreated} events created`,
      });
    } catch (error) {
      console.error('Calendar sync error:', error);
      toast.error('Sync failed', {
        description: 'An unknown error occurred during sync',
      });
    } finally {
      setIsExportingCalendar(false);
    }
  }

  return (
    <div className="flex gap-2">
      <Button
        variant="default"
        onClick={() => void handleNotionExport()}
        disabled={isExportingNotion}
      >
        {isExportingNotion ? 'Exporting…' : 'Export to Notion'}
      </Button>

      <Button
        variant="default"
        onClick={() => void handleCalendarSync()}
        disabled={isExportingCalendar}
      >
        {isExportingCalendar ? 'Syncing…' : 'Add to Google Calendar'}
      </Button>
    </div>
  );
}
