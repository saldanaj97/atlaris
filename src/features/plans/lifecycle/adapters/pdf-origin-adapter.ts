/**
 * PdfOriginAdapter — production implementation of PdfOriginPort.
 *
 * Thin wrapper around existing PDF origin functions that handle
 * proof verification, context extraction, and quota management.
 */

import {
  preparePlanInputWithPdfOrigin,
  rollbackPdfUsageIfReserved,
} from '@/features/plans/api/pdf-origin';
import type { CreateLearningPlanInput } from '@/features/plans/validation/learningPlans.types';
import type { DbClient } from '@/lib/db/types';

import type { PdfOriginPort } from '../ports';

export class PdfOriginAdapter implements PdfOriginPort {
  constructor(private readonly dbClient: DbClient) {}

  async preparePlanInput(params: {
    body: Record<string, unknown>;
    authUserId: string;
    internalUserId: string;
  }): Promise<{
    origin: 'pdf';
    extractedContext: unknown;
    topic: string;
    skillLevel: string;
    weeklyHours: number;
    learningStyle: string;
    pdfUsageReserved: boolean;
    pdfProvenance: { extractionHash: string; proofVersion: 1 } | null;
  }> {
    const result = await preparePlanInputWithPdfOrigin({
      body: params.body as CreateLearningPlanInput,
      authUserId: params.authUserId,
      internalUserId: params.internalUserId,
      dbClient: this.dbClient,
    });

    return result as {
      origin: 'pdf';
      extractedContext: unknown;
      topic: string;
      skillLevel: string;
      weeklyHours: number;
      learningStyle: string;
      pdfUsageReserved: boolean;
      pdfProvenance: { extractionHash: string; proofVersion: 1 } | null;
    };
  }

  async rollbackPdfUsage(params: {
    internalUserId: string;
    reserved: boolean;
  }): Promise<void> {
    await rollbackPdfUsageIfReserved({
      internalUserId: params.internalUserId,
      dbClient: this.dbClient,
      reserved: params.reserved,
    });
  }
}
