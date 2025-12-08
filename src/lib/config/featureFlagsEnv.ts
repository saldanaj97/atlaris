import { optionalEnv } from '@/lib/config/env';

export type FeatureFlags = {
  enableStreamingGeneration: boolean;
};

const toBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

export const featureFlagsEnv: FeatureFlags = {
  enableStreamingGeneration: toBoolean(
    optionalEnv('ENABLE_STREAMING_GENERATION'),
    true
  ),
};
