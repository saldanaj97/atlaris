import type { SlidingWindowLimiter } from '@/lib/api/types/rate-limit-core.types';

import { createSlidingWindowLimiter } from '@/lib/api/rate-limit-core';
import { assertNever } from '@/lib/errors';
import { logger } from '@/lib/logging/logger';
import { isIP } from 'node:net';

type IpRateLimitConfig = {
  maxRequests: number;
  windowMs: number;
  maxTrackedIps?: number;
};

type IpTrustMode = 'leftmost' | 'rightmost-untrusted' | 'trusted-proxies';

type IpExtractionConfig = {
  ipTrustMode?: IpTrustMode;
  trustedProxyList?: readonly string[];
};

const UNKNOWN_IP_WARN_INTERVAL_MS = 60_000;
let lastUnknownIpWarnTimestamp = 0;

export const IP_RATE_LIMIT_CONFIGS = {
  health: {
    maxRequests: 60,
    windowMs: 60 * 1000,
  },
  webhook: {
    maxRequests: 100,
    windowMs: 60 * 1000,
  },
  publicApi: {
    maxRequests: 30,
    windowMs: 60 * 1000,
  },
  docs: {
    maxRequests: 30,
    windowMs: 60 * 1000,
  },
  internal: {
    maxRequests: 60,
    windowMs: 60 * 1000,
  },
} as const;

export function getClientIp(
  request: Request,
  config?: IpExtractionConfig,
): string {
  const resolvedConfig = resolveIpExtractionConfig(config);

  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const clientIp = extractIpFromForwardedFor(forwardedFor, resolvedConfig);
    if (clientIp) {
      return clientIp;
    }
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp && isValidIp(realIp)) {
    return realIp;
  }

  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp && isValidIp(cfIp)) {
    return cfIp;
  }

  logUnknownIpFallback();
  return 'unknown';
}

function resolveIpExtractionConfig(
  config?: IpExtractionConfig,
): Required<IpExtractionConfig> {
  return {
    ipTrustMode: config?.ipTrustMode ?? 'leftmost',
    trustedProxyList: config?.trustedProxyList ?? [],
  };
}

function extractIpFromForwardedFor(
  forwardedFor: string,
  config: Required<IpExtractionConfig>,
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
          .filter((ip) => isValidIp(ip)),
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
    'Unable to determine client IP for rate limiting — all unidentified requests share a single bucket',
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

export function createIpRateLimiter(
  config: IpRateLimitConfig,
): SlidingWindowLimiter {
  return createSlidingWindowLimiter({
    maxRequests: config.maxRequests,
    windowMs: config.windowMs,
    maxTrackedKeys: config.maxTrackedIps ?? 10_000,
  });
}

const rateLimiters = new Map<string, SlidingWindowLimiter>();

function getRateLimiter(
  type: keyof typeof IP_RATE_LIMIT_CONFIGS,
): SlidingWindowLimiter {
  const existing = rateLimiters.get(type);
  if (existing) {
    return existing;
  }
  const limiter = createIpRateLimiter(IP_RATE_LIMIT_CONFIGS[type]);
  rateLimiters.set(type, limiter);
  return limiter;
}

export function checkIpRateLimit(
  request: Request,
  type: keyof typeof IP_RATE_LIMIT_CONFIGS,
  config?: IpExtractionConfig,
): void {
  const ip = getClientIp(request, config);
  const limiter = getRateLimiter(type);
  limiter.check(ip);
}

export function clearAllRateLimiters(): void {
  for (const limiter of rateLimiters.values()) {
    limiter.clear();
  }
  rateLimiters.clear();
  lastUnknownIpWarnTimestamp = 0;
}
