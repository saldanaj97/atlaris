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

import { LRUCache } from 'lru-cache';

import { RateLimitError } from '@/lib/api/errors';
import { logger } from '@/lib/logging/logger';

/**
 * Rate limit window entry tracking request counts
 */
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

/**
 * Configuration for IP rate limiting
 */
export interface IpRateLimitConfig {
  /** Maximum requests allowed within the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Maximum unique IPs to track (LRU eviction) */
  maxTrackedIps?: number;
}

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
 * 1. X-Forwarded-For header (leftmost IP from trusted proxy chain)
 * 2. X-Real-IP header
 * 3. CF-Connecting-IP (Cloudflare deployments)
 * 4. Falls back to 'unknown' if no IP can be determined
 *
 * DEPLOYMENT ASSUMPTION: This app runs behind Vercel's edge network, which
 * overwrites X-Forwarded-For with the verified client IP as the leftmost
 * entry. If deployed behind a different proxy that does NOT sanitize this
 * header, an attacker can prepend a spoofed IP to bypass rate limiting.
 * In that case, switch to rightmost-untrusted-IP extraction.
 *
 * @param request - The incoming HTTP request
 * @returns The client IP address or 'unknown' if not determinable
 */
export function getClientIp(request: Request): string {
  // Try X-Forwarded-For first (common with reverse proxies/load balancers)
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // X-Forwarded-For can contain multiple IPs: "client, proxy1, proxy2"
    // The leftmost IP is the original client (in trusted proxy setups)
    const ips = forwardedFor.split(',').map((ip) => ip.trim());
    const clientIp = ips[0];
    if (clientIp && isValidIp(clientIp)) {
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
  logger.warn(
    'Unable to determine client IP for rate limiting — all unidentified requests share a single bucket'
  );
  return 'unknown';
}

/**
 * Basic IP address validation.
 * Checks if a string looks like a valid IPv4 or IPv6 address.
 */
function isValidIp(ip: string): boolean {
  if (!ip || ip.length === 0 || ip.length > 45) {
    return false;
  }

  // IPv4 pattern: four octets separated by dots
  const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Pattern.test(ip)) {
    // Validate each octet is 0-255
    const octets = ip.split('.');
    return octets.every((octet) => {
      const num = parseInt(octet, 10);
      return num >= 0 && num <= 255;
    });
  }

  // IPv6 pattern: allows full form and compressed form with ::
  const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  if (ipv6Pattern.test(ip)) {
    return true;
  }

  // IPv6 with IPv4 suffix (e.g., ::ffff:192.168.1.1)
  const ipv6v4Pattern = /^::ffff:(\d{1,3}\.){3}\d{1,3}$/i;
  if (ipv6v4Pattern.test(ip)) {
    return true;
  }

  return false;
}

/**
 * Creates an IP-based rate limiter with the given configuration.
 *
 * @param config - Rate limit configuration
 * @returns A function that checks and enforces rate limits
 */
export function createIpRateLimiter(config: IpRateLimitConfig): {
  check: (ip: string) => void;
  getRemainingRequests: (ip: string) => number;
  reset: (ip: string) => void;
  clear: () => void;
} {
  const { maxRequests, windowMs, maxTrackedIps = 10000 } = config;

  const cache = new LRUCache<string, RateLimitEntry>({
    max: maxTrackedIps,
    // TTL slightly longer than window to handle edge cases
    ttl: windowMs + 1000,
  });

  /**
   * Checks if the IP has exceeded the rate limit.
   * Increments the request count for the IP.
   *
   * @param ip - Client IP address
   * @throws RateLimitError if rate limit exceeded
   */
  function check(ip: string): void {
    const now = Date.now();
    const entry = cache.get(ip);

    if (!entry) {
      // First request from this IP
      cache.set(ip, { count: 1, windowStart: now });
      return;
    }

    // Check if we're still in the same window
    if (now - entry.windowStart < windowMs) {
      // Same window - increment count
      entry.count++;
      cache.set(ip, entry);

      if (entry.count > maxRequests) {
        const retryAfter = Math.ceil(
          (entry.windowStart + windowMs - now) / 1000
        );
        throw new RateLimitError(
          `Rate limit exceeded. Maximum ${maxRequests} requests allowed per ${Math.round(windowMs / 1000)} seconds.`,
          { retryAfter }
        );
      }
    } else {
      // New window - reset count
      cache.set(ip, { count: 1, windowStart: now });
    }
  }

  /**
   * Gets the number of remaining requests for an IP in the current window.
   */
  function getRemainingRequests(ip: string): number {
    const now = Date.now();
    const entry = cache.get(ip);

    if (!entry) {
      return maxRequests;
    }

    // Check if window has expired
    if (now - entry.windowStart >= windowMs) {
      return maxRequests;
    }

    return Math.max(0, maxRequests - entry.count);
  }

  /**
   * Resets the rate limit counter for an IP.
   */
  function reset(ip: string): void {
    cache.delete(ip);
  }

  /**
   * Clears all rate limit entries. Useful for testing.
   */
  function clear(): void {
    cache.clear();
  }

  return { check, getRemainingRequests, reset, clear };
}

// Pre-configured rate limiters for common endpoint types
const rateLimiters = new Map<string, ReturnType<typeof createIpRateLimiter>>();

/**
 * Gets or creates a rate limiter for a specific endpoint type.
 */
function getRateLimiter(
  type: keyof typeof IP_RATE_LIMIT_CONFIGS
): ReturnType<typeof createIpRateLimiter> {
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
  type: keyof typeof IP_RATE_LIMIT_CONFIGS
): void {
  const ip = getClientIp(request);
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
  type: keyof typeof IP_RATE_LIMIT_CONFIGS
): Record<string, string> {
  const ip = getClientIp(request);
  const limiter = getRateLimiter(type);
  const config = IP_RATE_LIMIT_CONFIGS[type];
  const remaining = limiter.getRemainingRequests(ip);

  return {
    'X-RateLimit-Limit': String(config.maxRequests),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(
      Math.ceil((Date.now() + config.windowMs) / 1000)
    ),
  };
}

/**
 * Clears all rate limiters. Useful for testing.
 */
export function clearAllRateLimiters(): void {
  rateLimiters.forEach((limiter) => limiter.clear());
  rateLimiters.clear();
}
