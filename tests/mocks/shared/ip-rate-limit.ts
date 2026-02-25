import { RateLimitError } from '@/lib/api/errors';
import type { checkIpRateLimit } from '@/lib/api/ip-rate-limit';

export function mockRateLimitExceeded(
  retryAfter: number,
  message = 'Rate limit exceeded'
) {
  return (..._args: Parameters<typeof checkIpRateLimit>): never => {
    throw new RateLimitError(message, { retryAfter });
  };
}
