import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { validatePdfUpload } from '@/lib/api/pdf-rate-limit';
import { learningPlans, usageMetrics, users } from '@/lib/db/schema';
import { db } from '@/lib/db/service-role';
import { extractTextFromPdf } from '@/lib/pdf/extract';
import { TIER_LIMITS } from '@/lib/stripe/tier-limits';
import { checkPdfPlanQuota, incrementPdfPlanUsage } from '@/lib/stripe/usage';
import {
  ensureStripeWebhookEvents,
  resetDbForIntegrationTestFile,
} from '../helpers/db';

const buildPdfBuffer = (text: string, pageCount = 1): Buffer => {
  const header = '%PDF-1.4\n';
  const streamContent = [
    'BT\n',
    '/F1 24 Tf\n',
    '72 120 Td\n',
    `(${text}) Tj\n`,
    'ET\n',
  ].join('');
  const streamLength = Buffer.byteLength(streamContent, 'utf8');

  const pageRefs = Array.from(
    { length: pageCount },
    (_, i) => `${3 + i} 0 R`
  ).join(' ');

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    `2 0 obj\n<< /Type /Pages /Kids [${pageRefs}] /Count ${pageCount} >>\nendobj\n`,
  ];

  for (let i = 0; i < pageCount; i++) {
    const pageObjNum = 3 + i;
    const contentObjNum = 3 + pageCount + i;
    objects.push(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents ${contentObjNum} 0 R /Resources << /Font << /F1 ${3 + pageCount * 2} 0 R >> >> >>\nendobj\n`
    );
  }

  for (let i = 0; i < pageCount; i++) {
    const contentObjNum = 3 + pageCount + i;
    objects.push(
      `${contentObjNum} 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}endstream\nendobj\n`
    );
  }

  const fontObjNum = 3 + pageCount * 2;
  objects.push(
    `${fontObjNum} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`
  );

  let pdf = header;
  const offsets = [0];

  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += object;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  const objCount = objects.length + 1;
  const xrefLines = offsets
    .slice(1)
    .map((offset) => `${offset.toString().padStart(10, '0')} 00000 n `)
    .join('\n');

  pdf += `xref\n0 ${objCount}\n0000000000 65535 f \n${xrefLines}\n`;
  pdf += `trailer\n<< /Root 1 0 R /Size ${objCount} >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf8');
};

const buildInvalidBuffer = (): Buffer => {
  return Buffer.from('This is not a PDF file', 'utf8');
};

/** Fixed date for deterministic month in E2E (avoids wall-clock flakes). */
const E2E_FIXED_DATE = new Date('2024-01-15');

const getCurrentMonth = (now: Date = new Date()): string => {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const e2eNow = (): Date => new Date(E2E_FIXED_DATE.getTime());

describe('PDF to Plan E2E Flow', () => {
  let userId: string;
  const clerkUserId = `clerk_e2e_pdf_to_plan_user`;
  const email = `pdf-e2e-to-plan-test@example.com`;

  beforeEach(async () => {
    await resetDbForIntegrationTestFile();
    await ensureStripeWebhookEvents();

    const [user] = await db
      .insert(users)
      .values({
        clerkUserId,
        email,
        name: 'PDF E2E Test User',
        subscriptionTier: 'free',
      })
      .returning();
    userId = user.id;
  });

  describe('Happy Path: Complete PDF to Plan Workflow', () => {
    it('should extract text and structure from a valid PDF', async () => {
      const pdfBuffer = buildPdfBuffer('Learn TypeScript');

      const result = await extractTextFromPdf(pdfBuffer);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.text).toContain('Learn');
        expect(result.pageCount).toBeGreaterThanOrEqual(1);
        expect(result.structure).toBeDefined();
        expect(result.structure.sections).toBeDefined();
        expect(result.structure.suggestedMainTopic).toBeDefined();
        expect(result.structure.confidence).toMatch(/^(high|medium|low)$/);
      }
    });

    it('should allow PDF plan creation when user has quota', async () => {
      const hasQuota = await checkPdfPlanQuota(userId, { now: e2eNow });
      expect(hasQuota).toBe(true);

      const pdfBuffer = buildPdfBuffer('Learning TypeScript');
      const validation = await validatePdfUpload(userId, pdfBuffer.length, 1);

      expect(validation.allowed).toBe(true);
      if (validation.allowed) {
        expect(validation.limits.maxPdfSizeMb).toBe(
          TIER_LIMITS.free.maxPdfSizeMb
        );
        expect(validation.limits.maxPdfPages).toBe(
          TIER_LIMITS.free.maxPdfPages
        );
      }
    });

    it('should increment PDF usage counter after plan creation', async () => {
      const month = getCurrentMonth(E2E_FIXED_DATE);

      const [initialMetrics] = await db
        .select()
        .from(usageMetrics)
        .where(
          and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month))
        );

      expect(initialMetrics).toBeUndefined();

      await incrementPdfPlanUsage(userId, undefined, { now: e2eNow });

      const [updatedMetrics] = await db
        .select()
        .from(usageMetrics)
        .where(
          and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month))
        );

      expect(updatedMetrics).toBeDefined();
      expect(updatedMetrics.pdfPlansGenerated).toBe(1);
    });

    it('should create a plan with origin pdf after successful extraction', async () => {
      const pdfBuffer = buildPdfBuffer('Advanced React Patterns');

      const extractionResult = await extractTextFromPdf(pdfBuffer);
      expect(extractionResult.success).toBe(true);

      if (!extractionResult.success) return;

      const [plan] = await db
        .insert(learningPlans)
        .values({
          userId,
          topic:
            extractionResult.structure.suggestedMainTopic || 'React Patterns',
          skillLevel: 'intermediate',
          weeklyHours: 10,
          learningStyle: 'mixed',
          generationStatus: 'generating',
          origin: 'pdf',
        })
        .returning();

      expect(plan).toBeDefined();
      expect(plan.origin).toBe('pdf');
      expect(plan.userId).toBe(userId);
    });
  });

  describe('Error Cases: Invalid File Handling', () => {
    it('should reject non-PDF files with invalid_file error', async () => {
      const invalidBuffer = buildInvalidBuffer();

      const result = await extractTextFromPdf(invalidBuffer);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('invalid_file');
        expect(result.message).toContain('valid PDF');
      }
    });

    it('should reject files exceeding size limit', async () => {
      const freeTierLimit = TIER_LIMITS.free.maxPdfSizeMb;
      const oversizedBytes = (freeTierLimit + 1) * 1024 * 1024;

      const validation = await validatePdfUpload(userId, oversizedBytes, 1);

      expect(validation.allowed).toBe(false);
      if (!validation.allowed) {
        expect(validation.code).toBe('FILE_TOO_LARGE');
        expect(validation.reason).toContain(`${freeTierLimit}MB`);
      }
    });

    it('should reject files exceeding page limit', async () => {
      const freeTierPageLimit = TIER_LIMITS.free.maxPdfPages;
      const tooManyPages = freeTierPageLimit + 10;

      const validation = await validatePdfUpload(userId, 1024, tooManyPages);

      expect(validation.allowed).toBe(false);
      if (!validation.allowed) {
        expect(validation.code).toBe('TOO_MANY_PAGES');
        expect(validation.reason).toContain(`${freeTierPageLimit}-page`);
      }
    });
  });

  describe('Quota Enforcement', () => {
    it('should allow PDF plan creation when quota available after incrementing usage', async () => {
      const hasQuotaBefore = await checkPdfPlanQuota(userId, { now: e2eNow });
      expect(hasQuotaBefore).toBe(true);

      await incrementPdfPlanUsage(userId, undefined, { now: e2eNow });

      const hasQuotaAfter = await checkPdfPlanQuota(userId, { now: e2eNow });
      expect(hasQuotaAfter).toBe(true);
    });

    it('should deny PDF plan creation when quota exhausted', async () => {
      const month = getCurrentMonth(E2E_FIXED_DATE);
      const freeLimit = TIER_LIMITS.free.monthlyPdfPlans;

      await db.insert(usageMetrics).values({
        userId,
        month,
        plansGenerated: 0,
        regenerationsUsed: 0,
        exportsUsed: 0,
        pdfPlansGenerated: freeLimit,
      });

      const hasQuota = await checkPdfPlanQuota(userId, { now: e2eNow });
      expect(hasQuota).toBe(false);
    });

    it('should allow pro tier users higher limits', async () => {
      await db
        .update(users)
        .set({ subscriptionTier: 'pro' })
        .where(eq(users.id, userId));

      const proLimit = TIER_LIMITS.pro.maxPdfSizeMb;
      const proPagesLimit = TIER_LIMITS.pro.maxPdfPages;

      const largeSizeBytes = (TIER_LIMITS.free.maxPdfSizeMb + 5) * 1024 * 1024;
      const validation = await validatePdfUpload(userId, largeSizeBytes, 100);

      expect(validation.allowed).toBe(true);
      if (validation.allowed) {
        expect(validation.limits.maxPdfSizeMb).toBe(proLimit);
        expect(validation.limits.maxPdfPages).toBe(proPagesLimit);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle PDF with minimal text content', async () => {
      const pdfBuffer = buildPdfBuffer('A');

      const result = await extractTextFromPdf(pdfBuffer);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.text.length).toBeGreaterThan(0);
      }
    });

    it('should handle multiple sequential PDF uploads for same user', async () => {
      await incrementPdfPlanUsage(userId, undefined, { now: e2eNow });
      await incrementPdfPlanUsage(userId, undefined, { now: e2eNow });
      await incrementPdfPlanUsage(userId, undefined, { now: e2eNow });

      const month = getCurrentMonth(E2E_FIXED_DATE);
      const [metrics] = await db
        .select()
        .from(usageMetrics)
        .where(
          and(eq(usageMetrics.userId, userId), eq(usageMetrics.month, month))
        );

      expect(metrics.pdfPlansGenerated).toBe(3);

      const hasQuota = await checkPdfPlanQuota(userId, { now: e2eNow });
      expect(hasQuota).toBe(false);
    });
  });
});
