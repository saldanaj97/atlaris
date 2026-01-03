'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
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
export function RegenerateButton({ planId }: RegenerateButtonProps) {
  const [loading, setLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleRegenerate = async () => {
    // Abort any in-flight request before starting a new one
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setLoading(true);
    try {
      const res = await fetch(`/api/v1/plans/${planId}/regenerate`, {
        method: 'POST',
        signal: abortControllerRef.current.signal,
      });
      if (!res.ok) {
        throw new Error('Failed to enqueue regeneration');
      }
      toast.success('Plan regeneration enqueued');
    } catch (error) {
      // Ignore abort errors (e.g., component unmounted or new request started)
      if ((error as Error).name === 'AbortError') return;
      clientLogger.error('Regeneration failed:', error);
      toast.error('Unable to enqueue regeneration');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      disabled={loading}
      onClick={() => {
        void handleRegenerate();
      }}
    >
      {loading ? 'Regenerating…' : 'Regenerate Plan'}
    </Button>
  );
}
