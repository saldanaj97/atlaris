import { appEnv, avScannerEnv, EnvValidationError } from '@/lib/config/env';
import { MetaDefenderScanProvider } from '@/lib/security/providers/metadefender';
import type { ScanProvider } from '@/lib/security/scanner.types';

let cachedScanProvider: ScanProvider | null | undefined = undefined;

/**
 * Resets the cached scan provider. For testing only; production code should not call this.
 */
export function resetScanProviderCache(): void {
  cachedScanProvider = undefined;
}

/**
 * Creates or returns the cached AV scan provider. The factory caches the created
 * provider; callers receive a shared instance to avoid leaking SDK clients.
 */
export function createScanProvider(): ScanProvider | null {
  if (cachedScanProvider !== undefined) {
    return cachedScanProvider;
  }

  const provider = avScannerEnv.provider;

  if (provider === 'none') {
    if (appEnv.isProduction) {
      throw new EnvValidationError(
        'AV_PROVIDER must be configured in production',
        'AV_PROVIDER'
      );
    }
    cachedScanProvider = null;
    return null;
  }

  if (provider === 'metadefender') {
    cachedScanProvider = new MetaDefenderScanProvider({
      apiKey: avScannerEnv.metadefenderApiKey,
      baseUrl: avScannerEnv.metadefenderBaseUrl,
      timeoutMs: avScannerEnv.scanTimeoutMs,
    });
    return cachedScanProvider;
  }

  throw new EnvValidationError(
    `Unsupported AV_PROVIDER: ${provider}`,
    'AV_PROVIDER'
  );
}
