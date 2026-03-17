/**
 * IP-based rate limiting for unauthenticated endpoints.
 *
 * IMPORTANT: Storage scope and deployment considerations
 * - This module uses an in-memory LRU cache for rate limiting. The cache is
 *   per-process and volatile. In serverless or multi-instance deployments
 *   (e.g., Vercel, container replicas), requests may hit different instances
 *   with separate rate limit counters.
 * - For production-grade reliability, consider using a shared store (e.g., Redis)
 *   with atomic increment operations.
 * - Current implementation provides "best effort" rate limiting that works well
 *   for single-instance deployments and provides some protection in multi-instance
 *   deployments (each instance enforces its own limits).
 */

import { isIP } from 'node:net';

import { createSlidingWindowLimiter } from '@/lib/api/rate-limit-core';
import type { SlidingWindowLimiter } from '@/lib/api/types/rate-limit-core.types';
import { assertNever } from '@/lib/errors';
import { logger } from '@/lib/logging/logger';

/**
 * Configuration for IP rate limiting
 */
type IpRateLimitConfig = {
  /** Maximum requests allowed within the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum unique IPs to track (LRU eviction) */
  maxTrackedIps?: number;
};

type IpTrustMode = 'leftmost' | 'rightmost-untrusted' | 'trusted-proxies';

type IpExtractionConfig = {
  ipTrustMode?: IpTrustMode;
  trustedProxyList?: readonly string[];
};

const UNKNOWN_IP_WARN_INTERVAL_MS = 60_000;
let lastUnknownIpWarnTimestamp = 0;

/**
 * Default rate limit configurations for different endpoint types
 */
export const IP_RATE_LIMIT_CONFIGS = {
  /** Health check endpoints - very permissive for monitoring systems */
  health: {
    maxRequests: 60,
    windowMs: 60 * 1000, // 60 requests per minute
  },
  /** Webhook endpoints - permissive for payment processors */
  webhook: {
    maxRequests: 100,
    windowMs: 60 * 1000, // 100 requests per minute
  },
  /** Public API endpoints - more restrictive */
  publicApi: {
    maxRequests: 30,
    windowMs: 60 * 1000, // 30 requests per minute
  },
  /** Auth endpoints - restrictive to prevent brute force */
  auth: {
    maxRequests: 10,
    windowMs: 60 * 1000, // 10 requests per minute
  },
  /** Documentation endpoints - moderately permissive */
  docs: {
    maxRequests: 30,
    windowMs: 60 * 1000, // 30 requests per minute
  },
  /** Internal endpoints (cron/worker, e.g. /api/internal/) - permissive for single-worker traffic */
  internal: {
    maxRequests: 60,
    windowMs: 60 * 1000, // 60 requests per minute
  },
} as const;

/**
 * Extracts client IP address from a request, handling proxies correctly.
 *
 * IP extraction priority:
 * 1. X-Forwarded-For header (mode depends on IpExtractionConfig)
 * 2. X-Real-IP header
 * 3. CF-Connecting-IP (Cloudflare deployments)
 * 4. Falls back to 'unknown' if no IP can be determined
 *
 * Trust modes:
 * - leftmost: first IP in the chain (Vercel-friendly default)
 * - rightmost-untrusted: traverse right -> left, trim trusted proxies from the
 *   right edge, then return the first untrusted IP encountered
 * - trusted-proxies: traverse left -> right and return the first IP in the
 *   chain that is not trusted
 *
 * Example chain: "spoofed-client, real-client, trusted-proxy"
 * - rightmost-untrusted => "real-client"
 * - trusted-proxies => "spoofed-client"
 *
 * Prefer rightmost-untrusted when you trust only known right-edge proxies.
 *
 * @param request - The incoming HTTP request
 * @param config - Optional extraction config for proxy trust model
 * @returns The client IP address or 'unknown' if not determinable
 */
export function getClientIp(
  request: Request,
  config?: IpExtractionConfig
): string {
  const resolvedConfig = resolveIpExtractionConfig(config);

  // Try X-Forwarded-For first (common with reverse proxies/load balancers)
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const clientIp = extractIpFromForwardedFor(forwardedFor, resolvedConfig);
    if (clientIp) {
      return clientIp;
    }
  }

  // Try X-Real-IP (set by some reverse proxies like nginx)
  const realIp = request.headers.get('x-real-ip');
  if (realIp && isValidIp(realIp)) {
    return realIp;
  }

  // For Vercel deployments, check CF-Connecting-IP (Cloudflare) if used
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp && isValidIp(cfIp)) {
    return cfIp;
  }

  // Fallback - in serverless environments, there's often no direct socket access
  logUnknownIpFallback();
  return 'unknown';
}

function resolveIpExtractionConfig(
  config?: IpExtractionConfig
): Required<IpExtractionConfig> {
  return {
    ipTrustMode: config?.ipTrustMode ?? 'leftmost',
    trustedProxyList: config?.trustedProxyList ?? [],
  };
}

function extractIpFromForwardedFor(
  forwardedFor: string,
  config: Required<IpExtractionConfig>
): string | undefined {
  const ips = forwardedFor
    .split(',')
    .map((ip) => ip.trim())
    .filter((ip) => ip.length > 0 && isValidIp(ip));

  if (ips.length === 0) {
    return undefined;
  }

  let trustedProxySet: Set<string> | undefined;
  const getTrustedProxySet = (): Set<string> => {
    if (!trustedProxySet) {
      trustedProxySet = new Set(
        config.trustedProxyList
          .map((ip) => ip.trim())
          .filter((ip) => isValidIp(ip))
      );
    }
    return trustedProxySet;
  };

  switch (config.ipTrustMode) {
    case 'leftmost':
      return ips[0];
    case 'rightmost-untrusted':
      trustedProxySet = getTrustedProxySet();
      for (let index = ips.length - 1; index >= 0; index--) {
        const ip = ips[index];
        if (!trustedProxySet.has(ip)) {
          return ip;
        }
      }
      return undefined;
    case 'trusted-proxies':
      trustedProxySet = getTrustedProxySet();
      for (const ip of ips) {
        if (!trustedProxySet.has(ip)) {
          return ip;
        }
      }
      return undefined;
    default:
      return assertNever(config.ipTrustMode);
  }
}

function logUnknownIpFallback(): void {
  const now = Date.now();
  if (now - lastUnknownIpWarnTimestamp < UNKNOWN_IP_WARN_INTERVAL_MS) {
    return;
  }

  lastUnknownIpWarnTimestamp = now;
  logger.warn(
    'Unable to determine client IP for rate limiting — all unidentified requests share a single bucket'
  );
}

/**
 * Validates an IP address using Node's built-in net.isIP.
 * Correctly handles IPv4 (with octet range checks), IPv6, and IPv4-mapped IPv6.
 */
function isValidIp(ip: string): boolean {
  if (!ip || ip.length === 0 || ip.length > 45) {
    return false;
  }

  return isIP(ip) !== 0;
}

/**
 * Creates an IP-based rate limiter with the given configuration.
 *
 * @param config - Rate limit configuration
 * @returns A function that checks and enforces rate limits
 */
export function createIpRateLimiter(
  config: IpRateLimitConfig
): SlidingWindowLimiter {
  return createSlidingWindowLimiter({
    maxRequests: config.maxRequests,
    windowMs: config.windowMs,
    maxTrackedKeys: config.maxTrackedIps ?? 10_000,
  });
}

// Pre-configured rate limiters for common endpoint types
const rateLimiters = new Map<string, SlidingWindowLimiter>();

/**
 * Gets or creates a rate limiter for a specific endpoint type.
 */
function getRateLimiter(
  type: keyof typeof IP_RATE_LIMIT_CONFIGS
): SlidingWindowLimiter {
  const existing = rateLimiters.get(type);
  if (existing) {
    return existing;
  }
  const limiter = createIpRateLimiter(IP_RATE_LIMIT_CONFIGS[type]);
  rateLimiters.set(type, limiter);
  return limiter;
}

/**
 * Checks IP-based rate limit for a request.
 *
 * @param request - The incoming HTTP request
 * @param type - The type of endpoint (determines rate limit config)
 * @throws RateLimitError if rate limit exceeded
 */
export function checkIpRateLimit(
  request: Request,
  type: keyof typeof IP_RATE_LIMIT_CONFIGS,
  config?: IpExtractionConfig
): void {
  const ip = getClientIp(request, config);
  const limiter = getRateLimiter(type);
  limiter.check(ip);
}

/**
 * Gets rate limit headers for a response.
 *
 * @param request - The incoming HTTP request
 * @param type - The type of endpoint
 * @returns Headers object with rate limit information
 */
export function getRateLimitHeaders(
  request: Request,
  type: keyof typeof IP_RATE_LIMIT_CONFIGS,
  config?: IpExtractionConfig
): Record<string, string> {
  const ip = getClientIp(request, config);
  const limiter = getRateLimiter(type);
  const rateLimitConfig = IP_RATE_LIMIT_CONFIGS[type];
  const remaining = limiter.getRemainingRequests(ip);
  const reset = limiter.getResetTime(ip);

  return {
    'X-RateLimit-Limit': String(rateLimitConfig.maxRequests),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(reset),
  };
}

/**
 * Clears all rate limiters. Useful for testing.
 */
export function clearAllRateLimiters(): void {
  rateLimiters.forEach((limiter) => limiter.clear());
  rateLimiters.clear();
  lastUnknownIpWarnTimestamp = 0;
}
