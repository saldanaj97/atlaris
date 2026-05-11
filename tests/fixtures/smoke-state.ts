import { nanoid } from 'nanoid';
import type { SmokeStatePayload } from '../helpers/smoke/state-file';

export function buildIncompleteSmokeState(): Partial<SmokeStatePayload> {
  const suffix = nanoid();
  return {
    POSTGRES_URL: `postgresql://x/${suffix}`,
  };
}
