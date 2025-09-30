'use client';

import { AlertCircle, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { startTransition, useEffect, useRef, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface PlanPendingStateProps {
  planId: string;
  status: 'pending' | 'generating' | 'failed';
  errorMessage?: string;
  errorCode?: string;
}

// Polling configuration
// Poll every 5 seconds, up to 2 times (10 seconds total) for local development
// In production, this can be adjusted as needed
const POLL_INTERVAL_MS = 5000; // 5 seconds
const MAX_POLLS = 2; // 10 seconds total (2 * 5 seconds)

export function PlanPendingState({
  planId,
  status,
  errorMessage,
  errorCode,
}: PlanPendingStateProps) {
  const router = useRouter();
  const [pollCount, setPollCount] = useState(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Only poll if status is pending or generating
    if (status !== 'pending' && status !== 'generating') {
      return;
    }

    // Start polling
    intervalRef.current = setInterval(() => {
      // Bump poll counter first
      setPollCount((prev) => {
        const next = prev + 1;
        if (next >= MAX_POLLS && intervalRef.current) {
          clearInterval(intervalRef.current);
        }
        return next;
      });

      // Trigger server component re-fetch outside of state updater
      // Use startTransition to avoid blocking and React warning
      startTransition(() => {
        router.refresh();
      });
    }, POLL_INTERVAL_MS);

    // Cleanup on unmount or status change
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [status, router, planId]);

  // Failed state UI
  if (status === 'failed') {
    return (
      <div className="container mx-auto max-w-5xl px-6 py-12">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Plan Generation Failed</AlertTitle>
          <AlertDescription>
            <div className="space-y-2">
              <p>
                {errorMessage ||
                  'We encountered an error while generating your learning plan.'}
              </p>
              {errorCode && (
                <p className="font-mono text-xs">Error code: {errorCode}</p>
              )}
              <p className="text-muted-foreground text-sm">
                You can try creating a new plan or contact support if the
                problem persists.
              </p>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Pending/Generating state UI
  return (
    <div className="container mx-auto max-w-5xl px-6 py-12">
      <div className="flex min-h-[400px] flex-col items-center justify-center space-y-4 text-center">
        <Loader2 className="text-primary h-12 w-12 animate-spin" />
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">
            Generating your learning plan...
          </h2>
          <p className="text-muted-foreground">
            This usually takes 30-60 seconds. We&apos;ll automatically update
            when it&apos;s ready.
          </p>
        </div>

        {pollCount >= MAX_POLLS && (
          <Alert variant="destructive" className="mt-6 max-w-md">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Taking longer than expected</AlertTitle>
            <AlertDescription>
              The generation is taking longer than usual. Please refresh the
              page manually or contact support if the issue persists.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
