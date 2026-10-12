'use client';

import type { CreateLearningPlanInput } from '@/features/plans/validation/learningPlans.types';

import { parseApiErrorResponse } from '@/lib/api/error-response';
import { useCallback, useRef, useState } from 'react';

/**
 * `starting`: the create or retry request is in flight. `started`: the server
 * reserved an attempt and handed it to its runtime; the plan page polls
 * `GET /api/v1/plans/:planId/status` from here.
 */
type SessionStatus = 'idle' | 'starting' | 'started' | 'cancelled' | 'error';

type SessionError = {
  message: string;
  classification: string;
  retryable: boolean;
};

export type PlanGenerationResult =
  | { status: 'cancelled'; planId?: string }
  | { status: 'started'; planId: string; attemptId: string };

class PlanGenerationStartError extends Error {
  status?: number;
  planId?: string;
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
    this.name = 'PlanGenerationStartError';
    this.status = params.status;
    this.planId = params.planId;
    this.code = params.code;
    this.classification = params.classification;
    this.retryable = params.retryable;
  }
}

export type PlanGenerationSessionState = {
  status: SessionStatus;
  planId?: string;
  attemptId?: string;
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
  /** Called once the server accepts the attempt, before state updates. */
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
};

const UNEXPECTED_RESPONSE_MESSAGE =
  'Unexpected server response. Please try again.';

function readStarted(
  body: unknown,
): { planId: string; attemptId: string } | null {
  if (typeof body !== 'object' || body === null) {
    return null;
  }
  const { planId, attemptId } = body as Record<string, unknown>;
  return typeof planId === 'string' &&
    planId.length > 0 &&
    typeof attemptId === 'string' &&
    attemptId.length > 0
    ? { planId, attemptId }
    : null;
}

/** `details` of a not-started create or retry: the plan and retryability. */
function readStartFailureDetails(details: unknown): {
  planId?: string;
  retryable?: boolean;
} {
  if (typeof details !== 'object' || details === null) {
    return {};
  }
  const { planId, retryable } = details as Record<string, unknown>;
  return {
    ...(typeof planId === 'string' && planId.length > 0 ? { planId } : {}),
    ...(typeof retryable === 'boolean' ? { retryable } : {}),
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

/**
 * Starts plan generation for create (`POST /api/v1/plans`) or retry
 * (`POST /api/v1/plans/:planId/retry`). Both return `202 { planId, attemptId }`
 * once the attempt is reserved and handed to its runtime; generation runs in
 * the background and the plan page polls its status.
 */
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

      setState({ status: 'starting' });

      const fail = (error: PlanGenerationStartError): never => {
        setState((prev) => ({
          ...prev,
          status: 'error',
          planId: prev.planId ?? error.planId,
          error: {
            message: error.message,
            classification: error.classification ?? 'provider_error',
            retryable: error.retryable ?? false,
          },
        }));
        throw error;
      };

      let response: Response;
      try {
        response = await fetch(
          request.kind === 'create'
            ? '/api/v1/plans'
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

      if (!response.ok) {
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
        const details = readStartFailureDetails(parsedError.details);

        return fail(
          new PlanGenerationStartError({
            message: parsedError.error,
            status: response.status,
            code: parsedError.code,
            classification,
            planId: details.planId,
            retryable:
              details.retryable ??
              (classification === 'rate_limit' || classification === 'timeout'),
          }),
        );
      }

      const contentType = response.headers.get('content-type') ?? '';
      const started = contentType.includes('application/json')
        ? readStarted(await readJson(response))
        : null;

      if (!started) {
        if (response.redirected) {
          return fail(
            new PlanGenerationStartError({
              message: 'Please sign in to create a learning plan.',
              status: response.status,
              code: 'AUTH_REQUIRED',
              classification: 'auth_required',
              retryable: false,
            }),
          );
        }

        return fail(
          new PlanGenerationStartError({
            message: UNEXPECTED_RESPONSE_MESSAGE,
            status: response.status,
            code: 'INVALID_START_RESPONSE',
            classification: 'provider_error',
            retryable: false,
          }),
        );
      }

      options?.onPlanIdReady?.(started.planId);
      setState({
        status: 'started',
        planId: started.planId,
        attemptId: started.attemptId,
      });
      return { status: 'started', ...started };
    },
    [],
  );

  return {
    state,
    startSession,
    cancel,
  };
}
