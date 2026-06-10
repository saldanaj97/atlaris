import type { PlanStatus } from '@/shared/types/client.types';

import {
  createInitialPlanPollState,
  shouldContinuePolling,
  transitionPlanPollState,
  type PlanPollState,
} from './plan-status-machine';
import { parseApiErrorResponse } from '@/lib/api/error-response';
import { clientLogger } from '@/lib/logging/client';
import {
  INITIAL_POLL_MS,
  PLAN_STATUS_FETCH_TIMEOUT_MS,
} from '@/shared/constants/polling';
import { PlanStatusResponseSchema } from '@/shared/schemas/plan-status';
import { ZodError } from 'zod';

function isRetriableFromResponse(status: number): boolean {
  return status === 429 || status >= 500;
}

class RetriableError extends Error {
  constructor(
    message: string,
    public readonly isRetriable: boolean,
  ) {
    super(message);
    this.name = 'RetriableError';
  }
}

export interface PlanStatusPollerConfig {
  planId: string;
  initialStatus: PlanStatus;
  fetcher?: typeof fetch;
  randomFn?: () => number;
  fetchTimeoutMs?: number;
}

export interface PlanStatusSnapshot {
  status: PlanStatus;
  attempts: number;
  error: string | null;
  pollingError: string | null;
  isPolling: boolean;
}

export class PlanStatusPoller {
  private state: PlanPollState;
  private snapshot: PlanStatusSnapshot;
  private listeners = new Set<() => void>();
  private pollTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private inFlightFetch: Promise<void> | null = null;
  private pollingToken = 0;
  private cancelled = false;
  private started = false;
  private readonly fetcher: typeof fetch;
  private readonly randomFn: () => number;
  private readonly fetchTimeoutMs: number;

  constructor({
    planId,
    initialStatus,
    fetcher = fetch,
    randomFn = Math.random,
    fetchTimeoutMs = PLAN_STATUS_FETCH_TIMEOUT_MS,
  }: PlanStatusPollerConfig) {
    this.fetcher = fetcher;
    this.randomFn = randomFn;
    this.fetchTimeoutMs = fetchTimeoutMs;
    this.state = createInitialPlanPollState(planId, initialStatus);
    this.snapshot = this.buildSnapshot(this.state);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): PlanStatusSnapshot => this.snapshot;

  private buildSnapshot(state: PlanPollState): PlanStatusSnapshot {
    return {
      status: state.status,
      attempts: state.attempts,
      error: state.error,
      pollingError: state.pollingError,
      isPolling: state.phase === 'polling',
    };
  }

  private syncSnapshot(): void {
    this.snapshot = this.buildSnapshot(this.state);
  }

  revalidate = async (): Promise<void> => {
    this.state = transitionPlanPollState(this.state, { type: 'revalidate' });
    this.syncSnapshot();
    this.emit();
    if (shouldContinuePolling(this.state)) {
      this.clearScheduledPoll();
      const token = this.pollingToken;
      await this.fetchOnce('immediate');
      if (
        token !== this.pollingToken ||
        this.cancelled ||
        !shouldContinuePolling(this.state)
      ) {
        return;
      }
      this.scheduleNextPoll();
    }
  };

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.cancelled = false;

    if (!shouldContinuePolling(this.state)) {
      return;
    }

    this.state = {
      ...this.state,
      delayMs: INITIAL_POLL_MS,
    };

    void (async () => {
      const token = this.pollingToken;
      await this.fetchOnce('immediate');
      if (
        token !== this.pollingToken ||
        this.cancelled ||
        !shouldContinuePolling(this.state)
      ) {
        return;
      }
      this.scheduleNextPoll();
    })();
  }

  dispose(): void {
    this.cancelled = true;
    this.started = false;
    this.clearScheduledPoll();
  }

  private clearScheduledPoll(): void {
    this.pollingToken += 1;
    if (this.pollTimeoutId !== null) {
      clearTimeout(this.pollTimeoutId);
      this.pollTimeoutId = null;
    }
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private scheduleNextPoll(): void {
    if (
      this.pollTimeoutId !== null ||
      this.cancelled ||
      !shouldContinuePolling(this.state)
    ) {
      return;
    }

    const delayMs = this.state.delayMs;
    const token = this.pollingToken;
    this.pollTimeoutId = setTimeout(() => {
      this.pollTimeoutId = null;
      if (
        token !== this.pollingToken ||
        this.cancelled ||
        !shouldContinuePolling(this.state)
      ) {
        return;
      }

      void (async () => {
        const fetchToken = this.pollingToken;
        await this.fetchOnce('scheduled');
        if (
          fetchToken !== this.pollingToken ||
          this.cancelled ||
          !shouldContinuePolling(this.state)
        ) {
          return;
        }
        this.scheduleNextPoll();
      })();
    }, delayMs);
  }

  private fetchOnce(backoffMode: 'immediate' | 'scheduled'): Promise<void> {
    if (this.inFlightFetch) {
      return this.inFlightFetch;
    }

    const request = this.performFetchOnce(backoffMode);
    this.inFlightFetch = request;

    return request.finally(() => {
      if (this.inFlightFetch === request) {
        this.inFlightFetch = null;
      }
    });
  }

  private async performFetchOnce(
    backoffMode: 'immediate' | 'scheduled',
  ): Promise<void> {
    const { planId } = this.state;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.fetchTimeoutMs);

    try {
      const response = await this.fetcher(`/api/v1/plans/${planId}/status`, {
        signal: controller.signal,
      });

      if (!response.ok) {
        const parsed = await parseApiErrorResponse(
          response,
          `Failed to fetch plan status: ${response.status}`,
        );
        const retriable = isRetriableFromResponse(response.status);
        throw new RetriableError(parsed.error, retriable);
      }

      const raw = (await response.json()) as unknown;
      const parseResult = PlanStatusResponseSchema.safeParse(raw);
      if (!parseResult.success) {
        throw parseResult.error;
      }

      const data = parseResult.data;
      this.state = transitionPlanPollState(
        this.state,
        {
          type: 'response',
          status: data.status,
          attempts: data.attempts,
          error: data.latestError,
          backoffMode,
        },
        this.randomFn,
      );
      this.syncSnapshot();
      this.emit();
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        this.state = transitionPlanPollState(
          this.state,
          {
            type: 'transient_failure',
            message: 'Plan status request timed out',
          },
          this.randomFn,
        );
        this.syncSnapshot();
        this.emit();
        return;
      }

      if (err instanceof ZodError) {
        clientLogger.error('Plan status response validation failed', {
          planId,
          error: err.flatten(),
        });
        this.state = transitionPlanPollState(this.state, {
          type: 'fatal_failure',
          message: 'Received invalid plan status response from server.',
        });
        this.syncSnapshot();
        this.emit();
        return;
      }

      const message =
        err instanceof Error ? err.message : 'Failed to fetch plan status';
      const isRetriable =
        err instanceof RetriableError ? err.isRetriable : true;

      if (!isRetriable) {
        clientLogger.error('Failed to poll plan status (non-retriable):', err);
        this.state = transitionPlanPollState(this.state, {
          type: 'fatal_failure',
          message,
        });
        this.syncSnapshot();
        this.emit();
        return;
      }

      this.state = transitionPlanPollState(
        this.state,
        { type: 'transient_failure', message },
        this.randomFn,
      );
      this.syncSnapshot();
      this.emit();

      if (this.state.phase === 'stopped') {
        clientLogger.error(
          'Failed to poll plan status: max retries exhausted',
          err,
        );
      } else {
        clientLogger.warn('Transient polling failure, will retry:', err);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
