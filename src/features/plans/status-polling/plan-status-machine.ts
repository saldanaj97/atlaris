import type { PlanStatus } from '@/shared/types/client.types';

import { computeNextDelay, INITIAL_POLL_MS } from '@/shared/constants/polling';

export const MAX_CONSECUTIVE_FAILURES = 3;

export type PlanPollPhase = 'polling' | 'stopped' | 'terminal';

export interface PlanPollState {
  planId: string;
  phase: PlanPollPhase;
  status: PlanStatus;
  attempts: number;
  error: string | null;
  pollingError: string | null;
  consecutiveFailures: number;
  delayMs: number;
}

export type PlanPollEvent =
  | {
      type: 'response';
      status: PlanStatus;
      attempts: number;
      error: string | null;
      backoffMode: 'immediate' | 'scheduled';
    }
  | { type: 'transient_failure'; message: string }
  | { type: 'fatal_failure'; message: string }
  | { type: 'revalidate' }
  | { type: 'plan_changed'; planId: string; initialStatus: PlanStatus };

function isTerminalStatus(status: PlanStatus): boolean {
  return status === 'ready' || status === 'failed';
}

function initialPhase(initialStatus: PlanStatus): PlanPollPhase {
  return isTerminalStatus(initialStatus) ? 'terminal' : 'polling';
}

export function createInitialPlanPollState(
  planId: string,
  initialStatus: PlanStatus,
): PlanPollState {
  return {
    planId,
    phase: initialPhase(initialStatus),
    status: initialStatus,
    attempts: 0,
    error: null,
    pollingError: null,
    consecutiveFailures: 0,
    delayMs: INITIAL_POLL_MS,
  };
}

function nextDelayAfterResponse(
  state: PlanPollState,
  newStatus: PlanStatus,
  backoffMode: 'immediate' | 'scheduled',
  randomFn: () => number,
): number {
  if (backoffMode === 'immediate') {
    return computeNextDelay(state.delayMs, randomFn);
  }
  if (newStatus !== state.status) {
    return INITIAL_POLL_MS;
  }
  return computeNextDelay(state.delayMs, randomFn);
}

export function transitionPlanPollState(
  state: PlanPollState,
  event: PlanPollEvent,
  randomFn: () => number = Math.random,
): PlanPollState {
  switch (event.type) {
    case 'plan_changed':
      return createInitialPlanPollState(event.planId, event.initialStatus);

    case 'revalidate':
      if (state.phase === 'terminal') {
        return state;
      }
      return {
        ...state,
        phase: 'polling',
        pollingError: null,
        consecutiveFailures: 0,
        delayMs: INITIAL_POLL_MS,
      };

    case 'response': {
      const nextPhase: PlanPollPhase = isTerminalStatus(event.status)
        ? 'terminal'
        : state.phase === 'stopped'
          ? 'stopped'
          : 'polling';

      return {
        ...state,
        phase: isTerminalStatus(event.status) ? 'terminal' : nextPhase,
        status: event.status,
        attempts: event.attempts,
        error: event.error,
        consecutiveFailures: 0,
        delayMs: nextDelayAfterResponse(
          state,
          event.status,
          event.backoffMode,
          randomFn,
        ),
      };
    }

    case 'fatal_failure':
      return {
        ...state,
        phase: 'stopped',
        pollingError: event.message,
      };

    case 'transient_failure': {
      if (state.phase === 'terminal') {
        return state;
      }
      const consecutiveFailures = state.consecutiveFailures + 1;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        return {
          ...state,
          phase: 'stopped',
          consecutiveFailures,
          pollingError: event.message,
        };
      }
      return {
        ...state,
        consecutiveFailures,
        delayMs: computeNextDelay(state.delayMs, randomFn),
      };
    }

    default:
      return state;
  }
}

export function shouldContinuePolling(state: PlanPollState): boolean {
  return state.phase === 'polling';
}
