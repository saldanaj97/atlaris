import { describe, expect, it } from 'vitest';
import { DEFAULT_ATTEMPT_CAP } from '@/features/ai/generation-policy';
import { derivePlanReadStatus } from '@/features/plans/read-projection/read-status';

describe('derivePlanReadStatus', () => {
  it('returns ready when modules exist even if status is generating', () => {
    expect(
      derivePlanReadStatus({
        generationStatus: 'generating',
        hasModules: true,
      }),
    ).toBe('ready');
  });

  it('returns ready when generation status is ready without modules', () => {
    expect(
      derivePlanReadStatus({ generationStatus: 'ready', hasModules: false }),
    ).toBe('ready');
  });

  it('returns pending when generation status is ready without modules and attempts are below cap', () => {
    expect(
      derivePlanReadStatus({
        generationStatus: 'ready',
        hasModules: false,
        attemptsCount: DEFAULT_ATTEMPT_CAP - 1,
        attemptCap: DEFAULT_ATTEMPT_CAP,
      }),
    ).toBe('pending');
  });

  it('returns failed when generation status is ready without modules and attempts reached cap', () => {
    expect(
      derivePlanReadStatus({
        generationStatus: 'ready',
        hasModules: false,
        attemptsCount: DEFAULT_ATTEMPT_CAP,
        attemptCap: DEFAULT_ATTEMPT_CAP,
      }),
    ).toBe('failed');
  });

  it('returns failed when generation status is failed', () => {
    expect(
      derivePlanReadStatus({ generationStatus: 'failed', hasModules: false }),
    ).toBe('failed');
  });

  it('returns processing while generation is active and modules are absent', () => {
    expect(
      derivePlanReadStatus({
        generationStatus: 'generating',
        hasModules: false,
      }),
    ).toBe('processing');
  });

  it.each([
    ['generating', 0],
    ['generating', 1],
    ['generating', Math.floor(DEFAULT_ATTEMPT_CAP / 2)],
    ['generating', DEFAULT_ATTEMPT_CAP - 1],
    ['pending_retry', 0],
    ['pending_retry', 1],
    ['pending_retry', Math.floor(DEFAULT_ATTEMPT_CAP / 2)],
    ['pending_retry', DEFAULT_ATTEMPT_CAP - 1],
  ] as const)(
    'returns processing for %s without modules when attempts=%d is below the retry cap',
    (generationStatus, attemptsCount) => {
      expect(
        derivePlanReadStatus({
          generationStatus,
          hasModules: false,
          attemptsCount,
          attemptCap: DEFAULT_ATTEMPT_CAP,
        }),
      ).toBe('processing');
    },
  );

  it.each(['generating', 'pending_retry'] as const)(
    'returns failed for %s without modules when attempts reached the retry cap',
    (generationStatus) => {
      expect(
        derivePlanReadStatus({
          generationStatus,
          hasModules: false,
          attemptsCount: DEFAULT_ATTEMPT_CAP,
          attemptCap: DEFAULT_ATTEMPT_CAP,
        }),
      ).toBe('failed');
    },
  );

  it.each(['generating', 'pending_retry'] as const)(
    'returns failed for %s without modules when attempts exceed the retry cap',
    (generationStatus) => {
      expect(
        derivePlanReadStatus({
          generationStatus,
          hasModules: false,
          attemptsCount: DEFAULT_ATTEMPT_CAP + 1,
          attemptCap: DEFAULT_ATTEMPT_CAP,
        }),
      ).toBe('failed');
    },
  );

  it('returns processing for pending_retry when attempt counts are omitted', () => {
    expect(
      derivePlanReadStatus({
        generationStatus: 'pending_retry',
        hasModules: false,
      }),
    ).toBe('processing');
  });

  it('honors custom attempt caps', () => {
    expect(
      derivePlanReadStatus({
        generationStatus: 'pending_retry',
        hasModules: false,
        attemptsCount: 1,
        attemptCap: 2,
      }),
    ).toBe('processing');

    expect(
      derivePlanReadStatus({
        generationStatus: 'pending_retry',
        hasModules: false,
        attemptsCount: 2,
        attemptCap: 2,
      }),
    ).toBe('failed');
  });

  it('returns pending when ready plans are still below the retry cap', () => {
    expect(
      derivePlanReadStatus({
        generationStatus: 'ready',
        hasModules: false,
        attemptsCount: 1,
        attemptCap: DEFAULT_ATTEMPT_CAP,
      }),
    ).toBe('pending');
  });
});
