'use client';

import { type ReactElement, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { parseApiErrorResponse } from '@/lib/api/error-response';
import { isAbortError } from '@/lib/errors';
import { clientLogger } from '@/lib/logging/client';

interface RegenerateButtonProps {
  planId: string;
}

/**
 * Button component that triggers plan regeneration by calling the regeneration API.
 * Shows loading state while the request is in progress and displays toast notifications.
 *
 * @param planId - The ID of the plan to regenerate
 */
export function RegenerateButton({
  planId,
}: RegenerateButtonProps): ReactElement {
  const [loading, setLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleRegenerate = async (): Promise<void> => {
    // Abort any in-flight request before starting a new one
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    try {
      const res = await fetch(`/api/v1/plans/${planId}/regenerate`, {
        method: 'POST',
        signal: controller.signal,
      });

      if (!res.ok) {
        const parsedError = await parseApiErrorResponse(
          res,
          'Failed to enqueue regeneration'
        );
        throw new Error(parsedError.error);
      }

      toast.success('Plan regeneration enqueued');
    } catch (error: unknown) {
      // Ignore abort errors (e.g., component unmounted or new request started)
      if (isAbortError(error)) return;
      clientLogger.error('Regeneration failed', { planId, error });
      toast.error('Unable to enqueue regeneration');
    } finally {
      if (abortControllerRef.current === controller) {
        setLoading(false);
        abortControllerRef.current = null;
      }
    }
  };

  return (
    <Button disabled={loading} onClick={() => void handleRegenerate()}>
      {loading ? 'Regenerating…' : 'Regenerate Plan'}
    </Button>
  );
}
