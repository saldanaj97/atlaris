import type { SmokeStatePayload } from '../helpers/smoke/state-file';

import { randomUUID } from 'node:crypto';

export function buildIncompleteSmokeState(): Partial<SmokeStatePayload> {
  const suffix = randomUUID();
  return {
    POSTGRES_URL: `postgresql://x/${suffix}`,
  };
}
