import { describe, expect, it } from 'vitest';

import { validatePdfUpload } from '@/lib/api/pdf-rate-limit';
import { checkPdfPlanQuota } from '@/lib/stripe/usage';

const KB = 1024;
const MB = KB * 1024;

describe('checkPdfPlanQuota', () => {
  it('returns true when under the tier limit', async () => {
    const allowed = await checkPdfPlanQuota('user_1', {
      resolveTier: async () => 'free',
      getMetrics: async () => ({ pdfPlansGenerated: 1 }),
    });

    expect(allowed).toBe(true);
  });

  it('returns false when at the tier limit', async () => {
    const allowed = await checkPdfPlanQuota('user_1', {
      resolveTier: async () => 'free',
      getMetrics: async () => ({ pdfPlansGenerated: 3 }),
    });

    expect(allowed).toBe(false);
  });
});

describe('validatePdfUpload', () => {
  const TIER_FREE_MAX_SIZE_MB = 5;
  const TIER_FREE_MAX_PAGES = 50;

  it('allows valid files within limits', async () => {
    const result = await validatePdfUpload('user_1', 1 * MB, 10, {
      resolveTier: async () => 'free',
    });

    expect(result.allowed).toBe(true);
  });

  it('rejects oversized files', async () => {
    const result = await validatePdfUpload(
      'user_1',
      (TIER_FREE_MAX_SIZE_MB + 1) * MB,
      10,
      {
        resolveTier: async () => 'free',
      }
    );

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe('FILE_TOO_LARGE');
    }
  });

  it('rejects files with too many pages', async () => {
    const result = await validatePdfUpload(
      'user_1',
      1 * MB,
      TIER_FREE_MAX_PAGES + 1,
      {
        resolveTier: async () => 'free',
      }
    );

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe('TOO_MANY_PAGES');
    }
  });
});
