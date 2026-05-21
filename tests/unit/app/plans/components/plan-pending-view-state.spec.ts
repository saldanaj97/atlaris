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
  it('sets panelKind to failure when failed with a message', () => {
    const viewState = buildPlanPendingViewState({
      status: 'failed',
      retryStatus: 'idle',
      attempts: 1,
      error: 'Generation failed',
      pollingError: null,
      retryError: null,
    });

    expect(viewState.panelKind).toBe('failure');
    expect(viewState.status).toBe('failed');
  });

  it('sets panelKind to connection when polling fails with an error', () => {
    const viewState = buildPlanPendingViewState({
      status: 'processing',
      retryStatus: 'idle',
      attempts: 0,
      error: null,
      pollingError: 'Unable to reach the server',
      retryError: null,
    });

    expect(viewState.panelKind).toBe('connection');
  });

  it('sets panelKind to processing for active generation', () => {
    const viewState = buildPlanPendingViewState({
      status: 'processing',
      retryStatus: 'idle',
      attempts: 2,
      error: null,
      pollingError: null,
      retryError: null,
    });

    expect(viewState.panelKind).toBe('processing');
  });

  it('sets panelKind to pending for queued plans', () => {
    const viewState = buildPlanPendingViewState({
      status: 'pending',
      retryStatus: 'idle',
      attempts: 0,
      error: null,
      pollingError: null,
      retryError: null,
    });

    expect(viewState.panelKind).toBe('pending');
  });

  it('sets panelKind to ready when generation completes', () => {
    const viewState = buildPlanPendingViewState({
      status: 'ready',
      retryStatus: 'idle',
      attempts: 0,
      error: null,
      pollingError: null,
      retryError: null,
    });

    expect(viewState.panelKind).toBe('ready');
  });

  it('sets panelKind to unsupported for unknown status values', () => {
    const viewState = buildPlanPendingViewState({
      status: 'archived',
      retryStatus: 'idle',
      attempts: 0,
      error: null,
      pollingError: null,
      retryError: null,
    });

    expect(viewState.panelKind).toBe('unsupported');
    expect(viewState.status).toBe('archived');
  });

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
