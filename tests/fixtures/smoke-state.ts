import type { SmokeStatePayload } from '../helpers/smoke/state-file';

import { nanoid } from 'nanoid';

export function buildIncompleteSmokeState(): Partial<SmokeStatePayload> {
  const suffix = nanoid();
  return {
    POSTGRES_URL: `postgresql://x/${suffix}`,
  };
}
