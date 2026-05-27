import type { checkIpRateLimit } from '@/lib/api/ip-rate-limit';

import { RateLimitError } from '@/lib/api/errors';

export function mockRateLimitExceeded(
  retryAfter: number,
  message = 'Rate limit exceeded',
) {
  return (..._args: Parameters<typeof checkIpRateLimit>): never => {
    throw new RateLimitError(message, { retryAfter });
  };
}
