import {
  resolveUserTier,
  TIER_LIMITS,
  type SubscriptionTier,
} from '@/lib/stripe/usage';

type PdfUploadValidationDeps = {
  resolveTier?: (userId: string) => Promise<SubscriptionTier>;
};

type PdfUploadLimitDetails = {
  maxPdfSizeMb: number;
  maxPdfPages: number;
  monthlyPdfPlans: number;
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

export async function validatePdfUpload(
  userId: string,
  sizeBytes: number,
  pageCount: number,
  deps: PdfUploadValidationDeps = {}
): Promise<PdfUploadValidationResult> {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    throw new Error('sizeBytes must be a non-negative finite number');
  }
  if (!Number.isFinite(pageCount) || pageCount < 0) {
    throw new Error('pageCount must be a non-negative finite number');
  }

  let tier: SubscriptionTier;
  try {
    tier = await (deps.resolveTier ?? resolveUserTier)(userId);
  } catch (err) {
    throw new Error(
      `resolveTier failed for user ${userId}: ${err instanceof Error ? err.message : String(err)}`
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

  if (pageCount > limits.maxPdfPages) {
    return {
      allowed: false,
      code: 'TOO_MANY_PAGES',
      reason: `PDF exceeds ${limits.maxPdfPages}-page limit for ${tier} tier.`,
      limits,
    };
  }

  return { allowed: true, limits };
}
