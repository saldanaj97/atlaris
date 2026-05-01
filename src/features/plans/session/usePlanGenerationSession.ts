'use client';

import { useCallback, useRef, useState } from 'react';

import { parseSsePlanEventLine } from '@/features/plans/session/parse-sse-plan-event';
import type { PlanGenerationSessionEvent } from '@/features/plans/session/session-events';
import { consumePlanGenerationSseStream } from '@/features/plans/session/stream-reader';
import type { CreateLearningPlanInput } from '@/features/plans/validation/learningPlans.types';
import { parseApiErrorResponse } from '@/lib/api/error-response';
import { clientLogger } from '@/lib/logging/client';

type SessionStatus =
  | 'idle'
  | 'connecting'
  | 'generating'
  | 'cancelled'
  | 'complete'
  | 'error';

type DraftModule = {
  index: number;
  title: string;
  description?: string | null;
  estimatedMinutes: number;
  tasksCount: number;
};

type SessionError = {
  message: string;
  classification: string;
  retryable: boolean;
};

type SessionProgress = {
  modulesParsed: number;
  modulesTotalHint?: number;
  percent: number;
};

export type PlanGenerationResult =
  | { status: 'cancelled'; planId?: string }
  | { status: 'completed'; planId: string; result: string };

class StreamingError extends Error {
  status?: number;
  planId?: string;
  data?: { planId?: string };
  code?: string;
  classification?: string;
  retryable?: boolean;

  constructor(params: {
    message: string;
    status?: number;
    planId?: string;
    code?: string;
    classification?: string;
    retryable?: boolean;
  }) {
    super(params.message);
    this.name = 'StreamingError';
    this.status = params.status;
    this.planId = params.planId;
    this.code = params.code;
    this.classification = params.classification;
    this.retryable = params.retryable;
    if (params.planId) {
      this.data = { planId: params.planId };
    }
  }
}

export type PlanGenerationSessionState = {
  status: SessionStatus;
  planId?: string;
  modules: DraftModule[];
  progress?: SessionProgress;
  error?: SessionError;
};

type StartPlanGenerationSessionRequest =
  | {
      kind: 'create';
      input: CreateLearningPlanInput;
    }
  | {
      kind: 'retry';
      planId: string;
    };

type StartPlanGenerationSessionOptions = {
  onPlanIdReady?: (planId: string) => void;
};

export type UsePlanGenerationSessionResult = {
  state: PlanGenerationSessionState;
  startSession: (
    request: StartPlanGenerationSessionRequest,
    options?: StartPlanGenerationSessionOptions,
  ) => Promise<PlanGenerationResult>;
  cancel: () => void;
};

const INITIAL_STATE: PlanGenerationSessionState = {
  status: 'idle',
  modules: [],
};

function createStreamingError(params: {
  message: string;
  status?: number;
  planId?: string;
  code?: string;
  classification?: string;
  retryable?: boolean;
}): StreamingError {
  return new StreamingError(params);
}

const parseEventLine = (line: string): PlanGenerationSessionEvent | null => {
  const event = parseSsePlanEventLine(line, {
    onValidationFailed: ({ issues, payload }) => {
      clientLogger.warn('Streaming event validation failed', {
        issues,
        raw: payload,
      });
    },
  });
  return event as PlanGenerationSessionEvent | null;
};

export function usePlanGenerationSession(): UsePlanGenerationSessionResult {
  const [state, setState] = useState<PlanGenerationSessionState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const startSession = useCallback(
    async (
      request: StartPlanGenerationSessionRequest,
      options?: StartPlanGenerationSessionOptions,
    ): Promise<PlanGenerationResult> => {
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

      let response: Response;
      try {
        response = await fetch(
          request.kind === 'create'
            ? '/api/v1/plans/stream'
            : `/api/v1/plans/${request.planId}/retry`,
          {
            method: 'POST',
            headers:
              request.kind === 'create'
                ? { 'Content-Type': 'application/json' }
                : undefined,
            body:
              request.kind === 'create'
                ? JSON.stringify(request.input)
                : undefined,
            signal: controller.signal,
            credentials: 'include',
          },
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          setState((prev) => ({
            ...prev,
            status: 'cancelled',
          }));
          return {
            status: 'cancelled',
            planId: request.kind === 'retry' ? request.planId : undefined,
          };
        }

        setState((prev) => ({
          ...prev,
          status: 'error',
          error: {
            message: 'Unable to start plan generation. Please try again.',
            classification: 'provider_error',
            retryable: true,
          },
        }));
        throw error;
      }

      if (!response.ok || !response.body) {
        const fallbackMessage =
          request.kind === 'create'
            ? 'Unable to start streaming plan generation.'
            : 'Failed to retry generation.';
        const parsedError = await parseApiErrorResponse(
          response,
          fallbackMessage,
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

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('text/event-stream')) {
        if (response.redirected) {
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

      return await new Promise<PlanGenerationResult>((resolve, reject) => {
        let completed = false;
        let errored = false;
        let outcomeSettled = false;
        let planIdNotified = false;
        let latestPlanId: string | undefined;
        let terminal = false;

        const resolveOutcome = (result: PlanGenerationResult) => {
          if (outcomeSettled) {
            return;
          }
          outcomeSettled = true;
          resolve(result);
        };

        const rejectOutcome = (error: Error) => {
          if (outcomeSettled) {
            return;
          }
          outcomeSettled = true;
          reject(error);
        };

        const notifyPlanId = (planId: string | undefined) => {
          if (planIdNotified || !planId) {
            return;
          }
          planIdNotified = true;
          options?.onPlanIdReady?.(planId);
        };

        const handleCancelled = (
          event: Extract<PlanGenerationSessionEvent, { type: 'cancelled' }>,
        ) => {
          latestPlanId = latestPlanId ?? event.data.planId;
          if (request.kind === 'retry') {
            setState((prev) => ({
              ...prev,
              status: 'cancelled',
              planId: prev.planId ?? latestPlanId,
              error: undefined,
            }));
            resolveOutcome({
              status: 'cancelled',
              planId: latestPlanId,
            });
            return;
          }

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
          rejectOutcome(cancelledErr);
        };

        const handleEvent = (event: PlanGenerationSessionEvent) => {
          if (outcomeSettled) {
            return;
          }
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
                  percent: event.data.percent,
                },
              }));
              break;
            case 'complete':
              completed = true;
              terminal = true;
              latestPlanId = latestPlanId ?? event.data.planId;
              notifyPlanId(latestPlanId);
              setState((prev) => ({
                ...prev,
                status: 'complete',
                planId: prev.planId ?? latestPlanId,
              }));
              if (latestPlanId) {
                resolveOutcome({
                  status: 'completed',
                  planId: latestPlanId,
                  result: latestPlanId,
                });
              } else {
                rejectOutcome(
                  new Error(
                    'Plan generation completed but no plan ID was received.',
                  ),
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
              rejectOutcome(streamErr);
              break;
            }
            case 'cancelled':
              terminal = true;
              handleCancelled(event);
              break;
          }
        };

        void consumePlanGenerationSseStream({
          body: response.body as ReadableStream<Uint8Array>,
          parseLine: parseEventLine,
          onEvent: handleEvent,
          shouldStop: () => terminal,
        })
          .then(() => {
            if (outcomeSettled) {
              return;
            }
            setState((prev) => ({
              ...prev,
              status:
                prev.status === 'complete' || prev.status === 'error'
                  ? prev.status
                  : 'error',
              error: prev.error ?? {
                message:
                  'Plan generation ended unexpectedly. Please try again.',
                classification: 'provider_error',
                retryable: true,
              },
            }));
            if (!completed && !errored) {
              rejectOutcome(
                new Error(
                  'Plan generation ended unexpectedly. Please try again.',
                ),
              );
            }
          })
          .catch((error: unknown) => {
            rejectOutcome(
              error instanceof Error
                ? error
                : new Error('Plan generation stream failed.'),
            );
          });
      });
    },
    [],
  );

  return {
    state,
    startSession,
    cancel,
  };
}
