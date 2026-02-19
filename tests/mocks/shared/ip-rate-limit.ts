import { vi } from 'vitest';

import { RateLimitError } from '@/lib/api/errors';
import type { checkIpRateLimit } from '@/lib/api/ip-rate-limit';

export function createMockCheckIpRateLimit() {
  return vi.fn<typeof checkIpRateLimit>();
}

export function mockRateLimitExceeded(
  retryAfter: number,
  message = 'Rate limit exceeded'
) {
  return (..._args: Parameters<typeof checkIpRateLimit>): never => {
    throw new RateLimitError(message, { retryAfter });
  };
}
