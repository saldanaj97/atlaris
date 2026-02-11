import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { appEnv, EnvValidationError } from '@/lib/config/env';
import {
  createScanProvider,
  resetScanProviderCache,
} from '@/lib/security/scanner-factory';

describe('scanner-factory', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    resetScanProviderCache();
    process.env = { ...originalEnv };
    (process.env as Record<string, string>).NODE_ENV = 'test';
    delete process.env.AV_PROVIDER;
    delete process.env.AV_METADEFENDER_API_KEY;
    delete process.env.AV_METADEFENDER_BASE_URL;
    delete process.env.AV_SCAN_TIMEOUT_MS;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns null when AV_PROVIDER is none in non-production environments', () => {
    process.env.AV_PROVIDER = 'none';

    expect(createScanProvider()).toBeNull();
  });

  it('returns MetaDefender provider when AV_PROVIDER is metadefender', () => {
    process.env.AV_PROVIDER = 'metadefender';
    process.env.AV_METADEFENDER_API_KEY = 'test-key';

    const provider = createScanProvider();
    expect(provider?.name).toBe('metadefender');
  });

  it('throws in production when AV_PROVIDER is unset', () => {
    delete process.env.AV_PROVIDER;
    const isProductionSpy = vi
      .spyOn(appEnv, 'isProduction', 'get')
      .mockReturnValue(true);

    try {
      expect(() => createScanProvider()).toThrow(EnvValidationError);
      expect(() => createScanProvider()).toThrow(
        'AV_PROVIDER must be configured in production'
      );
    } finally {
      isProductionSpy.mockRestore();
    }
  });

  it('throws when AV_PROVIDER has an unsupported value', () => {
    process.env.AV_PROVIDER = 'unknown-provider';

    expect(() => createScanProvider()).toThrow(EnvValidationError);
    expect(() => createScanProvider()).toThrow(
      'Unsupported AV_PROVIDER: unknown-provider'
    );
  });

  it('throws when MetaDefender provider is selected without an API key', () => {
    process.env.AV_PROVIDER = 'metadefender';
    delete process.env.AV_METADEFENDER_API_KEY;

    expect(() => createScanProvider()).toThrow(EnvValidationError);
    expect(() => createScanProvider()).toThrow(
      'AV_METADEFENDER_API_KEY is required when AV_PROVIDER=metadefender'
    );
  });
});
