import { reserveRegenerationQuotaAtProviderStart } from '@/features/billing/regeneration-quota-boundary';
import { describe, expect, it } from 'vitest';

describe('regeneration-quota-boundary public surface', () => {
  it('exports reserveRegenerationQuotaAtProviderStart as the live settlement', () => {
    expect(typeof reserveRegenerationQuotaAtProviderStart).toBe('function');
  });

  it('does not export the deleted runRegenerationQuotaReserved wrapper', async () => {
    const boundary =
      await import('@/features/billing/regeneration-quota-boundary');
    expect(boundary).not.toHaveProperty('runRegenerationQuotaReserved');
    expect(boundary).not.toHaveProperty('runMeteredQuotaReserved');
  });
});
