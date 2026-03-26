'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type JSX, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { parseApiErrorResponse } from '@/lib/api/error-response';
import { isAbortError } from '@/lib/errors';
import { clientLogger } from '@/lib/logging/client';

import type {
  IntegrationCardProps,
  IntegrationStatus,
} from './IntegrationCard';
import { IntegrationCard } from './IntegrationCard';

type IntegrationDef = Omit<
  IntegrationCardProps,
  'status' | 'onConnect' | 'onDisconnect' | 'loading'
> & {
  id: string;
  provider?: string;
  defaultStatus: IntegrationStatus;
};

const INTEGRATIONS: IntegrationDef[] = [
  {
    id: 'google_calendar',
    provider: 'google_calendar',
    name: 'Google Calendar',
    icon: '📅',
    defaultStatus: 'available',
    description:
      'Automatically sync your learning schedule to Google Calendar. Get reminders for upcoming study sessions and keep your learning on track.',
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
    defaultStatus: 'available',
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
    defaultStatus: 'coming_soon',
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
    defaultStatus: 'coming_soon',
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
    defaultStatus: 'coming_soon',
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

type ConnectedProviders = Set<string>;

export function IntegrationGrid(): JSX.Element {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [connected, setConnected] = useState<ConnectedProviders>(new Set());
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [disconnectTarget, setDisconnectTarget] =
    useState<IntegrationDef | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/integrations/status');
      if (!res.ok) return;
      const data = (await res.json()) as {
        integrations: { provider: string; connected: boolean }[];
      };
      const providers = new Set(
        data.integrations.filter((i) => i.connected).map((i) => i.provider)
      );
      setConnected(providers);
    } catch {
      // Non-critical — cards fall back to default status
    }
  }, []);

  // Fetch integration status on mount
  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  // Handle OAuth redirect callback (?google=connected)
  useEffect(() => {
    if (searchParams.get('google') === 'connected') {
      toast.success('Google Calendar connected successfully');
      void fetchStatus();
      router.replace('/settings/integrations', { scroll: false });
    } else if (searchParams.get('error')) {
      toast.error(
        `Connection failed: ${searchParams.get('error_description') ?? 'Unknown error'}`
      );
      router.replace('/settings/integrations', { scroll: false });
    }
  }, [searchParams, fetchStatus, router]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleCsvExport = useCallback(() => {
    setLoadingId('csv_export');

    const link = document.createElement('a');
    link.href = '/api/v1/exports/csv';
    link.download = '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('CSV export started — check your downloads');
    setLoadingId(null);
  }, []);

  const handleConnect = useCallback(
    (integration: IntegrationDef) => {
      if (integration.id === 'csv_export') {
        handleCsvExport();
        return;
      }

      if (!integration.provider) return;

      // OAuth flow — redirect to backend which redirects to Google
      setLoadingId(integration.id);
      window.location.href = '/api/v1/auth/google';
    },
    [handleCsvExport]
  );

  const handleDisconnect = useCallback(async (integration: IntegrationDef) => {
    const { provider } = integration;
    if (!provider) return;

    setLoadingId(integration.id);
    setDisconnectTarget(null);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/v1/integrations/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const parsed = await parseApiErrorResponse(
          res,
          'Failed to disconnect integration'
        );
        toast.error(parsed.error);
        return;
      }

      setConnected((prev) => {
        const next = new Set(prev);
        next.delete(provider);
        return next;
      });
      toast.success(`${integration.name} disconnected`);
    } catch (error: unknown) {
      if (isAbortError(error)) return;
      const message =
        error instanceof Error ? error.message : 'Failed to disconnect';
      clientLogger.error('Integration disconnect failed', {
        integration: integration.id,
        error,
      });
      toast.error(message);
    } finally {
      setLoadingId(null);
    }
  }, []);

  function resolveStatus(def: IntegrationDef): IntegrationStatus {
    if (def.provider && connected.has(def.provider)) return 'connected';
    return def.defaultStatus;
  }

  return (
    <>
      <div className="grid gap-6 md:grid-cols-2">
        {INTEGRATIONS.map((def) => (
          <IntegrationCard
            key={def.id}
            name={def.name}
            description={def.description}
            icon={def.icon}
            features={def.features}
            status={resolveStatus(def)}
            loading={loadingId === def.id}
            onConnect={() => handleConnect(def)}
            onDisconnect={() => setDisconnectTarget(def)}
          />
        ))}
      </div>

      {/* Disconnect confirmation dialog */}
      <AlertDialog
        open={disconnectTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDisconnectTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Disconnect {disconnectTarget?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will revoke access and remove the connection. You can
              reconnect at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                if (disconnectTarget) {
                  void handleDisconnect(disconnectTarget);
                }
              }}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
