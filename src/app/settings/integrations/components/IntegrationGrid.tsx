'use client';

import { type JSX, useCallback, useState } from 'react';
import { toast } from 'sonner';

import { parseApiErrorResponse } from '@/lib/api/error-response';
import { clientLogger } from '@/lib/logging/client';

import type {
  IntegrationCardProps,
  IntegrationStatus,
} from './IntegrationCard';
import { IntegrationCard } from './IntegrationCard';

type IntegrationDef = Omit<IntegrationCardProps, 'onConnect' | 'loading'> & {
  id: string;
  status: IntegrationStatus;
};

const INTEGRATIONS: IntegrationDef[] = [
  {
    id: 'google_calendar',
    name: 'Google Calendar',
    icon: '📅',
    status: 'coming_soon',
    description:
      'Google Calendar integration is on hold for now. We will bring it back later with a cleaner, more deliberate implementation.',
    features: [
      'Auto-sync study sessions',
      'Smart reminders',
      'Time-block scheduling',
      'Calendar conflict detection',
    ],
  },
  {
    id: 'csv_export',
    name: 'CSV Export',
    icon: '📊',
    status: 'available',
    description:
      'Download your learning plans and progress data as CSV files for spreadsheet analysis or sharing.',
    features: [
      'Plan data export',
      'Progress history',
      'Custom date ranges',
      'Bulk export',
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    icon: '💬',
    status: 'coming_soon',
    description:
      'Get learning reminders and progress updates directly in your Slack workspace.',
    features: [
      'Daily learning reminders',
      'Progress notifications',
      'Team learning channels',
      'Bot commands',
    ],
  },
  {
    id: 'todoist',
    name: 'Todoist',
    icon: '✅',
    status: 'coming_soon',
    description:
      'Turn your learning tasks into Todoist tasks. Track study sessions alongside your daily to-dos.',
    features: [
      'Task sync',
      'Priority mapping',
      'Due date alignment',
      'Project organization',
    ],
  },
  {
    id: 'zapier',
    name: 'Zapier',
    icon: '⚡',
    status: 'coming_soon',
    description:
      'Connect Atlaris to 5,000+ apps through Zapier automations. Build custom workflows for your learning.',
    features: [
      '5,000+ app connections',
      'Custom triggers',
      'Multi-step workflows',
      'Webhook support',
    ],
  },
];

function getDownloadFilename(contentDisposition: string | null): string {
  const match = contentDisposition?.match(/filename="([^"]+)"/i);
  return match?.[1] ?? 'atlaris-export.csv';
}

export function IntegrationGrid(): JSX.Element {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleCsvExport = useCallback(async (): Promise<void> => {
    setLoadingId('csv_export');

    try {
      const res = await fetch('/api/v1/exports/csv');

      if (!res.ok) {
        const parsed = await parseApiErrorResponse(res, 'Failed to export CSV');
        clientLogger.error('CSV export request failed', {
          error: parsed.error,
          status: res.status,
        });
        toast.error(parsed.error);
        return;
      }

      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = downloadUrl;
      link.download = getDownloadFilename(
        res.headers.get('Content-Disposition')
      );
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);

      toast.success('CSV export downloaded successfully');
    } catch (error: unknown) {
      clientLogger.error('CSV export failed', { error });
      toast.error(
        error instanceof Error ? error.message : 'Failed to export CSV'
      );
    } finally {
      setLoadingId(null);
    }
  }, []);

  const handleConnect = useCallback(
    (integration: IntegrationDef) => {
      if (integration.id === 'csv_export') {
        void handleCsvExport();
      }
    },
    [handleCsvExport]
  );

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {INTEGRATIONS.map((def) => (
        <IntegrationCard
          key={def.id}
          name={def.name}
          description={def.description}
          icon={def.icon}
          features={def.features}
          status={def.status}
          loading={loadingId === def.id}
          onConnect={
            def.id === 'csv_export' ? () => handleConnect(def) : undefined
          }
        />
      ))}
    </div>
  );
}
