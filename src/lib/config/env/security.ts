import { z } from 'zod';
import {
  EnvValidationError,
  getServerOptional,
  getServerRequiredProdOnly,
  parseEnvNumber,
} from '@/lib/config/env/shared';

const AV_METADEFENDER_DEFAULT_BASE_URL = 'https://api.metadefender.com/v4';

const METADEFENDER_URL_SCHEMA = z.string().url();
const AV_PROVIDER_VALUES = ['none', 'metadefender', 'mock'] as const;
const avProviderSchema = z.enum(AV_PROVIDER_VALUES);
type AvProvider = z.infer<typeof avProviderSchema>;

const AV_MOCK_SCENARIO_VALUES = new Set([
  'clean',
  'infected',
  'timeout',
  'malformed',
]);

export const avScannerEnv = {
  /**
   * AV provider. Use 'metadefender' in production.
   * Use 'none' for heuristic-only local development.
   * Use 'mock' for scenario-driven local mock scans (non-production only).
   */
  get provider(): AvProvider {
    const raw = getServerOptional('AV_PROVIDER');
    const parsed = avProviderSchema.safeParse(raw?.toLowerCase() ?? 'none');
    if (!parsed.success) {
      throw new EnvValidationError(
        `AV_PROVIDER must be one of: ${AV_PROVIDER_VALUES.join(', ')}`,
        'AV_PROVIDER'
      );
    }
    return parsed.data;
  },
  /** Outcome when AV_PROVIDER=mock. */
  get mockScenario(): 'clean' | 'infected' | 'timeout' | 'malformed' {
    const raw = getServerOptional('AV_MOCK_SCENARIO')?.trim().toLowerCase();
    if (!raw || raw === 'clean') {
      return 'clean';
    }
    if (!AV_MOCK_SCENARIO_VALUES.has(raw)) {
      throw new EnvValidationError(
        `AV_MOCK_SCENARIO must be one of: ${[...AV_MOCK_SCENARIO_VALUES].join(', ')}`,
        'AV_MOCK_SCENARIO'
      );
    }
    return raw as 'clean' | 'infected' | 'timeout' | 'malformed';
  },
  /** MetaDefender Cloud API key. Required in production when AV_PROVIDER=metadefender. */
  get metadefenderApiKey(): string | undefined {
    if (this.provider === 'metadefender') {
      return getServerRequiredProdOnly('AV_METADEFENDER_API_KEY');
    }
    return getServerOptional('AV_METADEFENDER_API_KEY');
  },
  /** MetaDefender Cloud base URL */
  get metadefenderBaseUrl(): string {
    const configured = getServerOptional('AV_METADEFENDER_BASE_URL');
    if (!configured) {
      return AV_METADEFENDER_DEFAULT_BASE_URL;
    }

    const parsed = METADEFENDER_URL_SCHEMA.safeParse(configured);
    if (!parsed.success) {
      throw new EnvValidationError(
        `Invalid AV_METADEFENDER_BASE_URL: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
        'AV_METADEFENDER_BASE_URL'
      );
    }

    return parsed.data;
  },
  /** End-to-end scan timeout in milliseconds */
  get scanTimeoutMs(): number {
    return Math.max(
      1_000,
      parseEnvNumber(getServerOptional('AV_SCAN_TIMEOUT_MS'), 30_000)
    );
  },
} as const;
