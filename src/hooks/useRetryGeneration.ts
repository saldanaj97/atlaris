'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import { parseApiErrorResponse } from '@/lib/api/error-response';
import { clientLogger } from '@/lib/logging/client';
import { parseEventLine } from '@/lib/streaming/parse-event';

/** Runtime shape for SSE error event data (message and/or error key). */
const errorEventDataSchema = z
  .object({
    message: z.string().optional(),
    error: z.string().optional(),
  })
  .strict();

function getErrorMessage(raw: unknown): string {
  const parsed = errorEventDataSchema.safeParse(raw);
  if (parsed.success) {
    const m = parsed.data.message ?? parsed.data.error;
    if (m !== undefined) return m;
  }
  if (typeof raw === 'object' && raw !== null) {
    const o = raw as Record<string, unknown>;
    if (typeof o.message === 'string') return o.message;
    if (typeof o.error === 'string') return o.error;
  }
  if (raw instanceof Error && raw.message) return raw.message;
  if (
    typeof raw === 'string' ||
    typeof raw === 'number' ||
    typeof raw === 'boolean' ||
    typeof raw === 'bigint'
  ) {
    return `${raw}`;
  }
  return 'Generation failed.';
}

type RetryStatus = 'idle' | 'retrying' | 'success' | 'error';

interface UseRetryGenerationReturn {
  status: RetryStatus;
  error: string | null;
  isDisabled: boolean;
  retryGeneration: () => Promise<void>;
}

// Client-side debounce: minimum seconds between retry attempts
const RETRY_COOLDOWN_MS = 5000;

/**
 * Hook for retrying failed plan generation.
 *
 * Features:
 * - Client-side debounce (5s cooldown between retries)
 * - Server-side attempt limit check (handled by /api/v1/plans/[planId]/retry)
 * - Streaming response handling
 * - Auto-refresh on success
 *
 * @param planId - The ID of the plan to retry
 * @param maxAttempts - Maximum attempts allowed (for UI display, actual enforcement is server-side)
 * @param currentAttempts - Current number of attempts made
 */
export function useRetryGeneration(
  planId: string,
  maxAttempts: number,
  currentAttempts: number
): UseRetryGenerationReturn {
  const router = useRouter();
  const [status, setStatus] = useState<RetryStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [cooldownActive, setCooldownActive] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup cooldown timer and abort in-flight requests on unmount
  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  // Disable if already at max attempts, currently retrying, or in cooldown
  const isDisabled =
    status === 'retrying' || currentAttempts >= maxAttempts || cooldownActive;

  const retryGeneration = useCallback(async () => {
    // Prevent retry if cooldown is active
    if (cooldownActive) {
      return;
    }

    // Abort any existing request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Start cooldown
    setCooldownActive(true);

    // Clear any existing cooldown timer
    if (cooldownTimerRef.current) {
      clearTimeout(cooldownTimerRef.current);
    }

    // Set timer to end cooldown
    cooldownTimerRef.current = setTimeout(() => {
      setCooldownActive(false);
      cooldownTimerRef.current = null;
    }, RETRY_COOLDOWN_MS);

    setStatus('retrying');
    setError(null);

    try {
      const response = await fetch(`/api/v1/plans/${planId}/retry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      // Handle non-streaming error responses
      if (!response.ok || !response.body) {
        const parsedError = await parseApiErrorResponse(
          response,
          'Failed to retry generation.'
        );
        setStatus('error');
        setError(parsedError.error);
        return;
      }

      // Process streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const event = parseEventLine(line);
          if (!event) continue;

          if (event.type === 'complete') {
            setStatus('success');
            // Refresh the page to show the new content
            router.refresh();
            return;
          }

          if (event.type === 'error') {
            setStatus('error');
            setError(getErrorMessage(event.data as unknown));
            return;
          }

          if (event.type === 'cancelled') {
            setStatus('idle');
            setError(null);
            return;
          }
        }
      }

      // If we get here without a complete/error event, something went wrong
      setStatus('error');
      setError('Generation completed unexpectedly.');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setStatus('idle');
        return;
      }

      clientLogger.error('Retry generation failed:', err);
      setStatus('error');
      setError(
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred. Please try again.'
      );
    }
  }, [planId, router, cooldownActive]);

  return {
    status,
    error,
    isDisabled,
    retryGeneration,
  };
}
