'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { StreamingEvent } from '@/lib/ai/streaming/types';
import { clientLogger } from '@/lib/logging/client';

type RetryStatus = 'idle' | 'retrying' | 'success' | 'error';

interface UseRetryGenerationReturn {
  status: RetryStatus;
  error: string | null;
  isDisabled: boolean;
  retryGeneration: () => Promise<void>;
}

// Client-side debounce: minimum seconds between retry attempts
const RETRY_COOLDOWN_MS = 5000;

const parseEventLine = (line: string): StreamingEvent | null => {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const payload = trimmed.startsWith('data:')
    ? trimmed.slice('data:'.length).trim()
    : trimmed;
  if (!payload) return null;
  try {
    const parsed: unknown = JSON.parse(payload);
    // Validate minimal event structure before casting
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'type' in parsed &&
      typeof parsed.type === 'string'
    ) {
      return parsed as StreamingEvent;
    }
    return null;
  } catch {
    return null;
  }
};

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
  const lastRetryRef = useRef<number>(0);
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
    lastRetryRef.current = Date.now();
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
        let message = 'Failed to retry generation.';
        try {
          const json = (await response.json()) as { error?: string };
          if (json?.error) {
            message = json.error;
          }
        } catch {
          // Use default message
        }
        setStatus('error');
        setError(message);
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
            // Defensive access for runtime safety
            const errorData = event.data as { message?: string } | undefined;
            setError(errorData?.message ?? 'Generation failed.');
            return;
          }
        }
      }

      // If we get here without a complete/error event, something went wrong
      setStatus('error');
      setError('Generation completed unexpectedly.');
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') {
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
