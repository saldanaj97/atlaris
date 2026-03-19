'use client';

import { useCallback, useRef, useState } from 'react';

import { StreamingEventSchema } from '@/features/ai/streaming/schema';
import type { StreamingEvent } from '@/features/ai/types/streaming.types';
import type { CreateLearningPlanInput } from '@/features/plans/validation/learningPlans.types';
import { parseApiErrorResponse } from '@/lib/api/error-response';
import { clientLogger } from '@/lib/logging/client';

type GenerationStatus =
  | 'idle'
  | 'connecting'
  | 'generating'
  | 'persisting'
  | 'complete'
  | 'error';

type DraftModule = {
  index: number;
  title: string;
  description?: string | null;
  estimatedMinutes: number;
  tasksCount: number;
};

type GenerationError = {
  message: string;
  classification: string;
  retryable: boolean;
};

type Progress = {
  modulesParsed: number;
  modulesTotalHint?: number;
};

export type StreamingPlanState = {
  status: GenerationStatus;
  planId?: string;
  modules: DraftModule[];
  progress?: Progress;
  error?: GenerationError;
};

/**
 * Extended Error type for streaming generation failures.
 * Includes optional HTTP status, planId, and code for error recovery flows.
 */
export type StreamingError = Error & {
  status?: number;
  planId?: string;
  data?: { planId?: string };
  code?: string;
  classification?: string;
  retryable?: boolean;
};

export function isStreamingError(error: unknown): error is StreamingError {
  if (error instanceof Error) {
    return true;
  }

  if (error === null || typeof error !== 'object') {
    return false;
  }

  return (
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}

const INITIAL_STATE: StreamingPlanState = {
  status: 'idle',
  modules: [],
};

const parseEventLine = (line: string): StreamingEvent | null => {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const payload = trimmed.startsWith('data:')
    ? trimmed.slice('data:'.length).trim()
    : trimmed;
  if (!payload) return null;
  try {
    const parsed: unknown = JSON.parse(payload);
    const result = StreamingEventSchema.safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    clientLogger.warn('Streaming event validation failed', {
      issues: result.error.issues,
      raw: payload,
    });
    return null;
  } catch {
    return null;
  }
};

export type StartGenerationOptions = {
  onPlanIdReady?: (planId: string) => void;
};

type StartGeneration = (
  input: CreateLearningPlanInput,
  options?: StartGenerationOptions
) => Promise<string>;

export interface UseStreamingPlanGenerationResult {
  state: StreamingPlanState;
  startGeneration: StartGeneration;
  cancel: () => void;
}

function createStreamingError(params: {
  message: string;
  status?: number;
  planId?: string;
  code?: string;
  classification?: string;
  retryable?: boolean;
}): StreamingError {
  const error = new Error(params.message) as StreamingError;
  error.status = params.status;
  error.planId = params.planId;
  error.code = params.code;
  error.classification = params.classification;
  error.retryable = params.retryable;
  if (params.planId) {
    error.data = { planId: params.planId };
  }
  return error;
}

export function useStreamingPlanGeneration(): UseStreamingPlanGenerationResult {
  const [state, setState] = useState<StreamingPlanState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const startGeneration = useCallback(
    async (
      input: CreateLearningPlanInput,
      options?: StartGenerationOptions
    ): Promise<string> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState({
        status: 'connecting',
        modules: [],
        progress: undefined,
        error: undefined,
        planId: undefined,
      });

      const response = await fetch('/api/v1/plans/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input),
        signal: controller.signal,
        credentials: 'include',
      });

      if (!response.ok || !response.body) {
        const fallbackMessage = 'Unable to start streaming plan generation.';
        const parsedError = await parseApiErrorResponse(
          response,
          fallbackMessage
        );
        const classification =
          parsedError.classification ??
          (response.status === 429 ? 'rate_limit' : 'provider_error');
        const retryable =
          classification === 'rate_limit' || classification === 'timeout';

        setState((prev) => ({
          ...prev,
          status: 'error',
          error: {
            message: parsedError.error,
            classification,
            retryable,
          },
        }));

        const error = createStreamingError({
          message: parsedError.error,
          status: response.status,
          code: parsedError.code,
          classification,
          retryable,
        });
        throw error;
      }

      // Guard against non-SSE responses (e.g. auth redirect followed to HTML)
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text/event-stream')) {
        const isAuthRedirect = response.redirected;

        if (isAuthRedirect) {
          const authError = createStreamingError({
            message: 'Please sign in to create a learning plan.',
            status: response.status,
            code: 'AUTH_REQUIRED',
            classification: 'auth_required',
            retryable: false,
          });
          setState((prev) => ({
            ...prev,
            status: 'error',
            error: {
              message: authError.message,
              classification: 'auth_required',
              retryable: false,
            },
          }));
          throw authError;
        }

        setState((prev) => ({
          ...prev,
          status: 'error',
          error: {
            message: 'Unexpected server response. Please try again.',
            classification: 'provider_error',
            retryable: false,
          },
        }));
        throw createStreamingError({
          message: 'Unexpected server response. Please try again.',
          status: response.status,
          code: 'INVALID_STREAM_RESPONSE',
          classification: 'provider_error',
          retryable: false,
        });
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      return await new Promise<string>((resolve, reject) => {
        let completed = false;
        let errored = false;
        let planIdNotified = false;
        let latestPlanId: string | undefined;
        let terminal = false;
        const notifyPlanId = (planId: string | undefined) => {
          if (planIdNotified || !planId) {
            return;
          }
          planIdNotified = true;
          options?.onPlanIdReady?.(planId);
        };

        const handleEvent = (event: StreamingEvent) => {
          switch (event.type) {
            case 'plan_start':
              latestPlanId = event.data.planId;
              notifyPlanId(latestPlanId);
              setState((prev) => ({
                ...prev,
                status: 'generating',
                planId: event.data.planId,
              }));
              break;
            case 'module_summary':
              latestPlanId = latestPlanId ?? event.data.planId;
              notifyPlanId(latestPlanId);
              setState((prev) => ({
                ...prev,
                status: 'generating',
                planId: prev.planId ?? latestPlanId,
                modules: [
                  ...prev.modules,
                  {
                    index: event.data.index,
                    title: event.data.title,
                    description: event.data.description,
                    estimatedMinutes: event.data.estimatedMinutes,
                    tasksCount: event.data.tasksCount,
                  },
                ],
              }));
              break;
            case 'progress':
              setState((prev) => ({
                ...prev,
                progress: {
                  modulesParsed: event.data.modulesParsed,
                  modulesTotalHint: event.data.modulesTotalHint,
                },
              }));
              break;
            case 'complete':
              completed = true;
              latestPlanId = latestPlanId ?? event.data.planId;
              notifyPlanId(latestPlanId);
              setState((prev) => ({
                ...prev,
                status: 'complete',
                planId: prev.planId ?? latestPlanId,
              }));
              if (latestPlanId) {
                resolve(latestPlanId);
              } else {
                reject(
                  new Error(
                    'Plan generation completed but no plan ID was received.'
                  )
                );
              }
              break;
            case 'error': {
              errored = true;
              terminal = true;
              const errorPlanId = event.data.planId ?? latestPlanId;
              setState((prev) => ({
                ...prev,
                status: 'error',
                planId: prev.planId ?? event.data.planId ?? latestPlanId,
                error: {
                  message: event.data.message,
                  classification: event.data.classification,
                  retryable: event.data.retryable,
                },
              }));
              const streamErr = createStreamingError({
                message:
                  event.data.message ||
                  'Plan generation failed. Please try again.',
                planId: errorPlanId ?? undefined,
                code: event.data.code,
                classification: event.data.classification,
                retryable: event.data.retryable,
              });
              reject(streamErr);
              break;
            }
            case 'cancelled': {
              errored = true;
              terminal = true;
              latestPlanId = latestPlanId ?? event.data.planId;
              setState((prev) => ({
                ...prev,
                status: 'error',
                planId: prev.planId ?? latestPlanId,
                error: {
                  message: event.data.message,
                  classification: event.data.classification,
                  retryable: event.data.retryable,
                },
              }));
              const cancelledErr = createStreamingError({
                message: event.data.message || 'Plan generation was cancelled.',
                planId: latestPlanId ?? undefined,
                classification: event.data.classification,
                retryable: event.data.retryable,
              });
              reject(cancelledErr);
              break;
            }
          }
        };

        const pump = async (): Promise<void> => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                // Flush any remaining bytes from the TextDecoder
                const remaining = decoder.decode();
                if (remaining) {
                  buffer += remaining;
                }
                if (buffer.trim()) {
                  const event = parseEventLine(buffer);
                  if (event) {
                    handleEvent(event);
                  }
                  buffer = '';
                }

                setState((prev) => ({
                  ...prev,
                  status:
                    prev.status === 'complete' || prev.status === 'error'
                      ? prev.status
                      : 'persisting',
                }));
                if (!completed && !errored) {
                  reject(
                    new Error(
                      'Plan generation ended unexpectedly. Please try again.'
                    )
                  );
                }
                return;
              }

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() ?? '';

              for (const line of lines) {
                const event = parseEventLine(line);
                if (event) {
                  handleEvent(event);
                  if (terminal) {
                    void reader.cancel();
                    return;
                  }
                }
              }
            }
          } catch (error) {
            reject(
              error instanceof Error
                ? error
                : new Error('Plan generation stream failed.')
            );
          }
        };

        void pump();
      });
    },
    []
  );

  return {
    state,
    startGeneration,
    cancel,
  };
}
