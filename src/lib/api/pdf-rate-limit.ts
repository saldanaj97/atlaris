import { getDb } from '@/lib/db/runtime';
import { logger } from '@/lib/logging/logger';
import {
  resolveUserTier,
  TIER_LIMITS,
  type SubscriptionTier,
} from '@/lib/stripe/usage';
import { LRUCache } from 'lru-cache';

type PdfUploadValidationDeps = {
  resolveTier?: (
    userId: string,
    dbClient?: ReturnType<typeof getDb>
  ) => Promise<SubscriptionTier>;
};

type PdfUploadLimitDetails = {
  maxPdfSizeMb: number;
  maxPdfPages: number;
  monthlyPdfPlans: number;
};

export type PdfSizeLimitResult =
  | { allowed: true; limits: PdfUploadLimitDetails }
  | {
      allowed: false;
      code: 'FILE_TOO_LARGE';
      reason: string;
      limits: PdfUploadLimitDetails;
    };

export type PdfUploadValidationResult =
  | { allowed: true; limits: PdfUploadLimitDetails }
  | {
      allowed: false;
      code: 'FILE_TOO_LARGE' | 'TOO_MANY_PAGES';
      reason: string;
      limits: PdfUploadLimitDetails;
    };

const toLimitDetails = (tier: SubscriptionTier): PdfUploadLimitDetails => ({
  maxPdfSizeMb: TIER_LIMITS[tier].maxPdfSizeMb,
  maxPdfPages: TIER_LIMITS[tier].maxPdfPages,
  monthlyPdfPlans: TIER_LIMITS[tier].monthlyPdfPlans,
});

/**
 * Lightweight check for PDF file size limits before parsing.
 * Use this before calling extractTextFromPdf to avoid unnecessary parsing.
 */
export async function checkPdfSizeLimit(
  userId: string,
  sizeBytes: number,
  deps: PdfUploadValidationDeps = {}
): Promise<PdfSizeLimitResult> {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    throw new Error('sizeBytes must be a non-negative finite number');
  }

  let tier: SubscriptionTier;
  try {
    const db = getDb();
    tier = await (deps.resolveTier ?? resolveUserTier)(userId, db);
  } catch (err) {
    throw new Error(
      `resolveTier failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const limits = toLimitDetails(tier);
  const maxSizeBytes = limits.maxPdfSizeMb * 1024 * 1024;

  if (sizeBytes > maxSizeBytes) {
    return {
      allowed: false,
      code: 'FILE_TOO_LARGE',
      reason: `PDF exceeds ${limits.maxPdfSizeMb}MB limit for ${tier} tier.`,
      limits,
    };
  }

  return { allowed: true, limits };
}

export async function validatePdfUpload(
  userId: string,
  sizeBytes: number,
  pageCount: number,
  deps: PdfUploadValidationDeps = {}
): Promise<PdfUploadValidationResult> {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new Error('sizeBytes must be a positive finite number');
  }
  if (!Number.isFinite(pageCount) || pageCount <= 0) {
    throw new Error('pageCount must be a positive finite number');
  }

  const sizeResult = await checkPdfSizeLimit(userId, sizeBytes, deps);
  if (!sizeResult.allowed) {
    return sizeResult;
  }

  const { limits } = sizeResult;

  if (pageCount > limits.maxPdfPages) {
    return {
      allowed: false,
      code: 'TOO_MANY_PAGES',
      reason: `PDF exceeds ${limits.maxPdfPages}-page limit.`,
      limits,
    };
  }

  return { allowed: true, limits };
}

// ---------------------------------------------------------------------------
// Per-user PDF extraction throttle (sliding window)
// ---------------------------------------------------------------------------

/**
 * Simple sliding-window rate limiter for PDF extractions.
 * Limits: max 10 extractions per 10-minute window per user.
 *
 * In-memory store — resets on deploy, which is acceptable for DoS prevention.
 * Uses bounded LRU cache to prevent OOM under many unique user IDs.
 */
const PDF_EXTRACTION_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const PDF_EXTRACTION_MAX_PER_WINDOW = 10;
const PDF_EXTRACTION_MAX_TRACKED_USERS = 50_000;

const extractionTimestamps = new LRUCache<string, number[]>({
  max: PDF_EXTRACTION_MAX_TRACKED_USERS,
  ttl: PDF_EXTRACTION_WINDOW_MS + 1000,
});

export interface PdfThrottleResult {
  allowed: boolean;
  retryAfterMs?: number;
}

type ThrottleStore = Map<string, number[]> | LRUCache<string, number[]>;

export interface PdfThrottleDeps {
  store?: ThrottleStore;
  now?: () => number;
  headers?: Record<string, string | undefined>;
}

function pruneRecentTimestamps(
  timestamps: number[],
  windowStart: number
): number[] {
  return timestamps.filter((ts) => ts > windowStart);
}

export function checkPdfExtractionThrottle(
  userId: string,
  deps: PdfThrottleDeps = {}
): PdfThrottleResult {
  const now = deps.now?.() ?? Date.now();
  // Header input is accepted for call-site compatibility but intentionally ignored:
  // throttling is keyed by trusted userId, not spoofable IP headers.
  void deps.headers;
  const store = deps.store ?? extractionTimestamps;
  const windowStart = now - PDF_EXTRACTION_WINDOW_MS;

  const timestamps = store.get(userId) ?? [];
  // Filter to only timestamps within the window
  const recent = pruneRecentTimestamps(timestamps, windowStart);

  if (recent.length >= PDF_EXTRACTION_MAX_PER_WINDOW) {
    const oldest = Math.min(...recent);
    const retryAfterMs = oldest + PDF_EXTRACTION_WINDOW_MS - now;

    logger.warn(
      { userId, recentCount: recent.length, retryAfterMs },
      'PDF extraction throttled — rate limit exceeded'
    );

    return { allowed: false, retryAfterMs: Math.max(0, retryAfterMs) };
  }

  // Record this extraction
  recent.push(now);
  store.set(userId, recent);

  return { allowed: true };
}
