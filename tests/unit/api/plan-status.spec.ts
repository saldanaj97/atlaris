import { derivePlanStatus } from '@/lib/plans/status';
import { describe, expect, it } from 'vitest';

describe('derivePlanStatus', () => {
  it('returns ready when modules exist even if status is generating', () => {
    expect(
      derivePlanStatus({ generationStatus: 'generating', hasModules: true })
    ).toBe('ready');
  });

  it('returns ready when generation status is ready without modules', () => {
    expect(
      derivePlanStatus({ generationStatus: 'ready', hasModules: false })
    ).toBe('ready');
  });

  it('returns failed when generation status is failed', () => {
    expect(
      derivePlanStatus({ generationStatus: 'failed', hasModules: false })
    ).toBe('failed');
  });

  it('returns processing while generation is active and modules are absent', () => {
    expect(
      derivePlanStatus({ generationStatus: 'generating', hasModules: false })
    ).toBe('processing');
  });
});
