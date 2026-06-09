import {
  createInitialPlanPollState,
  MAX_CONSECUTIVE_FAILURES,
  transitionPlanPollState,
  type PlanPollState,
} from '@/features/plans/status-polling/plan-status-machine';
import { INITIAL_POLL_MS } from '@/shared/constants/polling';
import { describe, expect, it } from 'vitest';

const deterministicRandom = () => 0.5;

function pendingState(overrides: Partial<PlanPollState> = {}): PlanPollState {
  return {
    ...createInitialPlanPollState('plan-1', 'pending'),
    ...overrides,
  };
}

describe('plan-status-machine', () => {
  describe('createInitialPlanPollState', () => {
    it.each([
      ['pending', 'polling'],
      ['processing', 'polling'],
      ['ready', 'terminal'],
      ['failed', 'terminal'],
    ] as const)('initializes %s as %s phase', (status, phase) => {
      const state = createInitialPlanPollState('plan-1', status);
      expect(state.phase).toBe(phase);
      expect(state.status).toBe(status);
      expect(state.attempts).toBe(0);
      expect(state.error).toBeNull();
      expect(state.pollingError).toBeNull();
      expect(state.consecutiveFailures).toBe(0);
      expect(state.delayMs).toBe(INITIAL_POLL_MS);
    });
  });

  describe('response', () => {
    it('updates status fields and clears consecutive failures while polling', () => {
      const state = pendingState({ consecutiveFailures: 2, delayMs: 2000 });
      const next = transitionPlanPollState(
        state,
        {
          type: 'response',
          status: 'processing',
          attempts: 3,
          error: null,
          backoffMode: 'scheduled',
        },
        deterministicRandom,
      );

      expect(next.status).toBe('processing');
      expect(next.attempts).toBe(3);
      expect(next.error).toBeNull();
      expect(next.consecutiveFailures).toBe(0);
      expect(next.phase).toBe('polling');
    });

    it('transitions to terminal phase for ready status', () => {
      const next = transitionPlanPollState(
        pendingState(),
        {
          type: 'response',
          status: 'ready',
          attempts: 5,
          error: null,
          backoffMode: 'scheduled',
        },
        deterministicRandom,
      );

      expect(next.phase).toBe('terminal');
      expect(next.status).toBe('ready');
      expect(next.attempts).toBe(5);
    });

    it('transitions to terminal phase for failed status with error', () => {
      const next = transitionPlanPollState(
        pendingState(),
        {
          type: 'response',
          status: 'failed',
          attempts: 2,
          error: 'AI provider error',
          backoffMode: 'scheduled',
        },
        deterministicRandom,
      );

      expect(next.phase).toBe('terminal');
      expect(next.status).toBe('failed');
      expect(next.error).toBe('AI provider error');
    });

    it('resets delay on scheduled poll when status transitions', () => {
      const state = pendingState({ delayMs: 3375 });
      const next = transitionPlanPollState(
        state,
        {
          type: 'response',
          status: 'processing',
          attempts: 1,
          error: null,
          backoffMode: 'scheduled',
        },
        deterministicRandom,
      );

      expect(next.delayMs).toBe(INITIAL_POLL_MS);
    });

    it('applies backoff on scheduled poll when status is unchanged', () => {
      const state = pendingState({ delayMs: INITIAL_POLL_MS });
      const next = transitionPlanPollState(
        state,
        {
          type: 'response',
          status: 'pending',
          attempts: 1,
          error: null,
          backoffMode: 'scheduled',
        },
        deterministicRandom,
      );

      expect(next.delayMs).toBe(1500);
    });

    it('always applies backoff on immediate poll regardless of status transition', () => {
      const state = pendingState({ delayMs: INITIAL_POLL_MS });
      const next = transitionPlanPollState(
        state,
        {
          type: 'response',
          status: 'processing',
          attempts: 1,
          error: null,
          backoffMode: 'immediate',
        },
        deterministicRandom,
      );

      expect(next.delayMs).toBe(1500);
    });
  });

  describe('transient_failure', () => {
    it('increments consecutive failures and applies backoff while polling', () => {
      const state = pendingState({ consecutiveFailures: 0, delayMs: 1000 });
      const next = transitionPlanPollState(
        state,
        { type: 'transient_failure', message: 'Unavailable' },
        deterministicRandom,
      );

      expect(next.consecutiveFailures).toBe(1);
      expect(next.phase).toBe('polling');
      expect(next.pollingError).toBeNull();
      expect(next.delayMs).toBe(1500);
    });

    it('stops polling after max consecutive failures', () => {
      const state = pendingState({
        consecutiveFailures: MAX_CONSECUTIVE_FAILURES - 1,
      });
      const next = transitionPlanPollState(
        state,
        { type: 'transient_failure', message: 'Service unavailable' },
        deterministicRandom,
      );

      expect(next.consecutiveFailures).toBe(MAX_CONSECUTIVE_FAILURES);
      expect(next.phase).toBe('stopped');
      expect(next.pollingError).toBe('Service unavailable');
    });

    it('is a no-op in terminal phase', () => {
      const state = createInitialPlanPollState('plan-1', 'ready');
      const next = transitionPlanPollState(
        state,
        { type: 'transient_failure', message: 'Unavailable' },
        deterministicRandom,
      );

      expect(next).toEqual(state);
    });
  });

  describe('fatal_failure', () => {
    it('stops polling immediately with pollingError', () => {
      const next = transitionPlanPollState(pendingState(), {
        type: 'fatal_failure',
        message: 'Plan not found',
      });

      expect(next.phase).toBe('stopped');
      expect(next.pollingError).toBe('Plan not found');
    });
  });

  describe('revalidate', () => {
    it('clears errors and resumes polling from stopped phase', () => {
      const state = pendingState({
        phase: 'stopped',
        pollingError: 'Bad request',
        consecutiveFailures: 3,
        delayMs: 5000,
      });
      const next = transitionPlanPollState(state, { type: 'revalidate' });

      expect(next.phase).toBe('polling');
      expect(next.pollingError).toBeNull();
      expect(next.consecutiveFailures).toBe(0);
      expect(next.delayMs).toBe(INITIAL_POLL_MS);
    });

    it('is a no-op in terminal phase', () => {
      const state = createInitialPlanPollState('plan-1', 'ready');
      const next = transitionPlanPollState(state, { type: 'revalidate' });

      expect(next).toEqual(state);
    });

    it('resets backoff while already polling', () => {
      const state = pendingState({ delayMs: 5000, consecutiveFailures: 1 });
      const next = transitionPlanPollState(state, { type: 'revalidate' });

      expect(next.phase).toBe('polling');
      expect(next.consecutiveFailures).toBe(0);
      expect(next.delayMs).toBe(INITIAL_POLL_MS);
    });
  });

  describe('plan_changed', () => {
    it('fully resets state for the new plan', () => {
      const state = pendingState({
        status: 'processing',
        attempts: 4,
        error: 'transient',
        pollingError: 'old error',
        consecutiveFailures: 2,
        delayMs: 8000,
      });
      const next = transitionPlanPollState(state, {
        type: 'plan_changed',
        planId: 'plan-2',
        initialStatus: 'pending',
      });

      expect(next).toEqual(createInitialPlanPollState('plan-2', 'pending'));
    });

    it('initializes terminal phase when new plan is ready', () => {
      const next = transitionPlanPollState(pendingState(), {
        type: 'plan_changed',
        planId: 'plan-2',
        initialStatus: 'ready',
      });

      expect(next.phase).toBe('terminal');
      expect(next.planId).toBe('plan-2');
      expect(next.status).toBe('ready');
    });
  });
});
