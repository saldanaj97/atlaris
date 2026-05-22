import {
  buildPlanPendingViewState,
  formatOrigin,
  getStatusBadgeVariant,
  MAX_RETRY_ATTEMPTS,
} from '@/app/(app)/plans/[id]/components/plan-pending-view-state';
import type { ClientPlanDetail } from '@/shared/types/client.types';
import { describe, expect, it } from 'vitest';

describe('formatOrigin', () => {
  it.each([
    { origin: null, label: 'AI' },
    { origin: 'ai' as const, label: 'AI' },
    { origin: 'manual' as const, label: 'Manual' },
    { origin: 'template' as const, label: 'Template' },
  ])('maps $origin to $label', ({ origin, label }) => {
    expect(formatOrigin(origin)).toBe(label);
  });

  it('returns AI when origin is undefined', () => {
    expect(
      formatOrigin(undefined as unknown as ClientPlanDetail['origin']),
    ).toBe('AI');
  });
});

describe('buildPlanPendingViewState', () => {
  it.each([
    {
      name: 'failure when failed with a message',
      input: {
        status: 'failed' as const,
        retryStatus: 'idle' as const,
        attempts: 1,
        error: 'Generation failed',
        pollingError: null,
        retryError: null,
      },
      expectedPanelKind: 'failure' as const,
      expectedStatus: 'failed' as const,
    },
    {
      name: 'connection when polling fails with an error',
      input: {
        status: 'processing' as const,
        retryStatus: 'idle' as const,
        attempts: 0,
        error: null,
        pollingError: 'Unable to reach the server',
        retryError: null,
      },
      expectedPanelKind: 'connection' as const,
    },
    {
      name: 'processing for active generation',
      input: {
        status: 'processing' as const,
        retryStatus: 'idle' as const,
        attempts: 2,
        error: null,
        pollingError: null,
        retryError: null,
      },
      expectedPanelKind: 'processing' as const,
    },
    {
      name: 'pending for queued plans',
      input: {
        status: 'pending' as const,
        retryStatus: 'idle' as const,
        attempts: 0,
        error: null,
        pollingError: null,
        retryError: null,
      },
      expectedPanelKind: 'pending' as const,
    },
    {
      name: 'ready when generation completes',
      input: {
        status: 'ready' as const,
        retryStatus: 'idle' as const,
        attempts: 0,
        error: null,
        pollingError: null,
        retryError: null,
      },
      expectedPanelKind: 'ready' as const,
    },
    {
      name: 'unsupported for unknown status values',
      input: {
        status: 'archived' as const,
        retryStatus: 'idle' as const,
        attempts: 0,
        error: null,
        pollingError: null,
        retryError: null,
      },
      expectedPanelKind: 'unsupported' as const,
      expectedStatus: 'archived' as const,
    },
  ])(
    'sets panelKind to $expectedPanelKind for $name',
    ({ input, expectedPanelKind, expectedStatus }) => {
      const viewState = buildPlanPendingViewState(input);

      expect(viewState.panelKind).toBe(expectedPanelKind);
      if (expectedStatus !== undefined) {
        expect(viewState.status).toBe(expectedStatus);
      }
    },
  );

  it('keeps failure panelKind while a retry session is active', () => {
    const viewState = buildPlanPendingViewState({
      status: 'failed',
      retryStatus: 'retrying',
      attempts: 1,
      error: null,
      pollingError: null,
      retryError: null,
    });

    expect(viewState.isRetrying).toBe(true);
    expect(viewState.panelKind).toBe('failure');
    expect(getStatusBadgeVariant(viewState)).toBe('default');
  });

  it('uses the interrupted fallback when a cancelled retry has no concrete error', () => {
    const viewState = buildPlanPendingViewState({
      status: 'failed',
      retryStatus: 'cancelled',
      attempts: 1,
      error: null,
      pollingError: null,
      retryError: null,
    });

    expect(viewState.retryInterrupted).toBe(true);
    expect(viewState.displayError).toBeNull();
    expect(viewState.failedPlanMessage).toBe(
      'Generation was interrupted before it finished. You can try again.',
    );
  });

  it('prefers retryError over pollingError and plan error', () => {
    const viewState = buildPlanPendingViewState({
      status: 'processing',
      retryStatus: 'idle',
      attempts: 0,
      error: 'Plan error',
      pollingError: 'Polling error',
      retryError: 'Retry error',
    });

    expect(viewState.displayError).toBe('Retry error');
  });

  it('falls back to pollingError when retryError is absent', () => {
    const viewState = buildPlanPendingViewState({
      status: 'processing',
      retryStatus: 'idle',
      attempts: 0,
      error: 'Plan error',
      pollingError: 'Polling error',
      retryError: null,
    });

    expect(viewState.displayError).toBe('Polling error');
  });

  it('falls back to plan error when retry and polling errors are absent', () => {
    const viewState = buildPlanPendingViewState({
      status: 'failed',
      retryStatus: 'idle',
      attempts: 1,
      error: 'Plan error',
      pollingError: null,
      retryError: null,
    });

    expect(viewState.displayError).toBe('Plan error');
    expect(viewState.failedPlanMessage).toBe('Plan error');
  });

  it('marks retries as exhausted at the attempt cap', () => {
    const viewState = buildPlanPendingViewState({
      status: 'failed',
      retryStatus: 'idle',
      attempts: MAX_RETRY_ATTEMPTS,
      error: 'Generation failed',
      pollingError: null,
      retryError: null,
    });

    expect(viewState.hasExhaustedRetries).toBe(true);
  });
});
