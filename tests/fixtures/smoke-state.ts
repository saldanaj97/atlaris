import { nanoid } from 'nanoid';
import type { SmokeStatePayload } from '../helpers/smoke/state-file';

export function buildIncompleteSmokeState(): Partial<SmokeStatePayload> {
	const suffix = nanoid();
	return {
		DATABASE_URL: `postgresql://x/${suffix}`,
		DATABASE_URL_NON_POOLING: `postgresql://x/${suffix}`,
	};
}
