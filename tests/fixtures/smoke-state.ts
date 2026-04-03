import type { SmokeStatePayload } from '../helpers/smoke/state-file';

export function buildIncompleteSmokeState(): Partial<SmokeStatePayload> {
  return {
    DATABASE_URL: 'postgresql://x',
    DATABASE_URL_NON_POOLING: 'postgresql://x',
  };
}
